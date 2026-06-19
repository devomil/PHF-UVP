import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// In-memory DB stub — mirrors the pattern from brand-media-routes.test.ts.
// Handles: select/from/where/orderBy, insert/values/returning,
//          update/set/where/returning, delete/where/returning.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  cloned_voices: [],
};
let nextId = 1;

function tableName(table: any): string {
  const sym = Object.getOwnPropertySymbols(table).find(
    (s) => s.toString() === 'Symbol(drizzle:Name)',
  );
  return sym ? table[sym] : '';
}

interface WhereFilter {
  id?: number;
  userId?: string;
}

function extractFilter(condition: any): WhereFilter {
  const out: WhereFilter = {};
  if (!condition) return out;
  let pendingCol: string | null = null;

  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if ('name' in node && typeof node.name === 'string' && 'table' in node) {
      pendingCol = node.name;
      return;
    }
    if ('value' in node && 'brand' in node && pendingCol) {
      const camel =
        pendingCol === 'id'
          ? 'id'
          : pendingCol === 'user_id'
          ? 'userId'
          : pendingCol;
      (out as any)[camel] = node.value;
      pendingCol = null;
      return;
    }
    if (Array.isArray(node.queryChunks)) {
      for (const child of node.queryChunks) visit(child);
    }
  }
  visit(condition);
  return out;
}

function rowMatches(row: Row, filter: WhereFilter): boolean {
  if (filter.id !== undefined && row.id !== filter.id) return false;
  if (filter.userId !== undefined && row.userId !== filter.userId) return false;
  return true;
}

function makeSelect(table: any) {
  const name = tableName(table);
  let filter: WhereFilter = {};
  const chain = {
    where(cond: any) {
      filter = extractFilter(cond);
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return chain;
    },
    then(resolve: (rows: Row[]) => void) {
      resolve(tables[name].filter((r) => rowMatches(r, filter)));
    },
  };
  return chain;
}

const dbMock = {
  select() {
    return {
      from(table: any) {
        return makeSelect(table);
      },
    };
  },
  insert(table: any) {
    const name = tableName(table);
    return {
      values(row: Row) {
        return {
          returning: async () => {
            const created = {
              id: nextId++,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...row,
            };
            tables[name].push(created);
            return [created];
          },
        };
      },
    };
  },
  update(table: any) {
    const name = tableName(table);
    let updates: Row = {};
    let filter: WhereFilter = {};
    const chain = {
      set(u: Row) {
        updates = u;
        return chain;
      },
      where(cond: any) {
        filter = extractFilter(cond);
        return chain;
      },
      returning: async () => {
        const matches = tables[name].filter((r) => rowMatches(r, filter));
        for (const m of matches) Object.assign(m, updates);
        return matches;
      },
    };
    return chain;
  },
  delete(table: any) {
    const name = tableName(table);
    let filter: WhereFilter = {};
    const chain = {
      where(cond: any) {
        filter = extractFilter(cond);
        return chain;
      },
      returning: async () => {
        const matches = tables[name].filter((r) => rowMatches(r, filter));
        tables[name] = tables[name].filter((r) => !matches.includes(r));
        return matches;
      },
    };
    return chain;
  },
};

vi.mock('../../db', () => ({ db: dbMock, pool: {} }));

// ---------------------------------------------------------------------------
// Mock fs so we don't touch the real filesystem.
// ---------------------------------------------------------------------------
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock music-metadata to control duration parsing per test.
// ---------------------------------------------------------------------------
const mmParseMock = vi.fn().mockResolvedValue({ format: { duration: 15 } });
vi.mock('music-metadata', () => ({
  parseBuffer: (...args: any[]) => mmParseMock(...args),
}));

// ---------------------------------------------------------------------------
// Mock global fetch so triggerPlayhtClone doesn't make real network calls.
// Default: return a successful Play.ht response.
// ---------------------------------------------------------------------------
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ id: 'playht-voice-abc123' }),
  text: async () => '',
});
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Test-friendly auth: spoof user via x-test-user header.
// ---------------------------------------------------------------------------
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    const id = req.headers['x-test-user'];
    if (id) {
      req.user = { id };
      next();
    } else {
      _res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  },
}));

// ---------------------------------------------------------------------------
// Import the router AFTER all mocks are registered.
// ---------------------------------------------------------------------------
const { default: voiceCloneRouter } = await import('../voice-clone-routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/voice-cloning', voiceCloneRouter);
  return app;
}

// Minimal WAV buffer with RIFF magic bytes.
function makeWavBuffer(): Buffer {
  const buf = Buffer.alloc(44);
  buf[0] = 0x52; // R
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x46; // F
  return buf;
}

// Minimal MP3 buffer with ID3 magic bytes.
function makeMp3Buffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x49; // I
  buf[1] = 0x44; // D
  buf[2] = 0x33; // 3
  return buf;
}

