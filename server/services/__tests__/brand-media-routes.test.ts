import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// We have to set DATABASE_URL before any module that touches `../db` is
// imported, because `server/db.ts` throws at module load when it isn't set.
// Real DB access is fully replaced via the vi.mock() below — this is just
// to satisfy the load-time guard in case it's reached transitively.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// In-memory DB stub. Drizzle's fluent API is built up via chained calls; for
// testing the brand-media routes we only need to simulate the few chains
// the route handlers actually use:
//   db.select().from(table).where(...).orderBy(...)            → list
//   db.insert(table).values(row).returning()                   → create
//   db.update(table).set(updates).where(...).returning()       → update
//   db.delete(table).where(...).returning()                    → delete
//
// The stub stores rows under the table's pgTable name (e.g.
// "brand_reference_sets") and inspects the SQL chunks Drizzle emits for the
// where clause to figure out the id / ownerId filter. That is brittle in
// general, but stable enough for these CRUD endpoints whose where clauses
// only ever combine `id = ?` and `ownerId = ?` via `and(...)`.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  brand_reference_sets: [],
  brand_media_library: [],
};
let nextId = 1;

function tableName(table: any): string {
  // Drizzle pgTable instances stash their SQL name on a Symbol property.
  const sym = Object.getOwnPropertySymbols(table).find(
    (s) => s.toString() === 'Symbol(drizzle:Name)',
  );
  return sym ? table[sym] : '';
}

interface WhereFilter {
  id?: number;
  ownerId?: string;
}

