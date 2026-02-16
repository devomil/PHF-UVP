import { db } from '../db';
import { brandAssets } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { objectStorageClient } from '../objectStorage';

const urlCache = new Map<string, string>();

const REMOTION_BUCKET_NAME = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
const REMOTION_REGION = process.env.REMOTION_AWS_REGION || 'us-east-2';
const s3Client = process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY
  ? new S3Client({
      region: REMOTION_REGION,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

export interface AssetUrlResolverOptions {
  skipCache?: boolean;
}

class AssetUrlResolver {
  
  async resolve(url: string, options: AssetUrlResolverOptions = {}): Promise<string | null> {
    if (!url) {
      console.log('[AssetURL] Empty URL provided');
      return null;
    }
    
    if (this.isPublicUrl(url)) {
      return url;
    }
    
    if (!options.skipCache && urlCache.has(url)) {
      console.log('[AssetURL] Cache hit for:', url);
      return urlCache.get(url)!;
    }
    
    let publicUrl: string | null = null;
    
    if (url.startsWith('/api/brand-assets/file/')) {
      publicUrl = await this.resolveRelativeAssetUrl(url);
    } else if (url.includes('.picard.replit.dev') || url.includes('.replit.dev')) {
      publicUrl = await this.resolveReplitDevUrl(url);
    } else if (url.startsWith('/uploads/')) {
      publicUrl = await this.resolveStaticPath(url);
    }
    
    if (publicUrl) {
      urlCache.set(url, publicUrl);
      console.log('[AssetURL] Resolved:', url, '→', publicUrl.substring(0, 60) + '...');
    } else {
      console.warn('[AssetURL] Failed to resolve:', url);
    }
    
    return publicUrl;
  }
  
  async resolveAll(urls: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const resolved = await Promise.all(
        batch.map(url => this.resolve(url))
      );
      batch.forEach((url, idx) => results.set(url, resolved[idx]));
    }
    
    return results;
  }
  
  private isPublicUrl(url: string): boolean {
    return (
      url.startsWith('https://storage.googleapis.com/') ||
      url.startsWith('https://storage.theapi.app/') ||
      url.startsWith('https://s3.') ||
      url.startsWith('https://cdn.') ||
      url.includes('.s3.amazonaws.com') ||
      url.includes('.r2.cloudflarestorage.com')
    );
  }
  
  private async resolveRelativeAssetUrl(url: string): Promise<string | null> {
    try {
      const match = url.match(/\/api\/brand-assets\/file\/(\d+)/);
      if (!match) {
        console.log('[AssetURL] Invalid relative URL format:', url);
        return null;
      }
      
      const assetId = parseInt(match[1]);
      if (isNaN(assetId) || assetId <= 0) {
        console.log('[AssetURL] Invalid asset ID:', match[1]);
        return null;
      }
      
      const [asset] = await db
        .select()
        .from(brandAssets)
        .where(eq(brandAssets.id, assetId));
      
      if (!asset) {
        console.log('[AssetURL] Asset not found:', assetId);
        return null;
      }
      
      const settings = asset.settings as any;
      const storagePath = settings?.storagePath;
      
      if (!storagePath) {
        console.log('[AssetURL] No storagePath for asset:', assetId);
        return null;
      }
      
      const [bucketName, objectPath] = storagePath.split('|');
      if (!bucketName || !objectPath) {
        console.log('[AssetURL] Invalid storagePath format:', storagePath);
        return null;
      }
      
      if (bucketName.startsWith('replit-objstore-')) {
        console.log('[AssetURL] Replit object storage detected for asset:', assetId);
        return await this.cacheReplitAssetToS3(objectPath, assetId);
      }
      
      return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
      
    } catch (error) {
      console.error('[AssetURL] Error resolving relative URL:', error);
      return null;
    }
  }
  
  private async resolveReplitDevUrl(url: string): Promise<string | null> {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      if (path.startsWith('/api/brand-assets/file/')) {
        return this.resolveRelativeAssetUrl(path);
      }
      
      if (path.startsWith('/uploads/')) {
        return this.resolveStaticPath(path);
      }
      
      console.log('[AssetURL] Unknown Replit URL pattern:', path);
      return null;
      
    } catch (error) {
      console.error('[AssetURL] Error parsing Replit URL:', error);
      return null;
    }
  }
  
  private async resolveStaticPath(path: string): Promise<string | null> {
    return await this.cacheLocalFileToS3(path);
  }
  
  private async cacheReplitAssetToS3(objectPath: string, assetId: number): Promise<string | null> {
    if (!s3Client) {
      console.error('[AssetURL] S3 client not configured - cannot cache asset');
      return null;
    }
    
    try {
      console.log('[AssetURL] Fetching asset from Replit object storage:', objectPath);
      
      // Get bucket name from environment
      const bucketId = process.env.REPLIT_DEFAULT_BUCKET_ID || 
                       (process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split('/')[1]);
      
      if (!bucketId) {
        console.error('[AssetURL] No Replit bucket ID found in environment');
        return null;
      }
      
      // Use the GCS client from objectStorage.ts with proper sidecar authentication
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(objectPath);
      
      // Download file contents
      const [contents] = await file.download();
      const buffer = contents;
      
      const extension = objectPath.split('.').pop() || 'png';
      const contentType = this.getContentType(extension);
      const s3Key = `video-assets/brand/asset-${assetId}-${Date.now()}.${extension}`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: REMOTION_BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }));
      
      const s3Url = `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${s3Key}`;
      console.log('[AssetURL] Cached asset to S3 with public-read ACL:', s3Url);
      
      return s3Url;
      
    } catch (error) {
      console.error('[AssetURL] Error caching asset to S3:', error);
      return null;
    }
  }
  
  private async cacheLocalFileToS3(path: string): Promise<string | null> {
    if (!s3Client) {
      console.error('[AssetURL] S3 client not configured - cannot cache local file');
      return null;
    }
    
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';
      const fetchUrl = `${baseUrl}${path}`;
      
      console.log('[AssetURL] Fetching local file:', fetchUrl.substring(0, 60));
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        console.error('[AssetURL] Failed to fetch local file, status:', response.status);
        return null;
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = path.split('.').pop() || 'png';
      const contentType = this.getContentType(extension);
      const filename = path.split('/').pop() || 'file';
      const s3Key = `video-assets/brand/${filename.replace(/\.[^.]+$/, '')}-${Date.now()}.${extension}`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: REMOTION_BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }));
      
      const s3Url = `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${s3Key}`;
      console.log('[AssetURL] Cached local file to S3 with public-read ACL:', s3Url);
      
      return s3Url;
      
    } catch (error) {
      console.error('[AssetURL] Error caching local file to S3:', error);
      return null;
    }
  }
  
  private getContentType(extension: string): string {
    const types: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
    };
    return types[extension.toLowerCase()] || 'application/octet-stream';
  }
  
  clearCache(): void {
    urlCache.clear();
    console.log('[AssetURL] Cache cleared');
  }

  /**
   * Validate a URL can be accessed by Remotion Lambda
   */
  async validate(url: string): Promise<{ valid: boolean; error?: string }> {
    if (!url) {
      return { valid: false, error: 'URL is empty' };
    }

    // Check for Replit dev URLs (inaccessible from Lambda)
    const invalidPatterns = [
      '.picard.replit.dev',
      '.repl.co',
      'localhost:',
      '127.0.0.1',
    ];

    for (const pattern of invalidPatterns) {
      if (url.includes(pattern)) {
        return { 
          valid: false, 
          error: `URL contains inaccessible pattern: ${pattern}` 
        };
      }
    }

    // Check for relative URLs
    if (url.startsWith('/')) {
      return { 
        valid: false, 
        error: 'URL is relative and needs resolution' 
      };
    }

    // Check if it's a public URL
    if (this.isPublicUrl(url)) {
      return { valid: true };
    }

    // HTTPS URLs without invalid patterns are generally accessible
    if (url.startsWith('https://')) {
      return { valid: true };
    }

    return { 
      valid: false, 
      error: 'URL is not HTTPS or not publicly accessible' 
    };
  }

  /**
   * Check if a URL is accessible from Lambda (alias for validate)
   */
  isLambdaAccessible(url: string): boolean {
    if (!url) return false;
    
    const blockedPatterns = [
      '.picard.replit.dev',
      '.repl.co',
      'localhost',
      '127.0.0.1',
      '/api/',
      '/uploads/',
    ];

    return !blockedPatterns.some(pattern => url.includes(pattern));
  }
}

export const assetUrlResolver = new AssetUrlResolver();
