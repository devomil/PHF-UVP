import { describe, it, expect, beforeEach, vi } from 'vitest';

// Task #108: tests for atomic per-scene merge primitives in video-project-db.ts.

const executeMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();

vi.mock('../../db', () => ({
  db: {
    execute: executeMock,
    update: () => ({ set: () => ({ where: updateMock }) }),
    select: () => ({ from: () => ({ where: selectMock }) }),
  },
}));
vi.mock('../../../shared/schema', () => ({
  universalVideoProjects: { projectId: 'projectId', scenes: 'scenes' } as any,
}));
vi.mock('drizzle-orm', () => ({
  eq: (a: any, b: any) => ({ a, b }),
  // sql tag captures strings + bound values; nested sql tags are flattened
  // so chained jsonb_set expressions surface their values to the simulator.
  sql: (strings: TemplateStringsArray, ...values: any[]) => {
    const flatStrings: string[] = [strings[0] ?? ''];
    const flatValues: any[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const next = strings[i + 1] ?? '';
      if (v && typeof v === 'object' && Array.isArray(v.strings) && Array.isArray(v.values)) {
        // Splice nested sql in — joining boundary strings.
        flatStrings[flatStrings.length - 1] = flatStrings[flatStrings.length - 1] + (v.strings[0] ?? '');
        for (let j = 0; j < v.values.length; j++) {
          flatValues.push(v.values[j]);
          flatStrings.push(v.strings[j + 1] ?? '');
        }
        flatStrings[flatStrings.length - 1] = flatStrings[flatStrings.length - 1] + next;
      } else {
        flatValues.push(v);
        flatStrings.push(next);
      }
    }
    return { strings: flatStrings, values: flatValues, raw: flatStrings.join('?') };
  },
}));

// In-memory PG simulator: each execute() call atomically reads the row's
// current scenes, applies the merge, and writes back. Sufficient to prove
// the lost-update guarantee for two parallel calls.

type FakeRow = { project_id: string; scenes: any[] };
let store: FakeRow[] = [];

function simulateExecute(tag: any) {
  const raw = String(tag.raw ?? tag.strings?.join('?') ?? '');
  const values = tag.values as any[];
  const projectId = values[values.length - 1];
  const row = store.find((r) => r.project_id === projectId);
  if (!row) return Promise.resolve({ rowCount: 0 });

  if (raw.includes('|| ') && raw.includes('::jsonb')) {
    // patchSceneAtomic: [sceneId, patchJson, projectId]
    const [sceneId, patchJson] = values;
    const patch = JSON.parse(patchJson);
    row.scenes = row.scenes.map((s) =>
      s.id === sceneId ? { ...s, ...patch } : s,
    );
    return Promise.resolve({ rowCount: 1 });
  }

  if (raw.includes('jsonb_set')) {
    // single: [sceneId, msIdx, path, imageUrl, projectId]
    // batch:  [sceneId, maxIdx, path1, url1, ..., projectId]
    const sceneId = values[0];
    const inner = values.slice(2, values.length - 1);
    const updates: Array<{ path: string; url: string }> = [];
    for (let i = 0; i + 1 < inner.length; i += 2) {
      updates.push({ path: inner[i], url: inner[i + 1] });
    }
    row.scenes = row.scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const next = {
        ...s,
        microScenes: Array.isArray(s.microScenes) ? [...s.microScenes] : [],
      };
      for (const { path, url } of updates) {
        const m = /\{microScenes,(\d+),imageUrl\}/.exec(path);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        if (idx >= 0 && idx < next.microScenes.length) {
          next.microScenes[idx] = { ...next.microScenes[idx], imageUrl: url };
        }
      }
      return next;
    });
    return Promise.resolve({ rowCount: 1 });
  }

  return Promise.resolve({ rowCount: 0 });
}

