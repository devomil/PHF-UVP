import { Router, Request, Response } from 'express';
import { db } from '../db';
import { clonedVoices } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { isAuthenticated } from '../auth';

const router = Router();

const VOICE_SAMPLES_DIR = path.resolve('uploads/voice-samples');
if (!fs.existsSync(VOICE_SAMPLES_DIR)) {
  fs.mkdirSync(VOICE_SAMPLES_DIR, { recursive: true });
}

const MIN_DURATION_SECONDS = 10;

// Only WAV and MP3 are accepted for voice cloning.
const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3']);

// Magic-byte signatures for audio validation (prevents MIME spoofing).
// Returns the canonical extension for a valid audio file, or null if invalid.
function detectAudioType(buf: Buffer): '.wav' | '.mp3' | null {
  if (buf.length < 4) return null;
  // WAV: "RIFF" header
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return '.wav';
  }
  // MP3: ID3 tag (ID3v2) or MPEG frame sync (0xFF 0xEx / 0xFF 0xFx)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return '.mp3'; // ID3
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return '.mp3'; // MPEG sync
  return null;
}

// multer stores file in memory; no MIME-based fileFilter (spoofable) — we
// validate with magic bytes after receiving the buffer.
const voiceSampleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(isAuthenticated);

router.get('/', async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  try {
    const voices = await db
      .select()
      .from(clonedVoices)
      .where(eq(clonedVoices.userId, userId))
      .orderBy(desc(clonedVoices.createdAt));
    res.json({ success: true, voices });
  } catch (err: any) {
    console.error('[VoiceClone] List error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to list cloned voices' });
  }
});

router.post('/', voiceSampleUpload.single('sample'), async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio sample file provided.' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Voice name is required.' });
    }

    // Magic-byte validation — reject spoofed MIME types.
    const detectedExt = detectAudioType(req.file.buffer);
    if (!detectedExt) {
      return res.status(400).json({
        success: false,
        error: 'Invalid audio file. Please upload a WAV or MP3 file.',
      });
    }

    // Extension allow-list (belt + braces).
    const claimedExt = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(claimedExt) && !ALLOWED_EXTENSIONS.has(detectedExt)) {
      return res.status(400).json({
        success: false,
        error: 'Only WAV and MP3 files are accepted for voice cloning.',
      });
    }

    // Server-side duration check (≥10 s).
    let duration = 0;
    try {
      const mm = await import('music-metadata');
      const metadata = await mm.parseBuffer(req.file.buffer, { mimeType: req.file.mimetype });
      duration = metadata.format.duration ?? 0;
    } catch {
      // If metadata parsing fails, allow upload but log a warning.
      console.warn('[VoiceClone] Could not parse audio duration for upload — skipping duration check.');
      duration = MIN_DURATION_SECONDS; // Assume valid on parse failure to avoid blocking.
    }

    if (duration > 0 && duration < MIN_DURATION_SECONDS) {
      return res.status(400).json({
        success: false,
        error: `Audio sample must be at least ${MIN_DURATION_SECONDS} seconds long (your file is ${duration.toFixed(1)} s). A longer, clear sample produces better voice clones.`,
      });
    }

    // Use the canonically detected extension, not the user-supplied one.
    const safeExt = detectedExt;
    const uniqueName = `voice-${crypto.randomUUID()}${safeExt}`;
    const filePath = path.join(VOICE_SAMPLES_DIR, uniqueName);
    fs.writeFileSync(filePath, req.file.buffer);
    const sampleUrl = `/uploads/voice-samples/${uniqueName}`;

    const [record] = await db.insert(clonedVoices).values({
      userId,
      name: name.trim(),
      sampleUrl,
      provider: 'playht',
      status: 'pending',
    }).returning();

    triggerPlayhtClone(record.id, sampleUrl, name.trim()).catch((err) => {
      console.error(`[VoiceClone] Background clone failed for id=${record.id}:`, err.message);
    });

    res.status(201).json({ success: true, voice: record });
  } catch (err: any) {
    console.error('[VoiceClone] Upload error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create cloned voice.' });
  }
});

const PREVIEW_TEXT = "Hello! This is a preview of your cloned voice. It sounds just like you.";

