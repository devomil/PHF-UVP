import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { userMediaUploads } from '../../shared/schema';
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
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

router.use(isAuthenticated);

router.post('/uploads', memUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const fileExt = path.extname(req.file.originalname);
    const uniqueName = `${crypto.randomUUID()}${fileExt}`;
    const filePath = path.join(uploadsDir, uniqueName);

    fs.writeFileSync(filePath, req.file.buffer);

    const url = `/uploads/${uniqueName}`;
    const mediaType = req.file.mimetype?.split('/')[0] || 'unknown';
    const { name, description, category, tags } = req.body;

    const [upload] = await db.insert(userMediaUploads).values({
      uploadedBy: userId,
      name: name || req.file.originalname,
      originalFilename: req.file.originalname,
      description: description || null,
      type: mediaType,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      url,
      storageKey: uniqueName,
      category: category || null,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      status: 'ready',
    }).returning();

    res.status(201).json(upload);
  } catch (error: any) {
    console.error('[Uploads] Upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/uploads', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const uploads = await db
      .select()
      .from(userMediaUploads)
      .where(eq(userMediaUploads.uploadedBy, userId))
      .orderBy(desc(userMediaUploads.createdAt));

    res.json(uploads);
  } catch (error: any) {
    console.error('[Uploads] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

export default router;
