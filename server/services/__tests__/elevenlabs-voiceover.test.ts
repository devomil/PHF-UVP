import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// DATABASE_URL must be set before any module that imports server/db.ts is loaded.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// Minimal DB mock — generateVoiceover itself doesn't hit the DB, but the
// service constructor and cloned-voice path do. The mock is sufficient.
// ---------------------------------------------------------------------------
const dbMock = {
  select() {
    return {
      from(_table: any) {
        return {
          where(_cond: any) {
            return {
              limit(_n: number) {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };
  },
};

vi.mock('../../db', () => ({ db: dbMock, pool: {} }));

vi.mock('../../../shared/schema', () => ({
  clonedVoices: { id: {}, userId: {} },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => args,
  desc: (col: any) => col,
  ilike: (col: any, val: any) => ({ col, val }),
  or: (...args: any[]) => args,
  sql: Object.assign((s: any) => s, { raw: (s: any) => s }),
}));

vi.mock('music-metadata', () => ({
  parseBuffer: async () => ({ format: { duration: 3.0 } }),
}));

// ---------------------------------------------------------------------------
// Heavy service dependencies — same set as cloned-voice-routing.test.ts
// ---------------------------------------------------------------------------
vi.mock('../piapi-llm-client', () => ({
  llmClient: { isAvailable: () => false, complete: async () => '' },
}));
vi.mock('@fal-ai/client', () => ({ fal: { subscribe: async () => ({}) } }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class S3Client {
    constructor() {}
    send() {
      return Promise.resolve({});
    }
  },
  PutObjectCommand: class PutObjectCommand {
    constructor(public input: any) {}
  },
}));
vi.mock('../playht-client', () => ({ playHTClient: { isAvailable: () => false } }));
vi.mock('../video-frame-extractor', () => ({ videoFrameExtractor: {} }));
vi.mock('../brand-asset-service', () => ({ brandAssetService: {} }));
vi.mock('../brand-requirement-analyzer', () => ({ brandRequirementAnalyzer: {} }));
vi.mock('../brand-asset-matcher', () => ({ brandAssetMatcher: {} }));
vi.mock('../ai-video-service', () => ({ aiVideoService: {} }));
vi.mock('../sound-design-service', () => ({ soundDesignService: {} }));
vi.mock('../ai-music-service', () => ({ aiMusicService: {} }));
vi.mock('../product-image-service', () => ({ productImageService: {} }));
vi.mock('../scene-analysis-service', () => ({ sceneAnalysisService: {} }));
vi.mock('../composition-instructions-service', () => ({
  compositionInstructionsService: {},
}));
vi.mock('../brand-bible-service', () => ({ brandBibleService: {} }));
vi.mock('../script-parser-service', () => ({ scriptParserService: {} }));
vi.mock('../brand-context-service', () => ({ brandContextService: {} }));
vi.mock('../text-overlay-detector', () => ({
  detectTextOverlayRequirements: () => [],
}));
vi.mock('../text-overlay-generator', () => ({
  generateTextOverlays: async () => [],
}));
vi.mock('../prompt-sanitizer', () => ({
  sanitizePromptForAI: (p: string) => ({ prompt: p }),
}));
vi.mock('../motion-graphics-router', () => ({ motionGraphicsRouter: {} }));
vi.mock('../motion-graphics-generator', () => ({ motionGraphicsGenerator: {} }));
vi.mock('../video-prompt-optimizer', () => ({
  optimizePrompt: async (p: string) => p,
  logPromptOptimization: () => {},
}));
vi.mock('../intelligent-provider-selector', () => ({
  intelligentProviderSelector: {},
}));
vi.mock('../../shared/config/visual-art-presets', () => ({
  getVisualArtPreset: () => null,
  isStylizedPreset: () => false,
}));
vi.mock('../voice-clone-routes', () => ({
  resolveClonedVoice: vi.fn(),
  generatePlayhtSpeech: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place.
// ---------------------------------------------------------------------------
import { universalVideoService } from '../universal-video-service';

// Convenience: call the public method without TS type gymnastics.
function callGenerateVoiceover(
  text: string,
  voiceId?: string,
  options?: Record<string, any>,
  context?: { userId?: string },
) {
  return (universalVideoService as any).generateVoiceover(text, voiceId, options, context);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that fetch() would return. */
function makeResponse(status: number, body: string | ArrayBuffer, ok: boolean) {
  return {
    ok,
    status,
    arrayBuffer: async () =>
      typeof body === 'string' ? Buffer.from(body).buffer : body,
    text: async () => (typeof body === 'string' ? body : ''),
  } as unknown as Response;
}

const SAMPLE_AUDIO_BUFFER = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0xbe, 0xef]).buffer;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateVoiceover — ElevenLabs path', () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    // Default: key present and S3 returns null (triggers base64 fallback).
    process.env.ELEVENLABS_API_KEY = 'test-key-abc';
    vi.spyOn(universalVideoService as any, 'uploadToS3').mockResolvedValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(200, SAMPLE_AUDIO_BUFFER, true),
    );
  });

  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // Missing API key
  // ------------------------------------------------------------------

  it('returns { success: false } immediately when ELEVENLABS_API_KEY is not set', async () => {
    delete process.env.ELEVENLABS_API_KEY;

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.url).toBe('');
    expect(result.duration).toBe(0);
    expect(result.error).toMatch(/API key not configured/i);
    // fetch must NOT have been called — no network attempt.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Happy path — S3 fallback (base64)
  // ------------------------------------------------------------------

  it('returns { success: true, url } with a base64 data URL when S3 upload returns null', async () => {
    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(true);
    expect(result.url).toMatch(/^data:audio\/mpeg;base64,/);
    expect(result.duration).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Happy path — S3 succeeds
  // ------------------------------------------------------------------

  it('returns the S3 URL when uploadToS3 succeeds', async () => {
    vi.spyOn(universalVideoService as any, 'uploadToS3').mockResolvedValue(
      'https://s3.example.com/voiceover.mp3',
    );

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://s3.example.com/voiceover.mp3');
    expect(result.duration).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // ElevenLabs HTTP error responses
  // ------------------------------------------------------------------

  it('returns { success: false } on a 401 Unauthorized response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(401, 'Unauthorized', false),
    );

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.url).toBe('');
    expect(result.error).toMatch(/401/);
  });

  it('returns { success: false } on a 429 Too Many Requests response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(429, 'rate limit exceeded', false),
    );

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/429/);
  });

  it('returns { success: false } on a 500 Internal Server Error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(500, 'internal server error', false),
    );

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('returns { success: false } on a 503 Service Unavailable response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeResponse(503, 'service unavailable', false),
    );

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/503/);
  });

  // ------------------------------------------------------------------
  // Network / fetch throws
  // ------------------------------------------------------------------

  it('returns { success: false } and does not throw when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.url).toBe('');
    expect(result.error).toMatch(/ECONNRESET/i);
  });

  it('returns { success: false } and does not throw on a fetch timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network timeout'));

    const result = await callGenerateVoiceover('Hello world');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // Voice ID resolution
  // ------------------------------------------------------------------

  it('uses the default Rachel voice ID when no voiceId is provided', async () => {
    await callGenerateVoiceover('Hello world');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...any[]];
    expect(url).toContain('21m00Tcm4TlvDq8ikWAM');
  });

  it('uses the provided voiceId in the ElevenLabs request URL', async () => {
    await callGenerateVoiceover('Hello world', 'EXAVITQu4vr4xnSDxMaL');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, ...any[]];
    expect(url).toContain('EXAVITQu4vr4xnSDxMaL');
  });

  // ------------------------------------------------------------------
  // cloned: prefix falls through to ElevenLabs when Play.ht is unavailable
  // ------------------------------------------------------------------

  it('falls through to ElevenLabs (with default voice) when a cloned: voice fails', async () => {
    // DB returns empty rows → generateVoiceoverForClonedVoice returns null → falls through.
    const result = await callGenerateVoiceover(
      'Hello world',
      'cloned:999',
      undefined,
      { userId: 'user-xyz' },
    );

    // Should have fallen through to ElevenLabs and succeeded.
    expect(result.success).toBe(true);
    // fetch should have been called for ElevenLabs.
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });
});
