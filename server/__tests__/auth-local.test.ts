import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";
import { getTableName } from "drizzle-orm";

// server/db.ts throws at module load if DATABASE_URL is unset.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET = "test-session-secret";

// ---------------------------------------------------------------------------
// In-memory store for users + oauth_accounts (the two tables the local-login
// + register paths touch). Mirrors the pattern from auth-oauth.test.ts.
// ---------------------------------------------------------------------------

interface FakeUser {
  id: string;
  email: string;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
}
interface FakeOAuthAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
}

const usersStore: FakeUser[] = [];
const oauthStore: FakeOAuthAccount[] = [];

function extractValues(cond: any): string[] {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  function visit(n: any) {
    if (n == null) return;
    if (typeof n === "string") {
      out.push(n);
      return;
    }
    if (typeof n !== "object") return;
    if (seen.has(n)) return;
    seen.add(n);
    if ("columnType" in n || "dataType" in n) return;
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    if ("value" in n && !Array.isArray((n as any).value)) {
      const v = (n as any).value;
      if (typeof v === "string") out.push(v);
    }
    for (const k of Object.keys(n)) {
      if (k === "table" || k === "encoder" || k === "decoder") continue;
      try {
        visit((n as any)[k]);
      } catch {
        // proxy access can throw — ignore
      }
    }
  }
  visit(cond);
  return out;
}

function selectFromUsers(cond: any): FakeUser[] {
  const vals = extractValues(cond);
  const email = vals.find((v) => v.includes("@"));
  if (email) {
    const lower = email.toLowerCase();
    return usersStore.filter((u) => u.email.toLowerCase() === lower);
  }
  if (vals.length > 0) {
    return usersStore.filter((u) => vals.includes(u.id));
  }
  return [];
}

function selectFromOAuth(cond: any): FakeOAuthAccount[] {
  const vals = extractValues(cond);
  if (vals.length > 0) {
    return oauthStore.filter((r) => vals.includes(r.userId) || vals.includes(r.id));
  }
  return [];
}

function makeThenable<T>(producer: () => T) {
  return {
    then(resolve: (v: T) => void, reject?: (e: unknown) => void) {
      try {
        Promise.resolve(producer()).then(resolve, reject);
      } catch (e) {
        if (reject) reject(e);
        else throw e;
      }
    },
  };
}

const dbMock = {
  select() {
    let table: any = null;
    const chain: any = {
      from(t: any) {
        table = t;
        return chain;
      },
      where(cond: any) {
        const tableName = getTableName(table);
        const rows =
          tableName === "oauth_accounts"
            ? selectFromOAuth(cond)
            : selectFromUsers(cond);
        return makeThenable(() => rows);
      },
    };
    return chain;
  },
  insert(table: any) {
    const tableName = getTableName(table);
    return {
      values(vals: any) {
        const doInsert = () => {
          if (tableName === "users") {
            if (
              usersStore.some(
                (u) => u.email.toLowerCase() === String(vals.email).toLowerCase(),
              )
            ) {
              throw { code: "23505", message: "duplicate key" };
            }
            const row: FakeUser = {
              id: vals.id,
              email: vals.email,
              password: vals.password ?? null,
              firstName: vals.firstName ?? null,
              lastName: vals.lastName ?? null,
              profileImageUrl: vals.profileImageUrl ?? null,
              role: vals.role ?? "employee",
            };
            usersStore.push(row);
            return [row];
          }
          return [];
        };
        return {
          returning() {
            return makeThenable(doInsert);
          },
          then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
            try {
              resolve(doInsert());
            } catch (e) {
              if (reject) reject(e);
              else throw e;
            }
          },
        };
      },
    };
  },
  update(table: any) {
    const tableName = getTableName(table);
    return {
      set(vals: any) {
        return {
          where(cond: any) {
            const apply = () => {
              if (tableName === "users") {
                const matches = selectFromUsers(cond);
                for (const m of matches) Object.assign(m, vals);
              }
              return [];
            };
            return makeThenable(apply);
          },
        };
      },
    };
  },
};

vi.mock("../db", () => ({ db: dbMock, pool: {} }));

// connect-pg-simple needs a real pg pool; substitute the in-memory store
// shipped with express-session so the test app can boot without Postgres.
vi.mock("connect-pg-simple", async () => {
  const session = await import("express-session");
  return { default: () => (session as any).MemoryStore };
});

const createTrialMock = vi.fn(async (_userId: string) => {});
vi.mock("../services/credits-service", () => ({
  createInitialTrialForNewUser: createTrialMock,
}));

const signupNotifyMock = vi.fn(async (_p: any) => {});
const welcomeMock = vi.fn(async (_p: any) => {});
vi.mock("../services/notification-service", () => ({
  sendNewUserSignupNotification: signupNotifyMock,
  sendWelcomeEmail: welcomeMock,
}));

// runWithUserContext wraps the request — keep its real impl out of the test
// path (it expects AsyncLocalStorage state we don't set up).
vi.mock("../services/user-context", () => ({
  runWithUserContext: (_id: string, fn: () => unknown) => fn(),
}));

const auth = await import("../auth");
const { setupAuth } = auth;

function buildApp() {
  const app = express();
  app.use(express.json());
  setupAuth(app);
  return app;
}

async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  usersStore.length = 0;
  oauthStore.length = 0;
  createTrialMock.mockClear();
  signupNotifyMock.mockClear();
  welcomeMock.mockClear();
});

