// Task #184 — "Deck to Video" support service.
//
// Turns an uploaded PDF marketing/concept deck into a structured plan that the
// EXISTING AI-Generated Script engine (runScriptPipeline) can consume as a
// "front door". We do NOT build a new render pipeline here.
//
// Pipeline:
//   1. Render each PDF page to a clean composited JPEG via Poppler `pdftoppm`
//      (one image per slide — far more reliable than extracting embedded
//      rasters, which are noisy: backgrounds, soft-masks, tiny logos, dups).
//   2. Extract the deck's full text via pdf-parse.
//   3. Send text + page thumbnails to a multimodal LLM → a marketing brief plus
//      per-page usability (photo/illustration-dominant slides are "usable"
//      anchors; text-heavy / legal / footer / title / TOC pages are excluded).
//   4. Host the usable page images at durable public URLs (S3 if configured,
//      else PiAPI ephemeral) so providers + Remotion can fetch them later.
//
// `mapDeckImagesToScenes` is used AFTER the script pipeline produces scenes to
// anchor specific deck images onto the most relevant scenes via
// scene.brandReferences[].

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { llmClient } from './piapi-llm-client';
import { extractTextFromBuffer } from './document-extraction-service';

const execFileAsync = promisify(execFile);

// Durable hosting (mirrors the constants used in universal-video-routes.ts).
const REMOTION_BUCKET_NAME =
  process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
const REMOTION_REGION = process.env.REMOTION_AWS_REGION || 'us-east-2';
const deckS3Client =
  process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: REMOTION_REGION,
        credentials: {
          accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

// Render at most this many pages (keeps very large decks bounded), then select
// up to MAX_ANALYZE_PAGES evenly so we never blow up the multimodal payload.
const MAX_RENDER_PAGES = 40;
const MAX_ANALYZE_PAGES = 24;
const RENDER_DPI = '60'; // ~800x500 JPEG per US-letter slide; ~0.3s/page.

export interface DeckImage {
  /** Stable id, e.g. "page-7". */
  id: string;
  /** Durable public URL of the rendered slide. */
  url: string;
  pageNumber: number;
  /** Whether this slide is a good real-image anchor for a video scene. */
  usable: boolean;
  /** Short human caption of the slide's imagery. */
  label: string;
  /** Why the page was kept or excluded. */
  reason: string;
}

export interface DeckAnalysis {
  suggestedTitle: string;
  coreMessage: string;
  theme: string;
  targetAudience: string;
  suggestedDurationSec: number;
  /** Rich multi-paragraph narrative brief fed to runScriptPipeline. */
  brief: string;
  images: DeckImage[];
  pageCount: number;
  usableCount: number;
  excludedCount: number;
}

/**
 * Repair a truncated JSON string (the common failure when an LLM hits its
 * max_tokens limit mid-array). Single pass tracking string + bracket state,
 * remembering the last position where appending the right closers yields a
 * complete value, then cuts there and closes the open containers. Any partial
 * trailing element (half-written object, number, key) is dropped.
 */
function repairTruncatedJson(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let bestEnd = -1;
  let bestClosers = '';
  // Whether the next scalar/string is a VALUE (true) or an object KEY (false).
  // A closed key string is NOT a safe cut point ("reason"} is invalid JSON).
  let expectValue = true;
  const record = (end: number) => {
    bestEnd = end;
    bestClosers = stack.slice().reverse().join('');
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        inStr = false;
        if (expectValue) {
          record(i + 1); // a complete string VALUE is a safe cut point
          expectValue = false;
        }
      }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      stack.push('}');
      expectValue = false; // objects expect a key first
    } else if (c === '[') {
      stack.push(']');
      expectValue = true; // arrays expect a value first
    } else if (c === '}' || c === ']') {
      stack.pop();
      record(i + 1); // a closed container is a safe cut point
      expectValue = false;
    } else if (c === ':') {
      expectValue = true;
    } else if (c === ',') {
      record(i); // cut BEFORE the comma, dropping any incomplete next element
      expectValue = stack[stack.length - 1] === ']';
    }
  }
  if (bestEnd === -1) return null;
  return s.slice(0, bestEnd) + bestClosers;
}

