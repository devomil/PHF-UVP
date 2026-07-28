import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
// @ts-ignore — no type definitions published for passport-apple
import { Strategy as AppleStrategy } from "passport-apple";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Express, type Request, type Response, type NextFunction, urlencoded } from "express";
import { runWithUserContext } from "./services/user-context";
import bcrypt from "bcrypt";
import { db, pool } from "./db";
import { users, sessions, oauthAccounts } from "../shared/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { sendNewUserSignupNotification, sendWelcomeEmail } from "./services/notification-service";
import { revokeAppleToken } from "./lib/apple-revoke";

const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

type OAuthProviderName = "google" | "facebook" | "apple";

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isFacebookConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function isAppleConfigured() {
  return !!(
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
  );
}

// Apple distributes the .p8 key as a multiline PEM. When that's stuffed into
// an env var, newlines are commonly escaped as `\n`. Restore real newlines
// so passport-apple's JWT signer can parse the key.
function appleNormalizedPrivateKey(): string {
  const raw = process.env.APPLE_PRIVATE_KEY || "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

interface AppleIdTokenPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

export function decodeAppleIdToken(idToken: string): AppleIdTokenPayload | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// Preview-mode flag: forces /api/auth/providers to advertise every social
// button as "available" so designers/PMs can see the UI without registering
// real OAuth apps. Strategies are NOT actually registered, so clicking a
// button while in preview mode will not produce a working sign-in flow.
export function isOAuthPreviewMode() {
  const v = (process.env.OAUTH_PREVIEW_MODE || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getProvidersStatus() {
  const preview = isOAuthPreviewMode();
  return {
    google: isGoogleConfigured() || preview,
    facebook: isFacebookConfigured() || preview,
    apple: isAppleConfigured() || preview,
    canva: isCanvaLoginEnabled() || preview,
    preview,
  };
}

export function isCanvaLoginEnabled() {
  // Exploratory feature flag — Canva login is not implemented yet, but the
  // /api/auth/providers contract surfaces the flag so the client can opt in
  // once the strategy lands.
  const v = (process.env.ENABLE_CANVA_LOGIN || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

interface GoogleProfileJson {
  email_verified?: boolean;
  picture?: string;
}
interface FacebookProfileName {
  givenName?: string;
  familyName?: string;
}
interface FacebookProfilePhoto {
  value?: string;
}

function callbackUrl(envVar: string | undefined, fallbackPath: string) {
  if (envVar) return envVar;
  const base = process.env.APP_URL || process.env.PUBLIC_URL || "";
  return base ? `${base.replace(/\/+$/, "")}${fallbackPath}` : fallbackPath;
}

interface LinkOrCreateInput {
  provider: OAuthProviderName;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

// Thrown by linkOrCreateOAuthUser for expected validation failures (missing
// email, unverified email). Strategy verify callbacks translate these into
// `done(null, false, …)` so passport hits `failureRedirect` instead of 500.
export class OAuthUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthUserError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message || "");
}

async function findOAuthLink(provider: string, providerAccountId: string) {
  const [row] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)));
  return row;
}

export async function linkOrCreateOAuthUser(input: LinkOrCreateInput) {
  const { provider, providerAccountId, email, emailVerified, firstName, lastName, profileImageUrl } = input;
  const normalizedEmail = email ? email.toLowerCase() : null;

  // 1. Existing oauth_account row?
  const existingLink = await findOAuthLink(provider, providerAccountId);
  if (existingLink) {
    await db
      .update(oauthAccounts)
      .set({
        accessToken: input.accessToken ?? existingLink.accessToken,
        refreshToken: input.refreshToken ?? existingLink.refreshToken,
        expiresAt: input.expiresAt ?? existingLink.expiresAt,
        email: normalizedEmail ?? existingLink.email,
        updatedAt: new Date(),
      })
      .where(eq(oauthAccounts.id, existingLink.id));
    const [user] = await db.select().from(users).where(eq(users.id, existingLink.userId));
    if (!user) throw new Error("Linked OAuth account references missing user");
    return promoteAdminIfAllowlisted(user);
  }

  if (!normalizedEmail) {
    throw new OAuthUserError(`${provider} account did not return an email — cannot sign in`);
  }

  // Refuse to link by email unless the provider says it's verified — prevents
  // a hijack where someone registers an OAuth account with someone else's
  // unverified email and lands inside their account.
  if (!emailVerified) {
    throw new OAuthUserError(
      `${provider} did not confirm this email is verified. Please verify your email with ${provider} and try again.`,
    );
  }

  // 2. Existing user by verified email? Link a new oauth_accounts row.
  // Use case-insensitive match so a local account created with mixed-case
  // email (e.g. "Foo@Bar.com") still links to the same row.
  const [matched] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`);
  if (matched) {
    try {
      await db.insert(oauthAccounts).values({
        id: crypto.randomUUID(),
        userId: matched.id,
        provider,
        providerAccountId,
        email: normalizedEmail,
        accessToken: input.accessToken ?? null,
        refreshToken: input.refreshToken ?? null,
        expiresAt: input.expiresAt ?? null,
      });
    } catch (err) {
      // Concurrent callback for same (provider, providerAccountId) — re-fetch the winner.
      if (isUniqueViolation(err)) {
        const winner = await findOAuthLink(provider, providerAccountId);
        if (winner) {
          const [user] = await db.select().from(users).where(eq(users.id, winner.userId));
          if (user) return promoteAdminIfAllowlisted(user);
        }
      }
      throw err;
    }
    return promoteAdminIfAllowlisted(matched);
  }

  // 3. Brand new user.
  const userId = crypto.randomUUID();
  const role = ADMIN_EMAILS.includes(normalizedEmail) ? "admin" : "employee";
  let newUser;
  try {
    [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        password: null,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: profileImageUrl || null,
        role,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Another OAuth callback raced us and created the user (or a manual
      // /api/register hit at the same moment). Fall through to the linking path.
      const [raced] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`);
      if (raced) {
        return linkOrCreateOAuthUser(input);
      }
    }
    throw err;
  }

  try {
    await db.insert(oauthAccounts).values({
      id: crypto.randomUUID(),
      userId: newUser.id,
      provider,
      providerAccountId,
      email: normalizedEmail,
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await findOAuthLink(provider, providerAccountId);
      if (winner) {
        const [user] = await db.select().from(users).where(eq(users.id, winner.userId));
        if (user) return promoteAdminIfAllowlisted(user);
      }
    }
    throw err;
  }

  try {
    const { createInitialTrialForNewUser } = await import("./services/credits-service");
    await createInitialTrialForNewUser(newUser.id);
  } catch (creditErr) {
    console.error("[Auth/OAuth] Failed to provision trial subscription:", creditErr);
  }

  sendNewUserSignupNotification({
    email: newUser.email,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
  }).catch((err) => console.error("[Auth/OAuth] Notification error:", err));

  sendWelcomeEmail({
    email: newUser.email,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
  }).catch((err) => console.error("[Auth/OAuth] Welcome email error:", err));

  return newUser;
}

