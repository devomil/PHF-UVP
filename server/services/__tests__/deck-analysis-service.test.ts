// Task #187 — Automated coverage for the "Deck to Video" analysis pipeline.
//
// analyzeDeck() and mapDeckImagesToScenes() were only ever smoke-tested by hand
// on a trimmed slice of a real PDF, because the full multi-page pipeline blows
// past the environment's command time limit. This test exercises the real
// pipeline end-to-end against a small committed fixture PDF (3 pages, trimmed
// from a real marketing deck so Poppler renders it and pdf-parse extracts text)
// while stubbing the only two external dependencies — the multimodal LLM and
// the image host — so the run is fast and deterministic.
//
// We deliberately do NOT mock Poppler (`pdftoppm`) or `pdf-parse`: rendering and
// text extraction are core behaviours we want guarded against regressions.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample-deck.pdf');

// --- Stub the LLM transport -------------------------------------------------
// The real client would hit PiAPI/Anthropic. We hoist a mock so the SUT picks
// it up via dynamic import below, and route by systemPrompt: the analysis call
// (the "marketing video strategist" prompt) gets canned page metadata; the
// image→scene mapping call ("assign real deck images") gets canned assignments.
const createChatCompletionMock = vi.fn();
vi.mock('../piapi-llm-client', () => ({
  llmClient: {
    isAvailable: () => true,
    createChatCompletion: createChatCompletionMock,
  },
}));

// pdf-parse's index.js runs a debug harness when `module.parent` is falsy — which
// it is under Vitest — and tries to read a sample PDF that doesn't exist, throwing
// ENOENT before our code runs. The real runtime (tsx/esbuild) never hits this. We
// redirect the import to pdf-parse's real lib build so genuine PDF text extraction
// still runs (this is NOT a stub of the extraction logic, only a bypass of the
// broken debug entrypoint).
vi.mock('pdf-parse', async () => {
  // @ts-expect-error — pdf-parse ships no types for its internal lib build.
  const real = await import('pdf-parse/lib/pdf-parse.js');
  return { default: (real as any).default || real };
});

// Canned LLM analysis: page 1 is the text-heavy cover (excluded), pages 2 and 3
// are rich images (usable). Pages are numbered 1..3 to match the fixture.
const ANALYSIS_JSON = {
  suggestedTitle: 'The Book & The Residence',
  coreMessage: 'A premium concept development presentation.',
  theme: 'warm, premium, architectural',
  targetAudience: 'investors and partners',
  suggestedDurationSec: 45,
  brief: 'Open on the cover, build through the concept imagery, close on the vision.',
  pages: [
    { pageNumber: 1, usable: false, label: 'Title cover', reason: 'text-heavy title slide' },
    { pageNumber: 2, usable: true, label: 'Architectural concept render', reason: 'rich image' },
    { pageNumber: 3, usable: true, label: 'Interior concept render', reason: 'rich image' },
  ],
};

function routeLlm(options: any): { text: string } {
  const sys: string = options?.systemPrompt || '';
  if (sys.includes('senior marketing video strategist')) {
    return { text: JSON.stringify(ANALYSIS_JSON) };
  }
  if (sys.includes('assign real deck images')) {
    // Anchor page-2 → scene 0 and page-3 → scene 2 (leave scene 1 unmapped).
    return {
      text: JSON.stringify({
        assignments: [
          { imageId: 'page-2', sceneIndex: 0 },
          { imageId: 'page-3', sceneIndex: 2 },
        ],
      }),
    };
  }
  throw new Error(`Unexpected LLM systemPrompt in test: ${sys.slice(0, 60)}`);
}

