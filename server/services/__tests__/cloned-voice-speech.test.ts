import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Prevent db.ts from throwing at load time (no real DB needed here).
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// voice-clone-routes.ts imports from db, schema, and drizzle at module level.
// Stub them out so the module loads without errors — generatePlayhtSpeech
// doesn't use any of them at runtime.
vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../../shared/schema', () => ({ clonedVoices: {} }));
vi.mock('drizzle-orm', () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => args,
  desc: (col: any) => col,
}));
vi.mock('../auth', () => ({ isAuthenticated: (_req: any, _res: any, next: any) => next() }));
vi.mock('multer', () => {
  const m: any = () => ({ single: () => (_req: any, _res: any, next: any) => next() });
  m.memoryStorage = () => ({});
  return { default: m };
});

import { generatePlayhtSpeech } from '../voice-clone-routes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: Buffer) {
  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  );
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => arrayBuffer,
  });
}

function mockFetchError(status: number, text: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => text,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePlayhtSpeech', () => {
  const ORIGINAL_PLAYHT_API_KEY = process.env.PLAYHT_API_KEY;
  const ORIGINAL_PLAYHT_USER_ID = process.env.PLAYHT_USER_ID;

  beforeEach(() => {
    process.env.PLAYHT_API_KEY = 'test-api-key';
    process.env.PLAYHT_USER_ID = 'test-user-id';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (ORIGINAL_PLAYHT_API_KEY === undefined) {
      delete process.env.PLAYHT_API_KEY;
    } else {
      process.env.PLAYHT_API_KEY = ORIGINAL_PLAYHT_API_KEY;
    }
    if (ORIGINAL_PLAYHT_USER_ID === undefined) {
      delete process.env.PLAYHT_USER_ID;
    } else {
      process.env.PLAYHT_USER_ID = ORIGINAL_PLAYHT_USER_ID;
    }
    vi.restoreAllMocks();
  });

  it('returns null when PLAYHT_API_KEY is not set', async () => {
    delete process.env.PLAYHT_API_KEY;
    const result = await generatePlayhtSpeech('Hello', 'voice-123');
    expect(result).toBeNull();
  });

  it('returns null when PLAYHT_USER_ID is not set', async () => {
    delete process.env.PLAYHT_USER_ID;
    const result = await generatePlayhtSpeech('Hello', 'voice-123');
    expect(result).toBeNull();
  });

  it('returns null when both PLAYHT env vars are absent', async () => {
    delete process.env.PLAYHT_API_KEY;
    delete process.env.PLAYHT_USER_ID;
    const result = await generatePlayhtSpeech('Hello', 'voice-123');
    expect(result).toBeNull();
  });

  it('returns a Buffer containing audio data on a successful Play.ht response', async () => {
    const audioData = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]);
    vi.stubGlobal('fetch', mockFetchOk(audioData));

    const result = await generatePlayhtSpeech('Hello world', 's3://play.ht/voice-abc');

    expect(result).toBeInstanceOf(Buffer);
    expect(result!.length).toBeGreaterThan(0);
  });

  it('sends the correct headers and body to the Play.ht streaming endpoint', async () => {
    const fetchMock = mockFetchOk(Buffer.from([0x01]));
    vi.stubGlobal('fetch', fetchMock);

    await generatePlayhtSpeech('Test narration', 'my-voice-id');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.play.ht/api/v2/tts/stream');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer test-api-key');
    expect(opts.headers['X-User-ID']).toBe('test-user-id');
    const parsed = JSON.parse(opts.body);
    expect(parsed.voice).toBe('my-voice-id');
    expect(parsed.text).toBe('Test narration');
    expect(parsed.output_format).toBe('mp3');
  });

  it('throws an error when the Play.ht API returns a non-ok status', async () => {
    vi.stubGlobal('fetch', mockFetchError(400, 'Bad voice ID'));

    await expect(generatePlayhtSpeech('Hello', 'bad-voice')).rejects.toThrow(
      'Play.ht TTS returned 400',
    );
  });

  it('propagates errors thrown by fetch itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    );

    await expect(generatePlayhtSpeech('Hello', 'voice-x')).rejects.toThrow(
      'Network failure',
    );
  });
});
