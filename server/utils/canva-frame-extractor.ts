import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  filePath: string;
  timestamp: number;
  label: string;
}

export async function extractKeyFrames(
  mp4Path: string,
  count: number = 4
): Promise<ExtractedFrame[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuralcut-frames-'));

  let duration = 30;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      mp4Path,
    ]);
    const probe = JSON.parse(stdout);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream?.duration) {
      duration = parseFloat(videoStream.duration);
    } else if (probe.streams?.[0]?.duration) {
      duration = parseFloat(probe.streams[0].duration);
    }
  } catch (err) {
    console.warn('[FrameExtract] ffprobe failed, using default duration:', err);
  }

  const startOffset = duration * 0.05;
  const endOffset = duration * 0.95;
  const usable = endOffset - startOffset;
  const step = usable / (count + 1);

  const frames: ExtractedFrame[] = [];

  for (let i = 1; i <= count; i++) {
    const timestamp = startOffset + step * i;
    const outPath = path.join(tmpDir, `frame_${i}.jpg`);

    try {
      await execFileAsync('ffmpeg', [
        '-ss', timestamp.toFixed(2),
        '-i', mp4Path,
        '-vframes', '1',
        '-vf', 'scale=1920:-1',
        '-q:v', '2',
        '-y',
        outPath,
      ], { timeout: 30000 });

      frames.push({
        filePath: outPath,
        timestamp,
        label: `Frame ${i} (${Math.round(timestamp)}s)`,
      });
    } catch (err) {
      console.warn(`[FrameExtract] Failed to extract frame at ${timestamp}s:`, err);
    }
  }

  if (frames.length === 0) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error('No frames could be extracted from the video');
  }

  return frames;
}

export async function cleanupFrames(frames: ExtractedFrame[]): Promise<void> {
  if (frames.length === 0) return;
  const tmpDir = path.dirname(frames[0].filePath);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