/** Strip ```json fences and parse the first JSON object/array found, tolerating truncation. */
function parseJsonFromLLM(raw: string): any {
  let s = (raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 1. Direct parse.
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  // 2. Trim to the outermost brackets and retry.
  const start = s.search(/[{[]/);
  if (start === -1) throw new Error('LLM did not return valid JSON');
  s = s.slice(start);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end > 0) {
    try {
      return JSON.parse(s.slice(0, end + 1));
    } catch {
      /* fall through */
    }
  }
  // 3. Repair a truncated response (max_tokens cut off mid-array).
  const repaired = repairTruncatedJson(s);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch {
      /* fall through */
    }
  }
  throw new Error('LLM did not return valid JSON');
}

interface RenderedPage {
  pageNumber: number;
  buffer: Buffer;
}

/** Render PDF pages to JPEG buffers via Poppler pdftoppm, then sample evenly. */
async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
  const pdfPath = path.join(workDir, 'deck.pdf');
  const prefix = path.join(workDir, 'page');
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    await execFileAsync(
      'pdftoppm',
      ['-jpeg', '-r', RENDER_DPI, '-f', '1', '-l', String(MAX_RENDER_PAGES), pdfPath, prefix],
      { timeout: 90_000, maxBuffer: 1024 * 1024 * 64 },
    );

    const files = fs
      .readdirSync(workDir)
      .filter((f) => /^page-\d+\.jpg$/.test(f))
      .map((f) => ({ file: f, page: parseInt((f.match(/-(\d+)\.jpg$/) || [])[1] || '0', 10) }))
      .filter((x) => x.page > 0)
      .sort((a, b) => a.page - b.page);

    if (files.length === 0) {
      throw new Error('pdftoppm produced no page images');
    }

    // Even sampling when over the analyze cap, forcing the final slide to be
    // included (decks usually end on the CTA / closing image).
    let selected = files;
    if (files.length > MAX_ANALYZE_PAGES) {
      const step = files.length / MAX_ANALYZE_PAGES;
      const picked: typeof files = [];
      for (let i = 0; i < MAX_ANALYZE_PAGES; i++) {
        const idx = i === MAX_ANALYZE_PAGES - 1 ? files.length - 1 : Math.floor(i * step);
        picked.push(files[Math.min(files.length - 1, idx)]);
      }
      selected = picked;
    }

    return selected.map((x) => ({
      pageNumber: x.page,
      buffer: fs.readFileSync(path.join(workDir, x.file)),
    }));
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

/** Upload a JPEG buffer to a durable public URL (S3 preferred, PiAPI fallback). */
async function hostJpegBuffer(buffer: Buffer, filename: string): Promise<string | null> {
  if (deckS3Client) {
    try {
      const key = `deck-to-video/${Date.now()}_${filename}`;
      await deckS3Client.send(
        new PutObjectCommand({
          Bucket: REMOTION_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
          ACL: 'public-read',
        }),
      );
      return `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${key}`;
    } catch (err: any) {
      console.warn(`[DeckToVideo] S3 upload failed (${err?.message}), trying PiAPI...`);
    }
  }
  // PiAPI ephemeral fallback (24h) — best effort.
  try {
    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) return null;
    const response = await fetch('https://upload.theapi.app/api/ephemeral_resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ file_name: filename, file_data: buffer.toString('base64') }),
    });
    if (!response.ok) return null;
    const data: any = await response.json().catch(() => null);
    return data?.url || data?.data?.url || data?.image_url || data?.file_url || null;
  } catch (err: any) {
    console.warn(`[DeckToVideo] PiAPI upload failed: ${err?.message}`);
    return null;
  }
}

