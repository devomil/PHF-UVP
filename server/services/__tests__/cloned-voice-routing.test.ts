import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// DATABASE_URL must be set before any module that imports server/db.ts is
// loaded. The real database is replaced by the in-memory mock below.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// In-memory clonedVoices table stub.
// The DB mock ignores the WHERE filter and returns whatever `mockRows` holds.
// ---------------------------------------------------------------------------
let mockRows: any[] = [];

const dbMock = {
  select() {
    return {
      from(_table: any) {
        return {
          where(_cond: any) {
            return {
              limit(_n: number) {
                return Promise.resolve(mockRows.slice(0, 1));
              },
            };
          },
        };
      },
    };
  },
};

// ---------------------------------------------------------------------------
// vi.mock calls must be at the top level (Vitest hoists them).
// Mock the real database so no network connection is attempted.
// ---------------------------------------------------------------------------
vi.mock('../../db', () => ({ db: dbMock, pool: {} }));

// Provide just enough of shared/schema that the dynamic import inside
// generateVoiceoverForClonedVoice succeeds.
vi.mock('../../../shared/schema', () => ({
  clonedVoices: { id: {}, userId: {} },
}));

// Drizzle helpers — the DB mock ignores the filter so these only need to
// return a value that can be passed through without throwing.
vi.mock('drizzle-orm', () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => args,
  desc: (col: any) => col,
  ilike: (col: any, val: any) => ({ col, val }),
  or: (...args: any[]) => args,
  sql: Object.assign((s: any) => s, { raw: (s: any) => s }),
}));

// music-metadata — used to parse audio duration; return a fixed stub.
vi.mock('music-metadata', () => ({
  parseBuffer: async () => ({ format: { duration: 4.2 } }),
}));

// ---------------------------------------------------------------------------
// Heavy constructor / service dependencies for UniversalVideoService.
// These are mocked so the singleton can be instantiated without side-effects.
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
vi.mock('../playht-client', () => ({ playHTClient: {} }));
vi.mock('../video-frame-extractor', () => ({ videoFrameExtractor: {} }));
vi.mock('../brand-asset-service', () => ({ brandAssetService: {} }));
vi.mock('../brand-requirement-analyzer', () => ({ brandRequirementAnalyzer: {} }));
vi.mock('../brand-asset-matcher', () => ({ brandAssetMatcher: {} }));
vi.mock('../ai-video-service', () => ({ aiVideoService: {} }));
vi.mock('../sound-design-service', () => ({
  soundDesignService: {},
}));
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

