import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const BUCKET = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
const REGION = process.env.REMOTION_AWS_REGION || 'us-east-2';

const s3Client = (process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY)
  ? new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export interface S3RenderAsset {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified: string | null;
  contentType: string;
}

export const ASSET_PREFIXES = {
  sfx: 'audio/sfx/',
  music: 'audio/music/',
  logos: 'brand/logos/',
  badges: 'brand/badges/',
  overlays: 'brand/overlays/',
  'end-cards': 'brand/end-cards/',
  'intro-backgrounds': 'brand/intro-backgrounds/',
  fonts: 'brand/fonts/',
} as const;

export type AssetCategory = keyof typeof ASSET_PREFIXES;

const assetCache = new Map<string, { assets: S3RenderAsset[]; timestamp: number }>();
const CACHE_TTL = 60_000;

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

class S3RenderAssetService {
  async listAssets(category: AssetCategory, forceRefresh = false): Promise<S3RenderAsset[]> {
    if (!s3Client) {
      console.warn('[S3RenderAssets] S3 client not configured');
      return [];
    }

    const cacheKey = category;
    if (!forceRefresh) {
      const cached = assetCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.assets;
      }
    }

    try {
      const prefix = ASSET_PREFIXES[category];
      const allContents: any[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });
        const result = await s3Client.send(command);
        if (result.Contents) {
          allContents.push(...result.Contents);
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);

      const assets: S3RenderAsset[] = allContents
        .filter(obj => obj.Key && obj.Key !== prefix)
        .map(obj => {
          const key = obj.Key!;
          const name = key.split('/').pop() || key;
          const ext = name.split('.').pop() || '';
          return {
            key,
            name,
            url: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
            size: obj.Size || 0,
            lastModified: obj.LastModified?.toISOString() || null,
            contentType: getContentType(ext),
          };
        });

      assetCache.set(cacheKey, { assets, timestamp: Date.now() });
      console.log(`[S3RenderAssets] Listed ${assets.length} assets in ${category}`);
      return assets;
    } catch (error: any) {
      console.error(`[S3RenderAssets] Error listing ${category}:`, error.message);
      return [];
    }
  }

  async findAssetByName(category: AssetCategory, name: string): Promise<S3RenderAsset | null> {
    const assets = await this.listAssets(category);
    const lowerName = name.toLowerCase();
    return assets.find(a => a.name.toLowerCase() === lowerName) ||
           assets.find(a => a.name.toLowerCase().includes(lowerName)) ||
           null;
  }

  async findAssetsByPattern(category: AssetCategory, pattern: string): Promise<S3RenderAsset[]> {
    const assets = await this.listAssets(category);
    const lowerPattern = pattern.toLowerCase();
    return assets.filter(a => a.name.toLowerCase().includes(lowerPattern));
  }

  async getFirstAsset(category: AssetCategory): Promise<S3RenderAsset | null> {
    const assets = await this.listAssets(category);
    return assets.length > 0 ? assets[0] : null;
  }

  async getRandomAsset(category: AssetCategory): Promise<S3RenderAsset | null> {
    const assets = await this.listAssets(category);
    if (assets.length === 0) return null;
    return assets[Math.floor(Math.random() * assets.length)];
  }

  async getSfxByType(type: string): Promise<S3RenderAsset | null> {
    return this.findAssetByName('sfx', type);
  }

  async getLogoAsset(): Promise<S3RenderAsset | null> {
    return this.getFirstAsset('logos');
  }

  async getEndCardAsset(): Promise<S3RenderAsset | null> {
    return this.getFirstAsset('end-cards');
  }

  async getBadgeAssets(): Promise<S3RenderAsset[]> {
    return this.listAssets('badges');
  }

  async getOverlayAsset(): Promise<S3RenderAsset | null> {
    return this.getFirstAsset('overlays');
  }

  async getIntroBackgroundAssets(): Promise<S3RenderAsset[]> {
    return this.listAssets('intro-backgrounds');
  }

  async getRandomIntroBackground(): Promise<S3RenderAsset | null> {
    return this.getRandomAsset('intro-backgrounds');
  }

  async getRandomEndCard(): Promise<S3RenderAsset | null> {
    return this.getRandomAsset('end-cards');
  }

  async getBackgroundMusicAssets(): Promise<S3RenderAsset[]> {
    return this.listAssets('music');
  }

  clearCache(): void {
    assetCache.clear();
    console.log('[S3RenderAssets] Cache cleared');
  }

  isAvailable(): boolean {
    return s3Client !== null;
  }
}

export const s3RenderAssetService = new S3RenderAssetService();
