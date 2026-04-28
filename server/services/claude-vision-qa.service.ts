// Phase 21B (Task #106): Claude Vision QA scorer for NB2 candidate selection.
// Best-effort: any failure returns a neutral 0.5 so the first candidate wins
// by stable ordering. Pinned to Haiku 4.5 to keep per-project cost bounded.

import Anthropic from '@anthropic-ai/sdk';

/** Pinned Haiku 4.5 model id (2025-10-01). Exported for tests/log assertions. */
export const CLAUDE_VISION_QA_MODEL = 'claude-haiku-4-5-20251001' as const;

const MAX_TOKENS = 256;
const REQUEST_TIMEOUT_MS = 20_000;

export interface SceneScoringContext {
  /** The exact prompt that was sent to NB2 — used as the QA rubric. */
  prompt: string;
  /** Optional scene name / id for log lines. Not sent to the model. */
  sceneLabel?: string;
}

export interface VisionScoreResult {
  url: string;
  score: number;
  reason?: string;
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Parse the model's response. Accepts JSON `{"score": ..., "reason": ...}`
 * or a bare number; returns neutral 0.5 on any failure.
 */
export function parseScoreResponse(raw: string): { score: number; reason?: string } {
  if (!raw || typeof raw !== 'string') return { score: 0.5 };
  const text = raw.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reason?: unknown };
      const rawScore = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score);
      const score = clamp01(Number.isFinite(rawScore) ? rawScore : NaN);
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 160) : undefined;
      if (Number.isFinite(rawScore)) return { score, reason };
    } catch {
      // fall through to regex
    }
  }

  const numMatch = text.match(/-?\d+(?:\.\d+)?/);
  if (numMatch) {
    const n = Number(numMatch[0]);
    if (Number.isFinite(n)) {
      // Normalize 0..100 inputs into 0..1.
      const score = n > 1 ? clamp01(n / 100) : clamp01(n);
      return { score };
    }
  }

  return { score: 0.5 };
}

const SYSTEM_PROMPT = [
  'You are a senior creative director rating an AI-generated still image as a',
  'storyboard / hero frame for a short-form video scene.',
  'You will be given the prompt that was sent to the image model and one image.',
  'Reply ONLY with a single JSON object: {"score": <0..1>, "reason": "<≤120 chars>"}.',
  'Scoring rubric:',
  '  1.0 = subject, composition, lighting, and brand cues all match the brief.',
  '  0.7 = strong match with one minor flaw (slight off-color, minor artifact).',
  '  0.5 = recognizable subject but composition or lighting feels generic.',
  '  0.3 = subject present but visibly distorted, watermarked, or off-brand.',
  '  0.0 = wrong subject, broken anatomy, illegible text, or AI artifacts dominate.',
  'Be strict. Do not pad scores. Do not output anything outside the JSON object.',
].join(' ');

export async function scoreImage(
  imageUrl: string,
  ctx: SceneScoringContext
): Promise<VisionScoreResult> {
  const client = getClient();
  if (!client) {
    // No API key — return neutral so first candidate wins by stable ordering.
    return { url: imageUrl, score: 0.5, reason: 'qa-disabled' };
  }

  try {
    const response = await Promise.race([
      client.messages.create({
        model: CLAUDE_VISION_QA_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url' as const, url: imageUrl },
              },
              {
                type: 'text',
                text: `Prompt sent to the image model:\n${ctx.prompt}\n\nScore this image now.`,
              },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Claude Vision QA timed out')), REQUEST_TIMEOUT_MS)
      ),
    ]);

    const block = (response as Anthropic.Messages.Message).content[0];
    const text = block && block.type === 'text' ? block.text : '';
    const parsed = parseScoreResponse(text);
    return { url: imageUrl, score: parsed.score, reason: parsed.reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ClaudeVisionQA] Scoring failed for ${ctx.sceneLabel || 'scene'}: ${msg}`
    );
    return { url: imageUrl, score: 0.5, reason: 'qa-error' };
  }
}

export async function scoreImages(
  imageUrls: string[],
  ctx: SceneScoringContext
): Promise<VisionScoreResult[]> {
  if (imageUrls.length === 0) return [];
  return Promise.all(imageUrls.map(url => scoreImage(url, ctx)));
}
