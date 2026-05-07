import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { getTableName } from "drizzle-orm";

// server/db.ts throws at module load if DATABASE_URL is unset; satisfy the
// guard before anything in server/auth.ts pulls it transitively.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";

// ---------------------------------------------------------------------------
// In-memory store for the two tables linkOrCreateOAuthUser touches.
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
  updatedAt?: Date;
}

const usersStore: FakeUser[] = [];
const oauthStore: FakeOAuthAccount[] = [];

// Walk a drizzle condition AST and collect every leaf scalar value. The
// existing tests in server/services/__tests__ use the same general approach
// (see apply-brand-reference-set.test.ts).
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
    // Skip column proxies — they have a `dataType`/`columnType` and a `table` ref.
    if ("columnType" in n || "dataType" in n) return;
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    // drizzle Param: { value, encoder, brand: "Param" } — capture the value.
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

function selectFromOAuth(cond: any): FakeOAuthAccount[] {
  const vals = extractValues(cond);
  const provider = vals.find((v) => v === "google" || v === "facebook" || v === "apple");
  const others = vals.filter((v) => v !== provider);
  if (provider && others.length > 0) {
    // findOAuthLink: provider + providerAccountId
    return oauthStore.filter(
      (r) => r.provider === provider && others.includes(r.providerAccountId),
    );
  }
  // Lookup by id or userId — match either field against any extracted value.
  if (vals.length > 0) {
    return oauthStore.filter((r) => vals.includes(r.id) || vals.includes(r.userId));
  }
  return [];
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

// Allow a single insert to throw a unique-violation, simulating a concurrent
// callback racing the current one. The optional `racingRow`s let the simulated
// race ALSO leave its winning side-effect in the store, so the recovery branch's
// re-fetch finds the row that "won" the race.
let nextOAuthInsertError:
  | { code?: string; message?: string; racingRow?: FakeOAuthAccount }
  | null = null;
let nextUserInsertError:
  | { code?: string; message?: string; racingRow?: FakeUser }
  | null = null;

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
          tableName === "oauth_accounts" ? selectFromOAuth(cond) : selectFromUsers(cond);
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
          if (tableName === "oauth_accounts") {
            if (nextOAuthInsertError) {
              const err = nextOAuthInsertError;
              nextOAuthInsertError = null;
              if (err.racingRow) oauthStore.push(err.racingRow);
              throw err;
            }
            // Enforce the unique (provider, providerAccountId) constraint.
            if (
              oauthStore.some(
                (r) => r.provider === vals.provider && r.providerAccountId === vals.providerAccountId,
              )
            ) {
              throw { code: "23505", message: "duplicate key" };
            }
            const row: FakeOAuthAccount = {
              id: vals.id,
              userId: vals.userId,
              provider: vals.provider,
              providerAccountId: vals.providerAccountId,
              email: vals.email ?? null,
              accessToken: vals.accessToken ?? null,
              refreshToken: vals.refreshToken ?? null,
              expiresAt: vals.expiresAt ?? null,
            };
            oauthStore.push(row);
            return [row];
          }
          if (tableName === "users") {
            if (nextUserInsertError) {
              const err = nextUserInsertError;
              nextUserInsertError = null;
              if (err.racingRow) usersStore.push(err.racingRow);
              throw err;
            }
            if (usersStore.some((u) => u.email.toLowerCase() === String(vals.email).toLowerCase())) {
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
          // Bare `await db.insert(...).values(...)` path
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
              if (tableName === "oauth_accounts") {
                const matches = selectFromOAuth(cond);
                for (const m of matches) Object.assign(m, vals);
              } else if (tableName === "users") {
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

// Track side-effect calls so tests can assert trial + welcome + signup
// notifications fire only on the brand-new-user path.
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

// Now safe to import the module under test.
const auth = await import("../auth");
const {
  linkOrCreateOAuthUser,
  decodeAppleIdToken,
  isAppleConfigured,
  isGoogleConfigured,
  isFacebookConfigured,
  isCanvaLoginEnabled,
  getProvidersStatus,
  OAuthUserError,
} = auth;

beforeEach(() => {
  usersStore.length = 0;
  oauthStore.length = 0;
  nextOAuthInsertError = null;
  nextUserInsertError = null;
  createTrialMock.mockClear();
  signupNotifyMock.mockClear();
  welcomeMock.mockClear();
});

// Allow async background side-effects (.catch handlers) to settle.
async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe("linkOrCreateOAuthUser", () => {
  it("returns the existing user when the oauth_account row already exists (no trial / notification)", async () => {
    const existingUser: FakeUser = {
      id: "user-existing-uuid-1",
      email: "alice@example.com",
      password: null,
      firstName: "Alice",
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    };
    usersStore.push(existingUser);
    oauthStore.push({
      id: "oauth-1",
      userId: existingUser.id,
      provider: "google",
      providerAccountId: "google-sub-123",
      email: "alice@example.com",
      accessToken: "old-token",
      refreshToken: null,
      expiresAt: null,
    });

    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-sub-123",
      email: "alice@example.com",
      emailVerified: true,
      firstName: "Alice",
      lastName: null,
      profileImageUrl: null,
      accessToken: "fresh-token",
      refreshToken: "fresh-refresh",
    });

    expect(result.id).toBe(existingUser.id);
    // Tokens were refreshed on the existing oauth_account row.
    expect(oauthStore[0].accessToken).toBe("fresh-token");
    expect(oauthStore[0].refreshToken).toBe("fresh-refresh");
    // No new user, no trial, no notifications.
    expect(usersStore).toHaveLength(1);
    expect(createTrialMock).not.toHaveBeenCalled();
    expect(signupNotifyMock).not.toHaveBeenCalled();
    expect(welcomeMock).not.toHaveBeenCalled();
  });

  it("links a new oauth_account to an existing user when the verified email matches (case-insensitive)", async () => {
    const existing: FakeUser = {
      id: "user-existing-uuid-2",
      email: "BOB@example.com", // mixed case in store
      password: "hashed",
      firstName: "Bob",
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    };
    usersStore.push(existing);

    const result = await linkOrCreateOAuthUser({
      provider: "facebook",
      providerAccountId: "fb-99",
      email: "bob@example.com",
      emailVerified: true,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });

    expect(result.id).toBe(existing.id);
    expect(oauthStore).toHaveLength(1);
    expect(oauthStore[0]).toMatchObject({
      userId: existing.id,
      provider: "facebook",
      providerAccountId: "fb-99",
      email: "bob@example.com",
    });
    // Linking to an existing user is NOT a signup — no trial / welcome.
    expect(createTrialMock).not.toHaveBeenCalled();
    expect(signupNotifyMock).not.toHaveBeenCalled();
  });

  it("rejects link-by-email when the provider did not confirm email_verified", async () => {
    usersStore.push({
      id: "user-existing-uuid-3",
      email: "carol@example.com",
      password: "hashed",
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });

    await expect(
      linkOrCreateOAuthUser({
        provider: "facebook",
        providerAccountId: "fb-impostor",
        email: "carol@example.com",
        emailVerified: false,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
      }),
    ).rejects.toBeInstanceOf(OAuthUserError);

    // Did not link or create anything.
    expect(oauthStore).toHaveLength(0);
    expect(usersStore).toHaveLength(1);
  });

  it("rejects when the provider returned no email at all", async () => {
    await expect(
      linkOrCreateOAuthUser({
        provider: "facebook",
        providerAccountId: "fb-no-email",
        email: null,
        emailVerified: false,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
      }),
    ).rejects.toBeInstanceOf(OAuthUserError);
    expect(usersStore).toHaveLength(0);
    expect(oauthStore).toHaveLength(0);
  });

  it("creates a brand new user, links the oauth_account, and fires trial + welcome + signup side-effects", async () => {
    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-new-1",
      email: "Newbie@Example.com",
      emailVerified: true,
      firstName: "New",
      lastName: "Bie",
      profileImageUrl: "https://cdn.test/p.png",
      accessToken: "tok",
    });

    expect(usersStore).toHaveLength(1);
    expect(usersStore[0].email).toBe("newbie@example.com"); // normalized
    expect(usersStore[0].role).toBe("employee");
    expect(oauthStore).toHaveLength(1);
    expect(oauthStore[0].userId).toBe(result.id);

    await flush();
    expect(createTrialMock).toHaveBeenCalledTimes(1);
    expect(createTrialMock).toHaveBeenCalledWith(result.id);
    expect(signupNotifyMock).toHaveBeenCalledTimes(1);
    expect(welcomeMock).toHaveBeenCalledTimes(1);
  });

  it("auto-promotes a new user to admin when their email is on the allowlist", async () => {
    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-admin",
      email: "Ryan@PineHillFarm.co",
      emailVerified: true,
      firstName: "Ryan",
      lastName: "Admin",
      profileImageUrl: null,
    });

    expect(result.role).toBe("admin");
    expect(usersStore[0].role).toBe("admin");
  });

  it("auto-promotes an existing non-admin allowlist user when they sign in via OAuth", async () => {
    usersStore.push({
      id: "user-existing-admin",
      email: "ryan@pinehillfarm.co",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });
    oauthStore.push({
      id: "oauth-admin",
      userId: "user-existing-admin",
      provider: "google",
      providerAccountId: "google-admin-existing",
      email: "ryan@pinehillfarm.co",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });

    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-admin-existing",
      email: "ryan@pinehillfarm.co",
      emailVerified: true,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });

    expect(result.role).toBe("admin");
    expect(usersStore[0].role).toBe("admin");
  });

  it("recovers from a unique-violation race when linking a new oauth_account to an existing user", async () => {
    // Existing user that the link-by-email branch will match.
    const existing: FakeUser = {
      id: "user-race-1",
      email: "race@example.com",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    };
    usersStore.push(existing);

    // CRITICAL: oauthStore starts EMPTY so the initial findOAuthLink at the
    // top of linkOrCreateOAuthUser returns nothing — execution must continue
    // into the link-by-verified-email path. The race is simulated *during*
    // the oauth_accounts INSERT: the parallel callback's row is materialized
    // into the store at the same moment our insert raises 23505. The
    // recovery catch then re-fetches via findOAuthLink and resolves to the
    // racing winner instead of bubbling the unique-violation.
    nextOAuthInsertError = {
      code: "23505",
      message: "duplicate key",
      racingRow: {
        id: "oauth-race-winner",
        userId: existing.id,
        provider: "google",
        providerAccountId: "google-race-1",
        email: "race@example.com",
        accessToken: "winner",
        refreshToken: null,
        expiresAt: null,
      },
    };

    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-race-1",
      email: "race@example.com",
      emailVerified: true,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });

    // Recovery branch returned the winning user, not a 500.
    expect(result.id).toBe(existing.id);
    // Only the racing-winner row exists — our failed insert was rolled back
    // (and the recovery branch did NOT add a duplicate).
    expect(oauthStore).toHaveLength(1);
    expect(oauthStore[0].id).toBe("oauth-race-winner");
    // Linking is not a signup — no trial / welcome side-effects fire.
    await flush();
    expect(createTrialMock).not.toHaveBeenCalled();
    expect(signupNotifyMock).not.toHaveBeenCalled();
    expect(welcomeMock).not.toHaveBeenCalled();
  });

  it("recovers from a unique-violation race during the brand-new-user oauth_account insert", async () => {
    // Brand-new user path: no existing user, no existing oauth row. The race
    // happens on the SECOND insert (oauth_accounts) AFTER the user row is
    // already created. Simulates a parallel callback for the same provider
    // sub that beat us to inserting the link.
    nextOAuthInsertError = {
      code: "23505",
      message: "duplicate key",
      racingRow: {
        id: "oauth-race-new-winner",
        userId: "user-race-new-winner-id",
        provider: "google",
        providerAccountId: "google-race-new",
        email: "newrace@example.com",
        accessToken: "winner",
        refreshToken: null,
        expiresAt: null,
      },
    };
    // Pre-seed the racing winner user so the recovery's user-lookup succeeds.
    usersStore.push({
      id: "user-race-new-winner-id",
      email: "newrace@example.com",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    });

    // Force the user insert to also race — winning row is the same one.
    nextUserInsertError = {
      code: "23505",
      message: "duplicate key",
    };

    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-race-new",
      email: "newrace@example.com",
      emailVerified: true,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });

    // Resolved to the racing winner via the recursive recovery path.
    expect(result.id).toBe("user-race-new-winner-id");
    expect(oauthStore.map((r) => r.id)).toEqual(["oauth-race-new-winner"]);
  });

  it("recovers from a unique-violation race during brand-new-user creation", async () => {
    // The verify callback first checks for an existing user by email and finds
    // none, then attempts to insert. Simulate a parallel /api/register or
    // OAuth callback that wins the insert race.
    nextUserInsertError = { code: "23505", message: "duplicate key" };
    // Pre-seed the racing winner so the recovery re-fetch finds them.
    const racedWinner: FakeUser = {
      id: "user-raced-winner",
      email: "raced@example.com",
      password: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: "employee",
    };
    usersStore.push(racedWinner);

    const result = await linkOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-raced",
      email: "raced@example.com",
      emailVerified: true,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });

    // The recovery path falls through to the link-by-email branch and
    // attaches an oauth_account to the racing-winner user.
    expect(result.id).toBe(racedWinner.id);
    expect(oauthStore).toHaveLength(1);
    expect(oauthStore[0].userId).toBe(racedWinner.id);
    // No duplicate trial side-effects on the recovery path.
    await flush();
    expect(createTrialMock).not.toHaveBeenCalled();
  });
});