// ---------------------------------------------------------------------------
// LocalStrategy verify (exercised through POST /api/login)
// ---------------------------------------------------------------------------

describe("LocalStrategy / POST /api/login", () => {
  it("rejects unknown emails with a generic 'Invalid email or password' message", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "nobody@example.com", password: "anything" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("rejects a known email when the password does not match (same generic message — no email enumeration)", async () => {
    const hashed = await bcrypt.hash("correct-horse", 10);
    usersStore.push({
      id: "u-wrong-pw",
      email: "user@example.com",
      password: hashed,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "user@example.com", password: "battery-staple" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("redirects an OAuth-only (password=null) user to their social provider with a friendly message", async () => {
    usersStore.push({
      id: "u-oauth-only",
      email: "social@example.com",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });
    oauthStore.push({
      id: "oa-1",
      userId: "u-oauth-only",
      provider: "google",
      providerAccountId: "g-1",
      email: "social@example.com",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
    oauthStore.push({
      id: "oa-2",
      userId: "u-oauth-only",
      provider: "facebook",
      providerAccountId: "fb-1",
      email: "social@example.com",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "social@example.com", password: "tries-anyway" });
    expect(res.status).toBe(401);
    // Provider names get capitalized + joined with " or ".
    expect(res.body.message).toBe("This account uses Google or Facebook sign-in");
  });

  it("falls back to a 'no password set' message when the user has no password and no OAuth links", async () => {
    usersStore.push({
      id: "u-passwordless",
      email: "ghost@example.com",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });
    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "ghost@example.com", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Account has no password set");
  });

  it("logs in successfully with the correct password and case-insensitive email match", async () => {
    const hashed = await bcrypt.hash("hunter2", 10);
    usersStore.push({
      id: "u-ok",
      email: "Mixed@Case.com",
      password: hashed,
      firstName: "Mix",
      lastName: "Case",
      profileImageUrl: null,
      role: "employee",
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "MIXED@case.COM", password: "hunter2" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("u-ok");
    expect(res.body.email).toBe("Mixed@Case.com");
    // Password must never leak in the login response.
    expect(res.body.password).toBeUndefined();
  });

  it("auto-promotes an allowlisted email to admin role on successful local login", async () => {
    const hashed = await bcrypt.hash("admin-pw", 10);
    usersStore.push({
      id: "u-admin",
      email: "ryan@pinehillfarm.co",
      password: hashed,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/login")
      .send({ email: "ryan@pinehillfarm.co", password: "admin-pw" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
    // Persisted on the underlying row, not just the response payload.
    expect(usersStore[0].role).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// POST /api/register
// ---------------------------------------------------------------------------

describe("POST /api/register", () => {
  it("returns 400 when email is missing", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/register").send({ password: "pw" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email and password are required");
    expect(usersStore).toHaveLength(0);
  });

  it("returns 400 when password is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/register")
      .send({ email: "no-pw@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email and password are required");
    expect(usersStore).toHaveLength(0);
  });

  it("rejects a duplicate email (case-insensitive) with 400 and does not insert / notify", async () => {
    usersStore.push({
      id: "u-existing",
      email: "dup@example.com",
      password: "hashed",
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });
    const app = buildApp();
    const res = await request(app)
      .post("/api/register")
      .send({ email: "DUP@Example.COM", password: "anything" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already registered");
    expect(usersStore).toHaveLength(1);
    expect(createTrialMock).not.toHaveBeenCalled();
    expect(signupNotifyMock).not.toHaveBeenCalled();
    expect(welcomeMock).not.toHaveBeenCalled();
  });

  it("creates a new user with a lowercased email + bcrypt-hashed password, provisions trial, and fires both notifications", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/register")
      .send({
        email: "Newbie@Example.COM",
        password: "s3cret-pw",
        firstName: "New",
        lastName: "Bie",
      });

    expect(res.status).toBe(201);
    // Response strips the password.
    expect(res.body.password).toBeUndefined();
    expect(res.body.email).toBe("newbie@example.com");
    expect(res.body.firstName).toBe("New");
    expect(res.body.lastName).toBe("Bie");
    expect(res.body.role).toBe("employee");

    // Persisted user is normalized + hashed (not the plaintext we sent).
    expect(usersStore).toHaveLength(1);
    const stored = usersStore[0];
    expect(stored.email).toBe("newbie@example.com");
    expect(stored.password).not.toBe("s3cret-pw");
    expect(stored.password).toBeTruthy();
    expect(await bcrypt.compare("s3cret-pw", stored.password!)).toBe(true);

    // Trial is provisioned synchronously before req.login fires.
    expect(createTrialMock).toHaveBeenCalledTimes(1);
    expect(createTrialMock).toHaveBeenCalledWith(stored.id);

    // Signup + welcome notifications fire (background — flush microtasks).
    await flush();
    expect(signupNotifyMock).toHaveBeenCalledTimes(1);
    expect(signupNotifyMock).toHaveBeenCalledWith({
      email: "newbie@example.com",
      firstName: "New",
      lastName: "Bie",
    });
    expect(welcomeMock).toHaveBeenCalledTimes(1);
    expect(welcomeMock).toHaveBeenCalledWith({
      email: "newbie@example.com",
      firstName: "New",
      lastName: "Bie",
    });
  });

  it("assigns the admin role at registration when the email is on the allowlist", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/register")
      .send({ email: "ryan@pinehillfarm.co", password: "pw12345" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
    expect(usersStore[0].role).toBe("admin");
  });
});