describe('video-project-db: patchSceneAtomic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = [
      {
        project_id: 'p1',
        scenes: [
          { id: 'scene-A', narration: 'a' },
          { id: 'scene-B', narration: 'b' },
        ],
      },
    ];
    executeMock.mockImplementation((tag: any) => simulateExecute(tag));
  });

  it('two concurrent per-scene patches BOTH land safely (no lost update)', async () => {
    const { patchSceneAtomic } = await import('../video-project-db');

    await Promise.all([
      patchSceneAtomic('p1', 'scene-A', { thumbnailUrl: 'a-url', thumbnailStatus: 'complete' }),
      patchSceneAtomic('p1', 'scene-B', { thumbnailUrl: 'b-url', thumbnailStatus: 'complete' }),
    ]);

    const row = store.find((r) => r.project_id === 'p1')!;
    expect(row.scenes.find((s) => s.id === 'scene-A')).toMatchObject({
      thumbnailUrl: 'a-url',
      thumbnailStatus: 'complete',
    });
    expect(row.scenes.find((s) => s.id === 'scene-B')).toMatchObject({
      thumbnailUrl: 'b-url',
      thumbnailStatus: 'complete',
    });
  });

  it('contrast: a legacy read-modify-write pattern loses one update under the same race', async () => {
    // Models the OLD behavior to document the failure mode patchSceneAtomic prevents.
    let scenes = [
      { id: 'scene-A', narration: 'a' },
      { id: 'scene-B', narration: 'b' },
    ];
    async function legacyRMW(sceneId: string, patch: any) {
      const local = JSON.parse(JSON.stringify(scenes));
      await new Promise((r) => setImmediate(r));
      const idx = local.findIndex((s: any) => s.id === sceneId);
      local[idx] = { ...local[idx], ...patch };
      scenes = local;
    }
    await Promise.all([
      legacyRMW('scene-A', { thumbnailUrl: 'a-url' }),
      legacyRMW('scene-B', { thumbnailUrl: 'b-url' }),
    ]);
    const aOk = (scenes.find((s) => s.id === 'scene-A') as any)?.thumbnailUrl === 'a-url';
    const bOk = (scenes.find((s) => s.id === 'scene-B') as any)?.thumbnailUrl === 'b-url';
    expect(aOk && bOk).toBe(false); // one of them was lost
  });

  it('preserves non-patched fields on the same scene', async () => {
    const { patchSceneAtomic } = await import('../video-project-db');
    store[0].scenes[0] = { id: 'scene-A', narration: 'original', visualDirection: 'keep me' };

    await patchSceneAtomic('p1', 'scene-A', { thumbnailUrl: 'x' });

    const row = store.find((r) => r.project_id === 'p1')!;
    expect(row.scenes[0]).toMatchObject({
      id: 'scene-A',
      narration: 'original',
      visualDirection: 'keep me',
      thumbnailUrl: 'x',
    });
  });

  it('returns 0 rowCount when the project does not exist', async () => {
    const { patchSceneAtomic } = await import('../video-project-db');
    const n = await patchSceneAtomic('does-not-exist', 'scene-A', { thumbnailUrl: 'x' });
    expect(n).toBe(0);
  });
});

describe('video-project-db: micro-scene helpers use atomic SQL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = [
      {
        project_id: 'p1',
        scenes: [
          {
            id: 'scene-A',
            microScenes: [
              { imageUrl: '' },
              { imageUrl: '' },
              { imageUrl: '' },
            ],
          },
          {
            id: 'scene-B',
            microScenes: [{ imageUrl: '' }, { imageUrl: '' }],
          },
        ],
      },
    ];
    executeMock.mockImplementation((tag: any) => simulateExecute(tag));
  });

  it('updateMicroSceneImageUrl writes a single micro-scene atomically and returns true', async () => {
    const { updateMicroSceneImageUrl } = await import('../video-project-db');
    const ok = await updateMicroSceneImageUrl('p1', 'scene-A', 1, 'https://cdn/A1.png');
    expect(ok).toBe(true);
    expect(store[0].scenes[0].microScenes[1].imageUrl).toBe('https://cdn/A1.png');
    expect(updateMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('batchUpdateMicroSceneImageUrls applies all updates in one atomic statement', async () => {
    const { batchUpdateMicroSceneImageUrls } = await import('../video-project-db');
    const ok = await batchUpdateMicroSceneImageUrls('p1', 'scene-A', [
      { msIdx: 0, imageUrl: 'https://cdn/A0.png' },
      { msIdx: 2, imageUrl: 'https://cdn/A2.png' },
    ]);
    expect(ok).toBe(true);
    expect(store[0].scenes[0].microScenes.map((m: any) => m.imageUrl)).toEqual([
      'https://cdn/A0.png',
      '',
      'https://cdn/A2.png',
    ]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent micro-scene writes to different scenes BOTH land safely', async () => {
    const { updateMicroSceneImageUrl } = await import('../video-project-db');
    await Promise.all([
      updateMicroSceneImageUrl('p1', 'scene-A', 0, 'https://cdn/A0.png'),
      updateMicroSceneImageUrl('p1', 'scene-B', 1, 'https://cdn/B1.png'),
    ]);
    expect(store[0].scenes[0].microScenes[0].imageUrl).toBe('https://cdn/A0.png');
    expect(store[0].scenes[1].microScenes[1].imageUrl).toBe('https://cdn/B1.png');
  });

  it('rejects out-of-range msIdx without an UPDATE round-trip', async () => {
    const { updateMicroSceneImageUrl } = await import('../video-project-db');
    const ok = await updateMicroSceneImageUrl('p1', 'scene-A', -1, 'x');
    expect(ok).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('batchUpdateMicroSceneImageUrls is a no-op (returns true) for an empty list', async () => {
    const { batchUpdateMicroSceneImageUrls } = await import('../video-project-db');
    const ok = await batchUpdateMicroSceneImageUrls('p1', 'scene-A', []);
    expect(ok).toBe(true);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