// ---------------------------------------------------------------------------
// The mock for voice-clone-routes lets each test control what
// generatePlayhtSpeech returns.
// Use vi.fn() directly inside the factory to avoid the hoisting TDZ issue.
// ---------------------------------------------------------------------------
vi.mock('../voice-clone-routes', () => ({
  resolveClonedVoice: vi.fn(),
  generatePlayhtSpeech: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the real service and the mocked helper AFTER all mocks are in place.
// ---------------------------------------------------------------------------
import { universalVideoService } from '../universal-video-service';
import { generatePlayhtSpeech } from '../voice-clone-routes';

// Convenience: access the private method without TypeScript complaints.
function callGenerateVoiceoverForClonedVoice(
  text: string,
  clonedVoiceRef: string,
  fallbackVoiceId?: string,
  options?: Record<string, unknown>,
  userId?: string,
) {
  return (universalVideoService as any).generateVoiceoverForClonedVoice(
    text,
    clonedVoiceRef,
    fallbackVoiceId,
    options,
    userId,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A voice row that satisfies the "happy path" requirements. */
function makeReadyVoiceRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 7,
    userId: 'user-abc',
    name: 'My Cloned Voice',
    status: 'ready',
    providerVoiceId: 's3://play.ht/voices/abc123',
    provider: 'playht',
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateVoiceoverForClonedVoice', () => {
  beforeEach(() => {
    mockRows = [];
    vi.mocked(generatePlayhtSpeech).mockReset();
    // Default: Play.ht returns a small MP3-like buffer.
    vi.mocked(generatePlayhtSpeech).mockResolvedValue(
      Buffer.from([0xff, 0xfb, 0x90, 0x00, 0xbe, 0xef]),
    );
    // uploadToS3 is private; stub it to return null so the method falls back
    // to the data-URL path and we can verify the returned URL is non-empty.
    vi.spyOn(universalVideoService as any, 'uploadToS3').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // Happy path
  // ------------------------------------------------------------------

  it('routes cloned:N voiceId to Play.ht and returns a VoiceoverResult on success', async () => {
    mockRows = [makeReadyVoiceRow()];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello world',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).not.toBeNull();
    expect(result.success).toBe(true);
    expect(result.url).toBeTruthy();
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThan(0);
    // Confirm it called Play.ht with the correct providerVoiceId.
    expect(vi.mocked(generatePlayhtSpeech)).toHaveBeenCalledOnce();
    expect(vi.mocked(generatePlayhtSpeech)).toHaveBeenCalledWith(
      'Hello world',
      's3://play.ht/voices/abc123',
    );
  });

  it('returns a data-URL (base64) for the audio when S3 upload returns null', async () => {
    mockRows = [makeReadyVoiceRow()];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Test',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).not.toBeNull();
    expect(result!.url).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it('uses the S3 URL when uploadToS3 succeeds', async () => {
    mockRows = [makeReadyVoiceRow()];
    vi.spyOn(universalVideoService as any, 'uploadToS3').mockResolvedValue(
      'https://s3.example.com/voiceover.mp3',
    );

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result!.url).toBe('https://s3.example.com/voiceover.mp3');
  });

  // ------------------------------------------------------------------
  // Authorization / ownership checks
  // ------------------------------------------------------------------

  it('returns null when userId is not provided (authorization failure)', async () => {
    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
    );

    expect(result).toBeNull();
    // generatePlayhtSpeech must NOT have been called.
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });

  it('returns null when the voice record is not found or not owned by the user', async () => {
    // DB returns empty — voice doesn't belong to this user.
    mockRows = [];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'wrong-user',
    );

    expect(result).toBeNull();
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Status checks
  // ------------------------------------------------------------------

  it('returns null when voice status is "pending" (not yet cloned)', async () => {
    mockRows = [makeReadyVoiceRow({ status: 'pending' })];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });

  it('returns null when voice status is "failed"', async () => {
    mockRows = [makeReadyVoiceRow({ status: 'failed' })];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });

  it('returns null when voice status is "processing"', async () => {
    mockRows = [makeReadyVoiceRow({ status: 'processing' })];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // Missing providerVoiceId
  // ------------------------------------------------------------------

  it('returns null when the voice row has no providerVoiceId (Play.ht not configured for the voice)', async () => {
    mockRows = [makeReadyVoiceRow({ providerVoiceId: null })];

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // PLAYHT env-var absence
  // ------------------------------------------------------------------

  it('returns null (falls back gracefully) when generatePlayhtSpeech returns null (e.g. missing PLAYHT env vars)', async () => {
    mockRows = [makeReadyVoiceRow()];
    vi.mocked(generatePlayhtSpeech).mockResolvedValue(null);

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // Play.ht failure fallback
  // ------------------------------------------------------------------

  it('returns null and does not throw when generatePlayhtSpeech throws', async () => {
    mockRows = [makeReadyVoiceRow()];
    vi.mocked(generatePlayhtSpeech).mockRejectedValue(
      new Error('Play.ht TTS returned 503: Service Unavailable'),
    );

    // Must not throw — the method catches internally and returns null.
    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
  });

  it('returns null and does not throw on network errors from Play.ht', async () => {
    mockRows = [makeReadyVoiceRow()];
    vi.mocked(generatePlayhtSpeech).mockRejectedValue(new Error('ECONNRESET'));

    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:7',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // Malformed voice reference
  // ------------------------------------------------------------------

  it('returns null for a malformed cloned voice reference (non-numeric id)', async () => {
    const result = await callGenerateVoiceoverForClonedVoice(
      'Hello',
      'cloned:not-a-number',
      undefined,
      undefined,
      'user-abc',
    );

    expect(result).toBeNull();
    expect(vi.mocked(generatePlayhtSpeech)).not.toHaveBeenCalled();
  });
});