beforeEach(() => {
  tables.cloned_voices = [];
  nextId = 1;
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'playht-voice-abc123' }),
    text: async () => '',
  });
  mmParseMock.mockResolvedValue({ format: { duration: 15 } });
  process.env.PLAYHT_API_KEY = 'test-api-key';
  process.env.PLAYHT_USER_ID = 'test-user-id';
});

afterEach(() => {
  delete process.env.PLAYHT_API_KEY;
  delete process.env.PLAYHT_USER_ID;
});

// ===========================================================================
// GET /api/voice-cloning — list voices
// ===========================================================================

describe('GET /api/voice-cloning', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(makeApp()).get('/api/voice-cloning');
    expect(res.status).toBe(401);
  });

  it('returns an empty list when the user has no cloned voices', async () => {
    const res = await request(makeApp())
      .get('/api/voice-cloning')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.voices).toEqual([]);
  });

  it("only returns the calling user's voices, not other users'", async () => {
    tables.cloned_voices.push(
      {
        id: 1,
        userId: 'user-A',
        name: 'A Voice',
        sampleUrl: '/uploads/voice-samples/a.wav',
        provider: 'playht',
        status: 'ready',
        providerVoiceId: 'v-aaa',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        userId: 'user-B',
        name: 'B Voice',
        sampleUrl: '/uploads/voice-samples/b.wav',
        provider: 'playht',
        status: 'ready',
        providerVoiceId: 'v-bbb',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const res = await request(makeApp())
      .get('/api/voice-cloning')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.voices).toHaveLength(1);
    expect(res.body.voices[0].name).toBe('A Voice');
    expect(res.body.voices[0].userId).toBe('user-A');
  });

  it('returns all voices belonging to the authenticated user', async () => {
    tables.cloned_voices.push(
      {
        id: 1,
        userId: 'user-A',
        name: 'Voice One',
        sampleUrl: '/uploads/voice-samples/1.wav',
        provider: 'playht',
        status: 'ready',
        providerVoiceId: 'v-1',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        userId: 'user-A',
        name: 'Voice Two',
        sampleUrl: '/uploads/voice-samples/2.wav',
        provider: 'playht',
        status: 'pending',
        providerVoiceId: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const res = await request(makeApp())
      .get('/api/voice-cloning')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.voices).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/voice-cloning — upload & create clone
// ===========================================================================

describe('POST /api/voice-cloning', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .attach('sample', makeWavBuffer(), { filename: 'voice.wav', contentType: 'audio/wav' })
      .field('name', 'My Voice');
    expect(res.status).toBe(401);
  });

  it('returns 400 when no audio file is provided', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .field('name', 'My Voice');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/No audio sample/i);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'voice.wav', contentType: 'audio/wav' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when name is whitespace only', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'voice.wav', contentType: 'audio/wav' })
      .field('name', '   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('returns 400 when the uploaded file has invalid magic bytes (not WAV or MP3)', async () => {
    const invalidBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', invalidBuf, { filename: 'fake.wav', contentType: 'audio/wav' })
      .field('name', 'My Voice');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid audio file/i);
  });

  it('returns 400 when audio duration is below the minimum (10 s)', async () => {
    mmParseMock.mockResolvedValue({ format: { duration: 5 } });
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'short.wav', contentType: 'audio/wav' })
      .field('name', 'Short Voice');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 10 seconds/i);
  });

  it('accepts a valid WAV upload and returns 201 with a pending record', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'valid.wav', contentType: 'audio/wav' })
      .field('name', '  My Voice  ');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.voice.name).toBe('My Voice');
    expect(res.body.voice.userId).toBe('user-A');
    expect(res.body.voice.status).toBe('pending');
    expect(res.body.voice.provider).toBe('playht');
    expect(res.body.voice.sampleUrl).toMatch(/\/uploads\/voice-samples\//);
  });

  it('accepts a valid MP3 upload (ID3 magic bytes)', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeMp3Buffer(), { filename: 'voice.mp3', contentType: 'audio/mpeg' })
      .field('name', 'MP3 Voice');
    expect(res.status).toBe(201);
    expect(res.body.voice.sampleUrl).toMatch(/\.mp3$/);
  });

  it('trims the voice name before saving', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'v.wav', contentType: 'audio/wav' })
      .field('name', '  Padded Name  ');
    expect(res.status).toBe(201);
    expect(res.body.voice.name).toBe('Padded Name');
  });

  it('proceeds when music-metadata cannot parse duration (allows upload)', async () => {
    mmParseMock.mockRejectedValue(new Error('parse error'));
    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'unparseable.wav', contentType: 'audio/wav' })
      .field('name', 'Unparseable');
    expect(res.status).toBe(201);
  });

  it('triggers Play.ht clone in the background (fetch called after 201)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'playht-voice-xyz' }),
      text: async () => '',
    });

    const res = await request(makeApp())
      .post('/api/voice-cloning')
      .set('x-test-user', 'user-A')
      .attach('sample', makeWavBuffer(), { filename: 'v.wav', contentType: 'audio/wav' })
      .field('name', 'Clone Trigger Test');
    expect(res.status).toBe(201);

    // Give the background promise a tick to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.play.ht/api/v2/cloned-voices/instant',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ===========================================================================
