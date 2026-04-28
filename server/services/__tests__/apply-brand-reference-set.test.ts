import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Scene, VideoProject } from '../../../shared/video-types';

// `server/db.ts` throws at module load if DATABASE_URL is unset; the real DB
// is replaced wholesale via vi.mock below — this is just so the load-time
// guard doesn't fire if anything reaches it transitively.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// In-memory stores for the two pieces of state this endpoint touches:
//   - the saved brand reference set (queried via drizzle on `brandReferenceSets`)
//   - the project (fetched/saved via getProjectFromDb / saveProjectToDb)
// Both are mocked so the test never opens a real DB connection.
// ---------------------------------------------------------------------------

interface FakeRefSet {
  id: number;
  ownerId: string;
  name: string;
  description: string | null;
  references: Array<{ assetUrl: string; tag?: string; label?: string }>;
}

const refSets: FakeRefSet[] = [];
const projects: Record<string, VideoProject & { ownerId: string; scenes: Scene[] }> = {};
const savedProjects: Array<{ projectId: string; ownerId: string; scenes: Scene[] }> = [];

function extractIdAndOwnerFromCondition(condition: any): {
  id?: number;
  ownerId?: string;
} {
  const out: { id?: number; ownerId?: string } = {};
  let pendingCol: string | null = null;
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const c of node) visit(c);
      return;
    }
    if ('name' in node && typeof node.name === 'string' && 'table' in node) {
      pendingCol = node.name;
      return;
    }
    if ('value' in node && 'brand' in node && pendingCol) {
      const camel =
        pendingCol === 'id' ? 'id' : pendingCol === 'owner_id' ? 'ownerId' : pendingCol;
      (out as any)[camel] = node.value;
      pendingCol = null;
      return;
    }
    if (Array.isArray(node.queryChunks)) for (const c of node.queryChunks) visit(c);
  }
  visit(condition);
  return out;
}

const dbMock = {
  select() {
    return {
      from() {
        let filter: { id?: number; ownerId?: string } = {};
        const chain: any = {
          where(cond: any) {
            filter = extractIdAndOwnerFromCondition(cond);
            return chain;
          },
          limit() {
            return chain;
          },
          orderBy() {
            return chain;
          },
          then(resolve: (rows: FakeRefSet[]) => void) {
            const rows = refSets.filter(
              (r) =>
                (filter.id === undefined || r.id === filter.id) &&
                (filter.ownerId === undefined || r.ownerId === filter.ownerId),
            );
            resolve(rows);
          },
        };
        return chain;
      },
    };
  },
  insert() {
    return { values: () => ({ returning: async () => [] }) };
  },
  update() {
    return { set: () => ({ where: () => ({ returning: async () => [] }) }) };
  },
  delete() {
    return { where: () => ({ returning: async () => [] }) };
  },
};

vi.mock('../../db', () => ({ db: dbMock, pool: {} }));

// Mock project DB layer used by the apply endpoint.
vi.mock('../../services/video-project-db', () => ({
  getProjectFromDb: async (projectId: string) => projects[projectId] ?? null,
  saveProjectToDb: async (project: any, ownerId: string) => {
    // Record what would have been written so tests can assert on it.
    savedProjects.push({
      projectId: project.projectId,
      ownerId,
      scenes: JSON.parse(JSON.stringify(project.scenes)),
    });
    // Also reflect into the in-memory store so re-reads see the new state.
    projects[project.projectId] = {
      ...projects[project.projectId],
      scenes: project.scenes,
    } as any;
  },
  dbRowToVideoProject: (row: any) => row,
  mergeRenderSettingsToDb: async () => {},
}));

// Auth middleware: spoof the user via x-test-user header.
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    const id = req.headers['x-test-user'];
    if (!id) return _res.status(401).json({ message: 'Not authenticated' });
    req.user = { id };
    return next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  isAdmin: (_req: any, _res: any, next: any) => next(),
}));