function extractFilter(condition: any): WhereFilter {
  // Drizzle conditions carry `.queryChunks` (an array of SQL fragments and
  // bound params). Walk it RECURSIVELY: `eq(col, val)` produces a flat list
  // [StringChunk, Column, StringChunk, Param, StringChunk]; `and(a, b)`
  // wraps two SQL nodes with parens. We need to descend into nested SQL
  // nodes to find the column→param pairs.
  const out: WhereFilter = {};
  if (!condition) return out;

  let pendingCol: string | null = null;
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    // Column instance — drizzle Columns expose .name AND .table.
    if (
      'name' in node &&
      typeof node.name === 'string' &&
      'table' in node
    ) {
      pendingCol = node.name;
      return;
    }
    // Param instance — has .value (and .brand) but no .table/.queryChunks.
    if ('value' in node && 'brand' in node && pendingCol) {
      const camel =
        pendingCol === 'id' ? 'id' : pendingCol === 'owner_id' ? 'ownerId' : pendingCol;
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
  if (filter.ownerId !== undefined && row.ownerId !== filter.ownerId) return false;
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
  // Make it thenable so `await` works AND chainable.
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

// The route module also clears caches in brand-bible / brand-context after
// mutations. Replace with no-ops so we don't pull in their heavy deps.
vi.mock('../brand-bible-service', () => ({
  brandBibleService: { clearCache: () => {} },
}));
vi.mock('../brand-settings-service', () => ({
  clearBrandContextCache: () => {},
}));

// Test-friendly auth: any request can spoof a user via the `x-test-user`
// header. The real isAuthenticated middleware reads from passport's session,
// which is more setup than these route tests need.
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    const id = req.headers['x-test-user'];
    if (id) req.user = { id };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// Now safe to import the router under test.
const { default: brandMediaRouter } = await import('../brand-media-routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/brand-media-library', brandMediaRouter);
  return app;
}

beforeEach(() => {
  tables.brand_reference_sets = [];
  tables.brand_media_library = [];
  nextId = 1;
});

describe('POST /api/brand-media-library/reference-sets', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .send({ name: 'My set', references: [{ assetUrl: 'https://cdn.test/a.png' }] });
    expect(res.status).toBe(401);
  });

  it('rejects missing name with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({ references: [{ assetUrl: 'https://cdn.test/a.png' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('rejects whitespace-only name with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({ name: '   ', references: [{ assetUrl: 'https://cdn.test/a.png' }] });
    expect(res.status).toBe(400);
  });

  it('rejects empty references array with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({ name: 'Empty', references: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/references/);
  });

  it('rejects more than 9 references with 400', async () => {
    const app = makeApp();
    const refs = Array.from({ length: 10 }, (_, i) => ({
      assetUrl: `https://cdn.test/${i}.png`,
    }));
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({ name: 'Too many', references: refs });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 9/);
  });

  it('rejects references entries missing assetUrl with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({
        name: 'Bad entry',
        references: [{ assetUrl: 'https://cdn.test/a.png' }, { label: 'no url' }],
      });
    expect(res.status).toBe(400);
  });

  it('caps name length to 255 characters', async () => {
    const app = makeApp();
    const longName = 'x'.repeat(500);
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({
        name: longName,
        references: [{ assetUrl: 'https://cdn.test/a.png' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.name.length).toBe(255);
  });

  it('creates a reference set scoped to the calling user, normalizing tags', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A')
      .send({
        name: '  My Brand Pack  ',
        description: 'desc',
        references: [
          { assetUrl: 'https://cdn.test/a.png', tag: 'wrong' },
          { assetUrl: 'https://cdn.test/b.png' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('user-A');
    expect(res.body.name).toBe('My Brand Pack');
    expect(res.body.references).toEqual([
      { assetUrl: 'https://cdn.test/a.png', tag: 'image1' },
      { assetUrl: 'https://cdn.test/b.png', tag: 'image2' },
    ]);
  });
});

describe('PUT /api/brand-media-library/reference-sets/:id ownership scoping', () => {
  async function seed(ownerId: string, overrides: Partial<Row> = {}): Promise<Row> {
    const row = {
      id: nextId++,
      ownerId,
      name: 'Seed',
      description: null,
      references: [{ assetUrl: 'https://cdn.test/x.png', tag: 'image1' }],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    tables.brand_reference_sets.push(row);
    return row;
  }

  it("returns 404 when user A tries to update user B's set", async () => {
    const app = makeApp();
    const usersBSet = await seed('user-B', { name: "B's set" });
    const res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${usersBSet.id}`)
      .set('x-test-user', 'user-A')
      .send({ name: 'pwned' });
    expect(res.status).toBe(404);
    expect(tables.brand_reference_sets[0].name).toBe("B's set");
  });

  it('allows the owner to update their own set', async () => {
    const app = makeApp();
    const set = await seed('user-A', { name: 'old' });
    const res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .set('x-test-user', 'user-A')
      .send({ name: 'new', references: [{ assetUrl: 'https://cdn.test/y.png' }] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('new');
    expect(res.body.references[0].assetUrl).toBe('https://cdn.test/y.png');
  });

  it('rejects updates that violate references validation (>9, empty, missing url)', async () => {
    const app = makeApp();
    const set = await seed('user-A');
    const tooMany = Array.from({ length: 10 }, (_, i) => ({
      assetUrl: `https://cdn.test/${i}.png`,
    }));

    let res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .set('x-test-user', 'user-A')
      .send({ references: tooMany });
    expect(res.status).toBe(400);

    res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .set('x-test-user', 'user-A')
      .send({ references: [] });
    expect(res.status).toBe(400);

    res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .set('x-test-user', 'user-A')
      .send({ references: [{ label: 'no url' }] });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated update requests with 401', async () => {
    const app = makeApp();
    const set = await seed('user-A');
    const res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects updates with no fields with 400', async () => {
    const app = makeApp();
    const set = await seed('user-A');
    const res = await request(app)
      .put(`/api/brand-media-library/reference-sets/${set.id}`)
      .set('x-test-user', 'user-A')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/brand-media-library/reference-sets/:id ownership scoping', () => {
  it("returns 404 when user A tries to delete user B's set and leaves the row in place", async () => {
    const app = makeApp();
    const ownersRow = {
      id: nextId++,
      ownerId: 'user-B',
      name: "B's set",
      description: null,
      references: [{ assetUrl: 'https://cdn.test/x.png', tag: 'image1' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tables.brand_reference_sets.push(ownersRow);

    const res = await request(app)
      .delete(`/api/brand-media-library/reference-sets/${ownersRow.id}`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(404);
    expect(tables.brand_reference_sets).toHaveLength(1);
  });

  it('allows the owner to delete their own set', async () => {
    const app = makeApp();
    const ownersRow = {
      id: nextId++,
      ownerId: 'user-A',
      name: 'mine',
      description: null,
      references: [{ assetUrl: 'https://cdn.test/x.png', tag: 'image1' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tables.brand_reference_sets.push(ownersRow);

    const res = await request(app)
      .delete(`/api/brand-media-library/reference-sets/${ownersRow.id}`)
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(tables.brand_reference_sets).toHaveLength(0);
  });

  it('rejects unauthenticated delete requests with 401', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/brand-media-library/reference-sets/1');
    expect(res.status).toBe(401);
  });

  it('rejects non-numeric ids with 400', async () => {
    const app = makeApp();
    const res = await request(app)
      .delete('/api/brand-media-library/reference-sets/not-a-number')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/brand-media-library/reference-sets ownership scoping', () => {
  it("only returns the calling user's sets", async () => {
    const app = makeApp();
    tables.brand_reference_sets.push(
      {
        id: 1,
        ownerId: 'user-A',
        name: "A's pack",
        description: null,
        references: [{ assetUrl: 'https://cdn.test/a.png', tag: 'image1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        ownerId: 'user-B',
        name: "B's pack",
        description: null,
        references: [{ assetUrl: 'https://cdn.test/b.png', tag: 'image1' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const res = await request(app)
      .get('/api/brand-media-library/reference-sets')
      .set('x-test-user', 'user-A');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.sets[0].name).toBe("A's pack");
  });
});