// POST /api/voice-cloning/:id/preview — generate a TTS preview
// ===========================================================================

describe('POST /api/voice-cloning/:id/preview', () => {
  function seedVoice(userId: string, overrides: Partial<Row> = {}): Row {
    const row = {
      id: nextId++,
      userId,
      name: 'Preview Voice',
      sampleUrl: '/uploads/voice-samples/preview.wav',
      provider: 'playht',
      status: 'ready',
      providerVoiceId: 'v-preview',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    tables.cloned_voices.push(row);
    return row;
  }

  it('returns 401 for unauthenticated requests', async () => {
    const voice = seedVoice('user-A');
    const res = await request(makeApp()).post(`/api/voice-cloning/${voice.id}/preview`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric voice ID', async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning/not-a-number/preview')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid voice ID/i);
  });

  it("returns 404 when the voice does not exist", async () => {
    const res = await request(makeApp())
      .post('/api/voice-cloning/9999/preview')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 404 when user A tries to preview user B's voice", async () => {
    const bVoice = seedVoice('user-B');
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${bVoice.id}/preview`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when the voice status is not ready (pending)', async () => {
    const voice = seedVoice('user-A', { status: 'pending', providerVoiceId: null });
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not ready/i);
  });

  it('returns 400 when the voice status is failed', async () => {
    const voice = seedVoice('user-A', { status: 'failed', providerVoiceId: null });
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not ready/i);
  });

  it('returns 400 when status is ready but providerVoiceId is missing', async () => {
    const voice = seedVoice('user-A', { status: 'ready', providerVoiceId: null });
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not ready/i);
  });

  it('returns 503 when Play.ht credentials are not configured', async () => {
    delete process.env.PLAYHT_API_KEY;
    delete process.env.PLAYHT_USER_ID;
    const voice = seedVoice('user-A');
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it('streams audio/mpeg back on a valid ready voice', async () => {
    const fakeAudio = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer,
      text: async () => '',
    });

    const voice = seedVoice('user-A');
    const res = await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('calls Play.ht TTS with the correct voice ID and preview text', async () => {
    const fakeAudio = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio.buffer,
      text: async () => '',
    });

    const voice = seedVoice('user-A', { providerVoiceId: 'v-unique-123' });
    await request(makeApp())
      .post(`/api/voice-cloning/${voice.id}/preview`)
      .set('x-test-user', 'user-A');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.play.ht/api/v2/tts/stream',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('v-unique-123'),
      }),
    );
  });
});

// ===========================================================================
// DELETE /api/voice-cloning/:id — delete voice
// ===========================================================================

describe('DELETE /api/voice-cloning/:id', () => {
  function seedVoice(userId: string, overrides: Partial<Row> = {}): Row {
    const row = {
      id: nextId++,
      userId,
      name: 'Seed Voice',
      sampleUrl: '/uploads/voice-samples/seed.wav',
      provider: 'playht',
      status: 'ready',
      providerVoiceId: 'v-seed',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    tables.cloned_voices.push(row);
    return row;
  }

  it('returns 401 for unauthenticated requests', async () => {
    const voice = seedVoice('user-A');
    const res = await request(makeApp()).delete(`/api/voice-cloning/${voice.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric voice ID', async () => {
    const res = await request(makeApp())
      .delete('/api/voice-cloning/not-a-number')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid voice ID/i);
  });

  it("returns 404 when user A tries to delete user B's voice", async () => {
    const bVoice = seedVoice('user-B', { name: "B's Voice" });
    const res = await request(makeApp())
      .delete(`/api/voice-cloning/${bVoice.id}`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    // Row is still in the table.
    expect(tables.cloned_voices).toHaveLength(1);
  });

  it("returns 404 when trying to delete a voice that doesn't exist", async () => {
    const res = await request(makeApp())
      .delete('/api/voice-cloning/9999')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(404);
  });

  it('allows the owner to delete their own voice and removes the row', async () => {
    const voice = seedVoice('user-A');
    const res = await request(makeApp())
      .delete(`/api/voice-cloning/${voice.id}`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(voice.id);
    expect(tables.cloned_voices).toHaveLength(0);
  });

  it('does not delete the other user\'s voice when user A deletes their own', async () => {
    const aVoice = seedVoice('user-A', { name: 'A Voice' });
    seedVoice('user-B', { name: 'B Voice' });

    const res = await request(makeApp())
      .delete(`/api/voice-cloning/${aVoice.id}`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(tables.cloned_voices).toHaveLength(1);
    expect(tables.cloned_voices[0].userId).toBe('user-B');
  });
});
