import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const router = Router();

const BUCKET = process.env.REMOTION_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
const REGION = process.env.REMOTION_AWS_REGION || 'us-east-2';
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_DURATION_SEC = 600;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY || '',
  },
});

const ALLOWED_VIDEO_MIMES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
];
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
];
const ALLOWED_MIMES = [...ALLOWED_VIDEO_MIMES, ...ALLOWED_IMAGE_MIMES];

const SAFE_EXTENSIONS: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MIME_TO_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': 'video/mp4',
  'video/quicktime': 'video/mp4',
  'video/x-msvideo': 'video/x-msvideo',
  'video/x-matroska': 'video/x-matroska',
  'video/webm': 'video/webm',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const tmpDir = path.resolve('/tmp/studio-polish-uploads');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: tmpDir,
    filename: (_req, file, cb) => {
      const ext = SAFE_EXTENSIONS[file.mimetype] || '.bin';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Accepted: MP4, MOV, AVI, MKV, WebM, JPG, PNG, WEBP`));
    }
  },
});

router.use(isAuthenticated);

async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { timeout: 30000 }
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) || duration <= 0 ? 0 : duration;
  } catch {
    return 0;
  }
}

async function extractThumbnail(videoPath: string, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-ss', '1', '-i', videoPath, '-vframes', '1', '-q:v', '5', '-vf', 'scale=480:-2', outputPath],
      { timeout: 30000 }
    );
    return fs.existsSync(outputPath);
  } catch {
    try {
      await execFileAsync(
        'ffmpeg',
        ['-y', '-ss', '0', '-i', videoPath, '-vframes', '1', '-q:v', '5', '-vf', 'scale=480:-2', outputPath],
        { timeout: 15000 }
      );
      return fs.existsSync(outputPath);
    } catch {
      return false;
    }
  }
}

async function uploadToS3(filePath: string, s3Key: string, contentType: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: contentType,
    ACL: 'public-read',
    CacheControl: 'max-age=31536000',
  }));
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;
}

function cleanupFile(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function wrappedUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    diskUpload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Maximum file size is 500MB' });
        } else if (err instanceof multer.MulterError) {
          res.status(400).json({ error: `Upload error: ${err.message}` });
        } else {
          res.status(400).json({ error: err.message || 'Upload failed' });
        }
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

router.post('/upload', async (req: Request, res: Response) => {
  try {
    await wrappedUpload(req, res);
  } catch {
    return;
  }
  const uploadedPath = (req.file as any)?.path;
  const tempFiles: string[] = [];

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    tempFiles.push(uploadedPath);

    const isVideo = ALLOWED_VIDEO_MIMES.includes(req.file.mimetype);
    const isImage = ALLOWED_IMAGE_MIMES.includes(req.file.mimetype);
    const fileId = crypto.randomUUID();

    let duration = 0;
    let thumbnailUrl: string | null = null;
    let s3Url: string;

    if (isVideo) {
      duration = await probeDuration(uploadedPath);
      if (duration <= 0) {
        return res.status(400).json({ error: 'Could not determine video duration. The file may be corrupted.' });
      }
      if (duration > MAX_DURATION_SEC) {
        return res.status(400).json({
          error: `Maximum video length is 10 minutes per clip. This video is ${Math.ceil(duration / 60)} minutes.`,
        });
      }

      console.log(`[StudioPolish] Uploading video directly: ${req.file.originalname} (${duration.toFixed(1)}s, ${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

      const safeExt = SAFE_EXTENSIONS[req.file.mimetype] || '.mp4';
      const s3Key = `studio-polish/${userId}/${fileId}/source${safeExt}`;
      const contentType = MIME_TO_CONTENT_TYPE[req.file.mimetype] || 'video/mp4';
      s3Url = await uploadToS3(uploadedPath, s3Key, contentType);
      console.log(`[StudioPolish] Uploaded video to S3: ${s3Key}`);

      const thumbPath = path.join(tmpDir, `${fileId}_thumb.jpg`);
      tempFiles.push(thumbPath);
      const thumbOk = await extractThumbnail(uploadedPath, thumbPath);
      if (thumbOk) {
        const thumbKey = `studio-polish/${userId}/${fileId}/thumbnail.jpg`;
        thumbnailUrl = await uploadToS3(thumbPath, thumbKey, 'image/jpeg');
      }
    } else if (isImage) {
      duration = 5;
      const safeExt = SAFE_EXTENSIONS[req.file.mimetype] || '.bin';
      const s3Key = `studio-polish/${userId}/${fileId}/source${safeExt}`;
      s3Url = await uploadToS3(uploadedPath, s3Key, req.file.mimetype);
      thumbnailUrl = s3Url;
      console.log(`[StudioPolish] Uploaded image to S3: ${s3Key}`);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    res.json({
      fileId,
      s3Url,
      thumbnailUrl,
      duration,
      fileType: isVideo ? 'video' : 'image',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error: any) {
    console.error('[StudioPolish] Upload error:', error.message);
    res.status(500).json({ error: `Upload failed: ${error.message?.substring(0, 200)}` });
  } finally {
    for (const f of tempFiles) {
      cleanupFile(f);
    }
  }
});

router.post('/validate-asset', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { s3Url, fileType, duration: clientDuration } = req.body;
    if (!s3Url || typeof s3Url !== 'string') {
      return res.status(400).json({ error: 'Missing s3Url' });
    }

    if (fileType === 'video') {
      if (!clientDuration || typeof clientDuration !== 'number' || clientDuration <= 0) {
        return res.status(400).json({ error: 'Video duration is unknown. Please upload the video directly instead of selecting from Asset Library.' });
      }
      if (clientDuration > MAX_DURATION_SEC) {
        return res.status(400).json({
          error: `Maximum video length is 10 minutes per clip. This video is ${Math.ceil(clientDuration / 60)} minutes.`,
        });
      }
    }

    res.json({
      valid: true,
      duration: fileType === 'video' ? clientDuration : 5,
    });
  } catch (error: any) {
    res.status(500).json({ error: `Validation failed: ${error.message?.substring(0, 200)}` });
  }
});

export default router;