// Per-audience steering for the analysis. The chosen audience changes which
// slides count as "usable" anchors, the brief's tone, and the suggested
// duration. Keys MUST match DeckAudienceId in shared/config/deck-audiences.ts.
const AUDIENCE_GUIDANCE: Record<string, { name: string; keep: string; tone: string; duration: string; mixedSlides: string }> = {
  marketing: {
    name: 'short, punchy marketing video for customers & social media',
    keep: '"usable": true ONLY when the slide is dominated by a photograph or rich illustration that would make a strong real-image anchor. "usable": false for text-heavy slides, covers, agendas/TOC, legal/disclaimer/footer/contact/boilerplate, and slides that are mostly logos or charts of text.',
    tone: 'punchy, emotional, benefit-driven, fast-paced',
    duration: 'Aim short: 15-40 seconds.',
    mixedSlides: 'Prioritize visually striking imagery over dense text.',
  },
  investor: {
    name: 'investor / stakeholder presentation video',
    keep: 'Mark "usable": true for any substantive slide that carries the concept, vision, market, traction, data, or financials — EVEN IF it contains significant text, charts, or diagrams. Mark "usable": false ONLY for true boilerplate: covers, agendas/TOC, legal/disclaimer, contact pages, and decorative dividers.',
    tone: 'confident, substantive, credible, visionary',
    duration: 'Aim longer: 45-90 seconds.',
    mixedSlides: 'A slide that mixes a strong image, rendering, chart, or diagram with supporting text IS usable — it anchors the scene and conveys substance.',
  },
  internal: {
    name: 'internal video for employees & team knowledge',
    keep: 'Mark "usable": true for slides that explain the concept, process, roles, or plans so the team gets the full picture — even if text-heavy. Mark "usable": false ONLY for covers, agendas/TOC, legal, and contact/boilerplate pages.',
    tone: 'clear, informative, straightforward, on-brand',
    duration: 'Aim medium: 40-75 seconds.',
    mixedSlides: 'A slide that mixes a strong image or diagram with supporting text IS usable — the image region anchors the scene.',
  },
  educational: {
    name: 'educational / training video',
    keep: 'Mark "usable": true for slides that teach: step-by-step content, explanations, diagrams, and worked examples — even if text-heavy. Mark "usable": false ONLY for covers, agendas/TOC, legal, and contact/boilerplate pages.',
    tone: 'clear, instructional, well-structured, easy to follow',
    duration: 'Aim longer & structured: 45-90 seconds.',
    mixedSlides: 'A slide that mixes an illustration, diagram, or chart with explanatory text IS usable — it anchors the lesson.',
  },
};

const DEFAULT_AUDIENCE = 'marketing';

/** Build the analysis system prompt, steered by the chosen audience/intent. */
export function buildAnalysisSystemPrompt(audienceId?: string | null): string {
  const g = AUDIENCE_GUIDANCE[audienceId || ''] || AUDIENCE_GUIDANCE[DEFAULT_AUDIENCE];
  return `You are a senior video strategist. You are given the full text of a slide deck (PDF) and a rendered image of each page (labelled "Page N"). Your job is to plan how to turn this deck into a ${g.name} using an AI video engine.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "suggestedTitle": "concise project title",
  "coreMessage": "1-2 sentences capturing the single most important message of the deck",
  "theme": "the visual + tonal theme (e.g. 'warm, premium, artisanal')",
  "targetAudience": "who this video is for",
  "suggestedDurationSec": 30,
  "brief": "A rich multi-paragraph creative brief written for an AI script engine. Capture the narrative arc, the key selling points in order, the desired tone, and a suggested scene-by-scene beat list. Do NOT include legal disclaimers, page numbers, or boilerplate.",
  "pages": [
    { "pageNumber": 1, "usable": true, "label": "short caption of what the slide depicts", "reason": "why it is or isn't a good anchor" }
  ]
}

This video is for: ${g.name}.
Desired tone: ${g.tone}.
${g.duration}

Rules:
- suggestedDurationSec must be between 15 and 90, consistent with the duration guidance above.
- For EVERY page provided, include one entry in "pages".
- Decide "usable" for THIS audience: ${g.keep}
- ${g.mixedSlides}
- "label" should be a short, concrete caption of the slide (e.g. "watercolor rendering of the main dining room").
- Keep your output compact so it is never truncated: "label" max 12 words, "reason" max 12 words, and "brief" max ~220 words.`;
}

