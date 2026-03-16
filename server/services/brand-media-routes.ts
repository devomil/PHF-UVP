import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { brandMediaLibrary } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { brandBibleService } from './brand-bible-service';

const router = Router();

router.use(isAuthenticated);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(brandMediaLibrary)
      .orderBy(desc(brandMediaLibrary.createdAt));
    res.json({ assets: items, total: items.length });
  } catch (error: any) {
    console.error('[BrandMedia] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch brand media library' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name, description, mediaType, assetType, assetCategory,
      entityName, entityType, url, thumbnailUrl,
      matchKeywords, excludeKeywords, usageContexts,
      priority, isDefault, isActive, personInfo, productInfo,
      width, height, duration, fileSize, mimeType,
      visualAttributes, placementSettings,
    } = req.body;

    if (!name || !mediaType || !url) {
      return res.status(400).json({ error: 'name, mediaType, and url are required' });
    }

    const uploadedBy = (req.user as any)?.id || null;

    const [item] = await db.insert(brandMediaLibrary).values({
      name,
      description: description || null,
      mediaType,
      assetType: assetType || null,
      assetCategory: assetCategory || null,
      entityName: entityName || null,
      entityType: entityType || null,
      url,
      thumbnailUrl: thumbnailUrl || null,
      matchKeywords: matchKeywords || [],
      excludeKeywords: excludeKeywords || [],
      usageContexts: usageContexts || [],
      priority: priority ?? 0,
      isDefault: isDefault ?? false,
      isActive: isActive ?? true,
      uploadedBy,
      personInfo: personInfo || null,
      productInfo: productInfo || null,
      width: width || null,
      height: height || null,
      duration: duration || null,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      visualAttributes: visualAttributes || null,
      placementSettings: placementSettings || null,
    }).returning();

    brandBibleService.clearCache();
    res.status(201).json(item);
  } catch (error: any) {
    console.error('[BrandMedia] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create brand media asset' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const updates: Record<string, any> = {};
    const allowedFields = [
      'name', 'description', 'mediaType', 'assetType', 'assetCategory',
      'entityName', 'entityType', 'url', 'thumbnailUrl',
      'matchKeywords', 'excludeKeywords', 'usageContexts',
      'priority', 'isDefault', 'isActive', 'personInfo', 'productInfo',
      'width', 'height', 'duration', 'fileSize', 'mimeType',
      'visualAttributes', 'placementSettings',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(brandMediaLibrary)
      .set(updates)
      .where(eq(brandMediaLibrary.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Brand media asset not found' });
    }

    brandBibleService.clearCache();
    res.json(updated);
  } catch (error: any) {
    console.error('[BrandMedia] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update brand media asset' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [deleted] = await db
      .delete(brandMediaLibrary)
      .where(eq(brandMediaLibrary.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Brand media asset not found' });
    }

    brandBibleService.clearCache();
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[BrandMedia] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete brand media asset' });
  }
});

export default router;
