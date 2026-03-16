import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { mediaAssets } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
];

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

router.use(isAuthenticated);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(mediaAssets)
      .orderBy(desc(mediaAssets.createdAt));
    res.json({ assets: items, total: items.length });
  } catch (error: any) {
    console.error('[MediaAssets] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch media assets' });
  }
});

router.post('/', memUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { name, type, description, category, keywords } = req.body;
    const fileExt = path.extname(req.file.originalname);
    const uniqueName = `${crypto.randomUUID()}${fileExt}`;
    const filePath = path.join(uploadsDir, uniqueName);

    fs.writeFileSync(filePath, req.file.buffer);

    const url = `/uploads/${uniqueName}`;
    const uploadedBy = (req.user as any)?.id || null;

    const [asset] = await db.insert(mediaAssets).values({
      type: type || req.file.mimetype?.split('/')[0] || 'image',
      name: name || req.file.originalname,
      description: description || null,
      url,
      source: 'upload',
      classification: 'uncategorized',
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      category: category || null,
      keywords: keywords ? (Array.isArray(keywords) ? keywords : [keywords]) : [],
      uploadedBy,
    }).returning();

    res.status(201).json(asset);
  } catch (error: any) {
    console.error('[MediaAssets] Upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload media asset' });
  }
});

router.post('/:id/classify', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const { classification, brandMediaId } = req.body;
    if (!classification || !['brand', 'general'].includes(classification)) {
      return res.status(400).json({ error: 'classification must be "brand" or "general"' });
    }

    const updates: Record<string, any> = {
      classification,
      updatedAt: new Date(),
    };

    if (classification === 'brand' && brandMediaId) {
      updates.brandMediaId = brandMediaId;
    }

    const [updated] = await db
      .update(mediaAssets)
      .set(updates)
      .where(eq(mediaAssets.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Media asset not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[MediaAssets] Classify error:', error.message);
    res.status(500).json({ error: 'Failed to classify media asset' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [deleted] = await db
      .delete(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Media asset not found' });
    }

    if (deleted.url?.startsWith('/uploads/')) {
      const filePath = path.resolve(deleted.url.substring(1));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[MediaAssets] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete media asset' });
  }
});

export default router;
