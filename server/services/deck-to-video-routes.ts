// Task #184 — "Deck to Video" intake route.
//
// POST /api/deck-to-video/analyze  (multipart PDF)
//   → renders + analyzes the deck, returns a preview payload (no project is
//     created here). The client shows the preview, then creates a normal
//     ai-script project via POST /api/projects/create with the `deck` field.

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { isAuthenticated } from '../auth';
import { analyzeDeck } from './deck-analysis-service';

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

// Lightweight per-user in-memory rate limit — /analyze runs an expensive
// multimodal LLM call, so cap each user to a handful of analyses per minute.
const ANALYZE_RATE_LIMIT = 6;
const ANALYZE_WINDOW_MS = 60_000;
const analyzeHits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (analyzeHits.get(userId) || []).filter((t) => now - t < ANALYZE_WINDOW_MS);
  if (hits.length >= ANALYZE_RATE_LIMIT) {
    analyzeHits.set(userId, hits);
    return true;
  }
  hits.push(now);
  analyzeHits.set(userId, hits);
  return false;
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

router.post('/analyze', uploadDeck, async (req: Request, res: Response) => {
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
    if (rateLimited(String(userId))) {
      return res.status(429).json({ error: 'Too many deck analyses — please wait a minute and try again.' });
    }

    console.log(`[DeckToVideo] Analyzing "${req.file.originalname}" (${req.file.size} bytes) for user ${userId}`);
    const analysis = await analyzeDeck(req.file.buffer, req.file.originalname);
    console.log(
      `[DeckToVideo] Analysis complete: ${analysis.pageCount} pages, ${analysis.usableCount} usable, ${analysis.excludedCount} excluded`,
    );

    return res.status(200).json({ analysis });
  } catch (error: any) {
    console.error('[DeckToVideo] Analyze error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to analyze deck' });
  }
});

export default router;
