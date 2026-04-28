import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { brandMediaLibrary, brandReferenceSets } from '../../shared/schema';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { brandBibleService } from './brand-bible-service';
import { clearBrandContextCache } from './brand-settings-service';
import {
  sanitizeBrandReferenceList,
  MAX_BRAND_REFERENCE_SET_ENTRIES,
} from './brand-reference-helpers';

const router = Router();

router.use(isAuthenticated);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id || null;
    const items = await db
      .select()
      .from(brandMediaLibrary)
      .where(
        or(
          eq(brandMediaLibrary.uploadedBy, userId),
          isNull(brandMediaLibrary.uploadedBy)
        )
      )
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

    brandBibleService.clearCache(uploadedBy ?? undefined);
    clearBrandContextCache(uploadedBy ?? undefined);
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

    const userId = (req.user as any)?.id || null;
    const [updated] = await db
      .update(brandMediaLibrary)
      .set(updates)
      .where(and(eq(brandMediaLibrary.id, id), eq(brandMediaLibrary.uploadedBy, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Brand media asset not found' });
    }

    brandBibleService.clearCache(userId);
    clearBrandContextCache(userId);
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

    const userId = (req.user as any)?.id || null;
    const [deleted] = await db
      .delete(brandMediaLibrary)
      .where(and(eq(brandMediaLibrary.id, id), eq(brandMediaLibrary.uploadedBy, userId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Brand media asset not found' });
    }

    brandBibleService.clearCache(userId);
    clearBrandContextCache(userId);
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[BrandMedia] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete brand media asset' });
  }
});

// =====================================================================
// Task 91: brand reference SETS — saved bundles of brand-media references
// users can pick-and-apply across many product/solution scenes without
// re-selecting the same hero/pack/box images per scene.
//
// All endpoints are scoped to the authenticated user (req.user.id) and
// reject cross-user access with 404.
// =====================================================================

router.get('/reference-sets', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const sets = await db
      .select()
      .from(brandReferenceSets)
      .where(eq(brandReferenceSets.ownerId, userId))
      .orderBy(desc(brandReferenceSets.updatedAt));
    res.json({ sets, total: sets.length });
  } catch (error: any) {
    console.error('[BrandRefSets] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch brand reference sets' });
  }
});

router.post('/reference-sets', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { name, description, references } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    const sanitized = sanitizeBrandReferenceList(references);
    if (!sanitized) {
      return res.status(400).json({
        error: `references must be a non-empty array of {assetUrl, ...} (max ${MAX_BRAND_REFERENCE_SET_ENTRIES})`,
      });
    }
    const [created] = await db
      .insert(brandReferenceSets)
      .values({
        ownerId: userId,
        name: name.trim().slice(0, 255),
        description: typeof description === 'string' ? description.slice(0, 2000) : null,
        references: sanitized,
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    console.error('[BrandRefSets] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create brand reference set' });
  }
});

router.put('/reference-sets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const updates: Record<string, any> = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim().length > 0) {
      updates.name = req.body.name.trim().slice(0, 255);
    }
    if (req.body?.description !== undefined) {
      updates.description =
        typeof req.body.description === 'string' ? req.body.description.slice(0, 2000) : null;
    }
    if (req.body?.references !== undefined) {
      const sanitized = sanitizeBrandReferenceList(req.body.references);
      if (!sanitized) {
        return res.status(400).json({
          error: `references must be a non-empty array of {assetUrl, ...} (max ${MAX_BRAND_REFERENCE_SET_ENTRIES})`,
        });
      }
      updates.references = sanitized;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(brandReferenceSets)
      .set(updates)
      .where(and(eq(brandReferenceSets.id, id), eq(brandReferenceSets.ownerId, userId)))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Brand reference set not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('[BrandRefSets] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update brand reference set' });
  }
});

router.delete('/reference-sets/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [deleted] = await db
      .delete(brandReferenceSets)
      .where(and(eq(brandReferenceSets.id, id), eq(brandReferenceSets.ownerId, userId)))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: 'Brand reference set not found' });
    }
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[BrandRefSets] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete brand reference set' });
  }
});

export default router;