// Heavy services pulled in by universal-video-routes — none are exercised by
// the apply-brand-reference-set handler, so we replace them with empty stubs
// to keep test load time low and avoid network/AWS init at import.
vi.mock('../../services/universal-video-service', () => ({ universalVideoService: {} }));
vi.mock('../../services/remotion-lambda-service', () => ({ remotionLambdaService: {} }));
vi.mock('../../services/chunked-render-service', () => ({
  chunkedRenderService: {},
  MAX_CHUNK_DURATION_SEC: 30,
  CHUNK_THRESHOLD_SEC: 60,
}));
vi.mock('../../services/quality-evaluation-service', () => ({ qualityEvaluationService: {} }));
vi.mock('../../services/scene-analysis-service', () => ({ sceneAnalysisService: {} }));
vi.mock('../../services/scene-regeneration-service', () => ({ sceneRegenerationService: {} }));
vi.mock('../../services/auto-regeneration-service', () => ({ autoRegenerationService: {} }));
vi.mock('../../services/intelligent-regeneration-service', () => ({
  intelligentRegenerationService: {},
}));
vi.mock('../../services/intelligent-prompt-improver', () => ({ intelligentPromptImprover: {} }));
vi.mock('../../services/regeneration-strategy-engine', () => ({ regenerationStrategyEngine: {} }));
vi.mock('../../services/prompt-complexity-analyzer', () => ({ promptComplexityAnalyzer: {} }));
vi.mock('../../services/sound-design-service', () => ({ soundDesignService: {} }));
vi.mock('../../services/script-pipeline-service', () => ({ runScriptPipeline: async () => ({}) }));
vi.mock('../../services/image-generation-service', () => ({ imageGenerationService: {} }));
vi.mock('../../services/image-composition-service', () => ({ imageCompositionService: {} }));
vi.mock('../../services/image-to-video-service', () => ({ imageToVideoService: {} }));
vi.mock('../../services/piapi-video-service', () => ({ piapiVideoService: {} }));
vi.mock('../../services/cinematic-flow-service', () => ({
  runCinematicFlow: async () => ({}),
  getCinematicFlowStatus: () => ({}),
  cancelCinematicFlow: () => {},
}));

// Now safe to import the router under test. The apply endpoint uses dynamic
// imports for ../db, ../../shared/schema, drizzle-orm, and brand-reference-helpers,
// so vi.mock above on '../../db' covers the dynamic case as well.
const { default: universalVideoRouter } = await import('../universal-video-routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/universal-video', universalVideoRouter);
  return app;
}

function makeProductScene(id: string): Scene {
  return {
    id,
    sceneNumber: parseInt(id.replace(/\D/g, '')) || 1,
    description: 'A product scene',
    duration: 5,
    contentType: 'product',
  } as any;
}

function makeNonProductScene(id: string): Scene {
  return {
    id,
    sceneNumber: parseInt(id.replace(/\D/g, '')) || 1,
    description: 'A cta scene',
    duration: 5,
    contentType: 'cta',
  } as any;
}

beforeEach(() => {
  refSets.length = 0;
  Object.keys(projects).forEach((k) => delete projects[k]);
  savedProjects.length = 0;
});

