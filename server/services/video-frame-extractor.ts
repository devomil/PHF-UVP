import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

class VideoFrameExtractor {
  
  async isFFmpegAvailable(): Promise<boolean> {
    try {
      await execAsync('which ffmpeg');
      return true;
    } catch {
      return false;
    }
  }

  private async downloadVideo(url: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`[FrameExtractor] Starting download from: ${url.substring(0, 100)}...`);
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(outputPath);
      
      const request = protocol.get(url, { timeout: 60000 }, (response) => {
        console.log(`[FrameExtractor] Response status: ${response.statusCode}`);
        
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          console.log(`[FrameExtractor] Following redirect to: ${redirectUrl?.substring(0, 100)}...`);
          if (redirectUrl) {
            file.close();
            if (fs.existsSync(outputPath)) {
              try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
            }
            const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href;
            this.downloadVideo(fullRedirectUrl, outputPath).then(resolve);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          console.error(`[FrameExtractor] Download failed with status: ${response.statusCode}`);
          file.close();
          resolve(false);
          return;
        }
        
        let downloadedBytes = 0;
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
        });
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`[FrameExtractor] Download complete: ${downloadedBytes} bytes`);
          resolve(true);
        });
        file.on('error', (err) => {
          console.error(`[FrameExtractor] File write error:`, err.message);
          file.close();
          resolve(false);
        });
      });
      
      request.on('error', (err) => {
        console.error(`[FrameExtractor] Download error:`, err.message);
        file.close();
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
        }
        resolve(false);
      });
      
      request.on('timeout', () => {
        console.error(`[FrameExtractor] Download timeout after 60s`);
        request.destroy();
        file.close();
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
        }
        resolve(false);
      });
    });
  }

  private isImageUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('/images/') || 
           lowerUrl.endsWith('.jpg') || 
           lowerUrl.endsWith('.jpeg') || 
           lowerUrl.endsWith('.png') || 
           lowerUrl.endsWith('.gif') ||
           lowerUrl.endsWith('.webp');
  }

  private async downloadAsBase64(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      console.log(`[FrameExtractor] Downloading image directly: ${url.substring(0, 100)}...`);
      const protocol = url.startsWith('https') ? https : http;
      const chunks: Buffer[] = [];
      
      const request = protocol.get(url, { timeout: 60000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href;
            this.downloadAsBase64(fullRedirectUrl).then(resolve);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          console.error(`[FrameExtractor] Image download failed with status: ${response.statusCode}`);
          resolve(null);
          return;
        }
        
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          const mediaType = contentType.split(';')[0].trim();
          console.log(`[FrameExtractor] Image downloaded: ${buffer.length} bytes, type: ${mediaType}`);
          resolve(`data:${mediaType};base64,${buffer.toString('base64')}`);
        });
      });
      
      request.on('error', (err) => {
        console.error(`[FrameExtractor] Image download error:`, err.message);
        resolve(null);
      });
      
      request.on('timeout', () => {
        console.error(`[FrameExtractor] Image download timeout`);
        request.destroy();
        resolve(null);
      });
    });
  }

  async extractFrame(
    videoUrl: string,
    timestampSeconds: number = 1
  ): Promise<string | null> {
    const isRemoteUrl = videoUrl.startsWith('http://') || videoUrl.startsWith('https://');
    
    console.log(`[FrameExtractor] Processing URL (remote: ${isRemoteUrl}): ${videoUrl.substring(0, 100)}...`);
    
    if (this.isImageUrl(videoUrl)) {
      console.log(`[FrameExtractor] URL is an image, downloading directly instead of extracting frame`);
      if (isRemoteUrl) {
        return await this.downloadAsBase64(videoUrl);
      } else if (fs.existsSync(videoUrl)) {
        const buffer = fs.readFileSync(videoUrl);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
      return null;
    }
    
    const hasFFmpeg = await this.isFFmpegAvailable();
    
    if (!hasFFmpeg) {
      console.warn(`[FrameExtractor] FFmpeg not available`);
      return null;
    }

    const tempDir = os.tmpdir();
    const videoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    const outputPath = path.join(tempDir, `frame_${Date.now()}.jpg`);

    try {
      let inputPath = videoUrl;
      
      if (isRemoteUrl) {
        const downloaded = await this.downloadVideo(videoUrl, videoPath);
        if (!downloaded) {
          console.error(`[FrameExtractor] Download returned false`);
          return null;
        }
        if (!fs.existsSync(videoPath)) {
          console.error(`[FrameExtractor] Video file does not exist after download`);
          return null;
        }
        const stats = fs.statSync(videoPath);
        console.log(`[FrameExtractor] Video downloaded successfully: ${stats.size} bytes at ${videoPath}`);
        
        const magicBuffer = Buffer.alloc(12);
        const fd = fs.openSync(videoPath, 'r');
        fs.readSync(fd, magicBuffer, 0, 12, 0);
        fs.closeSync(fd);
        
        if (magicBuffer[0] === 0xFF && magicBuffer[1] === 0xD8) {
          console.log(`[FrameExtractor] Downloaded file is actually a JPEG image, returning directly`);
          const buffer = fs.readFileSync(videoPath);
          fs.unlinkSync(videoPath);
          return `data:image/jpeg;base64,${buffer.toString('base64')}`;
        }
        if (magicBuffer[0] === 0x89 && magicBuffer[1] === 0x50 && magicBuffer[2] === 0x4E && magicBuffer[3] === 0x47) {
          console.log(`[FrameExtractor] Downloaded file is actually a PNG image, returning directly`);
          const buffer = fs.readFileSync(videoPath);
          fs.unlinkSync(videoPath);
          return `data:image/png;base64,${buffer.toString('base64')}`;
        }
        
        inputPath = videoPath;
      }
      
      const command = `ffmpeg -ss ${timestampSeconds} -i "${inputPath}" -vframes 1 -q:v 2 "${outputPath}" -y`;
      console.log(`[FrameExtractor] Executing FFmpeg command...`);
      
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      if (stderr) {
        console.log(`[FrameExtractor] FFmpeg stderr: ${stderr.substring(0, 200)}`);
      }
      
      if (fs.existsSync(outputPath)) {
        const buffer = fs.readFileSync(outputPath);
        const base64 = buffer.toString('base64');
        console.log(`[FrameExtractor] Frame extracted successfully: ${buffer.length} bytes`);
        
        fs.unlinkSync(outputPath);
        if (isRemoteUrl && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        
        return `data:image/jpeg;base64,${base64}`;
      }
      
      console.error(`[FrameExtractor] FFmpeg did not produce output file`);
      if (isRemoteUrl && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      return null;

    } catch (error: any) {
      console.error(`[FrameExtractor] Exception:`, error.message);
      
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      return null;
    }
  }

  async extractFrameAsBase64(
    videoUrl: string,
    timestampSeconds: number = 1
  ): Promise<{ base64: string; mediaType: 'image/jpeg' } | null> {
    const dataUrl = await this.extractFrame(videoUrl, timestampSeconds);
    
    if (!dataUrl) {
      return null;
    }

    const base64Match = dataUrl.match(/base64,(.+)$/);
    if (!base64Match) {
      return null;
    }

    return {
      base64: base64Match[1],
      mediaType: 'image/jpeg',
    };
  }
}

export const videoFrameExtractor = new VideoFrameExtractor();
