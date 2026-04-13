import crypto from 'crypto';
import { db } from '../db';
import { canvaTokens } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_REVOKE_URL = 'https://api.canva.com/rest/v1/oauth/revoke';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface CanvaUserResponse {
  team_user?: {
    user_id: string;
    display_name: string;
    email?: string;
  };
  profile?: {
    display_name: string;
  };
}

interface CanvaConnectionStatus {
  connected: boolean;
  displayName?: string | null;
  connectedAt?: Date | null;
  scope?: string | null;
}

class CanvaAuthService {
  private get clientId(): string {
    return process.env.CANVA_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.CANVA_CLIENT_SECRET || '';
  }

  private get redirectUri(): string {
    return process.env.CANVA_REDIRECT_URI || '';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  generateCodeVerifier(): string {
    return crypto.randomBytes(96).toString('base64url');
  }

  generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  buildAuthorizationUrl(codeVerifier: string, state: string): string {
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const scopes = ['asset:read', 'asset:write', 'design:meta:read', 'profile:read'].join(' ');

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

  private getBasicAuth(): string {
    return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
  }

  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this.getBasicAuth()}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Canva token exchange failed: ${response.status} ${error}`);
    }

    return response.json() as Promise<TokenResponse>;
  }

  async refreshAccessToken(userId: string): Promise<string> {
    const [tokenRow] = await db
      .select()
      .from(canvaTokens)
      .where(eq(canvaTokens.userId, userId))
      .limit(1);

    if (!tokenRow) {
      throw new Error(`No Canva token found for user ${userId}`);
    }

    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (tokenRow.expiresAt > fiveMinutesFromNow) {
      return tokenRow.accessToken;
    }

    console.log(`[CanvaAuth] Refreshing token for user ${userId}`);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refreshToken,
    });

    const response = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${this.getBasicAuth()}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
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
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(canvaTokens.userId, userId));

    console.log(`[CanvaAuth] Token refreshed for user ${userId}, expires ${expiresAt.toISOString()}`);
    return tokens.access_token;
  }

  async getValidAccessToken(userId: string): Promise<string> {
    return this.refreshAccessToken(userId);
  }

  async saveTokens(userId: string, tokens: TokenResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const profile = await this.fetchUserProfile(tokens.access_token);
    const displayName = profile?.profile?.display_name || profile?.team_user?.display_name || null;
    const canvaUserId = profile?.team_user?.user_id || null;

    await db
      .insert(canvaTokens)
      .values({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        expiresAt,
        scope: tokens.scope,
        canvaUserId,
        displayName,
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
          canvaUserId,
          displayName,
          updatedAt: new Date(),
        },
      });

    console.log(`[CanvaAuth] Tokens saved for user ${userId} (${displayName || 'unknown'})`);
  }

  async getConnectionStatus(userId: string): Promise<CanvaConnectionStatus> {
    const [row] = await db
      .select({
        id: canvaTokens.id,
        displayName: canvaTokens.displayName,
        connectedAt: canvaTokens.connectedAt,
        scope: canvaTokens.scope,
      })
      .from(canvaTokens)
      .where(eq(canvaTokens.userId, userId))
      .limit(1);

    if (!row) {
      return { connected: false };
    }

    return {
      connected: true,
      displayName: row.displayName,
      connectedAt: row.connectedAt,
      scope: row.scope,
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    const status = await this.getConnectionStatus(userId);
    return status.connected;
  }

  async fetchUserProfile(accessToken: string): Promise<CanvaUserResponse | null> {
    try {
      const response = await fetch(`${CANVA_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;
      return response.json() as Promise<CanvaUserResponse>;
    } catch {
      return null;
    }
  }

  async disconnectUser(userId: string): Promise<void> {
    const [tokenRow] = await db
      .select({ accessToken: canvaTokens.accessToken })
      .from(canvaTokens)
      .where(eq(canvaTokens.userId, userId))
      .limit(1);

    if (tokenRow) {
      try {
        await fetch(CANVA_REVOKE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${this.getBasicAuth()}`,
          },
          body: new URLSearchParams({
            token: tokenRow.accessToken,
          }).toString(),
        });
        console.log(`[CanvaAuth] Token revoked at Canva for user ${userId}`);
      } catch (err: any) {
        console.warn(`[CanvaAuth] Token revocation failed for user ${userId}: ${err.message}`);
      }
    }

    await db.delete(canvaTokens).where(eq(canvaTokens.userId, userId));
    console.log(`[CanvaAuth] Disconnected Canva for user ${userId}`);
  }
}

export const canvaAuthService = new CanvaAuthService();
