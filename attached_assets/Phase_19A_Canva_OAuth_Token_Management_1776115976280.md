# Phase 19A: Canva OAuth + Token Management

## Priority: CRITICAL
## Dependency: None (first phase)
## Estimated Time: 3-4 hours

---

## What This Phase Builds

1. Database tables: `canva_tokens` + `canva_sync_jobs`
2. OAuth PKCE flow: authorization URL generation → callback → token exchange
3. Token refresh middleware
4. Connect/Disconnect API routes
5. "Connect Canva" button in the Settings UI (Canva-branded, per their UI guidelines)

---

## Prerequisites

Before starting, create a Canva Integration in the Developer Portal:

1. Go to https://www.canva.com/developers/integrations
2. Create a new integration (type: **Connect API**)
3. Set integration name: `NeuralCut`
4. Set redirect URL: `https://[your-replit-domain]/api/canva/callback`
5. Set scopes: `asset:read asset:write profile:read`
6. Save the **Client ID** and **Client Secret**
7. Add to Replit Secrets:
   - `CANVA_CLIENT_ID`
   - `CANVA_CLIENT_SECRET`
   - `CANVA_REDIRECT_URI` = `https://[your-replit-domain]/api/canva/callback`

---

## Task 1: Database Schema

### 1a. Add to `shared/schema.ts`

Add these two tables to the existing schema file:

```typescript
// shared/schema.ts — ADD these tables

import { 
  pgTable, text, integer, timestamp, boolean, jsonb, serial
} from 'drizzle-orm/pg-core';

// ─── Canva OAuth Tokens ───────────────────────────────────────────────────────

export const canvaTokens = pgTable('canva_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique(), // FK to users table
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenType: text('token_type').notNull().default('Bearer'),
  expiresAt: timestamp('expires_at').notNull(),
  scope: text('scope').notNull(),
  canvaUserId: text('canva_user_id'),   // Canva's internal user ID
  canvaTeamId: text('canva_team_id'),   // Canva team for folder targeting
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type CanvaToken = typeof canvaTokens.$inferSelect;
export type NewCanvaToken = typeof canvaTokens.$inferInsert;

// ─── Canva Sync Jobs ──────────────────────────────────────────────────────────

export const canvaSyncJobs = pgTable('canva_sync_jobs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),   // FK to video_projects table
  userId: integer('user_id').notNull(),
  assetType: text('asset_type').notNull(),       // 'video' | 'frame'
  assetLabel: text('asset_label'),               // e.g. "Final render" | "Scene 2 hero frame"
  s3Key: text('s3_key').notNull(),               // Source S3 key
  s3Url: text('s3_url').notNull(),               // Public S3 URL (presigned or public)
  canvaJobId: text('canva_job_id'),              // Canva async job ID (set after submit)
  canvaAssetId: text('canva_asset_id'),          // Set on success
  status: text('status').notNull().default('pending'),
    // 'pending' | 'uploading' | 'polling' | 'success' | 'failed'
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type CanvaSyncJob = typeof canvaSyncJobs.$inferSelect;
export type NewCanvaSyncJob = typeof canvaSyncJobs.$inferInsert;
```

### 1b. Create and run migration

```bash
# In Replit shell
npx drizzle-kit generate
npx drizzle-kit migrate
```

Verify the tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('canva_tokens', 'canva_sync_jobs');
```

---

## Task 2: Canva OAuth Service

Create file: `server/services/canva-auth.service.ts`

```typescript
// server/services/canva-auth.service.ts