describe("decodeAppleIdToken", () => {
  function makeIdToken(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "x" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.signature-not-verified`;
  }

  it("decodes a real-shape Apple id_token payload", () => {
    const tok = makeIdToken({
      sub: "001234.abcdef.1234",
      email: "user@example.com",
      email_verified: "true",
      is_private_email: "false",
    });
    const decoded = decodeAppleIdToken(tok);
    expect(decoded?.sub).toBe("001234.abcdef.1234");
    expect(decoded?.email).toBe("user@example.com");
    // Apple's spec: the verified flag arrives as the STRING "true", not boolean.
    expect(decoded?.email_verified).toBe("true");
  });

  it("returns null for malformed tokens", () => {
    expect(decodeAppleIdToken("not-a-jwt")).toBeNull(); // single segment
    expect(decodeAppleIdToken("only.garbage")).toBeNull(); // body is not valid base64 JSON
    expect(decodeAppleIdToken("")).toBeNull();
  });

  it("treats Apple id_token email_verified=\"true\" (string) as verified end-to-end", async () => {
    const tok = makeIdToken({
      sub: "apple-sub-string-true",
      email: "stringy@example.com",
      email_verified: "true",
    });
    const decoded = decodeAppleIdToken(tok)!;

    const verified =
      decoded.email_verified === true ||
      decoded.email_verified === "true" ||
      decoded.is_private_email === true ||
      decoded.is_private_email === "true";
    expect(verified).toBe(true);

    const result = await linkOrCreateOAuthUser({
      provider: "apple",
      providerAccountId: decoded.sub!,
      email: decoded.email!,
      emailVerified: verified,
      firstName: "First",
      lastName: "Last",
      profileImageUrl: null,
    });
    expect(usersStore.find((u) => u.id === result.id)?.email).toBe("stringy@example.com");
  });

  it("treats Apple's private-relay email path as verified", async () => {
    const tok = makeIdToken({
      sub: "apple-sub-private-relay",
      email: "abc123@privaterelay.appleid.com",
      is_private_email: "true",
    });
    const decoded = decodeAppleIdToken(tok)!;
    const verified =
      decoded.email_verified === true ||
      decoded.email_verified === "true" ||
      decoded.is_private_email === true ||
      decoded.is_private_email === "true";
    expect(verified).toBe(true);

    const result = await linkOrCreateOAuthUser({
      provider: "apple",
      providerAccountId: decoded.sub!,
      email: decoded.email!,
      emailVerified: verified,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });
    expect(usersStore.find((u) => u.id === result.id)?.email).toBe(
      "abc123@privaterelay.appleid.com",
    );
  });
});

describe("provider availability — /api/auth/providers", () => {
  const originalEnv = { ...process.env };

  function resetEnv() {
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "FACEBOOK_APP_ID",
      "FACEBOOK_APP_SECRET",
      "APPLE_CLIENT_ID",
      "APPLE_TEAM_ID",
      "APPLE_KEY_ID",
      "APPLE_PRIVATE_KEY",
      "ENABLE_CANVA_LOGIN",
    ]) {
      delete process.env[key];
    }
  }

  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
    Object.assign(process.env, originalEnv);
  });

  function makeProvidersApp() {
    const app = express();
    app.get("/api/auth/providers", (_req, res) => res.json(getProvidersStatus()));
    return app;
  }

  it("reports all providers disabled when no env vars are set", async () => {
    const res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false, facebook: false, apple: false, canva: false });
    expect(isGoogleConfigured()).toBe(false);
    expect(isFacebookConfigured()).toBe(false);
    expect(isAppleConfigured()).toBe(false);
    expect(isCanvaLoginEnabled()).toBe(false);
  });

  it("reports google:true only when both client id and secret are present", async () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    let res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.google).toBe(false);
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.google).toBe(true);
  });

  it("reports facebook:true only when both app id and secret are present", async () => {
    process.env.FACEBOOK_APP_ID = "id";
    let res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.facebook).toBe(false);
    process.env.FACEBOOK_APP_SECRET = "secret";
    res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.facebook).toBe(true);
  });

  it("reports apple:true only when all four Apple env vars are present", async () => {
    process.env.APPLE_CLIENT_ID = "com.example.signin";
    process.env.APPLE_TEAM_ID = "TEAMID";
    process.env.APPLE_KEY_ID = "KEYID";
    let res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.apple).toBe(false);
    process.env.APPLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
    res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.apple).toBe(true);
  });

  it("reports canva:true only when the explicit feature flag is on", async () => {
    let res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.canva).toBe(false);

    process.env.ENABLE_CANVA_LOGIN = "false";
    res = await request(makeProvidersApp()).get("/api/auth/providers");
    expect(res.body.canva).toBe(false);

    for (const truthy of ["1", "true", "yes", "TRUE", "Yes"]) {
      process.env.ENABLE_CANVA_LOGIN = truthy;
      res = await request(makeProvidersApp()).get("/api/auth/providers");
      expect(res.body.canva).toBe(true);
    }
  });
});
