import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Express, type Request, type Response, type NextFunction } from "express";
import { runWithUserContext } from "./services/user-context";
import bcrypt from "bcrypt";
import { db, pool } from "./db";
import { users, sessions } from "../shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { sendNewUserSignupNotification, sendWelcomeEmail } from "./services/notification-service";

const ADMIN_EMAILS = [
  "ryan@pinehillfarm.co",
];

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