async function promoteAdminIfAllowlisted<T extends { id: string; email: string | null; role: string | null }>(user: T): Promise<T> {
  if (ADMIN_EMAILS.includes((user.email || "").toLowerCase()) && user.role !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
    user.role = "admin";
    console.log(`[Auth] Auto-promoted ${user.email} to admin role`);
  }
  return user;
}

const PgSession = connectPgSimple(session);

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const normalizedEmail = (email || "").toLowerCase();
        const [user] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedEmail}`);
        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }
        if (!user.password) {
          const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
          if (links.length > 0) {
            const providerLabel = links.map((l) => l.provider.charAt(0).toUpperCase() + l.provider.slice(1)).join(" or ");
            return done(null, false, { message: `This account uses ${providerLabel} sign-in` });
          }
          return done(null, false, { message: "Account has no password set" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid email or password" });
        }
        if (ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== "admin") {
          await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
          user.role = "admin";
          console.log(`[Auth] Auto-promoted ${user.email} to admin role`);
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    done(null, user || null);
  } catch (err) {
    done(err);
  }
});

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || (isProduction ? (() => { throw new Error("SESSION_SECRET environment variable is required in production"); })() : "dev-session-secret-key"),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ---- Google OAuth ----
  if (isGoogleConfigured()) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: callbackUrl(process.env.GOOGLE_CALLBACK_URL, "/api/auth/google/callback"),
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            // Google's userinfo includes email_verified on the raw profile json.
            const json = (profile as { _json?: GoogleProfileJson })._json;
            const emailVerified = json?.email_verified === true;
            const user = await linkOrCreateOAuthUser({
              provider: "google",
              providerAccountId: profile.id,
              email,
              emailVerified,
              firstName: profile.name?.givenName || null,
              lastName: profile.name?.familyName || null,
              profileImageUrl: profile.photos?.[0]?.value || null,
              accessToken: accessToken || null,
              refreshToken: refreshToken || null,
            });
            done(null, user);
          } catch (err) {
            if (err instanceof OAuthUserError) {
              return done(null, false, { message: err.message });
            }
            done(err as Error);
          }
        },
      ),
    );
    // `state: true` enables Passport's session-backed CSRF-state validation
    // on both the initiate and callback routes, preventing login-CSRF.
    app.get(
      "/api/auth/google",
      passport.authenticate("google", { scope: ["profile", "email"], state: true }),
    );
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/auth?error=oauth_google", state: true }),
      (_req, res) => res.redirect("/"),
    );
    console.log("[Auth] Google OAuth strategy registered");
  } else {
    console.log("[Auth] Google OAuth disabled (set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to enable)");
  }

  // ---- Facebook OAuth ----
  if (isFacebookConfigured()) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID!,
          clientSecret: process.env.FACEBOOK_APP_SECRET!,
          callbackURL: callbackUrl(process.env.FACEBOOK_CALLBACK_URL, "/api/auth/facebook/callback"),
          profileFields: ["id", "emails", "name", "picture.type(large)"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const photo = (profile.photos?.[0] as FacebookProfilePhoto | undefined)?.value || null;
            // Facebook only returns the email field for accounts that have
            // verified the address; we treat presence as confirmation.
            const emailVerified = !!email;
            const name = profile.name as FacebookProfileName | undefined;
            const user = await linkOrCreateOAuthUser({
              provider: "facebook",
              providerAccountId: profile.id,
              email,
              emailVerified,
              firstName: name?.givenName || null,
              lastName: name?.familyName || null,
              profileImageUrl: photo,
              accessToken: accessToken || null,
              refreshToken: refreshToken || null,
            });
            done(null, user);
          } catch (err) {
            if (err instanceof OAuthUserError) {
              return done(null, false, { message: err.message });
            }
            done(err as Error);
          }
        },
      ),
    );
    app.get(
      "/api/auth/facebook",
      passport.authenticate("facebook", { scope: ["email"], state: true }),
    );
    app.get(
      "/api/auth/facebook/callback",
      passport.authenticate("facebook", { failureRedirect: "/auth?error=oauth_facebook", state: true }),
      (_req, res) => res.redirect("/"),
    );
    console.log("[Auth] Facebook OAuth strategy registered");
  } else {
    console.log("[Auth] Facebook OAuth disabled (set FACEBOOK_APP_ID + FACEBOOK_APP_SECRET to enable)");
  }

  // ---- Apple OAuth (Sign in with Apple) ----
  if (isAppleConfigured()) {
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID!,
          teamID: process.env.APPLE_TEAM_ID!,
          keyID: process.env.APPLE_KEY_ID!,
          privateKeyString: appleNormalizedPrivateKey(),
          callbackURL: callbackUrl(process.env.APPLE_CALLBACK_URL, "/api/auth/apple/callback"),
          passReqToCallback: true,
          scope: ["name", "email"],
        },
        async (
          req: Request,
          _accessToken: string,
          _refreshToken: string,
          idToken: string,
          _profile: unknown,
          done: (err: Error | null, user?: unknown, info?: { message?: string }) => void,
        ) => {
          try {
            const decoded = decodeAppleIdToken(idToken);
            if (!decoded?.sub) {
              return done(null, false, { message: "Apple did not return an account identifier" });
            }
            const email = decoded.email || null;
            // Apple's id_token only includes claims for accounts they've verified;
            // `email_verified` arrives as the string "true" (or boolean) per Apple's spec.
            // Private-relay addresses (`@privaterelay.appleid.com`) are also Apple-verified.
            const emailVerified =
              decoded.email_verified === true ||
              decoded.email_verified === "true" ||
              decoded.is_private_email === true ||
              decoded.is_private_email === "true";

            // Apple sends the user's name only on the very first authorization, in
            // the form_post body as a JSON-encoded `user` field. passport-apple
            // pre-parses this onto req.appleProfile.
            const appleProfile = (req as Request & { appleProfile?: { name?: { firstName?: string; lastName?: string } } })
              .appleProfile;
            const firstName = appleProfile?.name?.firstName || null;
            const lastName = appleProfile?.name?.lastName || null;

            const user = await linkOrCreateOAuthUser({
              provider: "apple",
              providerAccountId: decoded.sub,
              email,
              emailVerified,
              firstName,
              lastName,
              profileImageUrl: null,
              accessToken: _accessToken || null,
              refreshToken: _refreshToken || null,
            });
            done(null, user);
          } catch (err) {
            if (err instanceof OAuthUserError) {
              return done(null, false, { message: err.message });
            }
            done(err as Error);
          }
        },
      ),
    );
    // Apple posts the callback as application/x-www-form-urlencoded; ensure the
    // body parser is wired before passport reads `code`/`state`/`user` fields.
    const appleBodyParser = urlencoded({ extended: false });
    app.get(
      "/api/auth/apple",
      passport.authenticate("apple", { state: true }),
    );
    app.post(
      "/api/auth/apple/callback",
      appleBodyParser,
      passport.authenticate("apple", { failureRedirect: "/auth?error=oauth_apple", state: true }),
      (_req, res) => res.redirect("/"),
    );
    console.log("[Auth] Apple OAuth strategy registered");
  } else {
    console.log("[Auth] Apple OAuth disabled (set APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY to enable)");
  }

  app.get("/api/auth/providers", (_req, res) => {
    res.json(getProvidersStatus());
  });

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email: rawEmail, password, firstName, lastName } = req.body;
      if (!rawEmail || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      // Normalize email casing on write so future lookups (local + OAuth
      // linking) collide on the same canonical value.
      const email = String(rawEmail).toLowerCase();

      const [existing] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();

      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
          role: ADMIN_EMAILS.includes(email) ? "admin" : "employee",
        })
        .returning();

      // Phase NC-01 — explicitly create the FREE_TRIAL subscription row
      // at registration time. Without this hook the trial is only minted
      // lazily on first credit endpoint hit, which the architect flagged
      // as a deviation from the "14-day trial on signup" requirement.
      try {
        const { createInitialTrialForNewUser } = await import("./services/credits-service");
        await createInitialTrialForNewUser(newUser.id);
      } catch (creditErr) {
        console.error("[Auth] Failed to provision trial subscription:", creditErr);
      }

      req.login(newUser, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        const { password: _, ...safeUser } = newUser;

        sendNewUserSignupNotification({
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        }).catch(err => console.error("[Auth] Notification error:", err));

        sendWelcomeEmail({
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        }).catch(err => console.error("[Auth] Welcome email error:", err));

        return res.status(201).json(safeUser);
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...safeUser } = req.user as any;
    res.json({ ...safeUser, hasPassword: !!password });
  });

  // Task #164 — let OAuth-only users add a password so they can also use
  // local email + password sign-in as a backup credential.
  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password } = req.body ?? {};
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (password.length > 200) {
      return res.status(400).json({ message: "Password is too long" });
    }
    const sessionUser = req.user as { id: string };
    try {
      const [current] = await db.select().from(users).where(eq(users.id, sessionUser.id));
      if (!current) {
        return res.status(404).json({ message: "User not found" });
      }
      if (current.password) {
        return res.status(409).json({ message: "Password is already set for this account" });
      }
      const hashed = await bcrypt.hash(password, 10);
      await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, current.id));
      return res.json({ ok: true, hasPassword: true });
    } catch (err: any) {
      console.error("[Auth] set-password failed:", err);
      return res.status(500).json({ message: err?.message || "Failed to set password" });
    }
  });

  // ---- Connected OAuth accounts (Task #165) ----
  app.get("/api/auth/connections", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const u = req.user as { id: string; password: string | null };
    try {
      const links = await db
        .select({
          provider: oauthAccounts.provider,
          email: oauthAccounts.email,
          createdAt: oauthAccounts.createdAt,
        })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, u.id));
      res.json({
        hasPassword: !!u.password,
        connections: links,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to load connections" });
    }
  });

  app.delete("/api/auth/connections/:provider", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const provider = String(req.params.provider || "").toLowerCase();
    if (provider !== "google" && provider !== "facebook" && provider !== "apple") {
      return res.status(400).json({ message: "Unknown provider" });
    }
    const u = req.user as { id: string; password: string | null };
    try {
      const links = await db
        .select()
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, u.id));
      const target = links.find((l) => l.provider === provider);
      if (!target) {
        return res.status(404).json({ message: `No ${provider} account is connected` });
      }
      const otherLinks = links.filter((l) => l.provider !== provider);
      if (!u.password && otherLinks.length === 0) {
        return res.status(400).json({
          message:
            "Set a password before disconnecting your only sign-in method, or you'll be locked out.",
          code: "LAST_SIGN_IN_METHOD",
        });
      }

      // Apple's Sign in with Apple guidelines (and App Store review) require
      // that disconnecting unlinks on Apple's side too. Best-effort: prefer
      // the refresh token, fall back to the access token. If revoke fails we
      // still drop the local link — otherwise users would be permanently
      // unable to remove a stale Apple connection.
      let appleRevokeWarning: string | undefined;
      if (provider === "apple") {
        const tokenToRevoke = target.refreshToken || target.accessToken;
        if (tokenToRevoke) {
          const result = await revokeAppleToken({
            token: tokenToRevoke,
            tokenTypeHint: target.refreshToken ? "refresh_token" : "access_token",
          });
          if (!result.ok) {
            appleRevokeWarning =
              "Removed locally, but Apple's revoke endpoint did not confirm. You may need to remove this app from appleid.apple.com.";
            console.warn(
              `[Auth] Apple token revoke failed for user ${u.id}: status=${result.status} error=${result.error || ""}`,
            );
          }
        } else {
          appleRevokeWarning =
            "Removed locally — no Apple token was stored, so Apple may still list this app under your Apple ID.";
        }
      }

      await db
        .delete(oauthAccounts)
        .where(and(eq(oauthAccounts.userId, u.id), eq(oauthAccounts.provider, provider)));
      res.json({ ok: true, ...(appleRevokeWarning ? { warning: appleRevokeWarning } : {}) });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to disconnect" });
    }
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    const userId = (req.user as any)?.id;
    if (userId) {
      return runWithUserContext(userId, () => next());
    }
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = req.user as any;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}
