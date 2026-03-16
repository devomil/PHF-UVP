import { Router } from 'express';
import { db } from '../db';
import { brandSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { brandBibleService } from './brand-bible-service';

const router = Router();

const uploadsDir = path.resolve('uploads/logos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `logo-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get('/', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const userId = (req.user as any).id;

  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (!settings) {
      return res.json({
        brandName: '',
        tagline: '',
        website: '',
        primaryColor: '#9333ea',
        secondaryColor: '#4f46e5',
        accentColor: '#06b6d4',
        logoUrl: null,
        guidelines: '',
      });
    }

    res.json({
      brandName: settings.brandName || '',
      tagline: settings.tagline || '',
      website: settings.website || '',
      primaryColor: settings.primaryColor || '#9333ea',
      secondaryColor: settings.secondaryColor || '#4f46e5',
      accentColor: settings.accentColor || '#06b6d4',
      logoUrl: settings.logoUrl || null,
      guidelines: settings.guidelines || '',
    });
  } catch (error: any) {
    console.error('[BrandSettings] GET error:', error.message);
    res.status(500).json({ error: 'Failed to fetch brand settings' });
  }
});

router.put('/', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const userId = (req.user as any).id;
  const { brandName, tagline, website, primaryColor, secondaryColor, accentColor, guidelines } = req.body;

  try {
    const [existing] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(brandSettings)
        .set({
          brandName: brandName ?? existing.brandName,
          tagline: tagline ?? existing.tagline,
          website: website ?? existing.website,
          primaryColor: primaryColor ?? existing.primaryColor,
          secondaryColor: secondaryColor ?? existing.secondaryColor,
          accentColor: accentColor ?? existing.accentColor,
          guidelines: guidelines ?? existing.guidelines,
          updatedAt: new Date(),
        })
        .where(eq(brandSettings.userId, userId))
        .returning();

      brandBibleService.clearCache();
      return res.json({ success: true, settings: updated });
    }

    const [created] = await db
      .insert(brandSettings)
      .values({
        userId,
        brandName: brandName || '',
        tagline: tagline || '',
        website: website || '',
        primaryColor: primaryColor || '#9333ea',
        secondaryColor: secondaryColor || '#4f46e5',
        accentColor: accentColor || '#06b6d4',
        guidelines: guidelines || '',
      })
      .returning();

    brandBibleService.clearCache();
    res.json({ success: true, settings: created });
  } catch (error: any) {
    console.error('[BrandSettings] PUT error:', error.message);
    res.status(500).json({ error: 'Failed to save brand settings' });
  }
});

router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const userId = (req.user as any).id;

  if (!req.file) {
    return res.status(400).json({ error: 'No logo file provided' });
  }

  const host = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get('host')}`;
  const logoUrl = `${host}/uploads/logos/${req.file.filename}`;

  try {
    const [existing] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (existing) {
      if (existing.logoUrl) {
        const oldFilename = existing.logoUrl.split('/uploads/logos/').pop();
        if (oldFilename) {
          const oldPath = path.join(uploadsDir, oldFilename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      await db
        .update(brandSettings)
        .set({ logoUrl, updatedAt: new Date() })
        .where(eq(brandSettings.userId, userId));
    } else {
      await db.insert(brandSettings).values({ userId, logoUrl });
    }

    brandBibleService.clearCache();
    res.json({ success: true, logoUrl });
  } catch (error: any) {
    console.error('[BrandSettings] Logo upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

router.delete('/logo', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const userId = (req.user as any).id;

  try {
    const [existing] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (existing?.logoUrl) {
      const filename = existing.logoUrl.split('/uploads/logos/').pop();
      if (filename) {
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await db
        .update(brandSettings)
        .set({ logoUrl: null, updatedAt: new Date() })
        .where(eq(brandSettings.userId, userId));
    }

    brandBibleService.clearCache();
    res.json({ success: true });
  } catch (error: any) {
    console.error('[BrandSettings] Logo delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

export default router;
