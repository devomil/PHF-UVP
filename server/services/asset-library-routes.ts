import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { assetLibrary } from '../../shared/schema';
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm';

const router = Router();

router.use(isAuthenticated);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, favorite, search } = req.query;

    const conditions = [];

    if (type && typeof type === 'string') {
      conditions.push(eq(assetLibrary.assetType, type));
    }

    if (favorite === 'true') {
      conditions.push(eq(assetLibrary.isFavorite, true));
    }

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          ilike(assetLibrary.prompt, `%${search}%`),
          ilike(assetLibrary.contentType, `%${search}%`)
        )!
      );
    }

    const query = db
      .select()
      .from(assetLibrary)
      .orderBy(desc(assetLibrary.createdAt));

    const items = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    res.json(items);
  } catch (error: any) {
    console.error('[AssetLibrary] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch asset library' });
  }
});

router.post('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [existing] = await db
      .select({ isFavorite: assetLibrary.isFavorite })
      .from(assetLibrary)
      .where(eq(assetLibrary.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const [updated] = await db
      .update(assetLibrary)
      .set({
        isFavorite: !existing.isFavorite,
        updatedAt: new Date(),
      })
      .where(eq(assetLibrary.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('[AssetLibrary] Favorite error:', error.message);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [updated] = await db
      .update(assetLibrary)
      .set({
        useCount: sql`${assetLibrary.useCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assetLibrary.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[AssetLibrary] Use error:', error.message);
    res.status(500).json({ error: 'Failed to increment use count' });
  }
});

export default router;