/** Analyze a deck PDF buffer end-to-end. */
export async function analyzeDeck(
  pdfBuffer: Buffer,
  originalFilename?: string,
  audienceId?: string | null,
): Promise<DeckAnalysis> {
  if (!llmClient.isAvailable()) {
    throw new Error('No LLM API configured — set PIAPI_API_KEY or ANTHROPIC_API_KEY');
  }

  const [pages, extracted] = await Promise.all([
    renderPdfPages(pdfBuffer),
    extractTextFromBuffer(pdfBuffer, 'application/pdf', originalFilename).catch(() => ({
      text: '',
      wordCount: 0,
      sourceFormat: 'pdf' as const,
      title: undefined,
    })),
  ]);

  // Truncate very long decks' text so the prompt stays bounded.
  const deckText = (extracted.text || '').slice(0, 18_000);

  const contentParts: any[] = [
    {
      type: 'text',
      text: `DECK TITLE (from file): ${extracted.title || originalFilename || 'Untitled'}\n\nDECK TEXT:\n${deckText || '(no extractable text)'}\n\nBelow are the rendered pages in order. Plan the marketing video.`,
    },
  ];
  for (const p of pages) {
    contentParts.push({ type: 'text', text: `Page ${p.pageNumber}:` });
    contentParts.push({
      type: 'image',
      mediaType: 'image/jpeg',
      base64Data: p.buffer.toString('base64'),
    });
  }

  const completion = await llmClient.createChatCompletion({
    systemPrompt: buildAnalysisSystemPrompt(audienceId),
    messages: [{ role: 'user', content: contentParts }],
    // Headroom for the brief + one entry per page (up to MAX_ANALYZE_PAGES).
    // Too small a budget truncates the JSON mid-array and fails parsing.
    maxTokens: 4096,
    temperature: 0.4,
    timeoutMs: 120_000,
  });

  const parsed = parseJsonFromLLM(completion.text);

  const pageMetaByNumber = new Map<number, { usable: boolean; label: string; reason: string }>();
  if (Array.isArray(parsed.pages)) {
    for (const pg of parsed.pages) {
      const n = Number(pg?.pageNumber);
      if (Number.isFinite(n)) {
        pageMetaByNumber.set(n, {
          usable: pg?.usable === true,
          label: typeof pg?.label === 'string' ? pg.label : '',
          reason: typeof pg?.reason === 'string' ? pg.reason : '',
        });
      }
    }
  }

  // Host ONLY usable pages (avoid wasting storage on excluded slides), but keep
  // excluded pages in the response (without a URL) so the UI can show a count.
  const images: DeckImage[] = [];
  for (const p of pages) {
    const meta = pageMetaByNumber.get(p.pageNumber) || { usable: false, label: '', reason: '' };
    let url = '';
    if (meta.usable) {
      url = (await hostJpegBuffer(p.buffer, `page-${p.pageNumber}.jpg`)) || '';
      if (!url) {
        // Hosting failed → cannot anchor it; downgrade to excluded.
        meta.usable = false;
        meta.reason = meta.reason || 'Image hosting unavailable';
      }
    }
    images.push({
      id: `page-${p.pageNumber}`,
      url,
      pageNumber: p.pageNumber,
      usable: meta.usable,
      label: meta.label || `Page ${p.pageNumber}`,
      reason: meta.reason,
    });
  }

  const usable = images.filter((i) => i.usable && i.url);
  const duration = Math.min(90, Math.max(15, Math.round(Number(parsed.suggestedDurationSec) || 30)));

  return {
    suggestedTitle: typeof parsed.suggestedTitle === 'string' && parsed.suggestedTitle.trim()
      ? parsed.suggestedTitle.trim()
      : extracted.title || originalFilename || 'Deck Video',
    coreMessage: typeof parsed.coreMessage === 'string' ? parsed.coreMessage.trim() : '',
    theme: typeof parsed.theme === 'string' ? parsed.theme.trim() : '',
    targetAudience: typeof parsed.targetAudience === 'string' ? parsed.targetAudience.trim() : '',
    suggestedDurationSec: duration,
    brief: typeof parsed.brief === 'string' ? parsed.brief.trim() : (parsed.coreMessage || ''),
    images,
    pageCount: pages.length,
    usableCount: usable.length,
    excludedCount: images.length - usable.length,
  };
}

