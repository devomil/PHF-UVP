import { Router, Request, Response } from 'express';
import { canvaAuthService } from './canva-auth-service';
import { isAuthenticated } from '../auth';

export const canvaAuthRouter = Router();

canvaAuthRouter.get('/connect', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    if (!canvaAuthService.isConfigured()) {
      return res.status(503).json({ error: 'Canva integration is not configured' });
    }

    const codeVerifier = canvaAuthService.generateCodeVerifier();
    const state = canvaAuthService.generateState();

    (req.session as any).canvaOAuth = {
      codeVerifier,
      state,
      userId,
      createdAt: Date.now(),
    };

    const authUrl = canvaAuthService.buildAuthorizationUrl(codeVerifier, state);
    res.json({ authUrl });
  } catch (err: any) {
    console.error('[CanvaAuth] Connect error:', err.message);
    res.status(500).json({ error: 'Failed to initiate Canva connection' });
  }
});

canvaAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    console.warn('[CanvaAuth] OAuth error:', error);
    return res.redirect(`/brand?canva_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect('/brand?canva_error=missing_params');
  }

  const stored = (req.session as any)?.canvaOAuth;
  if (!stored || stored.state !== state) {
    return res.redirect('/brand?canva_error=invalid_state');
  }

  if (Date.now() - stored.createdAt > 10 * 60 * 1000) {
    delete (req.session as any).canvaOAuth;
    return res.redirect('/brand?canva_error=session_expired');
  }

  const currentUserId = (req.user as any)?.id;
  if (!currentUserId || currentUserId !== stored.userId) {
    delete (req.session as any).canvaOAuth;
    return res.redirect('/brand?canva_error=user_mismatch');
  }

  delete (req.session as any).canvaOAuth;

  try {
    const tokens = await canvaAuthService.exchangeCodeForTokens(code, stored.codeVerifier);
    await canvaAuthService.saveTokens(currentUserId, tokens);
    console.log(`[CanvaAuth] Connected Canva for user ${stored.userId}`);
    res.redirect('/brand?canva_connected=true');
  } catch (err: any) {
    console.error('[CanvaAuth] Callback error:', err.message);
    res.redirect(`/brand?canva_error=${encodeURIComponent(err.message)}`);
  }
});

canvaAuthRouter.get('/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const status = await canvaAuthService.getConnectionStatus(userId);
    res.json({
      configured: canvaAuthService.isConfigured(),
      ...status,
    });
  } catch (err: any) {
    console.error('[CanvaAuth] Status error:', err.message);
    res.status(500).json({ error: 'Failed to check Canva status' });
  }
});

canvaAuthRouter.delete('/disconnect', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    await canvaAuthService.disconnectUser(userId);
    res.json({ success: true, message: 'Canva account disconnected' });
  } catch (err: any) {
    console.error('[CanvaAuth] Disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect Canva' });
  }
});