describe('deck-analysis-service — analyzeDeck() + mapDeckImagesToScenes()', () => {
  let pdfBuffer: Buffer;

  beforeEach(() => {
    createChatCompletionMock.mockReset();
    createChatCompletionMock.mockImplementation(async (options: any) => routeLlm(options));

    // Force the PiAPI ephemeral hosting path (no S3 creds), and stub the upload
    // fetch so every hosted slide gets a deterministic public URL.
    delete process.env.REMOTION_AWS_ACCESS_KEY_ID;
    delete process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    process.env.PIAPI_API_KEY = 'test-key';

    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ url: 'https://cdn.test/hosted-slide.jpg' }),
      })),
    );

    pdfBuffer = fs.readFileSync(FIXTURE_PATH);
  });

  it('renders pages, extracts text, classifies usability, and hosts usable slides', async () => {
    const { analyzeDeck } = await import('../deck-analysis-service');

    const analysis = await analyzeDeck(pdfBuffer, 'sample-deck.pdf');

    // Pages render: the fixture has 3 pages and each is rendered + represented.
    expect(analysis.pageCount).toBe(3);
    expect(analysis.images).toHaveLength(3);
    expect(analysis.images.map((i) => i.pageNumber).sort()).toEqual([1, 2, 3]);

    // Text extraction is wired into the multimodal prompt. The fixture cover
    // contains "THE BOOK" — assert it reached the LLM call (proves pdf-parse ran
    // and its output was forwarded), and that rendered page images were attached.
    const analysisCall = createChatCompletionMock.mock.calls.find((c) =>
      (c[0]?.systemPrompt || '').includes('senior marketing video strategist'),
    );
    expect(analysisCall).toBeDefined();
    const contentParts = analysisCall![0].messages[0].content as any[];
    const promptText = contentParts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    expect(promptText.toUpperCase()).toContain('THE BOOK');
    const imageParts = contentParts.filter((p) => p.type === 'image');
    expect(imageParts).toHaveLength(3);
    for (const img of imageParts) {
      expect(img.mediaType).toBe('image/jpeg');
      expect(typeof img.base64Data).toBe('string');
      expect(img.base64Data.length).toBeGreaterThan(0);
    }

    // Usable / excluded split is sane and internally consistent.
    expect(analysis.usableCount).toBe(2);
    expect(analysis.excludedCount).toBe(1);
    expect(analysis.usableCount + analysis.excludedCount).toBe(analysis.images.length);

    // Hosted URLs are produced for usable slides only; excluded slide has none.
    const usable = analysis.images.filter((i) => i.usable);
    const excluded = analysis.images.filter((i) => !i.usable);
    expect(usable).toHaveLength(2);
    expect(excluded).toHaveLength(1);
    for (const i of usable) expect(i.url).toBe('https://cdn.test/hosted-slide.jpg');
    expect(excluded[0].url).toBe('');
    // Hosting was attempted exactly once per usable slide.
    expect((globalThis.fetch as any).mock.calls).toHaveLength(2);

    // Carries through the LLM brief / metadata, clamped to the valid range.
    expect(analysis.suggestedDurationSec).toBe(45);
    expect(analysis.suggestedTitle).toBe('The Book & The Residence');
    expect(analysis.brief.length).toBeGreaterThan(0);
  });

  it('recovers gracefully when the LLM analysis JSON is truncated mid-array (max_tokens cut)', async () => {
    // Simulate the real production failure: the model hit its output-token cap
    // partway through the `pages` array, returning invalid (unterminated) JSON.
    // The repair path should salvage the pages that fully arrived (1 & 2) and the
    // top-level metadata, and silently drop the half-written trailing page (3).
    const fullJson = JSON.stringify(ANALYSIS_JSON);
    const cutAtPage3 = fullJson.indexOf('{"pageNumber":3'); // drop the 3rd page entirely
    const truncated = fullJson.slice(0, cutAtPage3); // ends with a dangling comma
    expect(() => JSON.parse(truncated)).toThrow(); // sanity: genuinely invalid

    createChatCompletionMock.mockImplementation(async (options: any) => {
      const sys: string = options?.systemPrompt || '';
      if (sys.includes('senior marketing video strategist')) return { text: truncated };
      return routeLlm(options);
    });

    const { analyzeDeck } = await import('../deck-analysis-service');
    const analysis = await analyzeDeck(pdfBuffer, 'sample-deck.pdf');

    // Top-level brief/title survived the truncation.
    expect(analysis.suggestedTitle).toBe('The Book & The Residence');
    expect(analysis.brief.length).toBeGreaterThan(0);

    // All 3 pages still render; metadata applied for the 2 that fully arrived,
    // and the dropped page-3 falls back to excluded (default) rather than crashing.
    expect(analysis.images).toHaveLength(3);
    const page2 = analysis.images.find((i) => i.pageNumber === 2)!;
    expect(page2.usable).toBe(true);
    expect(analysis.usableCount).toBe(1);
    expect(analysis.excludedCount).toBe(2);
  });

  it('maps usable deck images onto scenes, one anchor per mappable scene', async () => {
    const { analyzeDeck, mapDeckImagesToScenes } = await import('../deck-analysis-service');

    const analysis = await analyzeDeck(pdfBuffer, 'sample-deck.pdf');

    const scenes = [
      { index: 0, type: 'hook', narration: 'Welcome to the residence', visualDirection: 'exterior' },
      { index: 1, type: 'content', narration: 'A word from our sponsor', visualDirection: 'logo' },
      { index: 2, type: 'content', narration: 'Step inside', visualDirection: 'interior' },
    ];

    const assignments = await mapDeckImagesToScenes(scenes, analysis.images);

    // Two usable images → two assignments (scene 1 intentionally left unmapped).
    expect(assignments).toHaveLength(2);

    // Each anchor references a usable, hosted image and a valid scene, with no
    // scene or image used twice.
    const sceneIdxs = assignments.map((a) => a.sceneIndex);
    const imageIds = assignments.map((a) => a.imageId);
    expect(new Set(sceneIdxs).size).toBe(sceneIdxs.length);
    expect(new Set(imageIds).size).toBe(imageIds.length);
    for (const a of assignments) {
      expect(a.sceneIndex).toBeGreaterThanOrEqual(0);
      expect(a.sceneIndex).toBeLessThan(scenes.length);
      expect(a.url).toBe('https://cdn.test/hosted-slide.jpg');
      expect(a.imageId).toMatch(/^page-\d+$/);
    }
  });

  it('returns no assignments when there are no usable images', async () => {
    const { mapDeckImagesToScenes } = await import('../deck-analysis-service');

    const result = await mapDeckImagesToScenes(
      [{ index: 0, narration: 'x' }],
      [{ id: 'page-1', url: '', pageNumber: 1, usable: false, label: '', reason: 'excluded' }],
    );

    expect(result).toEqual([]);
    // No usable images → the mapping LLM call is skipped entirely.
    expect(createChatCompletionMock).not.toHaveBeenCalled();
  });

  it('treats image→scene mapping as best-effort and returns [] when the LLM fails', async () => {
    const { mapDeckImagesToScenes } = await import('../deck-analysis-service');
    createChatCompletionMock.mockReset();
    createChatCompletionMock.mockRejectedValue(new Error('LLM exploded'));

    const result = await mapDeckImagesToScenes(
      [{ index: 0, narration: 'x' }],
      [{ id: 'page-2', url: 'https://cdn.test/x.jpg', pageNumber: 2, usable: true, label: 'img', reason: '' }],
    );

    expect(result).toEqual([]);
  });
});