export interface SceneForMapping {
  index: number;
  type?: string;
  narration?: string;
  visualDirection?: string;
}

export interface DeckImageAssignment {
  sceneIndex: number;
  imageId: string;
  url: string;
  label: string;
}

/**
 * Map usable deck images onto generated scenes (one image per scene). Uses an
 * LLM to match each image's subject to the most relevant scene by narration /
 * visual direction. Returns an empty array on any failure (callers treat
 * anchoring as best-effort and must still save the scenes).
 */
export async function mapDeckImagesToScenes(
  scenes: SceneForMapping[],
  deckImages: DeckImage[],
): Promise<DeckImageAssignment[]> {
  const usable = deckImages.filter((i) => i.usable && i.url);
  if (usable.length === 0 || scenes.length === 0) return [];

  try {
    const sceneLines = scenes
      .map(
        (s) =>
          `Scene ${s.index} [${s.type || 'content'}]: ${(s.narration || '').slice(0, 180)} | visual: ${(s.visualDirection || '').slice(0, 160)}`,
      )
      .join('\n');
    const imageLines = usable.map((i) => `${i.id}: ${i.label}`).join('\n');

    const completion = await llmClient.createChatCompletion({
      systemPrompt: `You assign real deck images to the most relevant scenes of a marketing video. Each image should anchor at most one scene, and each scene at most one image. Only assign an image when it genuinely fits the scene's subject; it is fine to leave images or scenes unassigned.

Return ONLY JSON: { "assignments": [ { "imageId": "page-7", "sceneIndex": 2 } ] }`,
      messages: [
        {
          role: 'user',
          content: `SCENES:\n${sceneLines}\n\nIMAGES:\n${imageLines}\n\nAssign images to scenes.`,
        },
      ],
      maxTokens: 1200,
      temperature: 0.2,
      timeoutMs: 60_000,
    });

    const parsed = parseJsonFromLLM(completion.text);
    const raw = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
    const byId = new Map(usable.map((i) => [i.id, i]));
    const usedScenes = new Set<number>();
    const usedImages = new Set<string>();
    const out: DeckImageAssignment[] = [];
    for (const a of raw) {
      const imageId = String(a?.imageId || '');
      const sceneIndex = Number(a?.sceneIndex);
      const img = byId.get(imageId);
      if (!img) continue;
      if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) continue;
      if (usedScenes.has(sceneIndex) || usedImages.has(imageId)) continue;
      usedScenes.add(sceneIndex);
      usedImages.add(imageId);
      out.push({ sceneIndex, imageId, url: img.url, label: img.label });
    }
    return out;
  } catch (err: any) {
    console.warn(`[DeckToVideo] image→scene mapping failed (non-fatal): ${err?.message}`);
    return [];
  }
}