describe('POST /api/universal-video/projects/:projectId/apply-brand-reference-set', () => {
  it("returns 404 when applying someone else's reference set", async () => {
    const app = makeApp();
    refSets.push({
      id: 10,
      ownerId: 'user-B',
      name: "B's pack",
      description: null,
      references: [{ assetUrl: 'https://cdn.test/b.png' }],
    });
    projects['proj-A'] = {
      projectId: 'proj-A',
      ownerId: 'user-A',
      scenes: [makeProductScene('s1')],
    } as any;

    const res = await request(app)
      .post('/api/universal-video/projects/proj-A/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 10 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(savedProjects).toHaveLength(0);
  });

  it("returns 403 when the user does not own the project", async () => {
    const app = makeApp();
    refSets.push({
      id: 11,
      ownerId: 'user-A',
      name: 'mine',
      description: null,
      references: [{ assetUrl: 'https://cdn.test/a.png' }],
    });
    projects['proj-B'] = {
      projectId: 'proj-B',
      ownerId: 'user-B',
      scenes: [makeProductScene('s1')],
    } as any;

    const res = await request(app)
      .post('/api/universal-video/projects/proj-B/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 11 });

    expect(res.status).toBe(403);
    expect(savedProjects).toHaveLength(0);
  });

  it("returns 404 when the project does not exist", async () => {
    const app = makeApp();
    refSets.push({
      id: 12,
      ownerId: 'user-A',
      name: 'mine',
      description: null,
      references: [{ assetUrl: 'https://cdn.test/a.png' }],
    });
    const res = await request(app)
      .post('/api/universal-video/projects/missing/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 12 });
    expect(res.status).toBe(404);
  });

  it('returns 400 when setId is missing or invalid', async () => {
    const app = makeApp();
    projects['p1'] = {
      projectId: 'p1',
      ownerId: 'user-A',
      scenes: [makeProductScene('s1')],
    } as any;

    let res = await request(app)
      .post('/api/universal-video/projects/p1/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({});
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/universal-video/projects/p1/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 'not-a-number' });
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/universal-video/projects/p1/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 0 });
    expect(res.status).toBe(400);
  });

  it('applies the set then is idempotent on re-apply (skips scenes that already have refs)', async () => {
    const app = makeApp();
    refSets.push({
      id: 20,
      ownerId: 'user-A',
      name: 'My pack',
      description: null,
      references: [
        { assetUrl: 'https://cdn.test/a.png' },
        { assetUrl: 'https://cdn.test/b.png' },
      ],
    });
    projects['proj-1'] = {
      projectId: 'proj-1',
      ownerId: 'user-A',
      scenes: [
        makeProductScene('s1'),
        makeProductScene('s2'),
        makeNonProductScene('s3'),
      ],
    } as any;

    // First apply: both product scenes pick up refs, the cta scene is skipped.
    let res = await request(app)
      .post('/api/universal-video/projects/proj-1/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 20 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attachedCount).toBe(2);
    expect(res.body.skippedNonProductType).toBe(1);
    expect(res.body.skippedAlreadyHasRefs).toBe(0);
    expect(savedProjects).toHaveLength(1);

    const written = savedProjects[0].scenes;
    const refs1 = (written[0] as any).brandReferences;
    expect(refs1).toHaveLength(2);
    expect(refs1.map((r: any) => r.tag)).toEqual(['image1', 'image2']);
    expect(refs1.map((r: any) => r.assetUrl)).toEqual([
      'https://cdn.test/a.png',
      'https://cdn.test/b.png',
    ]);
    expect((written[2] as any).brandReferences).toBeUndefined();

    // Second apply (without replaceExisting): nothing should change because
    // both product scenes already have refs.
    res = await request(app)
      .post('/api/universal-video/projects/proj-1/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 20 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attachedCount).toBe(0);
    expect(res.body.skippedAlreadyHasRefs).toBe(2);
    // No second save should have been issued (nothing to write).
    expect(savedProjects).toHaveLength(1);
  });

  it('replaceExisting=true overwrites pre-existing references on product scenes', async () => {
    const app = makeApp();
    refSets.push({
      id: 30,
      ownerId: 'user-A',
      name: 'New pack',
      description: null,
      references: [{ assetUrl: 'https://cdn.test/new.png', label: 'New' }],
    });
    projects['proj-2'] = {
      projectId: 'proj-2',
      ownerId: 'user-A',
      scenes: [
        {
          ...makeProductScene('s1'),
          brandReferences: [
            { assetUrl: 'https://cdn.test/old.png', tag: 'image1', label: 'Old' },
          ],
        } as any,
        makeProductScene('s2'),
      ],
    } as any;

    const res = await request(app)
      .post('/api/universal-video/projects/proj-2/apply-brand-reference-set')
      .set('x-test-user', 'user-A')
      .send({ setId: 30, replaceExisting: true });

    expect(res.status).toBe(200);
    expect(res.body.attachedCount).toBe(2);
    expect(res.body.skippedAlreadyHasRefs).toBe(0);

    const written = savedProjects[0].scenes;
    expect((written[0] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/new.png');
    expect((written[0] as any).brandReferences[0].label).toBe('New');
    expect((written[1] as any).brandReferences[0].assetUrl).toBe('https://cdn.test/new.png');
  });

  it('rejects unauthenticated callers with 401', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/universal-video/projects/proj-1/apply-brand-reference-set')
      .send({ setId: 1 });
    expect(res.status).toBe(401);
  });
});