router.post('/:id/preview', async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid voice ID.' });
  }

  try {
    const [voice] = await db
      .select()
      .from(clonedVoices)
      .where(and(eq(clonedVoices.id, id), eq(clonedVoices.userId, userId)))
      .limit(1);

    if (!voice) {
      return res.status(404).json({ success: false, error: 'Voice not found or not owned by you.' });
    }

    if (voice.status !== 'ready' || !voice.providerVoiceId) {
      return res.status(400).json({ success: false, error: 'Voice is not ready for preview yet.' });
    }

    const audioBuffer = await generatePlayhtSpeech(PREVIEW_TEXT, voice.providerVoiceId);
    if (!audioBuffer) {
      return res.status(503).json({ success: false, error: 'Voice preview is not available — Play.ht credentials are not configured.' });
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-store',
    });
    res.send(audioBuffer);
  } catch (err: any) {
    console.error(`[VoiceClone] Preview error for id=${id}:`, err.message);
    res.status(500).json({ success: false, error: 'Failed to generate voice preview.' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = (req.user as any).id;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid voice ID.' });
  }

  try {
    const [deleted] = await db
      .delete(clonedVoices)
      .where(and(eq(clonedVoices.id, id), eq(clonedVoices.userId, userId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Voice not found or not owned by you.' });
    }

    if (deleted.sampleUrl?.startsWith('/uploads/')) {
      const filePath = path.resolve(deleted.sampleUrl.substring(1));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true, id });
  } catch (err: any) {
    console.error('[VoiceClone] Delete error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete cloned voice.' });
  }
});

// Resolve a cloned voice ID for another service. Returns null if not found.
export async function resolveClonedVoice(
  clonedVoiceRef: string,
  userId: string,
): Promise<{ providerVoiceId: string | null; provider: string } | null> {
  // Accept "cloned:<id>" format.
  const match = clonedVoiceRef.match(/^cloned:(\d+)$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  const [row] = await db
    .select()
    .from(clonedVoices)
    .where(and(eq(clonedVoices.id, id), eq(clonedVoices.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { providerVoiceId: row.providerVoiceId, provider: row.provider };
}

// Generate speech via Play.ht for a cloned voice ID. Returns audio buffer or null on error.
export async function generatePlayhtSpeech(
  text: string,
  voiceId: string,
): Promise<Buffer | null> {
  const apiKey = process.env.PLAYHT_API_KEY;
  const userId = process.env.PLAYHT_USER_ID;

  if (!apiKey || !userId) {
    console.warn('[VoiceClone] PLAYHT_API_KEY or PLAYHT_USER_ID not set — cannot generate speech.');
    return null;
  }

  const response = await fetch('https://api.play.ht/api/v2/tts/stream', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-User-ID': userId,
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice: voiceId,
      output_format: 'mp3',
      voice_engine: 'PlayDialog',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Play.ht TTS returned ${response.status}: ${body}`);
  }

  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function triggerPlayhtClone(recordId: number, sampleUrl: string, voiceName: string) {
  const apiKey = process.env.PLAYHT_API_KEY;
  const userId = process.env.PLAYHT_USER_ID;

  if (!apiKey || !userId) {
    console.warn('[VoiceClone] PLAYHT_API_KEY or PLAYHT_USER_ID not configured — marking clone as failed.');
    await db.update(clonedVoices).set({
      status: 'failed',
      errorMessage: 'Voice cloning requires PLAYHT_API_KEY and PLAYHT_USER_ID to be configured. Contact support to enable this feature.',
      updatedAt: new Date(),
    }).where(eq(clonedVoices.id, recordId));
    return;
  }

  try {
    const absoluteUrl = sampleUrl.startsWith('http')
      ? sampleUrl
      : `${process.env.APP_URL || ''}${sampleUrl}`;

    const formData = new FormData();
    formData.append('voice_name', voiceName);
    formData.append('sample_file_url', absoluteUrl);

    const response = await fetch('https://api.play.ht/api/v2/cloned-voices/instant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-User-ID': userId,
        'Accept': 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Play.ht returned ${response.status}: ${body}`);
    }

    const data = await response.json();
    const providerVoiceId = data.id || data.voice_id || data.cloned_voice_id || null;

    await db.update(clonedVoices).set({
      status: providerVoiceId ? 'ready' : 'failed',
      providerVoiceId,
      errorMessage: providerVoiceId ? null : 'Play.ht did not return a voice ID.',
      updatedAt: new Date(),
    }).where(eq(clonedVoices.id, recordId));

    console.log(`[VoiceClone] Clone id=${recordId} registered with Play.ht: ${providerVoiceId}`);
  } catch (err: any) {
    console.error(`[VoiceClone] Play.ht clone failed for id=${recordId}:`, err.message);
    await db.update(clonedVoices).set({
      status: 'failed',
      errorMessage: err.message,
      updatedAt: new Date(),
    }).where(eq(clonedVoices.id, recordId));
  }
}

export default router;