import crypto from 'crypto';
import { db } from '../db';
import { canvaTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface CanvaUser {
  team_user: {
    user_id: string;
    display_name: string;
    email: string;
  };
  profile: {
    display_name: string;
  };
}

export class CanvaAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.CANVA_CLIENT_ID!;
    this.clientSecret = process.env.CANVA_CLIENT_SECRET!;
    this.redirectUri = process.env.CANVA_REDIRECT_URI!;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      console.warn('[CanvaAuth] Missing environment variables. Canva integration disabled.');
    }
  }

  // ─── PKCE Helpers ──────────────────────────────────────────────────────────

  generateCodeVerifier(): string {
    return crypto.randomBytes(96).toString('base64url');
  }

  generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  // ─── Authorization URL ─────────────────────────────────────────────────────

  buildAuthorizationUrl(codeVerifier: string, state: string): string {
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const scopes = ['asset:read', 'asset:write', 'profile:read'].join(' ');

    const params = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: scopes,
      response_type: 'code',
      client_id: this.clientId,
      state,
      redirect_uri: this.redirectUri,
    });

    return `${CANVA_AUTH_URL}?${params.toString()}`;
  }

  // ─── Token Exchange ────────────────────────────────────────────────────────

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString('base64');

    const response = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Canva token exchange failed: ${response.status} ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  async refreshAccessToken(userId: number): Promise<string> {
    const [tokenRow] = await db
      .select()
      .from(canvaTokens)
      .where(eq(canvaTokens.userId, userId))
      .limit(1);

    if (!tokenRow) {
      throw new Error(`No Canva token found for user ${userId}`);
    }

    // Check if still valid (with 5 min buffer)
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (tokenRow.expiresAt > fiveMinutesFromNow) {
      return tokenRow.accessToken;
    }

    console.log(`[CanvaAuth] Refreshing token for user ${userId}`);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refreshToken,
      client_id: this.clientId,
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString('base64');

    const response = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      // Refresh token invalid — user needs to reconnect
      if (response.status === 400 || response.status === 401) {
        await this.disconnectUser(userId);
        throw new Error('Canva token expired. Please reconnect your Canva account.');
      }
      throw new Error(`Canva token refresh failed: ${response.status} ${error}`);
    }

    const tokens: TokenResponse = await response.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db
      .update(canvaTokens)
      .set({
        accessToken: tokens.access_token,
        // Canva may or may not return a new refresh token — keep old one if not returned
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(canvaTokens.userId, userId));

    console.log(`[CanvaAuth] Token refreshed for user ${userId}, expires ${expiresAt}`);
    return tokens.access_token;
  }

  // ─── Save Tokens ───────────────────────────────────────────────────────────

  async saveTokens(userId: number, tokens: TokenResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fetch Canva user profile to get their user ID and team
    const profile = await this.fetchUserProfile(tokens.access_token);

    await db
      .insert(canvaTokens)
      .values({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        expiresAt,
        scope: tokens.scope,
        canvaUserId: profile?.team_user?.user_id ?? null,
        canvaTeamId: null, // Populate when Canva exposes team ID in profile
        connectedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: canvaTokens.userId,
        set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenType: tokens.token_type,
          expiresAt,
          scope: tokens.scope,
          canvaUserId: profile?.team_user?.user_id ?? null,
          updatedAt: new Date(),
        },
      });

    console.log(`[CanvaAuth] Tokens saved for user ${userId}`);
  }

  // ─── Get Valid Access Token ────────────────────────────────────────────────

  async getValidAccessToken(userId: number): Promise<string> {
    return this.refreshAccessToken(userId);
  }

  // ─── Check Connection Status ───────────────────────────────────────────────

  async isConnected(userId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: canvaTokens.id })
      .from(canvaTokens)
      .where(eq(canvaTokens.userId, userId))
      .limit(1);
    return !!row;
  }

  // ─── Fetch User Profile ────────────────────────────────────────────────────

  async fetchUserProfile(accessToken: string): Promise<CanvaUser | null> {
    try {
      const response = await fetch(`${CANVA_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;
      return response.json() as Promise<CanvaUser>;
    } catch {
      return null;
    }
  }

  // ─── Disconnect ────────────────────────────────────────────────────────────

  async disconnectUser(userId: number): Promise<void> {
    await db.delete(canvaTokens).where(eq(canvaTokens.userId, userId));
    console.log(`[CanvaAuth] Disconnected Canva for user ${userId}`);
  }
}

export const canvaAuthService = new CanvaAuthService();
```

---

## Task 3: OAuth Routes

Create file: `server/routes/canva-auth.routes.ts`

```typescript
// server/routes/canva-auth.routes.ts

import { Router, Request, Response } from 'express';
import { canvaAuthService } from '../services/canva-auth.service';

export const canvaAuthRouter = Router();

// In-memory PKCE state store (short-lived, for OAuth dance only)
// In production consider Redis with 10-minute TTL
const oauthStateStore = new Map<string, { 
  codeVerifier: string; 
  userId: number; 
  expiresAt: number;
}>();

// Clean up expired states every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (value.expiresAt < now) oauthStateStore.delete(key);
  }
}, 15 * 60 * 1000);

// ─── GET /api/canva/connect ────────────────────────────────────────────────
// Initiates the OAuth flow. Returns the authorization URL.

canvaAuthRouter.get('/connect', async (req: Request, res: Response) => {
  // TODO: Replace with your actual auth middleware to get userId
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const codeVerifier = canvaAuthService.generateCodeVerifier();
  const state = canvaAuthService.generateState();

  // Store PKCE verifier + userId keyed by state, with 10-minute expiry
  oauthStateStore.set(state, {
    codeVerifier,
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const authUrl = canvaAuthService.buildAuthorizationUrl(codeVerifier, state);

  res.json({ authUrl });
});

// ─── GET /api/canva/callback ───────────────────────────────────────────────
// Canva redirects here after the user authorizes.

canvaAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  // Handle user-cancelled flow
  if (error) {
    console.warn('[CanvaAuth] OAuth error:', error);
    return res.redirect(`/?canva_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect('/?canva_error=missing_params');
  }

  // Validate state
  const stored = oauthStateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    oauthStateStore.delete(state);
    return res.redirect('/?canva_error=invalid_state');
  }

  oauthStateStore.delete(state);

  try {
    const tokens = await canvaAuthService.exchangeCodeForTokens(
      code,
      stored.codeVerifier
    );
    await canvaAuthService.saveTokens(stored.userId, tokens);

    console.log(`[CanvaAuth] Connected Canva for user ${stored.userId}`);
    // Redirect back to settings page with success indicator
    res.redirect('/settings?canva_connected=true');
  } catch (err: any) {
    console.error('[CanvaAuth] Callback error:', err.message);
    res.redirect(`/settings?canva_error=${encodeURIComponent(err.message)}`);
  }
});

