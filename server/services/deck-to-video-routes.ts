// Task #184 — "Deck to Video" intake route.
//
// POST /api/deck-to-video/analyze  (multipart PDF)
//   → renders + analyzes the deck, returns a preview payload (no project is
//     created here). The client shows the preview, then creates a normal
//     ai-script project via POST /api/projects/create with the `deck` field.

import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { isAuthenticated } from '../auth';
import { analyzeDeck } from './deck-analysis-service';
import { requireCredits } from '../middleware/requireCredits';
import { consumeCredits, getCreditCost } from './credits-service';
import { consumeRateLimit } from '../lib/rate-limit';

// Provider id metered through the credit pipeline (see seed-generation-rates.ts
// and providerPermissions.ts). One /analyze request == one charge.
const DECK_ANALYSIS_PROVIDER = 'deck-analysis';

const router = Router();

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB cap for decks
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF decks are supported'));
    }
  },
});

router.use(isAuthenticated);

// Per-user rate limit — /analyze runs an expensive multimodal LLM call, so cap
// each user to a handful of analyses per minute. Backed by the persistent
// `rate_limit_hits` table (Task #196) so the cap survives restarts/redeploys
// and is shared across instances instead of living in process memory.
const ANALYZE_RATE_LIMIT = 6;
const ANALYZE_WINDOW_MS = 60_000;
const ANALYZE_RATE_BUCKET = 'deck-analyze';
function rateLimited(userId: string): Promise<boolean> {
  return consumeRateLimit({
    bucket: ANALYZE_RATE_BUCKET,
    subject: userId,
    limit: ANALYZE_RATE_LIMIT,
    windowMs: ANALYZE_WINDOW_MS,
  });
}

// Surface multer errors (oversized file, wrong mimetype) as JSON instead of
// Express's default HTML 500, so the client's res.json() parse never breaks.
function uploadDeck(req: Request, res: Response, next: NextFunction) {
  memUpload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Deck is too large (50MB max)' });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }
    next();
  });
}

router.post('/analyze', uploadDeck, requireCredits({ provider: DECK_ANALYSIS_PROVIDER }), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF provided' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF decks are supported' });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (await rateLimited(String(userId))) {
      return res.status(429).json({ error: 'Too many deck analyses — please wait a minute and try again.' });
    }

    const audience = typeof req.body?.audience === 'string' ? req.body.audience : undefined;
    console.log(`[DeckToVideo] Analyzing "${req.file.originalname}" (${req.file.size} bytes) for user ${userId}, audience=${audience || 'default'}`);
    const analysis = await analyzeDeck(req.file.buffer, req.file.originalname, audience);
    console.log(
      `[DeckToVideo] Analysis complete: ${analysis.pageCount} pages, ${analysis.usableCount} usable, ${analysis.excludedCount} excluded`,
    );

    // Meter the analysis through the credit pipeline (Task #186). Charge only
    // AFTER the work lands so failed analyses aren't billed. requireCredits has
    // already verified affordability + plan access (and bypassed admins). For
    // admin-unlimited users consumeCredits records a `source="admin_unlimited"`
    // ledger row (visible in the Costs dashboard) without decrementing balance.
    const gcCost = req.creditCost?.gcCost ?? (await getCreditCost(DECK_ANALYSIS_PROVIDER, null, null));
    try {
      await consumeCredits(String(userId), gcCost, {
        provider: DECK_ANALYSIS_PROVIDER,
        quality: 'per-deck',
        jobId: `deck-analyze-${randomUUID()}`,
        description: `Deck analysis (${analysis.pageCount} pages, ${analysis.usableCount} usable)`,
      });
    } catch (creditErr: any) {
      // Work is already delivered; never fail the response on a post-hoc
      // accounting hiccup (affordability was checked up front by middleware).
      console.error(`[DeckToVideo] Credit consume failed for user ${userId}: ${creditErr?.message}`);
    }

    return res.status(200).json({ analysis });
  } catch (error: any) {
    console.error('[DeckToVideo] Analyze error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to analyze deck' });
  }
});

export default router;
