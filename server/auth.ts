import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Express, type Request, type Response, type NextFunction } from "express";
import { runWithUserContext } from "./services/user-context";
import bcrypt from "bcrypt";
import { db, pool } from "./db";
import { users, sessions, oauthAccounts } from "../shared/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { sendNewUserSignupNotification, sendWelcomeEmail } from "./services/notification-service";

const ADMIN_EMAILS = [
  "ryan@pinehillfarm.co",
];

type OAuthProviderName = "google" | "facebook";

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
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

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || /duplicate key|unique constraint/i.test(err?.message || "");
}

async function findOAuthLink(provider: string, providerAccountId: string) {
  const [row] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)));
  return row;
}

async function linkOrCreateOAuthUser(input: LinkOrCreateInput) {
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
    throw new Error(`${provider} account did not return an email — cannot sign in`);
  }

  // Refuse to link by email unless the provider says it's verified — prevents
  // a hijack where someone registers an OAuth account with someone else's
  // unverified email and lands inside their account.
  if (!emailVerified) {
    throw new Error(
      `${provider} did not confirm this email is verified. Please verify your email with ${provider} and try again.`,
    );
  }

  // 2. Existing user by verified email? Link a new oauth_accounts row.
  const [matched] = await db.select().from(users).where(eq(users.email, normalizedEmail));
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
      const [raced] = await db.select().from(users).where(eq(users.email, normalizedEmail));
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

async function promoteAdminIfAllowlisted(user: any) {
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
        const [user] = await db.select().from(users).where(eq(users.email, email));
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
            const emailVerified = (profile as any)._json?.email_verified === true;
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
            done(err as Error);
          }
        },
      ),
    );
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/auth?error=oauth_google" }),
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
            const photo = (profile.photos?.[0] as any)?.value || null;
            // Facebook only returns the email field for accounts that have
            // verified the address; we treat presence as confirmation.
            const emailVerified = !!email;
            const user = await linkOrCreateOAuthUser({
              provider: "facebook",
              providerAccountId: profile.id,
              email,
              emailVerified,
              firstName: (profile.name as any)?.givenName || null,
              lastName: (profile.name as any)?.familyName || null,
              profileImageUrl: photo,
              accessToken: accessToken || null,
              refreshToken: refreshToken || null,
            });
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
    app.get(
      "/api/auth/facebook/callback",
      passport.authenticate("facebook", { failureRedirect: "/auth?error=oauth_facebook" }),
      (_req, res) => res.redirect("/"),
    );
    console.log("[Auth] Facebook OAuth strategy registered");
  } else {
    console.log("[Auth] Facebook OAuth disabled (set FACEBOOK_APP_ID + FACEBOOK_APP_SECRET to enable)");
  }

  app.get("/api/auth/providers", (_req, res) => {
    res.json({
      google: isGoogleConfigured(),
      facebook: isFacebookConfigured(),
      canva: false,
    });
  });

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, email));
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
          role: ADMIN_EMAILS.includes(email.toLowerCase()) ? "admin" : "employee",
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
    const { password: _, ...safeUser } = req.user as any;
    res.json(safeUser);
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