// ─── GET /api/canva/status ─────────────────────────────────────────────────
// Returns connection status for the current user.

canvaAuthRouter.get('/status', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const connected = await canvaAuthService.isConnected(userId);
  res.json({ connected });
});

// ─── DELETE /api/canva/disconnect ─────────────────────────────────────────
// Disconnects Canva for the current user.

canvaAuthRouter.delete('/disconnect', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  await canvaAuthService.disconnectUser(userId);
  res.json({ success: true, message: 'Canva account disconnected' });
});
```

### Register the router in `server/routes/index.ts` or `server/index.ts`:

```typescript
// Add alongside existing route registrations
import { canvaAuthRouter } from './routes/canva-auth.routes';

app.use('/api/canva', canvaAuthRouter);
```

---

## Task 4: Settings UI Component

Create file: `client/src/components/settings/CanvaConnect.tsx`

```tsx
// client/src/components/settings/CanvaConnect.tsx

import { useState, useEffect } from 'react';

interface CanvaConnectionStatus {
  connected: boolean;
}

export function CanvaConnect() {
  const [status, setStatus] = useState<CanvaConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    fetch('/api/canva/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  // Handle success/error redirects from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canva_connected')) {
      setStatus({ connected: true });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('canva_error')) {
      console.error('Canva connection error:', params.get('canva_error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/canva/connect');
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to initiate Canva connection:', err);
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Canva account? Future renders will not sync to Canva.')) return;
    setActionLoading(true);
    try {
      await fetch('/api/canva/disconnect', { method: 'DELETE' });
      setStatus({ connected: false });
    } catch (err) {
      console.error('Failed to disconnect Canva:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-border">
        <div className="w-8 h-8 rounded bg-muted animate-pulse" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border">
      <div className="flex items-center gap-3">
        {/* Canva logo mark — per their UI guidelines, icon + text together */}
        <div
          className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: '#7D2AE8' }}
        >
          C
        </div>
        <div>
          <p className="text-sm font-medium">Canva</p>
          <p className="text-xs text-muted-foreground">
            {status?.connected
              ? 'Connected — renders sync automatically'
              : 'Not connected — renders stay in NeuralCut only'}
          </p>
        </div>
        {status?.connected && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            Connected
          </span>
        )}
      </div>

      {status?.connected ? (
        <button
          onClick={handleDisconnect}
          disabled={actionLoading}
          className="text-sm px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          {actionLoading ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : (
        // Canva-branded connect button per their UI guidelines:
        // - Icon inside button with 8px+ margin
        // - Text clearly indicates the action
        // - Displayed at least as prominently as other third-party options
        <button
          onClick={handleConnect}
          disabled={actionLoading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#7D2AE8' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#6B1FD4')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7D2AE8')}
        >
          <span style={{ margin: '0 2px' }}>
            {/* Canva icon — 16px, 8px+ margin per guidelines */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style={{ margin: '0 2px' }}>
              <circle cx="12" cy="12" r="10" fill="white" fillOpacity="0.3" />
              <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">C</text>
            </svg>
          </span>
          {actionLoading ? 'Connecting...' : 'Connect with Canva'}
        </button>
      )}
    </div>
  );
}
```

### Add to your Settings page:

```tsx
// In your existing settings page component
import { CanvaConnect } from '@/components/settings/CanvaConnect';

// Inside the settings page JSX, in the "Integrations" section:
<section>
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
    Integrations
  </h3>
  <CanvaConnect />
</section>
```

---

## Task 5: Export from Services Index

Update `server/services/index.ts`:

```typescript
// Add to existing exports
export { canvaAuthService } from './canva-auth.service';
```

---

## Verification Checklist

Test the full OAuth flow:

1. Navigate to Settings in the app
2. Confirm the "Connect with Canva" button renders
3. Click it — verify you're redirected to `canva.com/api/oauth/authorize`
4. Authorize the integration
5. Confirm redirect back to `/settings?canva_connected=true`
6. Check the UI shows "Connected" status
7. Check the database: `SELECT * FROM canva_tokens WHERE user_id = [your id];`
8. Click "Disconnect" — verify row is deleted and UI reverts

```sql
-- Verify tokens are stored
SELECT user_id, canva_user_id, expires_at, scope, connected_at 
FROM canva_tokens;

-- Verify sync jobs table exists and is empty
SELECT COUNT(*) FROM canva_sync_jobs;
```

---

## Success Criteria

- [ ] `canva_tokens` table created and migrated
- [ ] `canva_sync_jobs` table created and migrated
- [ ] OAuth PKCE flow works end-to-end (connect → authorize → callback → token stored)
- [ ] `/api/canva/status` returns `{ connected: true }` after connect
- [ ] `/api/canva/disconnect` deletes the token row
- [ ] Settings UI shows correct connection state
- [ ] Token refresh works (test by manually setting `expires_at` to the past)
- [ ] No TypeScript errors

---

## Next Phase

Proceed to **Phase 19B: Canva Asset Upload Service** once OAuth is verified working.
