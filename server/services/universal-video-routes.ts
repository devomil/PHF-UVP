import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, inArray, and, or, like } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isAuthenticated, requireRole } from '../auth';
import { universalVideoService } from '../services/universal-video-service';
import { remotionLambdaService } from '../services/remotion-lambda-service';
import { chunkedRenderService, ChunkedRenderProgress, MAX_CHUNK_DURATION_SEC, CHUNK_THRESHOLD_SEC } from '../services/chunked-render-service';
import { qualityEvaluationService, VideoQualityReport, QualityIssue } from '../services/quality-evaluation-service';
import { sceneAnalysisService, SceneContext } from '../services/scene-analysis-service';
import type { Phase8AnalysisResult } from '../../shared/video-types';
import { sceneRegenerationService } from '../services/scene-regeneration-service';
import { autoRegenerationService, SceneForRegeneration, RegenerationResult } from '../services/auto-regeneration-service';
import { intelligentRegenerationService } from '../services/intelligent-regeneration-service';
import { intelligentPromptImprover } from '../services/intelligent-prompt-improver';
import { regenerationStrategyEngine } from '../services/regeneration-strategy-engine';
import { promptComplexityAnalyzer } from '../services/prompt-complexity-analyzer';
import { brandContextService } from '../services/brand-context-service';
import { runScriptPipeline } from '../services/script-pipeline-service';
import { videoProviderSelector, SceneForSelection } from '../services/video-provider-selector';
import { imageProviderSelector } from '../services/image-provider-selector';
import { motionGraphicsRouter } from '../services/motion-graphics-router';
import { motionGraphicsGenerator } from '../services/motion-graphics-generator';
import { soundDesignService } from '../services/sound-design-service';
import { transitionService, TransitionPlan, SceneTransition } from '../services/transition-service';
import { textOverlayDetector } from '../services/text-overlay-detector';
import { textPlacementService, TextOverlay as TextOverlayType, TextPlacement } from '../services/text-placement-service';
import { assetUrlResolver } from '../services/asset-url-resolver';
import { s3RenderAssetService } from '../services/s3-render-asset-service';
import { VIDEO_PROVIDERS } from '../../shared/provider-config';
import { calculateEffectiveDuration } from '../../shared/config/duration-math';
import { ObjectStorageService } from '../objectStorage';
import { videoFrameExtractor } from '../services/video-frame-extractor';
import { db } from '../db';
import { universalVideoProjects, sceneRegenerationHistory, brandAssets, brandMediaLibrary, videoGenerationJobs, characterLibrary, assetLibrary } from '../../shared/schema';
import { imageGenerationService } from '../services/image-generation-service';
import { objectStorageClient } from '../objectStorage';
import type { 
  VideoProject, 
  ProductVideoInput,
  ScriptVideoInput,
  ProductImage,
  Scene,
  GeneratedAssets,
  ProductionProgress,
  OutputFormat,
  BrandSettings,
  RegenerationRecord,
} from '../../shared/video-types';
import { 
  OUTPUT_FORMATS, 
  getCompositionId,
} from '../../shared/video-types';
import { imageCompositionService } from '../services/image-composition-service';
import { getAnyBrandContext } from '../services/brand-settings-service';
import { compositionRequestBuilder } from '../services/composition-request-builder';
import type { CompositionRequest, ProductPlacement } from '../../shared/types/image-composition-types';
import { imageToVideoService } from '../services/image-to-video-service';
import { motionStyleDetector } from '../services/motion-style-detector';
import { selectI2VProvider, I2V_PROVIDER_CAPABILITIES, getAllI2VProviders } from '../services/i2v-provider-capabilities';
import { logoCompositionService } from '../services/logo-composition-service';
import { logoAssetSelector } from '../services/logo-asset-selector';
import { logoPlacementCalculator } from '../services/logo-placement-calculator';
import type { LogoType, LogoPlacement, LogoCompositionConfig } from '../../shared/types/logo-composition-types';
import { brandWorkflowOrchestrator } from '../services/brand-workflow-orchestrator';
import { brandWorkflowRouter } from '../services/brand-workflow-router';
import type { WorkflowPath, WorkflowResult } from '../../shared/types/brand-workflow-types';
import { selectMediaSource, type MediaType } from '../services/media-source-selector';
import { piapiVideoService } from '../services/piapi-video-service';
import { overlayConfigurationService } from '../services/overlay-configuration-service';

const objectStorageService = new ObjectStorageService();

// S3 client for caching assets to Remotion Lambda bucket
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

const router = Router();

async function cropImageToAspectRatio(
  inputPath: string,
  targetAspectRatio: string
): Promise<string> {
  const sharp = (await import('sharp')).default;
  const fs = await import('fs');
  const path = await import('path');
  
  const [targetW, targetH] = targetAspectRatio.split(':').map(Number);
  if (!targetW || !targetH) return inputPath;
  
  const targetRatio = targetW / targetH;
  
  const metadata = await sharp(inputPath).metadata();
  const imgW = metadata.width || 0;
  const imgH = metadata.height || 0;
  if (!imgW || !imgH) return inputPath;
  
  const imgRatio = imgW / imgH;
  const ratioTolerance = 0.05;
  if (Math.abs(imgRatio - targetRatio) < ratioTolerance) {
    console.log(`[ImageCrop] Image already matches target ratio ${targetAspectRatio} (${imgW}x${imgH})`);
    return inputPath;
  }
  
  const ext = path.default.extname(inputPath);
  const outputPath = inputPath.replace(ext, `_cropped.png`);
  
  const maxW = Math.max(imgW, 1280);
  const outW = Math.min(maxW, 1920);
  const outH = Math.round(outW / targetRatio);
  
  try {
    console.log(`[ImageCrop] Cover-crop: ${imgW}x${imgH} (ratio ${imgRatio.toFixed(2)}) → ${outW}x${outH} (target ${targetAspectRatio}, ratio ${targetRatio.toFixed(2)})`);
    if (imgW < 1280 || imgH < 720) {
      console.warn(`[ImageCrop] ⚠ Source image is small (${imgW}x${imgH}), output quality may be reduced. Recommend 1920x1080+ for best results.`);
    }
    
    await sharp(inputPath)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(outW, outH, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toFile(outputPath);
    
    if (fs.default.existsSync(outputPath)) {
      console.log(`[ImageCrop] ✓ Processed image saved: ${outputPath}`);
      return outputPath;
    }
  } catch (err) {
    console.warn('[ImageCrop] Processing failed, using original:', err);
  }
  
  console.log(`[ImageCrop] ⚠ Processing failed, using original`);
  return inputPath;
}

async function resolveLocalUploadToPublicUrl(localUrl: string, userId: string): Promise<string> {
  if (!localUrl.startsWith('/uploads/')) return localUrl;
  
  const fs = await import('fs');
  const path = await import('path');
  const localPath = path.default.resolve(localUrl.substring(1));
  if (!fs.default.existsSync(localPath)) {
    console.warn(`[Characters] Local file not found: ${localPath}`);
    return localUrl;
  }
  
  const fileBuffer = fs.default.readFileSync(localPath);
  
  if (s3Client) {
    const s3Key = `character-photos/${userId}_${Date.now()}.png`;
    await s3Client.send(new PutObjectCommand({
      Bucket: REMOTION_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    }));
    const publicUrl = `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${s3Key}`;
    console.log(`[Characters] Uploaded reference photo to S3: ${publicUrl}`);
    return publicUrl;
  }
  
  const piapiUrl = await uploadImageToPiAPIStorage(fileBuffer, `char_photo_${Date.now()}.png`);
  if (piapiUrl) {
    console.log(`[Characters] Uploaded reference photo to PiAPI: ${piapiUrl}`);
    return piapiUrl;
  }
  
  return localUrl;
}

/**
 * Upload image to PiAPI's ephemeral storage.
 * Returns a storage.theapi.app URL (same as PiAPI Workspace uses).
 * Files are automatically deleted after 24 hours.
 * 
 * PiAPI expects JSON with base64, NOT multipart/form-data!
 */
async function uploadImageToPiAPIStorage(
  imageBuffer: Buffer,
  filename: string
): Promise<string | null> {
  const apiKey = process.env.PIAPI_API_KEY;
  
  if (!apiKey) {
    console.log('[PiAPI Upload] No PIAPI_API_KEY configured');
    return null;
  }
  
  try {
    console.log(`[PiAPI Upload] Uploading ${filename} (${imageBuffer.length} bytes)...`);
    
    // Convert buffer to base64
    const base64Data = imageBuffer.toString('base64');
    
    // PiAPI expects JSON with these EXACT parameter names
    const requestBody = {
      file_name: filename,      // NOT "filename"
      file_data: base64Data,    // NOT "file", just base64 without data URI prefix
    };
    
    console.log(`[PiAPI Upload] Sending JSON request with file_name: ${filename}`);
    
    const response = await fetch('https://upload.theapi.app/api/ephemeral_resource', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseText = await response.text();
    console.log(`[PiAPI Upload] Response status: ${response.status}`);
    console.log(`[PiAPI Upload] Response body: ${responseText.substring(0, 500)}`);
    
    if (!response.ok) {
      console.error(`[PiAPI Upload] Failed: ${response.status} - ${responseText}`);
      return null;
    }
    
    const data = JSON.parse(responseText);
    
    // Extract URL from response
    const imageUrl = data?.url || data?.data?.url || data?.image_url || data?.file_url;
    
    if (imageUrl) {
      console.log(`[PiAPI Upload] Success! URL: ${imageUrl}`);
      return imageUrl;
    }
    
    console.log('[PiAPI Upload] No URL in response:', responseText);
    return null;
    
  } catch (error: any) {
    console.error('[PiAPI Upload] Error:', error.message);
    return null;
  }
}

/**
 * Convert relative brand asset URL to public URL for external video providers.
 * Uses PiAPI's ephemeral storage to get storage.theapi.app URLs.
 * PiAPI storage is REQUIRED - no GCS fallback (GCS URLs are not publicly accessible).
 */
async function getPublicUrlForBrandAsset(relativeUrl: string, targetAspectRatio?: string): Promise<string | null> {
  if (!relativeUrl) {
    return null;
  }
  
  // Handle http URLs
  if (relativeUrl.startsWith('http')) {
    // If already a PiAPI URL, use it directly
    if (relativeUrl.includes('theapi.app') || relativeUrl.includes('storage.theapi')) {
      return relativeUrl;
    }
    console.log('[PublicURL] External HTTP URL - using directly:', relativeUrl.substring(0, 80));
    return relativeUrl;
  }
  
  // Handle object storage paths from brand-media-library uploads: /{bucketName}/public/brand-media/...
  if (relativeUrl.match(/^\/[^/]+\/public\/brand-media\//)) {
    try {
      // Parse bucket name and object path from URL like: /repl-default-bucket-xxx/public/brand-media/12345_file.png
      const parts = relativeUrl.slice(1).split('/'); // Remove leading slash and split
      const bucketName = parts[0];
      const objectPath = parts.slice(1).join('/'); // public/brand-media/12345_file.png
      
      console.log('[PublicURL] Object storage path detected - bucket:', bucketName, 'path:', objectPath);
      
      // Read file from Replit Object Storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectPath);
      const [fileBuffer] = await file.download();
      
      console.log('[PublicURL] Downloaded from object storage, size:', fileBuffer.length, 'bytes');
      
      let processedBuffer = fileBuffer;
      if (targetAspectRatio) {
        try {
          const fs = await import('fs');
          const os = await import('os');
          const path = await import('path');
          const tmpPath = path.default.join(os.default.tmpdir(), `objstore_${Date.now()}.png`);
          fs.default.writeFileSync(tmpPath, fileBuffer);
          const croppedPath = await cropImageToAspectRatio(tmpPath, targetAspectRatio);
          processedBuffer = fs.default.readFileSync(croppedPath);
          try { fs.default.unlinkSync(tmpPath); } catch {}
          if (croppedPath !== tmpPath) { try { fs.default.unlinkSync(croppedPath); } catch {} }
          console.log(`[PublicURL] Padded object storage image to ${targetAspectRatio}`);
        } catch (cropErr) {
          console.warn('[PublicURL] Object storage image crop failed, using original:', cropErr);
        }
      }
      
      const ext = objectPath.split('.').pop() || 'png';
      const filename = `scene_source_${Date.now()}.${ext}`;
      
      const piapiUrl = await uploadImageToPiAPIStorage(processedBuffer as Buffer, filename);
      
      if (piapiUrl) {
        console.log('[PublicURL] ✓ Uploaded to PiAPI storage:', piapiUrl);
        return piapiUrl;
      } else {
        console.log('[PublicURL] ⚠ PiAPI upload failed, trying direct GCS URL');
        // Fallback: try to generate a signed URL from GCS
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 3600 * 1000, // 1 hour
        });
        console.log('[PublicURL] Generated signed GCS URL');
        return signedUrl;
      }
    } catch (error) {
      console.error('[PublicURL] Error processing object storage path:', error);
      return null;
    }
  }
  
  // Handle /uploads/ paths (local disk uploads)
  if (relativeUrl.startsWith('/uploads/')) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      let filePath = path.default.resolve(process.cwd(), '.' + relativeUrl);
      if (fs.default.existsSync(filePath)) {
        if (targetAspectRatio) {
          try {
            filePath = await cropImageToAspectRatio(filePath, targetAspectRatio);
          } catch (cropErr) {
            console.warn('[PublicURL] Image crop failed, using original:', cropErr);
          }
        }
        const fileBuffer = fs.default.readFileSync(filePath);
        console.log('[PublicURL] Read from local uploads, size:', fileBuffer.length, 'bytes');
        const ext = filePath.split('.').pop() || 'png';
        const filename = `scene_ref_${Date.now()}.${ext}`;
        const piapiUrl = await uploadImageToPiAPIStorage(fileBuffer, filename);
        if (piapiUrl) {
          console.log('[PublicURL] ✓ Uploaded local file to PiAPI storage:', piapiUrl);
          return piapiUrl;
        }
      }
      console.log('[PublicURL] Local file not found:', filePath);
      return null;
    } catch (error) {
      console.error('[PublicURL] Error processing local upload path:', error);
      return null;
    }
  }
  
  // Handle brand-assets API paths: /api/brand-assets/file/{id}
  if (!relativeUrl.startsWith('/api/brand-assets/file/')) {
    console.log('[PublicURL] Unsupported URL format:', relativeUrl.substring(0, 80));
    return null;
  }
  
  try {
    const assetId = parseInt(relativeUrl.split('/').pop() || '0');
    if (isNaN(assetId) || assetId <= 0) {
      console.log('[PublicURL] Invalid asset ID from URL:', relativeUrl);
      return null;
    }
    
    const [asset] = await db.select().from(brandAssets).where(eq(brandAssets.id, assetId));
    if (!asset) {
      console.log('[PublicURL] Asset not found for ID:', assetId);
      return null;
    }
    
    const settings = asset.settings as any;
    const storagePath = settings?.storagePath;
    if (!storagePath) {
      console.log('[PublicURL] No storage path for asset:', assetId);
      return null;
    }
    
    const [bucketName, objectPath] = storagePath.split('|');
    if (!bucketName || !objectPath) {
      console.log('[PublicURL] Invalid storage path format:', storagePath);
      return null;
    }
    
    console.log('[PublicURL] Reading asset', assetId, 'from storage:', objectPath);
    
    // Read file from Replit Object Storage
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [fileBuffer] = await file.download();
    
    console.log('[PublicURL] Downloaded asset, size:', fileBuffer.length, 'bytes');
    
    // Upload to PiAPI storage (REQUIRED for I2V - no fallback)
    const ext = objectPath.split('.').pop() || 'png';
    const filename = `brand_asset_${assetId}_${Date.now()}.${ext}`;
    
    const piapiUrl = await uploadImageToPiAPIStorage(fileBuffer, filename);
    
    if (piapiUrl) {
      console.log('[PublicURL] ✓ PiAPI storage URL:', piapiUrl);
      return piapiUrl;
    }
    
    // NO GCS FALLBACK - PiAPI storage is required for I2V
    console.error('[PublicURL] ✗ PiAPI upload failed - I2V requires PiAPI storage URL');
    console.error('[PublicURL] GCS URLs are not publicly accessible and will cause 403 errors');
    return null;
    
  } catch (error) {
    console.error('[PublicURL] Error generating public URL:', error);
    return null;
  }
}

const productImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const productVideoInputSchema = z.object({
  productName: z.string().min(1),
  productDescription: z.string().min(1),
  targetAudience: z.string().min(1),
  benefits: z.array(z.string()).optional().default([]),
  duration: z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(60), z.literal(90)]),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'instagram-reels', 'facebook', 'website']),
  style: z.enum(['professional', 'casual', 'energetic', 'calm', 'cinematic', 'documentary', 'luxury', 'minimal', 'instructional', 'educational', 'training', 'hero', 'lifestyle', 'product', 'social', 'premium']),
  callToAction: z.string().min(1),
  productImages: z.array(productImageSchema).optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  qualityTier: z.enum(['standard', 'premium', 'ultra', 'draft']).optional().default('premium'),
});

// Phase 13: Audio generation settings schema
const audioGenerationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  voiceGeneration: z.boolean().default(true),
  soundEffects: z.boolean().default(true),
  ambientSound: z.boolean().default(true),
  language: z.string().optional().default('en'),
});

// Phase 13: Motion control settings schema
const motionControlSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  referenceVideoUrl: z.string().optional(),
  referenceVideoDuration: z.number().optional(),
});

// Phase 13: Combined generation settings schema
const generationSettingsSchema = z.object({
  audio: audioGenerationSettingsSchema.optional(),
  motionControl: motionControlSettingsSchema.optional(),
  preferredProvider: z.string().optional(),
});

// Phase 13D: Reference image configuration schema
const i2iSettingsSchema = z.object({
  strength: z.number().min(0).max(1).default(0.7),
  preserveComposition: z.boolean().default(true),
  preserveColors: z.boolean().default(true),
});

const i2vSettingsSchema = z.object({
  motionStrength: z.number().min(0).max(1).default(0.5),
  motionType: z.enum(['environmental', 'subtle', 'dynamic']).default('subtle'),
  preserveSubject: z.boolean().default(true),
});

const styleSettingsSchema = z.object({
  styleStrength: z.number().min(0).max(1).default(0.7),
  applyColors: z.boolean().default(true),
  applyLighting: z.boolean().default(true),
  applyComposition: z.boolean().default(false),
});

// Phase 16: End card settings schema
const endCardSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  useDefaults: z.boolean().default(true),
  duration: z.number().min(3).max(10).default(5),
  logoAnimation: z.enum(['scale-bounce', 'fade', 'slide-up', 'none']).default('scale-bounce'),
  taglineText: z.string().default('Rooted in Nature, Grown with Care'),
  taglineAnimation: z.enum(['typewriter', 'fade', 'slide-up']).default('typewriter'),
  contactWebsite: z.string().default('PineHillFarm.com'),
  contactPhone: z.string().default(''),
  contactEmail: z.string().default(''),
  // Phase 18E: Social icons
  socialIcons: z.array(z.object({
    platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok']),
    url: z.string(),
  })).optional(),
  socialSize: z.number().min(20).max(60).default(36),
  socialDelay: z.number().min(0).max(5).default(2.5),
  socialAnimation: z.enum(['pop', 'fade', 'stagger']).default('pop'),
  ambientEffect: z.enum(['particles', 'bokeh', 'none']).default('bokeh'),
  ambientIntensity: z.number().min(0).max(100).default(40),
  // Intro/Outro template selection
  introTemplate: z.enum(['classic-glow', 'minimal', 'cinematic', 'elegant-fade']).default('classic-glow').optional(),
  outroTemplate: z.enum(['animated', 'minimal', 'cinematic']).default('animated').optional(),
  introBackgroundRandom: z.boolean().default(false).optional(),
}).optional();

// Phase 16: Sound design settings schema
const soundDesignSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  useDefaults: z.boolean().default(true),
  transitionSounds: z.boolean().default(true),
  impactSounds: z.boolean().default(true),
  ambientLayer: z.boolean().default(true),
  ambientType: z.enum(['warm', 'nature', 'none']).default('nature'),
  masterVolume: z.number().min(0).max(1).default(1.0),
}).optional();

// Phase 18F: Film treatment settings schema
const filmTreatmentSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  colorGrade: z.enum(['warm-cinematic', 'cool-corporate', 'vibrant-lifestyle', 'moody-dramatic', 'natural-organic', 'luxury-elegant', 'none']).default('natural-organic'),
  colorIntensity: z.number().min(0).max(1).default(1.0),
  grainIntensity: z.number().min(0).max(0.1).default(0.03),
  vignetteIntensity: z.number().min(0).max(0.5).default(0.15),
  letterbox: z.enum(['2.35:1', '2.39:1', '1.85:1', 'none']).default('none'),
}).optional();

const referenceConfigSchema = z.object({
  mode: z.enum(['none', 'image-to-image', 'image-to-video', 'style-reference']),
  sourceUrl: z.string().optional(),
  sourceType: z.enum(['upload', 'current-media', 'asset-library', 'brand-media']),
  i2iSettings: i2iSettingsSchema.optional(),
  i2vSettings: i2vSettingsSchema.optional(),
  styleSettings: styleSettingsSchema.optional(),
});

const scriptVideoInputSchema = z.object({
  title: z.string().min(1),
  script: z.string().min(10),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'instagram-reels', 'facebook', 'website']),
  style: z.enum(['professional', 'casual', 'energetic', 'calm', 'cinematic', 'documentary', 'luxury', 'minimal', 'instructional', 'educational', 'training', 'hero', 'lifestyle', 'product', 'social', 'premium']),
  targetDuration: z.number().optional(),
  brandSettings: z.object({
    introLogoUrl: z.string().optional(),
    watermarkImageUrl: z.string().optional(),
    ctaText: z.string().optional(),
  }).optional(),
  musicEnabled: z.boolean().optional(),
  musicMood: z.string().optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  qualityTier: z.enum(['standard', 'premium', 'ultra', 'draft']).optional().default('premium'),
  artPresetId: z.string().optional(),
  // Phase 13: Audio and motion control generation settings
  generationSettings: generationSettingsSchema.optional(),
  // Phase 16: End card and sound design settings
  endCardSettings: endCardSettingsSchema,
  soundDesignSettings: soundDesignSettingsSchema,
  // Phase 18F: Film treatment settings
  filmTreatmentSettings: filmTreatmentSettingsSchema,
});

import {
  dbRowToVideoProject,
  saveProjectToDb,
  getProjectFromDb,
  mergeRenderSettingsToDb,
  type VideoProjectWithMeta,
} from '../services/video-project-db';


router.post('/redeploy-site', isAuthenticated, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    console.log('[UniversalVideo] Triggering Remotion site redeployment...');
    const serveUrl = await remotionLambdaService.redeploySite();
    console.log(`[UniversalVideo] Site redeployed successfully: ${serveUrl}`);
    res.json({ success: true, serveUrl });
  } catch (error: any) {
    console.error('[UniversalVideo] Site redeployment failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api-connectivity-test', isAuthenticated, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    console.log('[UniversalVideo] Running PiAPI connectivity test...');
    const result = await piapiVideoService.testAPIConnectivity();
    res.json(result);
  } catch (error: any) {
    console.error('[UniversalVideo] API connectivity test failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneIndex/assemble', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    const idx = parseInt(sceneIndex, 10);
    if (Number.isNaN(idx)) {
      return res.status(400).json({ success: false, error: 'Invalid scene index' });
    }

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) return res.status(404).json({ success: false, error: 'Project not found' });
    if (projectData.ownerId !== userId) return res.status(403).json({ success: false, error: 'Access denied' });

    const scenes = projectData.scenes || [];
    if (idx < 0 || idx >= scenes.length) {
      return res.status(400).json({ success: false, error: `Invalid scene index ${idx}, project has ${scenes.length} scenes` });
    }

    const scene = scenes[idx];
    const msWithVideo = (scene.microScenes || []).filter((ms: any) => !!ms.videoUrl);
    if (msWithVideo.length < 2) {
      return res.status(400).json({ success: false, error: `Scene ${idx} has ${msWithVideo.length} micro-scenes with video (need >=2)` });
    }

    const { ffmpegAssemblyService } = await import('./ffmpeg-assembly-service');

    console.log(`[AssembleScene] Assembling project ${projectId}, scene ${idx} (${msWithVideo.length} clips)`);
    const manifest = await ffmpegAssemblyService.assembleScene(
      scene.id,
      scene.microScenes!,
      projectData.projectId,
      scene.voiceoverWords || scene.captions?.words
    );

    projectData.scenes[idx].assemblyManifest = manifest;
    await saveProjectToDb(projectData, projectData.ownerId);

    res.json({
      success: !manifest.assemblyFailed,
      manifest,
      sceneIndex: idx,
    });
  } catch (error: any) {
    console.error('[AssembleScene] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/assemble-all', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) return res.status(404).json({ success: false, error: 'Project not found' });
    if (projectData.ownerId !== userId) return res.status(403).json({ success: false, error: 'Access denied' });

    const scenes = projectData.scenes || [];
    const { ffmpegAssemblyService } = await import('./ffmpeg-assembly-service');

    const results: Array<{ sceneIndex: number; success: boolean; error?: string; totalDurationSec?: number }> = [];
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const msWithVideo = (scene.microScenes || []).filter((ms: any) => !!ms.videoUrl);

      if (msWithVideo.length < 2) {
        skippedCount++;
        results.push({ sceneIndex: i, success: true, error: 'Skipped (fewer than 2 micro-scenes with video)' });
        continue;
      }

      try {
        console.log(`[AssembleAll] Scene ${i}/${scenes.length - 1}: Assembling ${msWithVideo.length} clips...`);
        const manifest = await ffmpegAssemblyService.assembleScene(
          scene.id,
          scene.microScenes!,
          projectData.projectId,
          scene.voiceoverWords || scene.captions?.words
        );

        projectData.scenes[i].assemblyManifest = manifest;

        if (manifest.assemblyFailed) {
          failCount++;
          results.push({ sceneIndex: i, success: false, error: manifest.error || 'Assembly failed' });
          console.warn(`[AssembleAll] Scene ${i}: Failed - ${manifest.error}`);
        } else {
          successCount++;
          results.push({ sceneIndex: i, success: true, totalDurationSec: manifest.totalDurationSec });
        }
      } catch (err: any) {
        failCount++;
        projectData.scenes[i].assemblyManifest = {
          assemblyFailed: true,
          totalDurationSec: 0,
          clips: [],
          sceneId: scene.id,
          createdAt: new Date().toISOString(),
          error: err.message,
        };
        results.push({ sceneIndex: i, success: false, error: err.message });
        console.error(`[AssembleAll] Scene ${i}: Exception - ${err.message}`);
      }
    }

    await saveProjectToDb(projectData, projectData.ownerId);

    console.log(`[AssembleAll] Complete: ${successCount} succeeded, ${failCount} failed, ${skippedCount} skipped`);
    res.json({
      success: failCount === 0,
      results,
      summary: { total: scenes.length, assembled: successCount, failed: failCount, skipped: skippedCount },
    });
  } catch (error: any) {
    console.error('[AssembleAll] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/scenes/:sceneIndex/assembly-invalidate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    const idx = parseInt(sceneIndex, 10);
    if (Number.isNaN(idx)) return res.status(400).json({ success: false, error: 'Invalid scene index' });

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) return res.status(404).json({ success: false, error: 'Project not found' });
    if (projectData.ownerId !== userId) return res.status(403).json({ success: false, error: 'Access denied' });

    const scenes = projectData.scenes || [];
    if (idx < 0 || idx >= scenes.length) return res.status(400).json({ success: false, error: 'Invalid scene index' });

    if (scenes[idx].assemblyManifest) {
      delete scenes[idx].assemblyManifest;
      await saveProjectToDb(projectData, projectData.ownerId);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const rows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.ownerId, userId))
      .orderBy(desc(universalVideoProjects.createdAt));
    
    const userProjects = rows.map(dbRowToVideoProject);
    
    res.json({ success: true, projects: userProjects });
  } catch (error: any) {
    console.error('[UniversalVideo] Error listing projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a video project
router.delete('/projects/:projectId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { projectId } = req.params;
    
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid project ID' });
    }
    
    // Verify ownership before deleting - use projectId string column
    const [existing] = await db.select({ ownerId: universalVideoProjects.ownerId })
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId));
    
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (existing.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this project' });
    }
    
    // Delete the project using projectId string column
    await db.delete(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId));
    
    console.log(`[UniversalVideo] Project ${projectId} deleted by user ${userId}`);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('[UniversalVideo] Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ask Suzzie (Claude AI) - dual mode: visual direction generation + general assistant
router.post('/ask-suzzie', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { mode, question, conversationHistory, narration, sceneType, projectTitle, workflowPath, matchedAssets, selectedProduct, artPresetId, artPresetName, visualDirection, provider, imageAttachment, hasReferenceImage } = req.body;
    
    if (mode === 'assistant') {
      if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
      }
      
      const truncatedQuestion = String(question).substring(0, 1000);
      let hasImage = false;
      if (imageAttachment && imageAttachment.base64 && imageAttachment.mediaType) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(imageAttachment.mediaType)) {
          return res.status(400).json({ success: false, error: 'Unsupported image format. Use JPEG, PNG, or WebP.' });
        }
        const base64Len = typeof imageAttachment.base64 === 'string' ? imageAttachment.base64.length : 0;
        const estimatedBytes = Math.ceil(base64Len * 0.75);
        if (estimatedBytes > 10 * 1024 * 1024) {
          return res.status(413).json({ success: false, error: 'Image too large. Maximum size is 10MB.' });
        }
        if (base64Len < 100 || !/^[A-Za-z0-9+/=]+$/.test(imageAttachment.base64.substring(0, 200))) {
          return res.status(400).json({ success: false, error: 'Invalid image data.' });
        }
        hasImage = true;
      }
      
      const { llmClient } = await import('../services/piapi-llm-client');
      const { buildSuzzieSystemPrompt } = await import('../services/suzzie-knowledge-base');
      
      if (!llmClient.isAvailable()) {
        return res.status(500).json({ success: false, error: 'AI service not configured' });
      }
      
      console.log(`[AskSuzzie:Assistant] Question: "${truncatedQuestion.substring(0, 80)}..." | Scene: ${sceneType || 'none'} | Art: ${artPresetName || 'none'} | History: ${Array.isArray(conversationHistory) ? conversationHistory.length : 0} msgs | Image: ${hasImage ? 'yes' : 'no'}`);
      
      const systemPrompt = buildSuzzieSystemPrompt({
        narration, sceneType, artPresetId, artPresetName, visualDirection, projectTitle, provider, hasReferenceImage: !!hasReferenceImage,
      });
      
      let llmMessages: any[];
      if (Array.isArray(conversationHistory) && conversationHistory.length > 1) {
        const maxHistory = conversationHistory.slice(-10);
        llmMessages = maxHistory.map((m: any, idx: number) => ({
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: String(m.content).substring(0, 2000),
        }));
      } else {
        llmMessages = [{ role: 'user' as const, content: truncatedQuestion }];
      }
      
      if (hasImage) {
        const lastMsg = llmMessages[llmMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.content = [
            { type: 'image' as const, mediaType: imageAttachment.mediaType, base64Data: imageAttachment.base64 },
            { type: 'text' as const, text: typeof lastMsg.content === 'string' ? lastMsg.content : truncatedQuestion },
          ];
        }
      }
      
      const llmResult = await llmClient.createChatCompletion({
        systemPrompt,
        messages: llmMessages,
        maxTokens: 1500,
      });
      
      const text = llmResult.text || '';
      
      let suggestedPrompt: string | undefined;
      let suggestedProvider: string | undefined;
      let suggestedArtStyle: { id: string; name: string } | undefined;
      
      const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/g) || [];
      for (const block of jsonBlocks) {
        try {
          const jsonStr = block.replace(/```json\s*/, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(jsonStr);
          if (parsed.suggestedPrompt && !suggestedPrompt) suggestedPrompt = parsed.suggestedPrompt;
          if (parsed.suggestedProvider && !suggestedProvider) suggestedProvider = parsed.suggestedProvider;
          if (parsed.suggestedArtStyle && !suggestedArtStyle && parsed.suggestedArtStyle.id && parsed.suggestedArtStyle.name) {
            suggestedArtStyle = { id: parsed.suggestedArtStyle.id, name: parsed.suggestedArtStyle.name };
          }
        } catch {}
      }
      
      const cleanMessage = text.replace(/```json\s*[\s\S]*?```/g, '').trim();
      
      return res.json({
        success: true,
        message: cleanMessage,
        suggestedPrompt,
        suggestedProvider,
        suggestedArtStyle,
      });
    }
    
    // Debug logging for I2V context
    console.log(`[AskSuzzie] Request received - sceneType: ${sceneType}, workflowPath: ${workflowPath}`);
    console.log(`[AskSuzzie] selectedProduct: ${selectedProduct?.name || 'none'}`);
    console.log(`[AskSuzzie] matchedAssets products: ${matchedAssets?.products?.length || 0}`);
    
    if (!narration) {
      return res.status(400).json({ success: false, error: 'Narration is required' });
    }
    
    const { llmClient } = await import('../services/piapi-llm-client');
    const { brandContextService } = await import('../services/brand-context-service');
    
    if (!llmClient.isAvailable()) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }
    
    // Get comprehensive brand context for better initial directions
    const brandContext = await brandContextService.getVisualDirectionGenerationContext();
    
    // Determine if this is an I2V (Image-to-Video) workflow that uses a real product photo
    const isProductWorkflow = workflowPath && ['product-video', 'product-image', 'product-hero'].includes(workflowPath);
    const hasSelectedProduct = !!selectedProduct?.name;
    const productNames = matchedAssets?.products?.map((p: any) => p.name).join(', ') || '';
    
    console.log(`[AskSuzzie] I2V detection - isProductWorkflow: ${isProductWorkflow}, hasSelectedProduct: ${hasSelectedProduct}`);
    
    // Build workflow-specific context
    let workflowContext = '';
    if (isProductWorkflow || hasSelectedProduct) {
      console.log(`[AskSuzzie] ✓ Activating I2V workflow context for product: ${selectedProduct?.name || 'auto-matched'}`);
    } else {
      console.log(`[AskSuzzie] Standard T2V workflow (no product selected)`);
    }
    if (isProductWorkflow || hasSelectedProduct) {
      workflowContext = `
## IMPORTANT: IMAGE-TO-VIDEO (I2V) WORKFLOW ACTIVE
This scene will use a REAL PRODUCT PHOTO that gets animated into video. Your visual direction must:
1. Describe the ENVIRONMENT/BACKGROUND where the product will be placed (NOT the product itself)
2. Focus on lighting, atmosphere, and motion that will be ADDED to the static product image
3. Include camera motion suggestions (slow zoom, gentle pan, parallax depth)
4. The product photo will be composited INTO the AI-generated environment

${hasSelectedProduct ? `SELECTED PRODUCT: "${selectedProduct.name}" - The product photo will be the hero element. Describe an environment that complements and showcases this product.` : ''}
${productNames ? `AVAILABLE PRODUCTS: ${productNames}` : ''}

## I2V PROMPT BEST PRACTICES:
- Describe background/environment motion (swirling steam, floating particles, gentle wind)
- Include lighting effects that enhance the product (rim lighting, warm glow, soft shadows)
- Suggest subtle camera movements (slow push-in, gentle orbit, depth reveal)
- DO NOT describe the product details - focus on the SCENE around it`;
    }
    
    const systemPrompt = `You are an expert visual director for brand marketing videos with deep brand knowledge. 
You create broadcast-quality visual directions that are ALREADY OPTIMIZED for AI generation - no "suggested improvements" needed.

${brandContext}
${workflowContext}

## YOUR TASK
Create a visual direction that is:
1. HIGHLY SPECIFIC - Include exact lighting, camera angle, composition, mood
2. AI-GENERATION READY - Achievable with current AI video/image models (no complex multi-person scenes)
3. BRAND-ALIGNED - Follows the brand aesthetic described in the brand context above
4. SCENE-TYPE APPROPRIATE - Matches the purpose of this scene in the video
${isProductWorkflow ? '5. I2V-OPTIMIZED - Focus on environment/background for product photo animation' : ''}

## OUTPUT FORMAT
Return a JSON object with exactly these fields:
{
  "visualDirection": "${isProductWorkflow ? '[I2V Environment for PRODUCT_NAME] ' : ''}3-4 sentences with SPECIFIC details: camera angle, lighting type, color palette, ${isProductWorkflow ? 'environment, camera motion, atmospheric effects' : 'subject, setting'}, mood, composition. Be concrete enough that any AI would generate the same vision.",
  "searchQuery": "3-5 word stock video search query",
  "fallbackQuery": "alternative 3-5 word search query (completely different visual approach)"
}
${isProductWorkflow ? `
CRITICAL I2V OUTPUT RULE: Your visualDirection MUST start with "[I2V Environment for ${selectedProduct?.name || 'Product'}]" to confirm you are describing the environment where the product photo will be placed, NOT the product itself.` : ''}

## VISUAL DIRECTION QUALITY CHECKLIST
Before outputting, verify your visual direction includes:
✓ Camera angle (wide/medium/close-up, high/eye-level/low)
✓ Lighting description (golden hour, diffused, dappled, soft studio)
✓ Color palette (earth tones, warm golds, greens)
${isProductWorkflow ? '✓ Environment/background description (where the product will be placed)' : '✓ Subject description (what/who is in frame)'}
${isProductWorkflow ? '✓ Camera motion (slow zoom, gentle pan, parallax)' : '✓ Setting/environment (farm, kitchen, garden, wellness space)'}
${isProductWorkflow ? '✓ Atmospheric effects (steam, particles, light rays)' : '✓ Mood/atmosphere (peaceful, hopeful, inviting, authentic)'}
✓ Composition notes (centered, rule of thirds, leading lines)

## CRITICAL RULES FOR SEARCH QUERIES:
1. searchQuery and fallbackQuery must be DIFFERENT concepts, not just rephrased
2. Avoid ambiguous words: "bathroom scale" → "digital weight scale feet", "bath" → may return bathtub videos
3. Use concrete, visual terms: "woman gardening vegetables", "organic herb kitchen", "wellness yoga morning"
4. fallbackQuery = completely different visual approach to same theme
5. Both queries: 3-5 words, optimized for Pexels/Pixabay stock video APIs`;

    const userPrompt = `Scene Type: ${sceneType || 'general'}
Project: ${projectTitle || 'Marketing Video'}
${workflowPath ? `Workflow: ${workflowPath}` : ''}
${hasSelectedProduct ? `Selected Product: ${selectedProduct.name}` : ''}

Narration for this scene:
"${narration}"

Create an OPTIMIZED visual direction that requires NO IMPROVEMENT. ${isProductWorkflow ? 'Focus on the ENVIRONMENT where the product will be placed, not the product itself. Include camera motion and atmospheric effects for I2V animation.' : 'Include specific camera angles, lighting, colors, subject, setting, and mood.'} Return JSON with visualDirection, searchQuery, and fallbackQuery.`;

    const llmResult = await llmClient.createChatCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 600,
    });

    const textContent = llmResult.text;
    
    if (!textContent) {
      console.error('[AskSuzzie] No text content in response');
      return res.status(500).json({ success: false, error: 'AI returned no suggestion' });
    }
    
    console.log('[AskSuzzie] Generated visual direction for scene type:', sceneType);
    
    let parsed: { visualDirection: string; searchQuery?: string; fallbackQuery?: string };
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonParsed = JSON.parse(jsonMatch[0]);
        parsed = {
          visualDirection: jsonParsed.visualDirection || textContent.trim(),
          searchQuery: jsonParsed.searchQuery || '',
          fallbackQuery: jsonParsed.fallbackQuery || ''
        };
      } else {
        parsed = { visualDirection: textContent.trim() };
      }
    } catch (parseErr) {
      console.warn('[AskSuzzie] Could not parse JSON, using text response');
      parsed = { visualDirection: textContent.trim() };
    }
    
    res.json({ 
      success: true, 
      ...parsed
    });
  } catch (error: any) {
    console.error('[AskSuzzie] Error generating visual direction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/ask-suzzie/asset-library', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory, context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const { llmClient } = await import('../services/piapi-llm-client');
    const { buildAssetLibrarySuzziePrompt } = await import('../services/suzzie-knowledge-base');

    if (!llmClient.isAvailable()) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const assetContext = {
      mode: context?.mode || 't2i',
      prompt: context?.prompt,
      provider: context?.provider,
      hasReferenceImage: context?.hasReferenceImage || false,
      aspectRatio: context?.aspectRatio,
      duration: context?.duration,
      style: context?.style,
    };

    const systemPrompt = buildAssetLibrarySuzziePrompt(assetContext);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-20)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: String(msg.content).substring(0, 2000) });
        }
      }
    }
    messages.push({ role: 'user', content: String(message).substring(0, 2000) });

    console.log(`[AskSuzzie:AssetLibrary] Mode: ${assetContext.mode} | History: ${messages.length - 1} msgs | Q: "${message.substring(0, 80)}..."`);

    const llmResult = await llmClient.createChatCompletion({
      systemPrompt,
      messages,
      maxTokens: 1200,
      temperature: 0.85,
    });

    const text = llmResult.text || '';

    let suggestedPrompt: string | undefined;
    let suggestedProvider: string | undefined;
    let suggestedNegativePrompt: string | undefined;
    let suggestedCfgScale: number | undefined;

    const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/g) || [];
    for (const block of jsonBlocks) {
      try {
        const jsonStr = block.replace(/```json\s*/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.suggestedPrompt && !suggestedPrompt) suggestedPrompt = parsed.suggestedPrompt;
        if (parsed.suggestedProvider && !suggestedProvider) suggestedProvider = parsed.suggestedProvider;
        if (parsed.suggestedNegativePrompt && !suggestedNegativePrompt) suggestedNegativePrompt = parsed.suggestedNegativePrompt;
        if (parsed.suggestedCfgScale !== undefined && suggestedCfgScale === undefined) {
          const val = parseFloat(parsed.suggestedCfgScale);
          if (!isNaN(val) && val >= 0 && val <= 1) suggestedCfgScale = val;
        }
      } catch {}
    }

    const cleanMessage = text.replace(/```json\s*[\s\S]*?```/g, '').trim();

    return res.json({
      success: true,
      message: cleanMessage,
      suggestedPrompt,
      suggestedProvider,
      suggestedNegativePrompt,
      suggestedCfgScale,
    });
  } catch (error: any) {
    console.error('[AskSuzzie:AssetLibrary] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/product', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const validatedInput = productVideoInputSchema.parse(req.body);
    
    console.log('[UniversalVideo] Creating product video project:', validatedInput.productName);
    
    const project = await universalVideoService.createProductVideoProject(validatedInput);
    
    // Set ACL for any product images to make them publicly accessible
    if (project.assets.productImages && project.assets.productImages.length > 0) {
      console.log('[UniversalVideo] Setting ACL for', project.assets.productImages.length, 'product images');
      for (const img of project.assets.productImages) {
        try {
          const normalizedPath = objectStorageService.normalizeObjectEntityPath(img.url);
          await objectStorageService.trySetObjectEntityAclPolicy(
            normalizedPath,
            { owner: userId, visibility: 'public' }
          );
          console.log('[UniversalVideo] Set public ACL for:', normalizedPath);
        } catch (aclError) {
          console.warn('[UniversalVideo] Failed to set ACL for image:', img.url, aclError);
        }
      }
    }
    
    await saveProjectToDb(project, userId);
    console.log('[UniversalVideo] Project saved to database:', project.id);
    
    res.json({
      success: true,
      project,
      message: `Project created with ${project.scenes.length} scenes`,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error creating product project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create project' 
    });
  }
});

router.post('/projects/script', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const validatedInput = scriptVideoInputSchema.parse(req.body);
    
    console.log('[UniversalVideo] Parsing script for:', validatedInput.title);
    
    const scenes = await universalVideoService.parseScript(validatedInput);
    
    const scriptBrandCtx = await getAnyBrandContext();
    const scriptBrand = scriptBrandCtx.brandName
      ? { name: scriptBrandCtx.brandName, tagline: scriptBrandCtx.tagline, website: scriptBrandCtx.website, colors: { primary: scriptBrandCtx.primaryColor, secondary: scriptBrandCtx.secondaryColor, accent: scriptBrandCtx.accentColor }, logoUrl: scriptBrandCtx.logoUrl, guidelines: scriptBrandCtx.guidelines }
      : { name: '', tagline: '', website: '', colors: {}, logoUrl: '', guidelines: '' };
    
    const project: VideoProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'script-based',
      title: validatedInput.title,
      description: '',
      fps: 30,
      totalDuration: scenes.reduce((acc, s) => acc + s.duration, 0),
      outputFormat: OUTPUT_FORMATS[validatedInput.platform] || OUTPUT_FORMATS.youtube,
      brand: scriptBrand,
      scenes,
      voiceId: validatedInput.voiceId || '21m00Tcm4TlvDq8ikWAM',
      voiceName: validatedInput.voiceName || 'Rachel',
      assets: {
        voiceover: { fullTrackUrl: '', duration: 0, perScene: [] },
        music: { url: '', duration: 0, volume: 0.18 },
        images: [],
        videos: [],
        productImages: [],
      },
      status: 'draft',
      progress: {
        currentStep: 'script',
        steps: {
          script: { status: 'complete', progress: 100, message: `Parsed ${scenes.length} scenes` },
          voiceover: { status: 'pending', progress: 0 },
          images: { status: 'pending', progress: 0 },
          videos: { status: 'pending', progress: 0 },
          music: { status: 'pending', progress: 0 },
          assembly: { status: 'pending', progress: 0 },
          rendering: { status: 'pending', progress: 0 },
        },
        overallPercent: 15,
        errors: [],
        serviceFailures: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Set quality tier (defaults to premium)
    (project as any).qualityTier = validatedInput.qualityTier || 'premium';
    console.log(`[UniversalVideo] Script project quality tier: ${(project as any).qualityTier}`);
    
    // Phase 16: Store end card and sound design settings
    (project as any).endCardSettings = validatedInput.endCardSettings || {
      enabled: true,
      useDefaults: true,
      duration: 5,
      logoAnimation: 'scale-bounce',
      taglineText: 'Rooted in Nature, Grown with Care',
      taglineAnimation: 'typewriter',
      contactWebsite: 'PineHillFarm.com',
      contactPhone: '',
      contactEmail: '',
      ambientEffect: 'bokeh',
      ambientIntensity: 40,
    };
    (project as any).soundDesignSettings = validatedInput.soundDesignSettings || {
      enabled: true,
      useDefaults: true,
      transitionSounds: true,
      impactSounds: true,
      ambientLayer: true,
      ambientType: 'nature',
      masterVolume: 1.0,
    };
    console.log(`[UniversalVideo] Phase 16 settings - End card enabled: ${(project as any).endCardSettings?.enabled}, Sound design enabled: ${(project as any).soundDesignSettings?.enabled}`);
    
    await saveProjectToDb(project, userId);
    console.log('[UniversalVideo] Script project saved to database:', project.id);
    
    res.json({
      success: true,
      project,
      message: `Script parsed into ${scenes.length} scenes`,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error parsing script:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input', 
        details: error.errors 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to parse script' 
    });
  }
});

router.post('/parse-script', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { script, platform, visualStyle, targetDuration } = req.body;

    if (!script || typeof script !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Script text is required' 
      });
    }

    console.log('[UniversalVideo] Parsing script with brand context...');

    const parsedResult = await universalVideoService.parseScriptWithBrandMatches({
      title: 'Parsed Script',
      script,
      targetDuration: targetDuration || 60,
      platform: platform || 'youtube',
      style: 'professional',
    });

    res.json({
      success: true,
      scenes: parsedResult.scenes,
      brandMatches: parsedResult.brandMatches,
      summary: parsedResult.summary,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Script parsing with brand context failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to parse script' 
    });
  }
});

router.get('/projects/:projectId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { projectId } = req.params;
    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Debug: Log scene video URLs when fetching
    const scenes = projectData.scenes || [];
    const scene2 = scenes.find((s: any) => s.id === 'scene_002_problem');
    if (scene2) {
      console.log('[DEBUG] API returning scene_002_problem videoUrls:', {
        background: scene2.background?.videoUrl?.substring(0, 80) || 'none',
        assets: scene2.assets?.videoUrl?.substring(0, 80) || 'none',
        mediaUrl: scene2.background?.mediaUrl?.substring(0, 80) || 'none'
      });
    }
    
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ success: true, project: projectData, fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/projects/:projectId/scenes', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { scenes } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    projectData.scenes = scenes;
    projectData.totalDuration = scenes.reduce((acc: number, s: Scene) => acc + s.duration, 0);
    projectData.updatedAt = new Date().toISOString();
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    res.json({ success: true, project: projectData });
  } catch (error: any) {
    console.error('[UniversalVideo] Error updating scenes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/scenes/:sceneId/narration', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { narration } = req.body;
    
    if (!narration || typeof narration !== 'string') {
      return res.status(400).json({ success: false, error: 'Narration text is required' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    projectData.scenes[sceneIndex].narration = narration.trim();
    projectData.updatedAt = new Date().toISOString();
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[UniversalVideo] Updated narration for scene ${sceneId} in project ${projectId}`);
    
    res.json({ 
      success: true, 
      project: projectData,
      message: 'Narration updated. Regenerate voiceover to apply changes to audio.'
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error updating narration:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/scenes/:sceneId/visual-direction', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { visualDirection, searchQuery, fallbackQuery } = req.body;
    
    if (!visualDirection || typeof visualDirection !== 'string') {
      return res.status(400).json({ success: false, error: 'Visual direction text is required' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    // Update visualDirection, background.source, and search queries
    projectData.scenes[sceneIndex].visualDirection = visualDirection.trim();
    projectData.scenes[sceneIndex].background.source = visualDirection.trim();
    
    // Update search queries if provided (from Ask Suzzie)
    if (searchQuery && typeof searchQuery === 'string') {
      projectData.scenes[sceneIndex].searchQuery = searchQuery.trim();
    }
    if (fallbackQuery && typeof fallbackQuery === 'string') {
      projectData.scenes[sceneIndex].fallbackQuery = fallbackQuery.trim();
    }
    
    projectData.updatedAt = new Date().toISOString();
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[UniversalVideo] Updated visual direction for scene ${sceneId} in project ${projectId}`);
    
    res.json({ 
      success: true, 
      project: projectData,
      message: 'Visual direction updated. Regenerate image or video to apply changes.'
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error updating visual direction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate visual direction for a single scene using Claude
router.post('/projects/:projectId/scenes/:sceneId/regenerate-visual-direction', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    console.log(`[RegenVisualDir] Request received - project: ${projectId}, scene: ${sceneId}, user: ${userId}`);

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const scene = projectData.scenes[sceneIndex];
    const narration = scene.narration || '';
    if (!narration.trim()) {
      return res.status(400).json({ success: false, error: 'Scene has no narration to generate visual direction from' });
    }

    const { llmClient } = await import('../services/piapi-llm-client');
    if (!llmClient.isAvailable()) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const { isStylizedPreset, getVisualArtPreset } = await import('../../shared/config/visual-art-presets');
    const { brandContextService } = await import('../services/brand-context-service');

    const artPresetId = (scene as any).artPresetId || (projectData as any).artPresetId;
    const isStylizedArtPreset = isStylizedPreset(artPresetId);
    const artPreset = artPresetId ? getVisualArtPreset(artPresetId) : null;

    let brandContextStr = '';
    try {
      const brandContext = await brandContextService.getVisualDirectionGenerationContext();
      brandContextStr = brandContext || '';
    } catch (brandErr) {
      console.log('[RegenVisualDir] Brand context unavailable, proceeding without it');
    }

    const projectVisualStyle = artPreset
      ? `${artPreset.name} — ${artPreset.description}`
      : 'Photorealistic / stock footage style';

    const lockedCharProfilesForPrompt = ((projectData as any).characters || [])
      .filter((c: any) => c.locked && c.referenceImageUrl)
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const charProfileSection = lockedCharProfilesForPrompt.length > 0
      ? '\nLOCKED CHARACTER PROFILES:\n' + lockedCharProfilesForPrompt.map((c: any) =>
        `- ${c.name} (${c.role || 'character'}): ${c.physicalDescription || 'no description'}. Wardrobe: ${c.wardrobe || 'not specified'}. Expression: ${c.personalityNotes || 'neutral'}.`
      ).join('\n')
      : '';

    const stylizedPromptRules = artPreset ? `
## STYLE: ${artPreset.name.toUpperCase()}
${artPreset.description}
Avoid: ${artPreset.negativePromptAdditions.join(', ')}

You are a cinematic AI video director specializing in Disney/Pixar 3D CGI educational content. Your job is to write a precise, specific, cinematically rich visual direction prompt for an AI video generation tool (Kling/fal.ai).

You will receive:
- The scene narration text
- The project art style (always 3D Illustration for this context)
- A list of locked character profiles with their physical descriptions, wardrobe, and expression notes
${charProfileSection}

RULES YOU MUST ALWAYS FOLLOW:

1. CHARACTER SPECIFICITY
   - If any locked character's name appears in the narration, reference them by exact name
   - EVERY time a character is mentioned in a micro-scene visualDirection, include their FULL physical description and wardrobe inline using this compact parenthetical format:
     CharacterName (age-description, hair details, eye color, skin tone, build, clothing items)
     Example: "Jackie Phillips (late-30s woman, shoulder-length dark brown hair, warm blue eyes, fair skin, athletic build, blue V-neck sweater, blue jeans, small hoop earrings)"
   - Pull ALL details from the LOCKED CHARACTER PROFILES above — do NOT abbreviate or omit wardrobe/outfit
   - Never describe a character generically (e.g., "a woman" or "a person") when a named locked character exists
   - Always append: "Maintain exact character appearance as described — same face, hair, clothing, and art style."
   - IMPORTANT: Do NOT reference any "reference image" — character consistency comes from the detailed text descriptions only. Never write "from reference image" or "from the reference".

2. NARRATION-VISUAL ALIGNMENT
   - The environment, camera movement, and character action must directly reinforce the MEANING of the narration — not just illustrate it generically
   - Ask yourself: what does this narration mean conceptually? Then express that concept visually

3. REQUIRED VISUAL ELEMENTS — always specify all six:
   a) Shot type (medium shot, close-up, wide establishing, etc.)
   b) Camera movement (slow push-in, subtle arc left-to-right, static hold, gentle orbit, etc.)
   c) Lighting mood (warm golden, cool clinical white, soft ambient, split warm-cool, etc.)
   d) Background environment (specific, thematic, never generic)
   e) Character action and gesture (what are they doing physically that matches the narration meaning)
   f) Art style suffix (always end with the standard suffix below)

4. STANDARD ART STYLE SUFFIX — always end every prompt with:
   "Disney/Pixar 3D CGI animation quality, subsurface skin scattering, shallow depth of field, cinematic warm color grading, 4K render. No text, no signs, no labels, no readable words anywhere in the scene. Clean background surfaces suitable for text overlay compositing. Smooth natural movement — gentle gestures, soft blinks, subtle breathing motion."

5. ENVIRONMENT AND BACKGROUND
   - When describing the scene environment, always include at least one compositionally clean surface or area that could naturally hold a text label or title — such as a wall, a chalkboard, a desk surface, an open sky area, or negative space beside the character. This prepares the scene for Remotion text overlay compositing in post-production.

6. NEVER USE:
   - Generic room descriptions ("cozy office", "modern workspace")
   - Vague character descriptions ("a woman", "a professional")
   - Static, non-cinematic framing descriptions
   - Environments unrelated to the narration's meaning

7. EVERY micro-scene prompt MUST include the art style marker (e.g. "Pixar-style 3D animated", "claymation", etc.) — AI video providers treat each prompt independently and will default to photorealistic if the style is not explicitly stated.

` : '';

    const defaultPromptRules = `
## CORE PRINCIPLE: AUTHENTICITY OVER PRODUCTION VALUE
The #1 priority is that the visual MATCHES the emotional reality of the narration.
${charProfileSection}

## CHARACTER SPECIFICITY
- If any locked character's name appears in the narration, reference them by exact name
- EVERY time a character is mentioned in a micro-scene visualDirection, include their FULL physical description and wardrobe inline using this compact parenthetical format:
  CharacterName (age-description, hair details, eye color, skin tone, build, clothing items)
  Example: "Jackie Phillips (late-30s woman, shoulder-length dark brown hair, warm blue eyes, fair skin, athletic build, blue V-neck sweater, blue jeans, small hoop earrings)"
- Pull ALL details from the LOCKED CHARACTER PROFILES above — do NOT abbreviate or omit wardrobe/outfit
- Never describe a character generically (e.g., "a woman" or "a person") when a named locked character exists
- Do NOT reference any "reference image" — character consistency comes from the detailed text descriptions only

## CRITICAL: VISUAL DIVERSITY
Vary the VISUAL TYPE across micro-scenes:
- Object close-up, Environment/setting, Conceptual/metaphor, Nature/organic, B-roll, Person/human

RULES:
- At MOST 1-2 micro-scenes (out of 3-4) should feature a person
- Vary the visual type

## RULES FOR VISUAL DIRECTIONS
1. MATCH THE NARRATION'S REALITY
2. ONE VISUAL PER MICRO-SCENE
3. KEEP IT SIMPLE - One subject, one setting per micro-scene. 10-20 words max.
4. BE CONCRETE, NOT ABSTRACT
5. BE DIRECT
6. REAL SETTINGS, NOT SETS
7. NO CINEMATIC LANGUAGE
8. VISUAL VARIETY`;

    const systemPrompt = `You are a visual director for ${isStylizedArtPreset ? `${artPreset!.name} style AI video content` : 'social media and television content'}.

${brandContextStr}

${isStylizedArtPreset ? stylizedPromptRules : defaultPromptRules}

## MICRO-SCENES
Split the narration into micro-scenes. Each micro-scene covers 1-2 sentences that share a single visual idea.

Guidelines for splitting:
- Split at natural topic/image shifts in the narration
- Each micro-scene should represent ONE clear visual moment
- 2-4 micro-scenes per scene is ideal (minimum 1, maximum 5)
- Short scenes (under 5 seconds or 1-2 sentences) should stay as 1 micro-scene
- Estimate duration proportionally based on word count of each segment

## VISUAL STYLE: ${projectVisualStyle}

## OUTPUT FORMAT
Return ONLY a JSON object:
{
  "visualDirection": "overall ${isStylizedArtPreset ? '4-6 sentence cinematic paragraph' : '1-sentence'} summary for the whole scene${isStylizedArtPreset ? ' including all six required visual elements and art style suffix' : ''}",
  "microScenes": [
    { "narration": "exact text from the narration for this segment", "visualDirection": "${isStylizedArtPreset ? '4-6 sentence cinematic paragraph with shot type, camera movement, lighting, environment, character action, and art style suffix. No bullet points.' : '1-2 sentences describing what we see'}", "duration": 4 },
    { "narration": "next segment text", "visualDirection": "different visual type for this part", "duration": 3 }
  ]
}`;

    const previousDirections = projectData.scenes
      .slice(0, sceneIndex)
      .filter((s: any) => s.visualDirection && s.visualDirection.trim().length >= 10)
      .slice(-2)
      .map((s: any, idx: number) => `Previous scene ${idx + 1}: "${s.visualDirection}"`)
      .join('\n');

    const characterProfilesText = lockedCharProfilesForPrompt.length > 0
      ? 'LOCKED CHARACTER PROFILES FOR THIS PROJECT:\n' + lockedCharProfilesForPrompt.map((c: any) => `
- Name: ${c.name}
  Role: ${c.role || 'character'}
  Physical Description: ${c.physicalDescription || 'no description'}
  Wardrobe: ${c.wardrobe || 'not specified'}
  Expression/Personality: ${c.personalityNotes || 'neutral'}
  Reference Image: ${c.referenceImageUrl ? 'Available' : 'Not generated'}
`).join('\n')
      : 'No locked character profiles for this project.';

    const userPrompt = isStylizedArtPreset ? `
Generate a cinematic visual direction prompt for the following scene.

PROJECT ART STYLE: ${artPreset!.name} (Disney/Pixar CGI)

${characterProfilesText}

SCENE ${sceneIndex + 1} of ${projectData.scenes.length}
Scene Type: ${scene.type || 'content'}
${(scene as any).title ? `Scene Title: ${(scene as any).title}` : ''}
Scene Duration: ${scene.duration || 10} seconds
${previousDirections ? `\nPREVIOUS SCENES (maintain character consistency with these):\n${previousDirections}\n` : ''}
SCENE NARRATION:
"${narration}"

Write a single paragraph visual direction prompt that:
1. References any named characters using their exact profile details above
2. Ties the environment and camera movement to the meaning of the narration
3. Includes shot type, camera movement, lighting, background, character action, and the standard art style suffix
4. Ends with the standard Disney/Pixar art style suffix

Split this narration into micro-scenes (2-4 segments) at natural topic shifts. Each micro-scene gets its own vivid cinematic paragraph visual direction. Return JSON with visualDirection and microScenes array.
` : `Scene Type: ${scene.type || 'content'}
${(scene as any).title ? `Scene Title: ${(scene as any).title}` : ''}
Scene ${sceneIndex + 1} of ${projectData.scenes.length}
Scene Duration: ${scene.duration || 10} seconds
${previousDirections ? `\nPREVIOUS SCENES (maintain character consistency with these):\n${previousDirections}\n` : ''}
Narration:
"${narration}"

Split this narration into micro-scenes (2-4 segments) at natural topic shifts. Each micro-scene gets its own simple, authentic visual direction. Return JSON with visualDirection and microScenes array.`;

    console.log(`[RegenVisualDir] Regenerating visual direction for scene ${sceneId} in project ${projectId} (art: ${artPresetId || 'default'})`);

    const llmResult = await llmClient.createChatCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: isStylizedArtPreset ? 2000 : 800,
    });

    const textContent = llmResult.text || '';
    if (!textContent) {
      return res.status(500).json({ success: false, error: 'AI returned no content' });
    }

    let visualDirection = '';
    let microScenes: any[] = [];
    const cleanedText = textContent
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    console.log('[RegenVisualDir] Raw LLM text (first 200):', textContent.substring(0, 200));
    try {
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        visualDirection = parsed.visualDirection || '';
        microScenes = parsed.microScenes || [];
        console.log('[RegenVisualDir] Parsed visualDirection (first 100):', visualDirection.substring(0, 100));
        console.log('[RegenVisualDir] MicroScenes count:', microScenes.length);
      }
    } catch (e: any) {
      console.log('[RegenVisualDir] JSON parse failed:', e.message, '- attempting field extraction');
    }

    if (!visualDirection) {
      const vdMatch = cleanedText.match(/"visualDirection"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (vdMatch) {
        visualDirection = vdMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        console.log('[RegenVisualDir] Extracted visualDirection via regex (first 100):', visualDirection.substring(0, 100));
      }
    }

    if (!visualDirection && microScenes.length === 0) {
      const msMatches = [...cleanedText.matchAll(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"visualDirection"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"duration"\s*:\s*(\d+)/g)];
      if (msMatches.length > 0) {
        microScenes = msMatches.map(m => ({
          narration: m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          visualDirection: m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          duration: parseInt(m[3]),
        }));
        visualDirection = microScenes.map(ms => ms.visualDirection).join(' ');
        console.log('[RegenVisualDir] Extracted', microScenes.length, 'microScenes via regex');
      }
    }

    if (!visualDirection) {
      visualDirection = cleanedText.replace(/^\{[\s\S]*$/, '').trim() || cleanedText;
      console.log('[RegenVisualDir] Fallback: using cleaned text');
    }

    if (!visualDirection) {
      return res.status(500).json({ success: false, error: 'Failed to parse visual direction from AI response' });
    }

    projectData.scenes[sceneIndex].visualDirection = visualDirection;
    if (!projectData.scenes[sceneIndex].background) {
      projectData.scenes[sceneIndex].background = {};
    }
    projectData.scenes[sceneIndex].background.source = visualDirection;
    if (microScenes.length > 0) {
      (projectData.scenes[sceneIndex] as any).microScenes = microScenes;
    }
    projectData.updatedAt = new Date().toISOString();

    await saveProjectToDb(projectData, projectData.ownerId);

    console.log(`[RegenVisualDir] Successfully regenerated visual direction for scene ${sceneId}`);

    res.json({
      success: true,
      project: projectData,
      visualDirection,
      microScenes,
    });
  } catch (error: any) {
    console.error('[RegenVisualDir] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 12 Addendum: Get reference config for a scene
router.get('/projects/:projectId/scenes/:sceneId/reference-config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scene = projectData.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const config = scene.referenceConfig || { mode: 'none', sourceType: 'upload' };
    
    res.json({ success: true, config });
  } catch (error: any) {
    console.error('[Phase12] Error getting reference config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 12 Addendum: Save reference config for a scene
router.patch('/projects/:projectId/scenes/:sceneId/reference-config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { mode, sourceUrl, sourceType, settings } = req.body;
    
    const validModes = ['none', 'image-to-image', 'image-to-video', 'style-reference'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ success: false, error: 'Invalid reference mode' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    // Build reference config
    if (mode === 'none') {
      projectData.scenes[sceneIndex].referenceConfig = { mode: 'none', sourceType: 'upload' };
    } else {
      projectData.scenes[sceneIndex].referenceConfig = {
        mode,
        sourceUrl,
        sourceType: sourceType || 'upload',
        ...(mode === 'image-to-image' && { i2iSettings: settings }),
        ...(mode === 'image-to-video' && { i2vSettings: settings }),
        ...(mode === 'style-reference' && { styleSettings: settings }),
      };
    }
    
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[Phase12] Updated reference config for scene ${sceneId}: ${mode}`);
    
    res.json({ 
      success: true, 
      scene: projectData.scenes[sceneIndex],
      message: mode === 'none' ? 'Reference config cleared' : `${mode} mode configured`
    });
  } catch (error: any) {
    console.error('[Phase12] Error updating reference config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 12 Addendum: Update scene content type
router.patch('/projects/:projectId/scenes/:sceneId/content-type', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { contentType } = req.body;
    
    const validTypes = [
      'b-roll', 'product-shot', 'lifestyle', 'talking-head',
      'testimonial', 'demo', 'cinematic', 'text-overlay'
    ];
    
    if (!validTypes.includes(contentType)) {
      return res.status(400).json({ success: false, error: 'Invalid content type' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    // Update content type with user source tracking
    (projectData.scenes[sceneIndex] as any).contentType = contentType;
    (projectData.scenes[sceneIndex] as any).contentTypeSource = 'user';
    
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[Phase12] Updated content type for scene ${sceneId}: ${contentType}`);
    
    res.json({ 
      success: true, 
      scene: projectData.scenes[sceneIndex],
      message: `Content type set to ${contentType}`
    });
  } catch (error: any) {
    console.error('[Phase12] Error updating content type:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 15H: Update scene brand asset toggle
router.patch('/projects/:projectId/scenes/:sceneId/brand-assets', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { useBrandAssets } = req.body;
    
    if (typeof useBrandAssets !== 'boolean') {
      return res.status(400).json({ success: false, error: 'useBrandAssets must be a boolean' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    (projectData.scenes[sceneIndex] as any).useBrandAssets = useBrandAssets;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[Phase15H] Updated brand asset mode for scene ${sceneId}: ${useBrandAssets ? 'Brand I2V' : 'AI T2V'}`);
    
    res.json({ 
      success: true, 
      scene: projectData.scenes[sceneIndex],
      message: useBrandAssets ? 'Brand asset mode enabled (I2V)' : 'AI generation mode enabled (T2V)'
    });
  } catch (error: any) {
    console.error('[Phase15H] Error updating brand asset mode:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 14C: Update quality tier for a project
router.patch('/projects/:projectId/quality-tier', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { qualityTier } = req.body;
    
    const validTiers = ['ultra', 'premium', 'standard', 'draft'];
    
    if (!validTiers.includes(qualityTier)) {
      return res.status(400).json({ success: false, error: 'Invalid quality tier' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Update quality tier
    (projectData as any).qualityTier = qualityTier;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[Phase14C] Updated quality tier for project ${projectId}: ${qualityTier}`);
    
    res.json({ 
      success: true, 
      qualityTier,
      message: `Quality tier set to ${qualityTier}`
    });
  } catch (error: any) {
    console.error('[Phase14C] Error updating quality tier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/media-mode', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { mediaMode } = req.body;
    
    const validModes = ['image', 'video'];
    
    if (!validModes.includes(mediaMode)) {
      return res.status(400).json({ success: false, error: 'Invalid media mode' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    (projectData as any).mediaMode = mediaMode;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[MediaMode] Updated media mode for project ${projectId}: ${mediaMode}`);
    
    res.json({ 
      success: true, 
      mediaMode,
      message: `Media mode set to ${mediaMode}`
    });
  } catch (error: any) {
    console.error('[MediaMode] Error updating media mode:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/aspect-ratio', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { aspectRatio } = req.body;
    
    const validRatios = ['16:9', '9:16', '1:1', '4:3'];
    
    if (!validRatios.includes(aspectRatio)) {
      return res.status(400).json({ success: false, error: 'Invalid aspect ratio. Must be one of: ' + validRatios.join(', ') });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (!projectData.outputFormat) {
      (projectData as any).outputFormat = {};
    }
    projectData.outputFormat!.aspectRatio = aspectRatio;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[AspectRatio] Updated aspect ratio for project ${projectId}: ${aspectRatio}`);
    
    res.json({ 
      success: true, 
      aspectRatio,
      project: projectData,
      message: `Aspect ratio set to ${aspectRatio}`
    });
  } catch (error: any) {
    console.error('[AspectRatio] Error updating aspect ratio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/render-settings', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { voiceover, music, soundDesign, filmTreatment, transitions, introEnabled, introTemplate, outroEnabled, outroTemplate, introBackgroundRandom, captions, nativeVideoAudio } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const progressPatch: Record<string, any> = {};
    const assetsPatch: Record<string, any> = {};

    if (voiceover !== undefined) {
      if (voiceover.enabled === false) {
        const existingAssets = projectData.assets || {} as any;
        const existingVoiceover = existingAssets.voiceover || {};
        assetsPatch.voiceover = { ...existingVoiceover, fullTrackUrl: '' };
      }
      progressPatch.voiceoverSettings = {
        enabled: voiceover.enabled ?? true,
        voiceId: voiceover.voiceId || null,
      };
    }
    
    if (music !== undefined) {
      const existingAssets = projectData.assets || {} as any;
      const existingMusic = existingAssets.music || {};
      assetsPatch.music = { ...existingMusic, volume: music.volume ?? existingMusic.volume ?? 0.18 };
      progressPatch.musicSettings = {
        enabled: music.enabled ?? true,
        volume: music.volume ?? 0.18,
      };
    }
    
    if (soundDesign !== undefined) {
      progressPatch.soundDesignSettings = {
        enabled: soundDesign.enabled ?? true,
        transitionSounds: soundDesign.transitionSounds ?? true,
        impactSounds: soundDesign.impactSounds ?? true,
        ambientLayer: soundDesign.ambientLayer ?? true,
        ambientType: soundDesign.ambientType || 'nature',
        masterVolume: soundDesign.masterVolume ?? 1.0,
        audioDucking: {
          enabled: soundDesign.audioDucking?.enabled ?? true,
          baseVolume: soundDesign.audioDucking?.baseVolume ?? 0.35,
          duckLevel: soundDesign.audioDucking?.duckLevel ?? 0.1,
          fadeFrames: soundDesign.audioDucking?.fadeFrames ?? 15,
        },
      };
    }
    
    if (filmTreatment !== undefined) {
      const validColorGrades = ['warm-cinematic', 'cool-corporate', 'natural-organic', 'vibrant-lifestyle', 'luxury-elegant', 'moody-dramatic'];
      const validLetterbox = ['none', '2.39:1', '1.85:1'];
      progressPatch.filmTreatmentSettings = {
        enabled: filmTreatment.enabled ?? true,
        colorGrade: validColorGrades.includes(filmTreatment.colorGrade) ? filmTreatment.colorGrade : 'warm-cinematic',
        colorIntensity: Math.min(1.0, Math.max(0, filmTreatment.colorIntensity ?? 1.0)),
        grainIntensity: Math.min(0.10, Math.max(0, filmTreatment.grainIntensity ?? 0.03)),
        vignetteIntensity: Math.min(0.50, Math.max(0, filmTreatment.vignetteIntensity ?? 0.2)),
        letterbox: validLetterbox.includes(filmTreatment.letterbox) ? filmTreatment.letterbox : 'none',
      };
    }
    
    if (transitions !== undefined) {
      const validStyles = ['fade', 'crossfade', 'dissolve', 'wipe-left', 'wipe-right', 'zoom', 'slide-left', 'slide-right', 'none'];
      progressPatch.transitionSettings = {
        style: validStyles.includes(transitions.style) ? transitions.style : 'crossfade',
        duration: Math.min(2.0, Math.max(0.1, transitions.duration ?? 0.5)),
      };
    }

    if (introEnabled !== undefined) {
      progressPatch.introEnabled = !!introEnabled;
    }

    if (introTemplate !== undefined) {
      const validTemplates = ['classic-glow', 'minimal', 'cinematic', 'elegant-fade'];
      progressPatch.introTemplate = validTemplates.includes(introTemplate) ? introTemplate : 'classic-glow';
    }

    if (outroEnabled !== undefined) {
      progressPatch.outroEnabled = !!outroEnabled;
    }

    if (outroTemplate !== undefined) {
      const validTemplates = ['classic-glow', 'minimal', 'cinematic', 'elegant-fade'];
      progressPatch.outroTemplate = validTemplates.includes(outroTemplate) ? outroTemplate : 'classic-glow';
    }

    if (introBackgroundRandom !== undefined) {
      progressPatch.introBackgroundRandom = !!introBackgroundRandom;
    }

    if (captions !== undefined) {
      const validPresets = ['karaoke', 'capcut', 'hormozi', 'broadcast', 'minimal', 'glossy', 'neon', 'typewriter', 'glitch'];
      const validPositions = ['bottom', 'center', 'top'];
      progressPatch.captionSettings = {
        enabled: captions.enabled ?? false,
        style: {
          preset: validPresets.includes(captions.style?.preset) ? captions.style.preset : 'capcut',
          position: validPositions.includes(captions.style?.position) ? captions.style.position : 'bottom',
          fontSize: captions.style?.fontSize ? Math.min(120, Math.max(16, captions.style.fontSize)) : undefined,
          primaryColor: captions.style?.primaryColor || undefined,
          activeColor: captions.style?.activeColor || undefined,
        },
      };
    }

    const endCard = req.body.endCard;
    if (endCard !== undefined) {
      const existing = (projectData as any).endCardSettings || {};
      const validLogoAnimations = ['scale-bounce', 'fade', 'slide-up', 'zoom-blur', 'spin-in', 'elastic-pop', 'none'];
      const validTaglineAnimations = ['typewriter', 'fade', 'slide-up', 'letter-cascade', 'word-reveal', 'glow-pulse', 'cinematic-rise', 'none'];
      const validContactAnimations = ['stagger', 'fade', 'slide-up', 'slide-left', 'stagger-slide', 'stagger-scale', 'cascade-blur', 'none'];
      const validAmbientEffects = ['particles', 'bokeh', 'none'];
      const validFonts = ['Great Vibes', 'Inter', 'Playfair Display', 'Montserrat', 'Raleway', 'Oswald', 'Lora', 'Poppins', 'Dancing Script', 'Sacramento', 'Pacifico', 'Caveat', 'Satisfy', 'Kaushan Script', 'Allura', 'Cormorant Garamond', 'Libre Baskerville', 'EB Garamond', 'Quicksand', 'Nunito', 'Open Sans'];
      progressPatch.endCardSettings = {
        ...existing,
        enabled: endCard.enabled ?? existing.enabled ?? true,
        duration: endCard.duration != null ? Math.min(10, Math.max(3, endCard.duration)) : (existing.duration || 5),
        taglineText: endCard.taglineText ?? existing.taglineText ?? '',
        taglineAnimation: validTaglineAnimations.includes(endCard.taglineAnimation) ? endCard.taglineAnimation : (existing.taglineAnimation || 'typewriter'),
        logoAnimation: validLogoAnimations.includes(endCard.logoAnimation) ? endCard.logoAnimation : (existing.logoAnimation || 'scale-bounce'),
        logoSize: endCard.logoSize != null ? Math.min(60, Math.max(10, endCard.logoSize)) : (existing.logoSize || 25),
        contactWebsite: endCard.contactWebsite ?? existing.contactWebsite ?? '',
        contactPhone: endCard.contactPhone ?? existing.contactPhone ?? '',
        contactEmail: endCard.contactEmail ?? existing.contactEmail ?? '',
        contactAnimation: validContactAnimations.includes(endCard.contactAnimation) ? endCard.contactAnimation : (existing.contactAnimation || 'stagger'),
        ambientEffect: validAmbientEffects.includes(endCard.ambientEffect) ? endCard.ambientEffect : (existing.ambientEffect || 'bokeh'),
        backgroundUrl: endCard.backgroundUrl !== undefined ? (endCard.backgroundUrl || null) : (existing.backgroundUrl || null),
        logoUrl: endCard.logoUrl !== undefined ? (endCard.logoUrl || null) : (existing.logoUrl || null),
        logoPositionY: endCard.logoPositionY != null ? Math.min(90, Math.max(10, endCard.logoPositionY)) : (existing.logoPositionY || 32),
        taglinePositionY: endCard.taglinePositionY != null ? Math.min(95, Math.max(15, endCard.taglinePositionY)) : (existing.taglinePositionY || 55),
        websitePositionY: endCard.websitePositionY != null ? Math.min(95, Math.max(20, endCard.websitePositionY)) : (existing.websitePositionY || 75),
        taglineFontSize: endCard.taglineFontSize != null ? Math.min(72, Math.max(14, endCard.taglineFontSize)) : (existing.taglineFontSize || 28),
        taglineColor: endCard.taglineColor ?? existing.taglineColor ?? '#E8D5B7',
        taglineFontFamily: validFonts.includes(endCard.taglineFontFamily) ? endCard.taglineFontFamily : (existing.taglineFontFamily || 'Great Vibes'),
        taglineBold: endCard.taglineBold ?? existing.taglineBold ?? false,
        taglineFontWeight: endCard.taglineFontWeight != null
          ? Math.min(900, Math.max(100, endCard.taglineFontWeight))
          : (existing.taglineFontWeight ?? ((endCard.taglineBold ?? existing.taglineBold) ? 700 : undefined)),
        websiteFontSize: endCard.websiteFontSize != null ? Math.min(48, Math.max(12, endCard.websiteFontSize)) : (existing.websiteFontSize || 22),
        websiteColor: endCard.websiteColor ?? existing.websiteColor ?? '#FFFFFF',
        websiteBold: endCard.websiteBold ?? existing.websiteBold ?? false,
        websiteFontWeight: endCard.websiteFontWeight != null
          ? Math.min(900, Math.max(100, endCard.websiteFontWeight))
          : (existing.websiteFontWeight ?? ((endCard.websiteBold ?? existing.websiteBold) ? 700 : undefined)),
        websiteFontFamily: validFonts.includes(endCard.websiteFontFamily) ? endCard.websiteFontFamily : (existing.websiteFontFamily || 'Inter'),
      };
    }

    const introCard = req.body.introCard;
    if (introCard !== undefined) {
      const existing = (projectData as any).introCardSettings || {};
      const validLogoAnimations = ['scale-bounce', 'fade', 'slide-up', 'zoom-blur', 'spin-in', 'elastic-pop', 'none'];
      const validTaglineAnimations = ['typewriter', 'fade', 'slide-up', 'letter-cascade', 'word-reveal', 'glow-pulse', 'cinematic-rise', 'none'];
      const validContactAnimations = ['stagger', 'fade', 'slide-up', 'slide-left', 'stagger-slide', 'stagger-scale', 'cascade-blur', 'none'];
      const validAmbientEffects = ['particles', 'bokeh', 'none'];
      const validFonts = ['Great Vibes', 'Inter', 'Playfair Display', 'Montserrat', 'Raleway', 'Oswald', 'Lora', 'Poppins', 'Dancing Script', 'Sacramento', 'Pacifico', 'Caveat', 'Satisfy', 'Kaushan Script', 'Allura', 'Cormorant Garamond', 'Libre Baskerville', 'EB Garamond', 'Quicksand', 'Nunito', 'Open Sans'];
      progressPatch.introCardSettings = {
        ...existing,
        enabled: introCard.enabled ?? existing.enabled ?? true,
        duration: introCard.duration != null ? Math.min(10, Math.max(3, introCard.duration)) : (existing.duration || 4),
        taglineText: introCard.taglineText ?? existing.taglineText ?? '',
        taglineAnimation: validTaglineAnimations.includes(introCard.taglineAnimation) ? introCard.taglineAnimation : (existing.taglineAnimation || 'fade'),
        logoAnimation: validLogoAnimations.includes(introCard.logoAnimation) ? introCard.logoAnimation : (existing.logoAnimation || 'scale-bounce'),
        logoSize: introCard.logoSize != null ? Math.min(60, Math.max(10, introCard.logoSize)) : (existing.logoSize || 30),
        contactWebsite: introCard.contactWebsite ?? existing.contactWebsite ?? '',
        contactPhone: introCard.contactPhone ?? existing.contactPhone ?? '',
        contactEmail: introCard.contactEmail ?? existing.contactEmail ?? '',
        contactAnimation: validContactAnimations.includes(introCard.contactAnimation) ? introCard.contactAnimation : (existing.contactAnimation || 'stagger'),
        ambientEffect: validAmbientEffects.includes(introCard.ambientEffect) ? introCard.ambientEffect : (existing.ambientEffect || 'bokeh'),
        backgroundUrl: introCard.backgroundUrl !== undefined ? (introCard.backgroundUrl || null) : (existing.backgroundUrl || null),
        logoUrl: introCard.logoUrl !== undefined ? (introCard.logoUrl || null) : (existing.logoUrl || null),
        logoPositionY: introCard.logoPositionY != null ? Math.min(90, Math.max(10, introCard.logoPositionY)) : (existing.logoPositionY || 32),
        taglinePositionY: introCard.taglinePositionY != null ? Math.min(95, Math.max(15, introCard.taglinePositionY)) : (existing.taglinePositionY || 50),
        websitePositionY: introCard.websitePositionY != null ? Math.min(95, Math.max(20, introCard.websitePositionY)) : (existing.websitePositionY || 75),
        taglineFontSize: introCard.taglineFontSize != null ? Math.min(72, Math.max(14, introCard.taglineFontSize)) : (existing.taglineFontSize || 28),
        taglineColor: introCard.taglineColor ?? existing.taglineColor ?? '#E8D5B7',
        taglineFontFamily: validFonts.includes(introCard.taglineFontFamily) ? introCard.taglineFontFamily : (existing.taglineFontFamily || 'Great Vibes'),
        taglineBold: introCard.taglineBold ?? existing.taglineBold ?? false,
        taglineFontWeight: introCard.taglineFontWeight != null
          ? Math.min(900, Math.max(100, introCard.taglineFontWeight))
          : (existing.taglineFontWeight ?? ((introCard.taglineBold ?? existing.taglineBold) ? 700 : undefined)),
        websiteFontSize: introCard.websiteFontSize != null ? Math.min(48, Math.max(12, introCard.websiteFontSize)) : (existing.websiteFontSize || 22),
        websiteColor: introCard.websiteColor ?? existing.websiteColor ?? '#FFFFFF',
        websiteBold: introCard.websiteBold ?? existing.websiteBold ?? false,
        websiteFontWeight: introCard.websiteFontWeight != null
          ? Math.min(900, Math.max(100, introCard.websiteFontWeight))
          : (existing.websiteFontWeight ?? ((introCard.websiteBold ?? existing.websiteBold) ? 700 : undefined)),
        websiteFontFamily: validFonts.includes(introCard.websiteFontFamily) ? introCard.websiteFontFamily : (existing.websiteFontFamily || 'Inter'),
      };
    }

    if (req.body.introBackgroundUrl !== undefined) {
      progressPatch.introBackgroundUrl = req.body.introBackgroundUrl || null;
    }

    if (nativeVideoAudio !== undefined) {
      progressPatch.nativeVideoAudioSettings = {
        enabled: !!nativeVideoAudio.enabled,
        volume: Math.min(1.0, Math.max(0, nativeVideoAudio.volume ?? 0.8)),
      };
    }
    
    await mergeRenderSettingsToDb(
      projectId,
      progressPatch,
      Object.keys(assetsPatch).length > 0 ? assetsPatch : undefined,
    );
    
    console.log(`[RenderSettings] Updated render settings for project ${projectId}`);
    
    res.json({ 
      success: true, 
      message: 'Render settings updated',
      settings: {
        voiceover: progressPatch.voiceoverSettings ?? (projectData as any).voiceoverSettings,
        music: progressPatch.musicSettings ?? (projectData as any).musicSettings,
        soundDesign: progressPatch.soundDesignSettings ?? (projectData as any).soundDesignSettings,
        filmTreatment: progressPatch.filmTreatmentSettings ?? (projectData as any).filmTreatmentSettings,
        transitions: progressPatch.transitionSettings ?? (projectData as any).transitionSettings,
        introEnabled: progressPatch.introEnabled ?? (projectData as any).introEnabled ?? true,
        introTemplate: progressPatch.introTemplate ?? (projectData as any).introTemplate ?? 'classic-glow',
        outroEnabled: progressPatch.outroEnabled ?? (projectData as any).outroEnabled ?? true,
        outroTemplate: progressPatch.outroTemplate ?? (projectData as any).outroTemplate ?? 'classic-glow',
        introBackgroundRandom: progressPatch.introBackgroundRandom ?? (projectData as any).introBackgroundRandom ?? false,
        introBackgroundUrl: progressPatch.introBackgroundUrl ?? (projectData as any).introBackgroundUrl ?? null,
        captions: progressPatch.captionSettings ?? (projectData as any).captionSettings ?? { enabled: false, style: { preset: 'capcut', position: 'bottom' } },
        nativeVideoAudio: progressPatch.nativeVideoAudioSettings ?? (projectData as any).nativeVideoAudioSettings ?? { enabled: false, volume: 0.8 },
        endCard: progressPatch.endCardSettings ?? (projectData as any).endCardSettings ?? { enabled: true, duration: 5, taglineText: '', logoSize: 25, logoAnimation: 'scale-bounce', taglineAnimation: 'typewriter', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null, logoPositionY: 32, taglinePositionY: 55, websitePositionY: 75 },
        introCard: progressPatch.introCardSettings ?? (projectData as any).introCardSettings ?? { enabled: true, duration: 4, taglineText: '', logoSize: 30, logoAnimation: 'scale-bounce', taglineAnimation: 'fade', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null, logoPositionY: 32, taglinePositionY: 50, websitePositionY: 75 },
      }
    });
  } catch (error: any) {
    console.error('[RenderSettings] Error updating render settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects/:projectId/render-settings', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const hasVoiceover = !!(projectData.assets?.voiceover?.fullTrackUrl);
    const hasMusic = !!(projectData.assets?.music?.url);
    const scenes = projectData.scenes || [];
    const hasSceneVideos = scenes.some((s: any) => s.assets?.videoUrl || s.background?.videoUrl);
    
    res.json({ 
      success: true,
      hasSceneVideos,
      settings: {
        voiceover: {
          enabled: (projectData as any).voiceoverSettings?.enabled ?? true,
          voiceId: (projectData as any).voiceoverSettings?.voiceId || null,
          hasGenerated: hasVoiceover,
          url: projectData.assets?.voiceover?.fullTrackUrl || null,
          duration: projectData.assets?.voiceover?.duration || 0,
        },
        music: {
          enabled: (projectData as any).musicSettings?.enabled ?? true,
          volume: (projectData as any).musicSettings?.volume ?? projectData.assets?.music?.volume ?? 0.18,
          hasGenerated: hasMusic,
          url: projectData.assets?.music?.url || null,
        },
        soundDesign: {
          enabled: (projectData as any).soundDesignSettings?.enabled ?? true,
          transitionSounds: (projectData as any).soundDesignSettings?.transitionSounds ?? true,
          impactSounds: (projectData as any).soundDesignSettings?.impactSounds ?? true,
          ambientLayer: (projectData as any).soundDesignSettings?.ambientLayer ?? true,
          ambientType: (projectData as any).soundDesignSettings?.ambientType || 'nature',
          masterVolume: (projectData as any).soundDesignSettings?.masterVolume ?? 1.0,
        },
        filmTreatment: {
          enabled: (projectData as any).filmTreatmentSettings?.enabled ?? true,
          colorGrade: (projectData as any).filmTreatmentSettings?.colorGrade || 'warm-cinematic',
          grainIntensity: (projectData as any).filmTreatmentSettings?.grainIntensity ?? 0.03,
          vignetteIntensity: (projectData as any).filmTreatmentSettings?.vignetteIntensity ?? 0.2,
          letterbox: (projectData as any).filmTreatmentSettings?.letterbox || 'none',
        },
        transitions: {
          style: (projectData as any).transitionSettings?.style || 'crossfade',
          duration: (projectData as any).transitionSettings?.duration ?? 0.5,
        },
        introEnabled: (projectData as any).introEnabled ?? true,
        introTemplate: (projectData as any).introTemplate || 'classic-glow',
        outroEnabled: (projectData as any).outroEnabled ?? true,
        outroTemplate: (projectData as any).outroTemplate || 'classic-glow',
        introBackgroundRandom: (projectData as any).introBackgroundRandom ?? false,
        introBackgroundUrl: (projectData as any).introBackgroundUrl || null,
        captions: (projectData as any).captionSettings || { enabled: false, style: { preset: 'capcut', position: 'bottom' } },
        nativeVideoAudio: (projectData as any).nativeVideoAudioSettings || { enabled: false, volume: 0.8 },
        endCard: (projectData as any).endCardSettings || { enabled: true, duration: 5, taglineText: '', logoSize: 25, logoAnimation: 'scale-bounce', taglineAnimation: 'typewriter', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null, logoPositionY: 32, taglinePositionY: 55, websitePositionY: 75 },
        introCard: (projectData as any).introCardSettings || { enabled: true, duration: 4, taglineText: '', logoSize: 30, logoAnimation: 'scale-bounce', taglineAnimation: 'fade', contactAnimation: 'stagger', contactWebsite: '', contactPhone: '', contactEmail: '', ambientEffect: 'bokeh', backgroundUrl: null, logoPositionY: 32, taglinePositionY: 50, websitePositionY: 75 },
      }
    });
  } catch (error: any) {
    console.error('[RenderSettings] Error fetching render settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 8A: Background scene analysis helper (runs async without blocking response)
// Updated to handle video scenes by extracting a thumbnail frame for analysis
async function runBackgroundSceneAnalysis(projectId: string, userId: number | string) {
  try {
    const projectData = await getProjectFromDb(projectId);
    if (!projectData || !projectData.scenes) return;
    
    console.log(`[Phase8A Background] Starting analysis for ${projectData.scenes.length} scenes`);
    
    for (let i = 0; i < projectData.scenes.length; i++) {
      const scene = projectData.scenes[i];
      const videoUrl = scene.assets?.videoUrl || (scene.background as any)?.videoUrl;
      const imageUrl = scene.assets?.imageUrl || (scene.background as any)?.url;
      
      // Determine if this is a video scene - check both assets and background
      const isVideoScene = !!videoUrl || scene.background?.type === 'video';
      
      let base64: string | null = null;
      let mediaSource = 'image';
      
      try {
        if (isVideoScene && videoUrl) {
          // For video scenes, extract a frame for analysis
          console.log(`[Phase8A Background] Scene ${i + 1} is a video - extracting frame for analysis`);
          
          let fullVideoUrl = videoUrl;
          if (videoUrl.startsWith('/objects') || videoUrl.startsWith('/')) {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
              : 'http://localhost:5000';
            fullVideoUrl = `${baseUrl}${videoUrl}`;
          }
          
          const frameResult = await videoFrameExtractor.extractFrameAsBase64(fullVideoUrl, 2);
          if (frameResult) {
            base64 = frameResult.base64;
            mediaSource = 'video_frame';
            console.log(`[Phase8A Background] Successfully extracted frame from video`);
          } else {
            console.warn(`[Phase8A Background] Failed to extract frame from video, falling back to image`);
          }
        }
        
        // Fall back to image if no video frame extracted
        if (!base64 && imageUrl) {
          let fullUrl = imageUrl;
          if (imageUrl.startsWith('/objects') || imageUrl.startsWith('/')) {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
              : 'http://localhost:5000';
            fullUrl = `${baseUrl}${imageUrl}`;
          }
          
          const response = await fetch(fullUrl, { headers: { 'Accept': 'image/*' } });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            base64 = buffer.toString('base64');
            mediaSource = 'image';
          }
        }
        
        if (!base64) {
          console.warn(`[Phase8A Background] Scene ${i + 1} has no analyzable media`);
          continue;
        }
        
        const context: SceneContext = {
          sceneIndex: i,
          sceneType: scene.type || 'content',
          narration: scene.narration || '',
          visualDirection: scene.visualDirection || '',
          expectedContentType: (scene as any).contentType || 'lifestyle',
          totalScenes: projectData.scenes.length,
        };
        
        console.log(`[Phase8A Background] Analyzing scene ${i + 1} from ${mediaSource}`);
        const analysisResult = await sceneAnalysisService.analyzeScenePhase8(base64, context);
        projectData.scenes[i].analysisResult = analysisResult;
        projectData.scenes[i].qualityScore = analysisResult.overallScore;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (err: any) {
        console.warn(`[Phase8A Background] Scene ${i + 1} analysis failed:`, err.message);
      }
    }
    
    await saveProjectToDb(projectData, String(userId));
    console.log(`[Phase8A Background] Analysis complete for project ${projectId}`);
    
  } catch (err: any) {
    console.error('[Phase8A Background] Analysis error:', err.message);
  }
}

router.post('/projects/:projectId/generate-outline', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const text = projectData.description || '';
    if (!text.trim() || text.split(/\s+/).length < 50) {
      return res.status(400).json({ success: false, error: 'Document text too short for chapter outline (minimum ~50 words)' });
    }

    const targetDuration = projectData.totalDuration || 300;

    const { generateChapterOutline } = await import('./chapter-outline-service');
    const outline = await generateChapterOutline(text, targetDuration);

    const progress = (projectData.progress as any) || {};
    progress.chapterOutline = outline;
    progress.phase = 'outline_review';

    await db.update(universalVideoProjects)
      .set({ progress, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[GenerateOutline] Generated ${outline.chapters.length} chapters for project ${projectId}`);

    res.json({ success: true, outline });
  } catch (error: any) {
    console.error('[GenerateOutline] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/approve-outline', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { chapters } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!chapters || !Array.isArray(chapters) || chapters.length < 4) {
      return res.status(400).json({ success: false, error: 'At least 4 chapters are required' });
    }
    if (chapters.length > 8) {
      return res.status(400).json({ success: false, error: 'Maximum 8 chapters allowed' });
    }
    for (const ch of chapters) {
      if (!ch.title || typeof ch.title !== 'string' || ch.title.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'All chapters must have a non-empty title' });
      }
    }

    const progress = (projectData.progress as any) || {};
    progress.approvedOutline = chapters;
    progress.phase = 'outline_approved';

    await db.update(universalVideoProjects)
      .set({ progress, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[ApproveOutline] Approved ${chapters.length} chapters for project ${projectId}`);

    res.json({ success: true, chapters });
  } catch (error: any) {
    console.error('[ApproveOutline] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/repurpose', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { type } = req.body;

    if (!type || !['highlight', 'clips'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid repurpose type. Must be "highlight" or "clips".' });
    }

    const sourceProject = await getProjectFromDb(projectId);
    if (!sourceProject) {
      return res.status(404).json({ success: false, error: 'Source project not found' });
    }
    if (sourceProject.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const sourceProgress = (sourceProject.progress as any) || {};
    if (sourceProgress.projectType !== 'long-story') {
      return res.status(400).json({ success: false, error: 'Repurpose is only available for Long Story projects' });
    }
    if (sourceProject.status !== 'completed' && !sourceProject.outputUrl) {
      return res.status(400).json({ success: false, error: 'Source project must be completed before repurposing' });
    }

    const sourceScenes = sourceProject.scenes || [];
    if (sourceScenes.length === 0) {
      return res.status(400).json({ success: false, error: 'Source project has no scenes' });
    }

    const newProjectId = `repurpose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let newScenes: any[];
    let newTitle: string;
    let newDuration: number;
    let newPlatform: string;
    let newAspectRatio: string;

    if (type === 'highlight') {
      const scoredScenes = sourceScenes
        .filter((s: any) => s.id !== 'intro-scene-auto')
        .map((s: any, i: number) => ({ ...s, score: (s.type === 'hook' ? 10 : s.type === 'cta' ? 8 : 5) - i * 0.1 }))
        .sort((a: any, b: any) => b.score - a.score);

      newScenes = scoredScenes.slice(0, Math.min(6, scoredScenes.length)).map((s: any, i: number) => ({
        ...s,
        id: `highlight-${i}`,
        duration: Math.min(s.duration || 10, 12),
      }));
      newTitle = `${sourceProject.title} — Highlight Reel`;
      newDuration = 60;
      newPlatform = 'YouTube';
      newAspectRatio = '16:9';
    } else {
      const chapterScenes = sourceScenes.filter((s: any) => s.id !== 'intro-scene-auto');
      const chunkSize = Math.ceil(chapterScenes.length / 5);
      newScenes = [];
      for (let c = 0; c < 5 && c * chunkSize < chapterScenes.length; c++) {
        const chunk = chapterScenes.slice(c * chunkSize, (c + 1) * chunkSize);
        const bestScene = chunk.reduce((best: any, cur: any) =>
          (cur.type === 'hook' || cur.type === 'benefit') && (!best || best.type === 'content') ? cur : best, chunk[0]);
        if (bestScene) {
          newScenes.push({
            ...bestScene,
            id: `clip-${c}`,
            duration: Math.min(bestScene.duration || 10, 15),
          });
        }
      }
      newTitle = `${sourceProject.title} — Social Clips`;
      newDuration = 60;
      newPlatform = 'TikTok';
      newAspectRatio = '9:16';
    }

    const newProject = {
      projectId: newProjectId,
      title: newTitle,
      description: `Repurposed from: ${sourceProject.title}`,
      status: 'draft',
      scenes: newScenes,
      totalDuration: newDuration,
      outputFormat: { platform: newPlatform, aspectRatio: newAspectRatio },
      assets: {},
      progress: {
        phase: 'script_ready',
        projectType: type === 'highlight' ? 'youtube-ad' : 'tiktok-reels',
        artPresetId: (sourceProject.progress as any)?.artPresetId || 'auto',
        completedSteps: ['script'],
        steps: {
          script: { status: 'complete', progress: 100, message: 'Repurposed from long-form' },
          voiceover: { status: 'pending', progress: 0, message: '' },
          images: { status: 'pending', progress: 0, message: '' },
          videos: { status: 'pending', progress: 0, message: '' },
          music: { status: 'pending', progress: 0, message: '' },
          assembly: { status: 'pending', progress: 0, message: '' },
        },
      },
      ownerId: userId,
    };

    await saveProjectToDb(newProject, userId);
    console.log(`[Repurpose] Created ${type} project ${newProjectId} from ${projectId} with ${newScenes.length} scenes`);

    res.json({ success: true, projectId: newProjectId, scenesCount: newScenes.length });
  } catch (error: any) {
    console.error('[Repurpose] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/generate-script', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    let script = projectData.description || '';
    if (!script.trim()) {
      return res.status(400).json({ success: false, error: 'No script/description to parse' });
    }

    const platform = projectData.outputFormat?.platform || 'YouTube';
    const targetDuration = projectData.totalDuration || 60;
    const visualStyle = (projectData as any).visualStyle || req.body?.visualStyle || 'lifestyle';
    const numScenes = req.body?.numScenes || undefined;

    let productContext = (projectData.progress as any)?.productContext || null;
    const artPresetIdFromProgress = (projectData.progress as any)?.artPresetId || undefined;
    const artPresetIdsFromProgress: string[] | undefined = (projectData.progress as any)?.artPresetIds || undefined;
    const productMediaUrl = (projectData.progress as any)?.productMediaUrl || (projectData.assets as any)?.productMediaUrl || null;
    const scriptPresets = (projectData.progress as any)?.scriptPresets || null;
    const projectType = (projectData.progress as any)?.projectType || null;
    const contentStructure = (projectData.progress as any)?.contentStructure || null;
    const approvedOutline = (projectData.progress as any)?.approvedOutline || null;

    if (approvedOutline && Array.isArray(approvedOutline) && approvedOutline.length > 0) {
      const chapterDirective = approvedOutline.map((ch: any, idx: number) =>
        `CHAPTER ${idx + 1}: "${ch.title}" (~${ch.estimatedDuration}s, ${ch.recommendedSceneCount} scenes)\n  Summary: ${ch.summary}\n  Key topics: ${(ch.keyTopics || []).join(', ')}`
      ).join('\n\n');

      script = `[CHAPTER STRUCTURE - Generate scenes following this exact chapter order. Start each chapter with a title card scene (type "chapter-title"). Add a bridge narration sentence at the end of each chapter leading into the next.]\n\n${chapterDirective}\n\n---\n\nSOURCE CONTENT:\n${script}`;
    }

    if (!productContext && productMediaUrl && /\.(jpg|jpeg|png|webp)$/i.test(productMediaUrl)) {
      try {
        const { analyzeProductImage } = await import('./product-analysis-service');
        console.log(`[GenerateScript] Product context missing but media exists — running inline analysis`);
        productContext = await analyzeProductImage(productMediaUrl, script, scriptPresets);
        const freshProject = await getProjectFromDb(projectId);
        if (freshProject) {
          const latestProgress = (freshProject.progress as any) || {};
          latestProgress.productContext = productContext;
          latestProgress.productAnalysisStatus = 'complete';
          await db.update(universalVideoProjects)
            .set({ progress: latestProgress, updatedAt: new Date() })
            .where(eq(universalVideoProjects.projectId, projectId));
        }
      } catch (err: any) {
        console.warn(`[GenerateScript] Inline product analysis failed:`, err.message);
      }
    }

    console.log(`[GenerateScript] Generating script for project ${projectId} - ${targetDuration}s, ${platform}, style: ${visualStyle}${productContext ? `, product: ${productContext.productName}` : ''}`);

    const isChapterBased = approvedOutline && Array.isArray(approvedOutline) && approvedOutline.length > 0;

    let scenes: any[];
    let summary: any;
    let pipelineStrategy: any = null;
    let pipelineNarrative: any = null;

    if (isChapterBased) {
      const parsed = await universalVideoService.parseScriptWithBrandMatches({
        title: 'Generated Script',
        script,
        platform: platform as ScriptVideoInput['platform'],
        style: 'professional',
        targetDuration,
        artPresetId: artPresetIdFromProgress,
        artPresetIds: artPresetIdsFromProgress,
        productContext,
        scriptPresets,
        projectType,
        contentStructure,
      });
      scenes = parsed.scenes;
      summary = parsed.summary;
      if (artPresetIdsFromProgress && artPresetIdsFromProgress.length > 1) {
        const { assignMultiStyleToScenes } = await import("./script-pipeline-service");
        await assignMultiStyleToScenes(scenes, artPresetIdsFromProgress);
        console.log(`[GenerateScript] Chapter-based multi-style assignment completed`);
      }
    } else {
      const trendHooks = (projectData.progress as any)?.selectedTrendHooks || null;
      const pipelineResult = await runScriptPipeline({
        description: script,
        platform,
        targetDuration,
        targetAudience: projectData.targetAudience || null,
        artPresetId: artPresetIdFromProgress,
        artPresetIds: artPresetIdsFromProgress,
        productContext,
        scriptPresets,
        projectType,
        contentStructure,
        trendHooks,
      });
      scenes = pipelineResult.scenes;
      summary = pipelineResult.summary;
      pipelineStrategy = pipelineResult.strategy;
      pipelineNarrative = pipelineResult.narrative;
    }

    if (productMediaUrl && scenes.length > 0) {
      const productSceneTypes = ['product', 'solution', 'hero', 'benefit', 'proof'];
      let targetScene = scenes.find((s: any) => productSceneTypes.includes(s.type));
      if (!targetScene) {
        const midIndex = Math.min(Math.floor(scenes.length / 2), scenes.length - 1);
        targetScene = scenes[midIndex];
      }
      if (targetScene) {
        let resolvedProductUrl = productMediaUrl;
        if (productMediaUrl.startsWith('/uploads/')) {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000');
          resolvedProductUrl = `${baseUrl}${productMediaUrl}`;
        }
        targetScene.brandAssetUrl = resolvedProductUrl;
        console.log(`[GenerateScript] Assigned product image to scene "${targetScene.id}" (type: ${targetScene.type}) for I2V generation: ${resolvedProductUrl.substring(0, 80)}`);
      }
    }

    if (numScenes && scenes.length > numScenes) {
      scenes = scenes.slice(0, numScenes);
    }

    if (isChapterBased) {
      const totalSuggested = approvedOutline.reduce((sum: number, ch: any) => sum + (ch.recommendedSceneCount || 3), 0);
      const chapterBoundaries: number[] = [];
      let cumulative = 0;
      for (const ch of approvedOutline) {
        const ratio = (ch.recommendedSceneCount || 3) / totalSuggested;
        cumulative += Math.round(ratio * scenes.length);
        chapterBoundaries.push(Math.min(cumulative, scenes.length));
      }
      chapterBoundaries[chapterBoundaries.length - 1] = scenes.length;

      let chapterIdx = 0;
      for (let i = 0; i < scenes.length; i++) {
        while (chapterIdx < chapterBoundaries.length - 1 && i >= chapterBoundaries[chapterIdx]) {
          chapterIdx++;
        }
        const scene = scenes[i] as any;
        scene.chapterIndex = chapterIdx;
        scene.chapterTitle = approvedOutline[chapterIdx]?.title || '';
      }
      const scenesWithTitleCards: any[] = [];
      let lastChapterIdx = -1;
      for (const scene of scenes) {
        const s = scene as any;
        if (s.chapterIndex !== lastChapterIdx) {
          scenesWithTitleCards.push({
            id: `chapter-title-${s.chapterIndex}`,
            order: scenesWithTitleCards.length,
            type: 'chapter-title',
            duration: 3,
            narration: '',
            visualDirection: `Chapter ${(s.chapterIndex ?? 0) + 1}: ${s.chapterTitle}`,
            textOverlays: [{
              text: s.chapterTitle || `Chapter ${(s.chapterIndex ?? 0) + 1}`,
              position: 'center',
              style: 'title',
            }],
            background: { type: 'color', color: '#1a1a2e' },
            transitionIn: { type: 'fade', duration: 0.5 },
            transitionOut: { type: 'fade', duration: 0.5 },
            chapterIndex: s.chapterIndex,
            chapterTitle: s.chapterTitle,
            textImageEnabled: true,
          });
          lastChapterIdx = s.chapterIndex;
        }
        s.order = scenesWithTitleCards.length;
        scenesWithTitleCards.push(s);
      }
      scenes = scenesWithTitleCards;
      console.log(`[GenerateScript] Tagged ${scenes.length} scenes (incl. ${approvedOutline.length} title cards) across ${approvedOutline.length} chapters`);

      try {
        const { enhanceChapterTitleVisualDirections } = await import("./script-pipeline-service");
        let chapterBrandName: string | undefined;
        try {
          const ctx = await brandContextService.getVisualDirectionGenerationContext();
          const nameMatch = ctx?.match(/Brand:\s*(.+)/i);
          chapterBrandName = nameMatch?.[1]?.trim() || projectData.title;
        } catch { chapterBrandName = projectData.title; }
        await enhanceChapterTitleVisualDirections(scenes, chapterBrandName);
        console.log(`[GenerateScript] Enhanced chapter title visual directions with cinematic metaphors`);
      } catch (chapterErr: any) {
        console.warn(`[GenerateScript] Chapter title enhancement failed, using defaults: ${chapterErr.message}`);
      }

      try {
        const { enhanceChapterScenesWithStage4 } = await import("./script-pipeline-service");
        console.log(`[GenerateScript] Running Stage 4 cinematic enhancement on chapter content scenes...`);
        scenes = await enhanceChapterScenesWithStage4(scenes, {
          platform: platform as string,
          targetDuration,
          artPresetId: artPresetIdFromProgress,
          artPresetIds: artPresetIdsFromProgress,
          productContext,
          scriptPresets,
          projectType,
          contentStructure,
        });
        console.log(`[GenerateScript] Chapter Stage 4 cinematic enhancement complete`);
      } catch (stage4Err: any) {
        console.warn(`[GenerateScript] Chapter Stage 4 enhancement failed, using original visual directions: ${stage4Err.message}`);
      }
    }

    projectData.scenes = scenes;
    projectData.progress = {
      ...projectData.progress,
      phase: 'script_ready',
      currentStep: '',
      overallPercent: 0,
      completedSteps: ['script'],
      steps: {
        script: { status: 'complete', progress: 100, message: 'Script generated' },
        voiceover: { status: 'pending', progress: 0, message: '' },
        images: { status: 'pending', progress: 0, message: '' },
        videos: { status: 'pending', progress: 0, message: '' },
        music: { status: 'pending', progress: 0, message: '' },
        assembly: { status: 'pending', progress: 0, message: '' },
      },
    };

    const dbUpdate: any = {
      scenes: projectData.scenes,
      progress: projectData.progress,
      totalDuration: summary?.totalDuration || targetDuration,
      updatedAt: new Date(),
    };
    if (pipelineStrategy) dbUpdate.scriptStrategy = pipelineStrategy;
    if (pipelineNarrative) dbUpdate.scriptNarrative = pipelineNarrative;

    await db.update(universalVideoProjects)
      .set(dbUpdate)
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[GenerateScript] Generated ${scenes.length} scenes for project ${projectId}${pipelineStrategy ? ' (pipeline)' : ' (chapter-based)'}`);

    res.json({
      success: true,
      scenes,
      summary,
      strategy: pipelineStrategy || undefined,
    });
  } catch (error: any) {
    console.error('[GenerateScript] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/scenes/:sceneId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const updates = req.body;
    const updateKeys = Object.keys(updates);
    console.log(`[UpdateScene] PATCH scene ${sceneId} in project ${projectId} - fields: ${updateKeys.join(', ')}`);

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scenes = projectData.scenes || [];
    const sceneIndex = scenes.findIndex((s: any) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const allowedFields = ['narration', 'visualDirection', 'duration', 'type', 'name', 'title', 'searchQuery', 'keyPoints', 'overlayItems', 'microScenes', 'contentTag', 'artPresetId', 'textImageEnabled'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        (scenes[sceneIndex] as any)[field] = updates[field];
      }
    }
    if (updates.overlayItems !== undefined) {
      console.log(`[UpdateScene] Saving overlayItems for scene ${sceneId}: ${updates.overlayItems.length} items`, JSON.stringify(updates.overlayItems.map((o: any) => ({ name: o.name, url: o.url?.substring(0, 60) }))));
    }

    if (updates.referenceImages !== undefined) {
      if (!scenes[sceneIndex].assets) {
        (scenes[sceneIndex] as any).assets = {};
      }
      (scenes[sceneIndex] as any).assets.referenceImages = updates.referenceImages;
    }

    if (updates.referenceVideoUrl !== undefined) {
      if (!scenes[sceneIndex].assets) {
        (scenes[sceneIndex] as any).assets = {};
      }
      (scenes[sceneIndex] as any).assets.referenceVideoUrl = updates.referenceVideoUrl;
    }

    if (updates.clearImage) {
      if (scenes[sceneIndex].assets) {
        scenes[sceneIndex].assets.imageUrl = '';
        scenes[sceneIndex].assets.imageProvider = '';
      }
      if (scenes[sceneIndex].background) {
        scenes[sceneIndex].background.url = '';
        scenes[sceneIndex].background.mediaUrl = '';
      }
      const assets = projectData.assets as any;
      if (assets?.images) {
        assets.images = assets.images.filter((img: any) => img.sceneId !== sceneId);
      }
      await db.update(universalVideoProjects)
        .set({
          scenes,
          assets,
          updatedAt: new Date(),
        })
        .where(eq(universalVideoProjects.projectId, projectId));
    } else {
    await db.update(universalVideoProjects)
      .set({
        scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));
    }

    res.json({ success: true, scene: scenes[sceneIndex] });
  } catch (error: any) {
    console.error('[UpdateScene] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/projects/:projectId/scenes/:sceneId/micro-scenes/:msIdx/overlays', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId, msIdx: msIdxStr } = req.params;
    const msIdx = parseInt(msIdxStr, 10);
    const { overlayItems } = req.body;

    if (isNaN(msIdx) || msIdx < 0) {
      return res.status(400).json({ success: false, error: 'Invalid micro-scene index' });
    }
    if (!Array.isArray(overlayItems)) {
      return res.status(400).json({ success: false, error: 'overlayItems must be an array' });
    }

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scenes = projectData.scenes || [];
    const sceneIndex = scenes.findIndex((s: any) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const scene = scenes[sceneIndex] as any;
    const microScenes = scene.microScenes || [];
    if (msIdx >= microScenes.length) {
      return res.status(404).json({ success: false, error: 'Micro-scene not found' });
    }

    microScenes[msIdx].overlayItems = overlayItems;

    await db.update(universalVideoProjects)
      .set({
        scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, microScene: microScenes[msIdx] });
  } catch (error: any) {
    console.error('[UpdateMicroSceneOverlays] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/projects/:projectId/scenes/:sceneId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scenes = (projectData.scenes || []).filter((s: any) => s.id !== sceneId);

    await db.update(universalVideoProjects)
      .set({
        scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, scenes });
  } catch (error: any) {
    console.error('[DeleteScene] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/generate-assets', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { skipMusic, skipAnalysis, voiceId, referenceImages, videoProvider } = req.body || {};
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (voiceId) {
      (projectData as any).voiceId = voiceId;
      (projectData as any).voiceoverSettings = {
        ...((projectData as any).voiceoverSettings || {}),
        enabled: true,
        voiceId,
      };
    }
    if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      (projectData as any).referenceImages = referenceImages;
      if (!projectData.assets) projectData.assets = {} as any;
      (projectData.assets as any).referenceImages = referenceImages;
    }
    if (videoProvider) {
      (projectData as any).preferredVideoProvider = videoProvider;
    }
    
    console.log('[UniversalVideo] Queuing asset generation for project:', projectId, skipMusic ? '(music disabled)' : '', voiceId ? `voice: ${voiceId}` : '');
    
    projectData.status = 'queued';
    if (!projectData.progress) {
      projectData.progress = {};
    }
    projectData.progress.overallPercent = 0;
    projectData.progress.currentStep = 'voiceover';
    projectData.progress.completedSteps = [];
    projectData.progress.errors = [];
    projectData.progress.serviceFailures = [];
    if (projectData.progress.steps && typeof projectData.progress.steps === 'object') {
      for (const step of Object.keys(projectData.progress.steps)) {
        const s = (projectData.progress.steps as any)[step];
        if (s && typeof s === 'object') {
          s.status = 'pending';
          s.progress = 0;
          s.message = '';
        }
      }
    }
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log('[UniversalVideo] Project queued for worker processing:', projectId);
    
    res.json({
      success: true,
      project: projectData,
      queued: true,
      message: 'Asset generation queued - the dedicated video worker will process this shortly.',
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error queuing asset generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/generate-step', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { step, skipMusic } = req.body || {};

    const validSteps = ['voiceover', 'images', 'videos', 'music', 'assembly'];
    if (!step || !validSteps.includes(step)) {
      return res.status(400).json({ success: false, error: `Invalid step. Must be one of: ${validSteps.join(', ')}` });
    }

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    console.log(`[UniversalVideo] Step-by-step generation: running step "${step}" for project ${projectId}`);

    projectData.status = 'generating';
    projectData.progress.errors = [];
    projectData.progress.serviceFailures = [];
    await saveProjectToDb(projectData, projectData.ownerId);

    const onProgress = async (p: any) => {
      try {
        await saveProjectToDb(p, projectData.ownerId);
      } catch (err: any) {
        console.log(`[UniversalVideo] Step progress save warning: ${err.message}`);
      }
    };

    const updatedProject = await universalVideoService.generateProjectAssets(
      projectData,
      { skipMusic: skipMusic ?? false, onProgress, targetStep: step as any }
    );

    await saveProjectToDb(updatedProject, projectData.ownerId);

    console.log(`[UniversalVideo] Step "${step}" completed for project ${projectId}`);

    res.json({
      success: true,
      project: updatedProject,
      completedStep: step,
      message: `Step "${step}" completed successfully.`,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error in step-by-step generation:', error);

    try {
      const failedProject = await getProjectFromDb(req.params.projectId);
      if (failedProject) {
        failedProject.status = 'draft';
        failedProject.progress.errors = failedProject.progress.errors || [];
        failedProject.progress.errors.push(`Step generation error: ${error.message}`);
        await saveProjectToDb(failedProject, failedProject.ownerId);
      }
    } catch (dbErr: any) {
      console.error('[UniversalVideo] Failed to save error status:', dbErr.message);
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/skip-to-step', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { targetStep } = req.body || {};

    const validTargets = ['music', 'assembly', 'render'];
    if (!targetStep || !validTargets.includes(targetStep)) {
      return res.status(400).json({ success: false, error: `Invalid target step. Must be one of: ${validTargets.join(', ')}` });
    }

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!projectData.progress) {
      projectData.progress = { currentStep: '', overallPercent: 0, steps: {} as any, errors: [], serviceFailures: [] };
    }
    if (!projectData.progress.steps) {
      projectData.progress.steps = {} as any;
    }

    const stepOrder = ['voiceover', 'images', 'videos', 'music', 'assembly'];
    const targetIndex = targetStep === 'render' ? stepOrder.length : stepOrder.indexOf(targetStep);

    for (let i = 0; i < targetIndex; i++) {
      const stepName = stepOrder[i] as keyof typeof projectData.progress.steps;
      if (!projectData.progress.steps[stepName]) {
        (projectData.progress.steps as any)[stepName] = { status: 'skipped', progress: 0 };
      } else if (projectData.progress.steps[stepName].status !== 'complete') {
        projectData.progress.steps[stepName].status = 'skipped';
      }
    }

    projectData.status = 'draft';
    await saveProjectToDb(projectData, projectData.ownerId);

    console.log(`[UniversalVideo] Skipped to step "${targetStep}" for project ${projectId}`);

    res.json({
      success: true,
      project: projectData,
      message: `Skipped ahead to ${targetStep}. Previous steps marked as skipped.`,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error in skip-to-step:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/reset-status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Reset project status to ready for retry
    projectData.status = 'ready';
    projectData.progress.steps.rendering.status = 'pending';
    projectData.progress.steps.rendering.progress = 0;
    projectData.progress.steps.rendering.message = '';
    delete (projectData.progress as any).renderStartedAt;
    delete (projectData.progress as any).renderStatus;
    delete (projectData.progress as any).renderMethod;
    delete (projectData.progress as any).lastProgressValue;
    delete (projectData.progress as any).lastProgressUpdateAt;
    projectData.progress.errors = [];
    projectData.progress.overallPercent = 85;
    projectData.updatedAt = new Date().toISOString();
    
    // Save project state and clear render metadata
    await db.update(universalVideoProjects)
      .set({
        status: projectData.status,
        progress: projectData.progress,
        updatedAt: new Date(),
        renderId: null,
        bucketName: null,
        outputUrl: null,
      })
      .where(eq(universalVideoProjects.projectId, projectId));
    
    // Clear local render metadata from response
    delete (projectData as any).renderId;
    delete (projectData as any).bucketName;
    delete (projectData as any).outputUrl;
    
    console.log(`[UniversalVideo] Reset project ${projectId} status to ready for retry`);
    
    res.json({ 
      success: true, 
      project: projectData,
      message: 'Project reset. You can now retry rendering.'
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error resetting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const renderBuckets: Map<string, string> = new Map();

router.post('/projects/:projectId/render', isAuthenticated, async (req: Request, res: Response) => {
  console.log('\n\n========================================');
  console.log('🎬 [RENDER] POST /render endpoint HIT!');
  console.log('========================================\n');
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const { projectId } = req.params;
    const { forceRender } = req.body;
    console.log('🎬 [RENDER] Project:', projectId, 'User:', userId, 'Role:', userRole);
    
    // Phase 10D: Security - forceRender only allowed for admin role
    const isAdminForceRender = forceRender && userRole === 'admin';
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Allow rendering for ready/draft/error/complete projects
    // Quick Create projects may stay in 'draft' status with assets ready
    const renderableStatuses = ['ready', 'draft', 'error', 'complete', 'completed', 'scenes-ready'];
    if (!renderableStatuses.includes(projectData.status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Project must be ready before rendering. Current status: ${projectData.status}` 
      });
    }
    
    console.log('[UniversalVideo] Starting render for project:', projectId);
    
    // Ensure Quick Create visual asset is populated (fix race condition where voiceover/music overwrites visual)
    const qcAssets = (projectData as any).assets?.quickCreate;
    if (qcAssets && (!qcAssets.visual?.url || (qcAssets.visual?.url && qcAssets.visual?.duration == null))) {
      const missingUrl = !qcAssets.visual?.url;
      console.log(`[PrepareAssets] Quick Create visual ${missingUrl ? 'missing' : 'missing duration'}, checking video_generation_jobs fallback...`);
      try {
        const [latestJob] = await db
          .select()
          .from(videoGenerationJobs)
          .where(eq(videoGenerationJobs.projectId, projectId))
          .orderBy(desc(videoGenerationJobs.createdAt))
          .limit(1);
        
        if (latestJob?.status === 'completed' && latestJob.videoUrl) {
          const jobUrl = latestJob.videoUrl;
          const jobIsVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(jobUrl) || latestJob.sceneType === 'video';
          
          if (missingUrl) {
            console.log(`[PrepareAssets] Found visual from job fallback: ${jobUrl.substring(0, 60)}... (isVideo: ${jobIsVideo}, duration: ${latestJob.duration})`);
            if (!projectData.assets) projectData.assets = {} as any;
            (projectData as any).assets.quickCreate = {
              ...qcAssets,
              visual: {
                status: 'completed',
                url: jobUrl,
                videoUrl: jobIsVideo ? jobUrl : undefined,
                imageUrl: !jobIsVideo ? jobUrl : undefined,
                type: jobIsVideo ? 'video' : 'image',
                provider: latestJob.provider || 'kling',
                duration: latestJob.duration ?? undefined,
                error: null,
              },
            };
          } else if (latestJob.duration) {
            console.log(`[PrepareAssets] Recovered visual duration from job: ${latestJob.duration}s`);
            (projectData as any).assets.quickCreate.visual.duration = latestJob.duration;
          }
        }
      } catch (err: any) {
        console.warn('[PrepareAssets] Job fallback lookup failed:', err.message);
      }
    }
    
    console.log('[UniversalVideo] Preparing assets for Lambda...');
    const assetPrep = await universalVideoService.prepareAssetsForLambda(projectData);
    
    if (!assetPrep.valid) {
      console.error('[UniversalVideo] Asset preparation failed:', assetPrep.issues);
      return res.status(400).json({
        success: false,
        error: 'Asset preparation failed - no valid scene images',
        issues: assetPrep.issues,
      });
    }
    
    if (assetPrep.issues.length > 0) {
      console.warn('[UniversalVideo] Asset preparation warnings:', assetPrep.issues);
    }
    
    const preparedProject = assetPrep.preparedProject;
    
    preparedProject.status = 'rendering';
    if (!preparedProject.progress) preparedProject.progress = {} as any;
    if (!preparedProject.progress.steps) preparedProject.progress.steps = {} as any;
    if (!preparedProject.progress.steps.rendering) preparedProject.progress.steps.rendering = {} as any;
    preparedProject.progress.currentStep = 'rendering';
    preparedProject.progress.steps.rendering.status = 'in-progress';
    preparedProject.progress.steps.rendering.progress = 0;
    preparedProject.progress.steps.rendering.message = 'Starting render...';
    (preparedProject.progress as any).lastProgressValue = 0;
    (preparedProject.progress as any).lastProgressUpdateAt = Date.now();
    delete (preparedProject.progress as any).renderStatus;
    if (!preparedProject.progress.errors) preparedProject.progress.errors = [];
    preparedProject.progress.errors = [];
    preparedProject.updatedAt = new Date().toISOString();
    
    console.log('[UniversalVideo] Render state reset - cleared stall detection, renderStatus, and errors');
    
    if (!preparedProject.outputFormat) preparedProject.outputFormat = { aspectRatio: '16:9', resolution: '1080p' } as any;
    const compositionId = getCompositionId(preparedProject.outputFormat.aspectRatio || '16:9');
    
    const getPublicAssetUrl = async (relativeUrl: string): Promise<string> => {
      if (!relativeUrl) return '';
      
      if (relativeUrl.startsWith('https://') && !relativeUrl.includes('.replit.dev')) {
        return relativeUrl;
      }
      
      const resolved = await assetUrlResolver.resolve(relativeUrl);
      if (resolved) {
        console.log(`[UniversalVideo] Resolved asset URL: ${relativeUrl} -> ${resolved.substring(0, 60)}...`);
        return resolved;
      }
      
      if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
        console.warn(`[UniversalVideo] Asset URL resolver failed, using original URL: ${relativeUrl.substring(0, 60)}...`);
        return relativeUrl;
      }
      
      console.error(`[UniversalVideo] Failed to resolve asset URL to public URL: ${relativeUrl}`);
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';
      return `${baseUrl}${relativeUrl}`;
    };
    
    // Resolve brand context for end card and render
    const renderBrandCtx = await getAnyBrandContext();
    const brandCtxForEndCard = renderBrandCtx.brandName
      ? { name: renderBrandCtx.brandName, tagline: renderBrandCtx.tagline, website: renderBrandCtx.website, colors: { primary: renderBrandCtx.primaryColor, secondary: renderBrandCtx.secondaryColor, accent: renderBrandCtx.accentColor }, logoUrl: renderBrandCtx.logoUrl }
      : null;
    const effectiveBrand = preparedProject.brand && Object.keys(preparedProject.brand).length > 0
      ? preparedProject.brand
      : brandCtxForEndCard;

    // Phase 16: Build end card config from settings
    const endCardSettings = (preparedProject as any).endCardSettings;
    const outroEnabledFlag = (projectData as any).outroEnabled;
    let endCardConfig: any = undefined;
    console.log('[UniversalVideo] Phase 16 End Card - endCardSettings:', JSON.stringify(endCardSettings || 'undefined'));
    console.log('[UniversalVideo] Phase 16 End Card - outroEnabled:', outroEnabledFlag);
    console.log('[UniversalVideo] Phase 16 End Card - brand.logoUrl:', preparedProject.brand?.logoUrl || 'EMPTY');
    if (outroEnabledFlag === false) {
      endCardConfig = { enabled: false, duration: 0, background: { type: 'solid' as const, color: '#000' }, logo: { url: '', size: 0, position: { x: 0, y: 0 }, animation: 'none' as const }, contact: { delay: 0, animation: 'fade' as const, style: { fontSize: 0, color: '#000' } } };
      console.log('[Render] Outro/end card disabled by outroEnabled flag');
    } else if (endCardSettings?.enabled !== false) {
      let cachedLogoUrl = '';
      
      const sourceLogoUrl = endCardSettings?.logoUrl || preparedProject.brand?.logoUrl || effectiveBrand?.logoUrl || '';
      cachedLogoUrl = await assetUrlResolver.resolve(sourceLogoUrl) || '';
      if (cachedLogoUrl) {
        console.log('[UniversalVideo] End card logo from asset resolver:', sourceLogoUrl, '->', cachedLogoUrl);
      }
      
      if (!cachedLogoUrl) {
        console.error('[UniversalVideo] End card logo URL could not be resolved - logo will not appear');
      }
      const userSelectedEndCardBg = endCardSettings?.backgroundUrl || null;
      let endCardBgUrl = userSelectedEndCardBg;
      if (!endCardBgUrl) {
        const s3EndCard = await s3RenderAssetService.getRandomEndCard();
        endCardBgUrl = s3EndCard ? s3EndCard.url : null;
        if (s3EndCard) {
          console.log('[UniversalVideo] End card background from S3 (random):', s3EndCard.name);
        }
      } else {
        console.log('[UniversalVideo] End card background from user selection:', userSelectedEndCardBg);
      }
      
      endCardConfig = {
        enabled: true,
        duration: endCardSettings?.duration || 5,
        background: endCardBgUrl ? {
          type: 'image' as const,
          imageUrl: endCardBgUrl,
        } : {
          type: 'animated-gradient' as const,
          gradient: {
            colors: [
              effectiveBrand?.colors?.primary || '#1a1a2e',
              effectiveBrand?.colors?.secondary || '#16213e',
              effectiveBrand?.colors?.accent ? effectiveBrand.colors.accent + '33' : '#0d1b2a'
            ],
            angle: 145,
          },
        },
        logo: {
          url: cachedLogoUrl,
          size: endCardSettings?.logoSize || 28,
          position: { x: 50, y: endCardSettings?.logoPositionY || 32 },
          animation: (endCardSettings?.logoAnimation || 'scale-bounce') as any,
        },
        tagline: {
          text: endCardSettings?.taglineText || '',
          delay: 0.8,
          animation: (endCardSettings?.taglineAnimation || 'typewriter') as any,
          positionY: endCardSettings?.taglinePositionY || 55,
          style: {
            fontSize: endCardSettings?.taglineFontSize || 28,
            fontFamily: `'${endCardSettings?.taglineFontFamily || 'Great Vibes'}', cursive`,
            color: endCardSettings?.taglineColor || '#E8D5B7',
            fontWeight: endCardSettings?.taglineFontWeight ?? (endCardSettings?.taglineBold ? 700 : 400),
          },
        },
        contact: {
          website: endCardSettings?.contactWebsite || '',
          phone: endCardSettings?.contactPhone || '',
          email: endCardSettings?.contactEmail || '',
          delay: 1.8,
          animation: (endCardSettings?.contactAnimation || 'stagger') as any,
          positionY: endCardSettings?.websitePositionY || 75,
          style: {
            fontSize: endCardSettings?.websiteFontSize || 22,
            fontFamily: `'${endCardSettings?.websiteFontFamily || 'Inter'}', sans-serif`,
            color: endCardSettings?.websiteColor || '#FFFFFF',
            fontWeight: endCardSettings?.websiteFontWeight ?? (endCardSettings?.websiteBold ? 700 : 500),
          },
        },
        // Phase 18E: Social icons
        social: endCardSettings?.socialIcons?.length ? {
          icons: endCardSettings.socialIcons,
          size: endCardSettings.socialSize || 36,
          delay: endCardSettings.socialDelay || 2.5,
          animation: (endCardSettings.socialAnimation || 'pop') as 'pop' | 'fade' | 'stagger',
        } : {
          icons: [],
          size: 36,
          delay: 2.5,
          animation: 'pop' as const,
        },
        ambientEffect: {
          type: (endCardSettings?.ambientEffect || 'bokeh') as 'particles' | 'bokeh' | 'none',
          color: 'rgba(232, 213, 183, 0.3)',
          intensity: endCardSettings?.ambientIntensity || 40,
        },
      };
      console.log('[UniversalVideo] Phase 18E: End card config built with logo:', endCardConfig.logo.url?.substring(0, 50));
      console.log('[UniversalVideo] End card contact:', JSON.stringify({ website: endCardConfig.contact.website, animation: endCardConfig.contact.animation, positionY: endCardConfig.contact.positionY }));
      
      const selectedOutroTemplate = (preparedProject as any).outroTemplate || 'animated';
      const hasUserLogoSize = endCardSettings?.logoSize != null;
      const hasUserLogoAnim = endCardSettings?.logoAnimation != null;
      const hasUserTaglineAnim = endCardSettings?.taglineAnimation != null;
      console.log(`[Render] Outro template: ${selectedOutroTemplate}`);
      if (selectedOutroTemplate === 'cinematic') {
        if (!endCardBgUrl) {
          endCardConfig.background = {
            type: 'animated-gradient' as const,
            gradient: { colors: ['#0a0a1a', '#1a0a2e', '#0d1b2a'], angle: 160 },
          };
        }
        if (endCardConfig.logo) {
          if (!hasUserLogoAnim) endCardConfig.logo.animation = 'fade';
          if (!hasUserLogoSize) endCardConfig.logo.size = 32;
        }
        if (endCardConfig.tagline) {
          if (!hasUserTaglineAnim) endCardConfig.tagline.animation = 'fade';
          endCardConfig.tagline.style = { ...endCardConfig.tagline.style, fontSize: 32, letterSpacing: 3 };
        }
        endCardConfig.ambientEffect = { type: 'bokeh' as const, color: 'rgba(200, 180, 255, 0.2)', intensity: 25 };
      } else if (selectedOutroTemplate === 'minimal') {
        endCardConfig.background = { type: 'solid' as const, color: '#111111' };
        if (endCardConfig.logo) {
          if (!hasUserLogoAnim) endCardConfig.logo.animation = 'fade';
          if (!hasUserLogoSize) endCardConfig.logo.size = 24;
        }
        if (endCardConfig.tagline) {
          if (!hasUserTaglineAnim) endCardConfig.tagline.animation = 'fade';
          endCardConfig.tagline.style = { ...endCardConfig.tagline.style, fontSize: 24 };
        }
        endCardConfig.ambientEffect = { type: 'none' as const, color: 'transparent', intensity: 0 };
      }
    }
    
    // Phase 16: Build sound design config from settings
    const soundDesignSettings = (preparedProject as any).soundDesignSettings;
    let soundDesignConfig: any = undefined;
    if (soundDesignSettings?.enabled !== false) {
      // Validate SFX files exist in S3 Render Assets (audio/sfx/) managed via Asset Library UI
      const sfxAssets = await s3RenderAssetService.listAssets('sfx');
      const sfxNames = sfxAssets.map(a => a.name.toLowerCase());
      const whooshValid = sfxNames.some(n => n.includes('whoosh'));
      const riseSwellValid = sfxNames.some(n => n.includes('rise-swell') || n.includes('swell'));
      const logoImpactValid = sfxNames.some(n => n.includes('logo-impact') || n.includes('impact'));
      const roomToneType = soundDesignSettings?.ambientType === 'warm' ? 'room-tone-warm' : 'room-tone';
      const ambientValid = sfxNames.some(n => n.includes(roomToneType) || n.includes('ambient'));

      const transitionsEnabled = whooshValid && (soundDesignSettings?.transitionSounds !== false);
      const impactsEnabled = (logoImpactValid || riseSwellValid) && (soundDesignSettings?.impactSounds !== false);
      const ambientEnabled = ambientValid && (soundDesignSettings?.ambientLayer !== false);
      const anyEnabled = transitionsEnabled || impactsEnabled || ambientEnabled;

      console.log(`[UniversalVideo] SFX from S3 Render Assets (audio/sfx/): ${sfxAssets.length} files found - whoosh=${whooshValid}, riseSwell=${riseSwellValid}, logoImpact=${logoImpactValid}, ambient=${ambientValid}`);

      soundDesignConfig = {
        enabled: anyEnabled,
        transitionSounds: transitionsEnabled,
        impactSounds: impactsEnabled,
        ambientLayer: ambientEnabled,
        ambientType: soundDesignSettings?.ambientType || 'nature',
        masterVolume: soundDesignSettings?.masterVolume ?? 1.0,
        audioDucking: {
          enabled: true,
          baseVolume: soundDesignSettings?.audioDucking?.baseVolume ?? 0.35,
          duckLevel: soundDesignSettings?.audioDucking?.duckLevel ?? 0.1,
          fadeFrames: soundDesignSettings?.audioDucking?.fadeFrames ?? 15,
        },
      };
      console.log('[UniversalVideo] Phase 16/18D: Sound design config built:', soundDesignConfig);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 18F: Build film treatment config from settings or style
    // ═══════════════════════════════════════════════════════════════
    const filmTreatmentSettings = (preparedProject as any).filmTreatmentSettings;
    let filmTreatmentConfig: any = undefined;
    
    if (filmTreatmentSettings?.enabled !== false) {
      // Map visual style to film treatment preset
      const styleToPreset: Record<string, any> = {
        'hero': { colorGrade: 'warm-cinematic', colorIntensity: 1.0, grainIntensity: 0.04, vignetteIntensity: 0.25 },
        'cinematic': { colorGrade: 'warm-cinematic', colorIntensity: 1.0, grainIntensity: 0.04, vignetteIntensity: 0.25 },
        'lifestyle': { colorGrade: 'natural-organic', colorIntensity: 1.0, grainIntensity: 0.03, vignetteIntensity: 0.15 },
        'product': { colorGrade: 'cool-corporate', colorIntensity: 0.8, grainIntensity: 0.02, vignetteIntensity: 0.1 },
        'educational': { colorGrade: 'natural-organic', colorIntensity: 0.9, grainIntensity: 0.02, vignetteIntensity: 0.1 },
        'training': { colorGrade: 'natural-organic', colorIntensity: 0.9, grainIntensity: 0.02, vignetteIntensity: 0.1 },
        'instructional': { colorGrade: 'natural-organic', colorIntensity: 0.9, grainIntensity: 0.02, vignetteIntensity: 0.1 },
        'social': { colorGrade: 'vibrant-lifestyle', colorIntensity: 1.0, grainIntensity: 0.01, vignetteIntensity: 0.05 },
        'energetic': { colorGrade: 'vibrant-lifestyle', colorIntensity: 1.0, grainIntensity: 0.01, vignetteIntensity: 0.05 },
        'premium': { colorGrade: 'luxury-elegant', colorIntensity: 1.0, grainIntensity: 0.03, vignetteIntensity: 0.3 },
        'luxury': { colorGrade: 'luxury-elegant', colorIntensity: 1.0, grainIntensity: 0.03, vignetteIntensity: 0.3 },
        'documentary': { colorGrade: 'moody-dramatic', colorIntensity: 0.9, grainIntensity: 0.04, vignetteIntensity: 0.2 },
        'professional': { colorGrade: 'cool-corporate', colorIntensity: 0.8, grainIntensity: 0.02, vignetteIntensity: 0.1 },
      };
      
      const visualStyle = preparedProject.visualStyle?.toLowerCase() || 'lifestyle';
      const stylePreset = styleToPreset[visualStyle] || styleToPreset['lifestyle'];
      
      filmTreatmentConfig = {
        enabled: true,
        colorGrade: filmTreatmentSettings?.colorGrade || stylePreset.colorGrade,
        colorIntensity: filmTreatmentSettings?.colorIntensity ?? stylePreset.colorIntensity,
        grainIntensity: filmTreatmentSettings?.grainIntensity ?? stylePreset.grainIntensity,
        vignetteIntensity: filmTreatmentSettings?.vignetteIntensity ?? stylePreset.vignetteIntensity,
        letterbox: filmTreatmentSettings?.letterbox || 'none',
      };
      
      console.log(`[UniversalVideo] Phase 18F: Film treatment config built for style "${visualStyle}":`, filmTreatmentConfig);
    } else {
      // Explicitly disabled
      filmTreatmentConfig = { enabled: false };
      console.log('[UniversalVideo] Phase 18F: Film treatment disabled by settings');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 18D: Calculate voiceover ranges for audio ducking
    // ═══════════════════════════════════════════════════════════════
    const fps = 30; // Standard FPS
    const voiceoverRanges: Array<{ startFrame: number; endFrame: number }> = [];
    let currentFrame = 0;
    const hasPerSceneVoiceover = preparedProject.assets?.voiceover?.perScene?.length > 0 &&
      preparedProject.assets?.voiceover?.perScene?.some((ps: any) => ps.url);
    
    for (const scene of preparedProject.scenes) {
      const sceneDurationFrames = Math.round((scene.duration || 5) * fps);
      
      const hasSceneVoiceover = scene.voiceoverUrl ||
                          scene.voiceover?.audioUrl || 
                          scene.assets?.voiceover?.url ||
                          preparedProject.assets?.voiceover?.fullTrackUrl;
      
      if (hasSceneVoiceover) {
        if (hasPerSceneVoiceover && scene.voiceoverDuration) {
          const voiceoverFrames = Math.round(scene.voiceoverDuration * fps);
          voiceoverRanges.push({
            startFrame: currentFrame,
            endFrame: currentFrame + voiceoverFrames,
          });
        } else {
          voiceoverRanges.push({
            startFrame: currentFrame,
            endFrame: currentFrame + sceneDurationFrames,
          });
        }
      }
      
      currentFrame += sceneDurationFrames;
    }
    
    console.log(`[UniversalVideo] Phase 18D: Calculated ${voiceoverRanges.length} voiceover ranges (per-scene: ${hasPerSceneVoiceover})`);
    
    // Create a brand copy with S3-cached logo URL for Lambda accessibility
    // Ensure brand always has complete colors to prevent render crashes
    const defaultBrandColors = {
      primary: '#2d5a27',
      secondary: '#607e66',
      accent: '#c9a227',
      text: '#5e637a',
      textLight: '#ffffff',
    };
    const defaultBrandFonts = {
      heading: 'Playfair Display, Georgia, serif',
      body: 'Open Sans, Helvetica, sans-serif',
      weight: { heading: 700, body: 400 },
    };
    const baseBrand = effectiveBrand || { name: '', colors: {}, logoUrl: '' };
    const brandWithCachedLogo = {
      ...baseBrand,
      colors: { ...defaultBrandColors, ...(baseBrand.colors || {}) },
      fonts: { ...defaultBrandFonts, ...(baseBrand.fonts || {}) },
      logoUrl: endCardConfig?.logo?.url || baseBrand.logoUrl,
    };
    
    console.log('[UniversalVideo] Brand logo URL for Lambda:', {
      original: preparedProject.brand?.logoUrl?.substring(0, 60),
      cached: brandWithCachedLogo?.logoUrl?.substring(0, 60),
    });
    
    // ═══════════════════════════════════════════════════════════════
    // PHASE 18B: Generate scene overlay configurations
    // ═══════════════════════════════════════════════════════════════
    console.log('[Render] ═══════════════════════════════════════════════════');
    console.log('[Render] Preparing project for Remotion render');
    console.log('[Render] ═══════════════════════════════════════════════════');
    console.log('[Render] Step 1: Resolving asset URLs...');
    console.log('[Render] Step 2: Generating overlay configurations...');
    
    let sceneOverlayConfigs: Record<string, any> = {};
    try {
      const sceneInputs = preparedProject.scenes.map((scene: any) => ({
        id: scene.id,
        sceneType: scene.type || scene.sceneType || 'standard',
        duration: scene.duration || 5,
        script: scene.voiceover?.text || scene.script,
      }));
      
      const overlayConfigsMap = await overlayConfigurationService.generateOverlaysForProject(
        projectId,
        sceneInputs
      );
      
      // Convert Map to Record for JSON serialization
      sceneOverlayConfigs = Object.fromEntries(overlayConfigsMap);
      
      // Resolve overlay asset URLs to ensure Lambda accessibility
      for (const [sceneId, config] of Object.entries(sceneOverlayConfigs)) {
        const overlayConfig = config as any;
        
        // Resolve logo URL if present
        if (overlayConfig.logo?.url) {
          const resolvedLogoUrl = await assetUrlResolver.resolve(overlayConfig.logo.url);
          if (resolvedLogoUrl && assetUrlResolver.isLambdaAccessible(resolvedLogoUrl)) {
            overlayConfig.logo.url = resolvedLogoUrl;
          } else {
            console.warn(`[Render] Logo URL not Lambda accessible for scene ${sceneId}:`, overlayConfig.logo.url);
          }
        }
        
        // Resolve watermark URL if present
        if (overlayConfig.watermark?.url) {
          const resolvedWatermarkUrl = await assetUrlResolver.resolve(overlayConfig.watermark.url);
          if (resolvedWatermarkUrl && assetUrlResolver.isLambdaAccessible(resolvedWatermarkUrl)) {
            overlayConfig.watermark.url = resolvedWatermarkUrl;
          } else {
            console.warn(`[Render] Watermark URL not Lambda accessible for scene ${sceneId}:`, overlayConfig.watermark.url);
          }
        }
        
        // Resolve badge URLs if present
        if (overlayConfig.badges?.length) {
          for (const badge of overlayConfig.badges) {
            if (badge.url) {
              const resolvedBadgeUrl = await assetUrlResolver.resolve(badge.url);
              if (resolvedBadgeUrl && assetUrlResolver.isLambdaAccessible(resolvedBadgeUrl)) {
                badge.url = resolvedBadgeUrl;
              }
            }
          }
        }
      }
      
      console.log(`[Render] Generated overlay configs for ${Object.keys(sceneOverlayConfigs).length} scenes`);
      
      // Log summary of each scene's overlays
      for (const [sceneId, config] of Object.entries(sceneOverlayConfigs)) {
        const overlayConfig = config as any;
        const overlayTypes: string[] = [];
        if (overlayConfig.logo?.enabled) overlayTypes.push('logo');
        if (overlayConfig.watermark?.enabled) overlayTypes.push('watermark');
        if (overlayConfig.textOverlays?.length) overlayTypes.push(`${overlayConfig.textOverlays.length} texts`);
        if (overlayConfig.ctaOverlay?.enabled) overlayTypes.push('CTA');
        if (overlayConfig.badges?.length) overlayTypes.push(`${overlayConfig.badges.length} badges`);
        if (overlayConfig.endCard?.enabled) overlayTypes.push('end-card');
        
        console.log(`[Render]   Scene ${sceneId}: ${overlayTypes.join(', ') || 'none'}`);
      }
    } catch (overlayError: any) {
      console.error('[Render] Error generating overlay configs:', overlayError.message);
      // Continue with empty configs rather than failing render
    }
    
    const resolvedMusicUrl = preparedProject.assets.music?.url || null;
    
    const captionSettings = (projectData as any).captionSettings || {};
    const captionStyle = captionSettings.enabled ? (captionSettings.style || { preset: 'capcut', position: 'bottom' }) : null;

    if (hasPerSceneVoiceover && captionStyle) {
      for (const scene of preparedProject.scenes as any[]) {
        const perSceneEntry = preparedProject.assets?.voiceover?.perScene?.find(
          (ps: any) => ps.sceneId === scene.id
        );
        if (perSceneEntry?.words?.length) {
          scene.captions = {
            words: perSceneEntry.words,
            style: captionStyle,
            enabled: true,
          };
        }
      }
      console.log(`[UniversalVideo] Captions enabled with style: ${captionStyle.preset}`);
    }

    const isQuickCreateProject = (projectData as any).outputFormat?.platform === 'quick-create';
    if (isQuickCreateProject && !hasPerSceneVoiceover && captionStyle) {
      const qcVoiceover = (projectData as any).assets?.quickCreate?.voiceover;
      const narrationScript = qcVoiceover?.narrationText || '';
      const voiceoverDuration = qcVoiceover?.duration || 0;

      if (narrationScript.trim() && voiceoverDuration > 0) {
        const words = narrationScript.trim().split(/\s+/);
        const charWeights = words.map((w: string) => Math.max(w.length, 2) + 1);
        const totalWeight = charWeights.reduce((a: number, b: number) => a + b, 0);
        let cursor = 0;
        const wordTimings = words.map((word: string, idx: number) => {
          const duration = (charWeights[idx] / totalWeight) * voiceoverDuration;
          const start = +cursor.toFixed(3);
          cursor += duration;
          const end = +cursor.toFixed(3);
          return { word, start, end };
        });

        for (const scene of preparedProject.scenes as any[]) {
          if (scene.id === 'intro-scene-auto') continue;
          scene.captions = {
            words: wordTimings,
            style: captionStyle,
            enabled: true,
          };
        }
        console.log(`[UniversalVideo] Quick Create captions enabled: ${words.length} words over ${voiceoverDuration}s (style: ${captionStyle.preset})`);
      } else {
        console.log('[UniversalVideo] Quick Create captions skipped: no narration text or voiceover duration');
      }
    }

    // Inject intro scene if enabled
    const introEnabled = (projectData as any).introEnabled !== false;
    const introTemplate = (projectData as any).introTemplate || 'classic-glow';
    const introBackgroundRandom = (projectData as any).introBackgroundRandom || false;
    const legacyIntroBackground = (projectData as any).introBackgroundUrl || null;
    
    if (introEnabled) {
      const introCardSettings = (projectData as any).introCardSettings || {};
      console.log('[Render] introCardSettings from DB:', JSON.stringify({
        backgroundUrl: introCardSettings.backgroundUrl || 'EMPTY',
        taglineText: introCardSettings.taglineText || 'EMPTY',
        logoUrl: introCardSettings.logoUrl || 'EMPTY',
        contactWebsite: introCardSettings.contactWebsite || 'EMPTY',
        duration: introCardSettings.duration,
      }));
      const cardBackgroundUrl = introCardSettings.backgroundUrl || null;
      
      let introBackgroundUrl: string | null = cardBackgroundUrl || legacyIntroBackground;
      if (!introBackgroundUrl && introBackgroundRandom) {
        try {
          const introBg = await s3RenderAssetService.getRandomIntroBackground();
          if (introBg) {
            introBackgroundUrl = introBg.url;
            console.log('[Render] Intro background from S3 (random):', introBg.name);
          }
        } catch (e: any) {
          console.warn('[Render] Failed to get intro background:', e.message);
        }
      }
      if (introBackgroundUrl) {
        console.log('[Render] Intro background from user selection:', introBackgroundUrl);
      }
      
      const brandName = brandWithCachedLogo.name || effectiveBrand?.name || '';
      const introLogoSource = introCardSettings.logoUrl || brandWithCachedLogo.logoUrl || '';
      const brandLogoUrl = introLogoSource ? (await assetUrlResolver.resolve(introLogoSource) || introLogoSource) : '';
      const brandColors = brandWithCachedLogo.colors || {};
      const introDuration = introCardSettings.duration || 4;
      
      const effectiveIntroBg = introBackgroundUrl || null;

      const introScene: any = {
        id: 'intro-scene-auto',
        type: 'intro',
        title: brandName || 'Introduction',
        duration: introDuration,
        narration: '',
        background: effectiveIntroBg
          ? { type: 'image', imageUrl: effectiveIntroBg }
          : {
              type: 'gradient',
              gradient: {
                colors: [brandColors.primary || '#1a1a2e', brandColors.secondary || '#16213e', brandColors.accent || '#0d1b2a'],
                angle: 180,
              },
            },
        assets: {
          imageUrl: effectiveIntroBg || '',
          backgroundUrl: effectiveIntroBg || '',
        },
        textOverlays: [],
        transitions: { type: 'fade', duration: 0.8 },
        microScenes: [],
        introCardConfig: {
          taglineText: introCardSettings.taglineText || '',
          taglineAnimation: introCardSettings.taglineAnimation || 'fade',
          taglineFontSize: introCardSettings.taglineFontSize || 28,
          taglineFontFamily: introCardSettings.taglineFontFamily || 'Great Vibes',
          taglineColor: introCardSettings.taglineColor || '#E8D5B7',
          taglineFontWeight: introCardSettings.taglineFontWeight ?? 400,
          logoAnimation: introCardSettings.logoAnimation || 'scale-bounce',
          contactAnimation: introCardSettings.contactAnimation || 'stagger',
          contactWebsite: introCardSettings.contactWebsite || '',
          contactPhone: introCardSettings.contactPhone || '',
          contactEmail: introCardSettings.contactEmail || '',
          ambientEffect: introCardSettings.ambientEffect || 'bokeh',
          logoSize: introCardSettings.logoSize || 30,
          logoPositionY: introCardSettings.logoPositionY || 32,
          taglinePositionY: introCardSettings.taglinePositionY || 50,
          websitePositionY: introCardSettings.websitePositionY || 75,
          websiteFontSize: introCardSettings.websiteFontSize || 22,
          websiteColor: introCardSettings.websiteColor || '#FFFFFF',
          websiteFontFamily: introCardSettings.websiteFontFamily || 'Inter',
          websiteFontWeight: introCardSettings.websiteFontWeight ?? 500,
        },
      };
      
      preparedProject.scenes = [introScene, ...preparedProject.scenes.filter((s: any) => s.id !== 'intro-scene-auto')];
      console.log('[Render] Intro scene injected (template: ' + introTemplate + ', background: ' + (effectiveIntroBg ? 'S3 image' : 'brand gradient') + ', duration: ' + introDuration + 's)');
      
      if (brandLogoUrl) {
        sceneOverlayConfigs['intro-scene-auto'] = {
          logo: {
            enabled: true,
            url: brandLogoUrl,
            position: 'center',
            size: introCardSettings.logoSize || 30,
            opacity: 1,
            animation: introCardSettings.logoAnimation || 'scale-bounce',
            timing: { startTime: 0.3, duration: introDuration - 0.8 },
          },
        };
        console.log('[Render] Intro scene logo overlay configured');
      }
    } else {
      preparedProject.scenes = preparedProject.scenes.filter((s: any) => s.id !== 'intro-scene-auto');
      console.log('[Render] Intro scene disabled, removed any existing intro-scene-auto from scenes');
    }

    // Recalculate voiceover ranges after intro scene injection (frame offsets may have shifted)
    voiceoverRanges.length = 0;
    let voRecalcFrame = 0;
    for (const scene of preparedProject.scenes) {
      const sceneDurationFrames = Math.round((scene.duration || 5) * fps);
      const hasSceneVO = (scene as any).voiceoverUrl ||
                          (scene as any).voiceover?.audioUrl || 
                          (scene as any).assets?.voiceover?.url ||
                          preparedProject.assets?.voiceover?.fullTrackUrl;
      if (hasSceneVO) {
        if (hasPerSceneVoiceover && (scene as any).voiceoverDuration) {
          const voFrames = Math.round((scene as any).voiceoverDuration * fps);
          voiceoverRanges.push({ startFrame: voRecalcFrame, endFrame: voRecalcFrame + voFrames });
        } else {
          voiceoverRanges.push({ startFrame: voRecalcFrame, endFrame: voRecalcFrame + sceneDurationFrames });
        }
      }
      voRecalcFrame += sceneDurationFrames;
    }
    console.log('[Render] Voiceover ranges recalculated after intro injection:', voiceoverRanges.length, 'ranges');

    // Ensure scene durations are never shorter than their voiceover audio.
    // This is a safety net — voiceover generation already sets durations correctly,
    // but other processes (assembly, user edits) could shorten them.
    // The assembled video clip will loop via SafeVideo to fill any extra visual time.
    if (hasPerSceneVoiceover) {
      for (const scene of preparedProject.scenes as any[]) {
        if (scene.id === 'intro-scene-auto') continue;
        const voDur = scene.voiceoverDuration || scene.voiceoverDurationSec || scene.audioDuration;
        const minDur = scene.minDurationForVoiceover;
        if (voDur && typeof voDur === 'number' && voDur > 0) {
          const sceneDur = scene.duration || 5;
          const bufferSec = 0.5;
          const requiredDur = Math.ceil((voDur + bufferSec) * 10) / 10;
          const floor = Math.max(requiredDur, minDur || 0);
          if (floor > sceneDur) {
            console.log(`[Render] Scene ${scene.id}: extending duration ${sceneDur}s → ${floor}s to fit voiceover (${voDur.toFixed(1)}s)`);
            scene.duration = floor;
          }
        }
      }
    }

    let clearedInstructionOverlays = 0;
    let clearedTraditionalOverlays = 0;
    for (const scene of preparedProject.scenes as any[]) {
      const sceneType = (scene.type || '').toLowerCase();
      const sceneId = (scene.id || '').toLowerCase();
      if (sceneType === 'cta' || sceneType === 'call_to_action') continue;
      if (sceneType === 'intro' || sceneType === 'outro') continue;
      if (sceneId === 'intro-scene-auto') continue;
      const requirement = textOverlayDetector.detectTextOverlayRequirements({
        sceneIndex: scene.sceneIndex,
        visualDirection: scene.visualDirection,
        narration: scene.narration,
        type: scene.type,
      });
      if (!requirement.required) {
        if (scene.compositionInstructions?.textOverlays?.length) {
          clearedInstructionOverlays += scene.compositionInstructions.textOverlays.length;
          scene.compositionInstructions.textOverlays = [];
        }
        if (scene.textOverlays?.length) {
          clearedTraditionalOverlays += scene.textOverlays.length;
          scene.textOverlays = [];
        }
      }
    }
    if (clearedInstructionOverlays > 0 || clearedTraditionalOverlays > 0) {
      console.log(`[Render] Cleared stale text overlays: ${clearedInstructionOverlays} from compositionInstructions, ${clearedTraditionalOverlays} from scene.textOverlays`);
    }

    const visualStyle = (projectData as any).visualStyle || (projectData as any).style || 'lifestyle';
    const scenesForTransitionPlanning = preparedProject.scenes.map((s: any, idx: number) => ({
      sceneIndex: idx,
      sceneType: s.type || 'benefit',
      duration: s.duration || 5,
      analysisResult: s.analysisResult,
    }));
    const transitionPlan = transitionService.planTransitions(scenesForTransitionPlanning, visualStyle);
    const normalizeTransitionType = (type: string): string => {
      if (type === 'cut') return 'none';
      if (type === 'zoom-in' || type === 'zoom-out') return 'zoom';
      if (type === 'wipe-up' || type === 'wipe-down') return 'wipe-left';
      if (type === 'blur') return 'dissolve';
      return type;
    };
    const renderTransitions = transitionPlan.transitions.map(t => ({
      type: normalizeTransitionType(t.config.type),
      duration: t.config.duration,
      easing: t.config.easing,
    }));

    for (let i = 0; i < transitionPlan.transitions.length; i++) {
      const t = transitionPlan.transitions[i];
      const fromScene = preparedProject.scenes[t.fromSceneIndex] as any;
      const toScene = preparedProject.scenes[t.toSceneIndex] as any;
      if (fromScene) {
        if (!fromScene.compositionInstructions) fromScene.compositionInstructions = {};
        fromScene.compositionInstructions.transitionOut = {
          type: normalizeTransitionType(t.config.type),
          duration: t.config.duration,
          easing: t.config.easing,
        };
      }
      if (toScene) {
        if (!toScene.compositionInstructions) toScene.compositionInstructions = {};
        toScene.compositionInstructions.transitionIn = {
          type: normalizeTransitionType(t.config.type),
          duration: t.config.duration,
          easing: t.config.easing,
        };
      }
    }
    console.log(`[Render] Planned ${transitionPlan.transitions.length} mood-matched transitions:`, transitionPlan.summary);

    const inputProps = {
      scenes: preparedProject.scenes,
      voiceoverUrl: hasPerSceneVoiceover ? null : (preparedProject.assets?.voiceover?.fullTrackUrl || null),
      musicUrl: resolvedMusicUrl,
      musicVolume: preparedProject.assets.music?.volume || 0.18,
      brand: brandWithCachedLogo,
      outputFormat: preparedProject.outputFormat,
      endCardConfig,
      soundDesignConfig,
      sceneOverlayConfigs,
      voiceoverRanges,
      soundEffectsBaseUrl: process.env.SOUND_EFFECTS_URL || `https://${process.env.REMOTION_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o'}.s3.${process.env.REMOTION_AWS_REGION || 'us-east-2'}.amazonaws.com/audio/sfx`,
      filmTreatmentConfig,
      captionStyle: captionStyle || null,
      transitions: renderTransitions,
    };
    
    // Helper: resolve a single overlay item URL to Lambda-accessible public URL
    const resolveOverlayUrl = async (item: any): Promise<any> => {
      if (!item.url) return item;
      let resolvedUrl = item.url;
      const isS3UploadsPath = item.url.includes('.amazonaws.com/uploads/');
      const isLocalUploadsPath = item.url.startsWith('/uploads/');
      const needsResolution = !item.url.startsWith("http") || item.url.includes(".replit.dev") || isS3UploadsPath;
      if (needsResolution || isLocalUploadsPath) {
        if (isS3UploadsPath) {
          const filename = item.url.split('/uploads/').pop();
          const localPath = `/uploads/${filename}`;
          console.log(`[UniversalVideo] S3 uploads/ path detected for overlay "${item.name}", resolving via local file: ${localPath}`);
          const publicUrl = await getPublicAssetUrl(localPath);
          if (publicUrl) resolvedUrl = publicUrl;
        } else {
          const publicUrl = await getPublicAssetUrl(item.url);
          if (publicUrl) resolvedUrl = publicUrl;
        }
      }
      console.log(`[UniversalVideo] Overlay item "${item.name}": ${item.url.substring(0, 60)} -> ${resolvedUrl.substring(0, 80)}`);
      return { ...item, url: resolvedUrl };
    };

    // Resolve overlay item URLs to Lambda-accessible public URLs
    for (const scene of inputProps.scenes as any[]) {
      // 1. Resolve scene-level overlayItems
      if (scene.overlayItems && Array.isArray(scene.overlayItems) && scene.overlayItems.length > 0) {
        console.log(`[UniversalVideo] Scene ${scene.id} has ${scene.overlayItems.length} overlay items:`, scene.overlayItems.map((o: any) => `${o.name} @ (${o.x}%,${o.y}%) ${o.width}x${o.height}`).join(', '));
        scene.overlayItems = await Promise.all(scene.overlayItems.map(resolveOverlayUrl));
        console.log(`[UniversalVideo] Resolved ${scene.overlayItems.length} overlay items for scene ${scene.id}`);
      }

      // 2. Resolve micro-scene level overlayItems (Lambda reads these directly)
      if (scene.microScenes && Array.isArray(scene.microScenes)) {
        for (const ms of scene.microScenes) {
          if (ms.overlayItems && Array.isArray(ms.overlayItems) && ms.overlayItems.length > 0) {
            console.log(`[UniversalVideo] Scene ${scene.id} micro-scene has ${ms.overlayItems.length} overlay items to resolve`);
            ms.overlayItems = await Promise.all(ms.overlayItems.map(resolveOverlayUrl));
          }
        }
      }

      // 3. Do NOT promote micro-scene overlays to scene level — they render for the
      //    entire scene duration at scene level, causing carryover between micro-scenes.
      //    Micro-scene overlays are rendered by MicroSceneOverlayCompositor within their
      //    time range inside the Remotion MicroSceneBackground component.

      const sceneOverlayCount = scene.overlayItems?.length || 0;
      const msOverlayCount = scene.microScenes?.reduce((sum: number, ms: any) => sum + (ms.overlayItems?.length || 0), 0) || 0;
      if (sceneOverlayCount === 0 && msOverlayCount === 0) {
        console.log(`[UniversalVideo] Scene ${scene.id} has NO overlay items`);
      } else {
        console.log(`[UniversalVideo] Scene ${scene.id}: ${sceneOverlayCount} scene-level + ${msOverlayCount} micro-scene overlays`);
      }
    }
    // Log video B-roll details for each scene
    const videoScenes = inputProps.scenes.filter((s: any) => s.assets?.videoUrl);
    console.log('[UniversalVideo] Prepared input props for Lambda:', {
      sceneCount: inputProps.scenes.length,
      videoSceneCount: videoScenes.length,
      hasVoiceover: !!inputProps.voiceoverUrl,
      hasMusic: !!inputProps.musicUrl,
      voiceoverUrl: inputProps.voiceoverUrl?.substring(0, 80),
      musicUrl: inputProps.musicUrl?.substring(0, 80),
      captionStyle: inputProps.captionStyle,
    });
    for (const scene of inputProps.scenes as any[]) {
      if (scene.captions) {
        console.log(`[UniversalVideo] Scene ${scene.id} captions: enabled=${scene.captions.enabled}, words=${scene.captions.words?.length}, style=${JSON.stringify(scene.captions.style)}`);
      }
    }
    
    // Debug: log each scene's video status
    inputProps.scenes.forEach((scene: any, idx: number) => {
      const hasVideo = !!scene.assets?.videoUrl;
      const bgType = scene.background?.type;
      if (hasVideo || bgType === 'video') {
        console.log(`[UniversalVideo] Scene ${idx} (${scene.id}): videoUrl=${scene.assets?.videoUrl?.substring(0, 60) || 'none'}, background.type=${bgType}`);
      }
    });
    
    let freshServeUrl: string | undefined;
    try {
      console.log('[UniversalVideo] Auto-redeploying Remotion site to ensure Lambda bundle is up to date...');
      freshServeUrl = await remotionLambdaService.redeploySite();
      console.log(`[UniversalVideo] Site redeployed successfully: ${freshServeUrl}`);
    } catch (redeployError: any) {
      console.warn(`[UniversalVideo] Site redeploy failed (using existing bundle): ${redeployError.message}`);
    }

    const totalDuration = calculateEffectiveDuration(preparedProject.scenes, renderTransitions);
    const useChunkedRendering = chunkedRenderService.shouldUseChunkedRendering(preparedProject.scenes, CHUNK_THRESHOLD_SEC, renderTransitions);
    
    console.log(`[UniversalVideo] Total video duration: ${totalDuration}s, using ${useChunkedRendering ? 'chunked' : 'standard'} rendering`);
    
    if (useChunkedRendering) {
      console.log(`[UniversalVideo] === CHUNKED RENDERING TRIGGERED ===`);
      console.log(`[UniversalVideo] Project: ${projectId}, Duration: ${totalDuration}s, Scenes: ${preparedProject.scenes.length}`);
      
      try {
        const numChunks = Math.ceil(totalDuration / MAX_CHUNK_DURATION_SEC) || 1;
        (preparedProject.progress as any).renderStartedAt = Date.now();
        (preparedProject.progress as any).renderMethod = 'chunked';
        (preparedProject.progress as any).renderInputProps = inputProps;
        (preparedProject.progress as any).renderCompositionId = compositionId;
        (preparedProject.progress as any).renderStatus = {
          phase: 'queued',
          totalChunks: numChunks,
          completedChunks: 0,
          percent: 0,
          message: `Waiting for worker to start render (${numChunks} chunk${numChunks > 1 ? 's' : ''})...`,
          startedAt: Date.now(),
          lastUpdateAt: Date.now(),
          elapsedMs: 0,
          error: null,
        };
        preparedProject.progress.steps.rendering.message = 'Queued for chunked render (worker process)...';
        preparedProject.status = 'render_queued';
        
        await saveProjectToDb(preparedProject, projectData.ownerId);
        console.log(`[UniversalVideo] Saved render_queued state to DB - worker will pick up`);
        
        res.json({
          success: true,
          renderMethod: 'chunked',
          totalDuration,
          message: `Chunked rendering queued for ${totalDuration.toFixed(0)}s video (worker process)`,
        });
        
        return;
      } catch (renderError: any) {
        preparedProject.status = 'error';
        preparedProject.progress.currentStep = null;
        preparedProject.progress.percentage = 0;
        preparedProject.progress.steps.rendering.status = 'error';
        preparedProject.progress.steps.rendering.message = renderError.message || 'Render failed';
        preparedProject.progress.errors.push(`Render failed: ${renderError.message}`);
        
        await saveProjectToDb(preparedProject, projectData.ownerId);
        
        res.status(500).json({
          success: false,
          error: renderError.message || 'Failed to start chunked render',
        });
      }
    } else {
      // Use standard Lambda rendering for short videos
      try {
        const renderResult = await remotionLambdaService.startRender({
          compositionId,
          inputProps,
          serveUrlOverride: freshServeUrl,
        });
        
        renderBuckets.set(renderResult.renderId, renderResult.bucketName);
        
        (preparedProject.progress as any).renderStartedAt = Date.now();
        (preparedProject.progress as any).renderMethod = 'standard';
        (preparedProject.progress as any).renderInputProps = inputProps;
        (preparedProject.progress as any).renderCompositionId = compositionId;
        (preparedProject.progress as any).standardRenderId = renderResult.renderId;
        (preparedProject.progress as any).standardBucketName = renderResult.bucketName;
        preparedProject.progress.steps.rendering.message = `Render started: ${renderResult.renderId}`;
        
        await saveProjectToDb(preparedProject, projectData.ownerId, renderResult.renderId, renderResult.bucketName);
        
        res.json({
          success: true,
          renderId: renderResult.renderId,
          bucketName: renderResult.bucketName,
          renderMethod: 'standard',
          message: 'Render started on AWS Lambda',
        });
      } catch (renderError: any) {
        preparedProject.status = 'error';
        if (!preparedProject.progress) preparedProject.progress = {} as any;
        if (!preparedProject.progress.steps) preparedProject.progress.steps = {} as any;
        if (!preparedProject.progress.steps.rendering) preparedProject.progress.steps.rendering = {} as any;
        preparedProject.progress.steps.rendering.status = 'error';
        preparedProject.progress.steps.rendering.message = renderError.message || 'Render failed';
        if (!preparedProject.progress.errors) preparedProject.progress.errors = [];
        preparedProject.progress.errors.push(`Render failed: ${renderError.message}`);
        
        if (!preparedProject.progress.serviceFailures) preparedProject.progress.serviceFailures = [];
        preparedProject.progress.serviceFailures.push({
          service: 'remotion-lambda',
          timestamp: new Date().toISOString(),
          error: renderError.message || 'Unknown error',
        });
        
        await saveProjectToDb(preparedProject, projectData.ownerId);
        
        res.status(500).json({
          success: false,
          error: renderError.message || 'Failed to start render',
        });
      }
    }
  } catch (error: any) {
    console.error('[UniversalVideo] Error starting render:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const LAMBDA_TIMEOUT_MS = 900000; // 15 minutes - matches Lambda function timeout (900 seconds)
const RENDER_TIMEOUT_MS = 1200000; // 20 minutes - allows buffer beyond Lambda timeout for chunked renders
const STALL_DETECTION_MS = 300000; // 5 minutes - Lambda cold starts + complex scene init can take time

router.get('/projects/:projectId/render-status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { renderId, bucketName } = req.query;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Check if this is a chunked render - progress is updated directly in DB
    const renderMethod = (projectData.progress as any).renderMethod;
    if (renderMethod === 'chunked') {
      console.log(`[UniversalVideo] Chunked render status for ${projectId}: ${projectData.status}, progress: ${projectData.progress.steps.rendering?.progress || 0}%`);
      
      const isDone = projectData.status === 'complete' || projectData.status === 'completed' || projectData.status === 'error';
      const renderProgress = projectData.progress.steps.rendering;
      
      return res.json({
        success: projectData.status !== 'error',
        done: isDone,
        progress: (renderProgress?.progress || 0) / 100,
        outputUrl: isDone && (projectData.status === 'complete' || projectData.status === 'completed') ? projectData.outputUrl : null,
        errors: projectData.status === 'error' ? projectData.progress.errors : [],
        project: projectData,
        renderMethod: 'chunked',
        message: renderProgress?.message || 'Processing...',
      });
    }
    
    // Standard Lambda render - requires renderId
    if (!renderId || typeof renderId !== 'string' || renderId === 'undefined') {
      // Return current project state instead of error
      console.log(`[UniversalVideo] No renderId for ${projectId}, returning current state`);
      return res.json({
        success: true,
        done: projectData.status === 'complete' || projectData.status === 'completed' || projectData.status === 'error',
        progress: (projectData.progress.steps.rendering?.progress || 0) / 100,
        outputUrl: projectData.outputUrl || null,
        errors: projectData.progress.errors || [],
        project: projectData,
      });
    }
    
    const bucket = (typeof bucketName === 'string' ? bucketName : null) || 
                   renderBuckets.get(renderId) || 
                   REMOTION_BUCKET_NAME;
    
    // Get render start time (persisted in DB to survive restarts)
    // Primary source: DB-persisted progress.renderStartedAt
    // Fallback: current time (persisted immediately so timeout works for legacy renders)
    let persistedStartTime = (projectData.progress as any).renderStartedAt;
    let needsPersist = false;
    
    if (!persistedStartTime || typeof persistedStartTime !== 'number') {
      persistedStartTime = Date.now();
      (projectData.progress as any).renderStartedAt = persistedStartTime;
      needsPersist = true;
      console.log(`[UniversalVideo] Legacy render - persisting start time: ${persistedStartTime}`);
    }
    
    const renderStartTime = persistedStartTime;
    const elapsedTime = Date.now() - renderStartTime;
    
    // Persist fallback start time immediately so timeout works for legacy renders
    if (needsPersist) {
      await saveProjectToDb(projectData, projectData.ownerId);
    }
    
    console.log(`[UniversalVideo] Render status check for ${renderId}: elapsed ${Math.round(elapsedTime/1000)}s (started: ${new Date(renderStartTime).toISOString()})`);
    
    if (elapsedTime > RENDER_TIMEOUT_MS && (projectData.status === 'rendering' || projectData.status === 'lambda_pending')) {
      console.log(`[UniversalVideo] Render timeout detected for ${projectId} after ${Math.round(elapsedTime/1000)}s`);
      
      projectData.status = 'error';
      projectData.progress.steps.rendering.status = 'error';
      projectData.progress.steps.rendering.message = `Render timed out after ${Math.round(elapsedTime/60000)} minutes`;
      projectData.progress.errors.push('Render timed out - Lambda may have exceeded its time limit');
      projectData.progress.serviceFailures.push({
        service: 'remotion-lambda',
        timestamp: new Date().toISOString(),
        error: 'Render timeout - please try again with a shorter video or fewer scenes',
      });
      
      await saveProjectToDb(projectData, projectData.ownerId);
      
      return res.json({
        success: false,
        done: false,
        progress: projectData.progress.steps.rendering.progress / 100,
        outputUrl: null,
        errors: ['Render timed out. The video may be too complex. Please try again.'],
        project: projectData,
        timeout: true,
      });
    }
    
    try {
      const statusResult = await remotionLambdaService.getRenderProgress(renderId, bucket);
      
      // Check for errors from Lambda
      if (statusResult.errors && statusResult.errors.length > 0) {
        console.log(`[UniversalVideo] Render errors for ${projectId}:`, statusResult.errors);
        
        projectData.status = 'error';
        projectData.progress.steps.rendering.status = 'error';
        projectData.progress.steps.rendering.message = statusResult.errors[0];
        projectData.progress.errors.push(...statusResult.errors);
        
        await saveProjectToDb(projectData, projectData.ownerId);
        
        return res.json({
          success: false,
          done: true,
          progress: statusResult.overallProgress,
          outputUrl: null,
          errors: statusResult.errors,
          project: projectData,
        });
      }
      
      if (statusResult.done) {
        projectData.status = 'completed';
        projectData.progress.steps.rendering.status = 'complete';
        projectData.progress.steps.rendering.progress = 100;
        projectData.progress.overallPercent = 100;
        projectData.progress.currentStep = null;
        projectData.progress.percentage = 0;
        projectData.outputUrl = statusResult.outputFile;
        projectData.updatedAt = new Date().toISOString();
        
        await saveProjectToDb(
          projectData, 
          projectData.ownerId, 
          undefined, 
          undefined, 
          statusResult.outputFile || undefined
        );
      } else {
        const currentProgress = Math.round(statusResult.overallProgress * 100);
        const lastProgress = (projectData.progress as any).lastProgressValue || 0;
        const lastUpdateAt = (projectData.progress as any).lastProgressUpdateAt || renderStartTime;
        
        if (currentProgress === lastProgress && currentProgress > 0) {
          const stallTime = Date.now() - lastUpdateAt;
          console.log(`[UniversalVideo] Progress unchanged at ${currentProgress}% for ${Math.round(stallTime/1000)}s`);
          
          if (stallTime > STALL_DETECTION_MS) {
            console.log(`[UniversalVideo] Render stalled for ${projectId} - no progress for ${Math.round(stallTime/60000)} minutes`);
            
            projectData.status = 'error';
            projectData.progress.steps.rendering.status = 'error';
            projectData.progress.steps.rendering.message = `Render stalled at ${currentProgress}% - Lambda may have stopped unexpectedly`;
            projectData.progress.errors.push('Render stalled - AWS Lambda may have terminated. Please retry.');
            projectData.progress.serviceFailures.push({
              service: 'remotion-lambda',
              timestamp: new Date().toISOString(),
              error: 'Render stalled - no progress for 3+ minutes',
            });
            
            await saveProjectToDb(projectData, projectData.ownerId);
            
            return res.json({
              success: false,
              done: false,
              progress: currentProgress / 100,
              outputUrl: null,
              errors: ['Render stalled - Lambda stopped unexpectedly. Please click Retry Render.'],
              project: projectData,
              stalled: true,
            });
          }
        } else if (currentProgress !== lastProgress) {
          (projectData.progress as any).lastProgressValue = currentProgress;
          (projectData.progress as any).lastProgressUpdateAt = Date.now();
        }
        
        projectData.progress.steps.rendering.progress = currentProgress;
        projectData.progress.overallPercent = 85 + Math.round(statusResult.overallProgress * 15);
        await saveProjectToDb(projectData, projectData.ownerId);
      }
      
      const progressPercent = Math.round(statusResult.overallProgress * 100);
      const elapsedSeconds = Math.round(elapsedTime / 1000);
      let estimatedTotalSeconds = 0;
      let estimatedRemainingSeconds = 0;
      
      if (progressPercent > 5 && !statusResult.done) {
        estimatedTotalSeconds = Math.round(elapsedSeconds / (progressPercent / 100));
        estimatedRemainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);
      }
      
      const renderPhase = statusResult.done ? 'complete' : 
        progressPercent < 10 ? 'initializing' :
        progressPercent < 80 ? 'rendering' : 'encoding';
      
      res.json({
        success: true,
        done: statusResult.done,
        progress: statusResult.overallProgress,
        progressPercent,
        outputUrl: statusResult.outputFile,
        errors: statusResult.errors,
        project: projectData,
        elapsedSeconds,
        estimatedRemainingSeconds,
        estimatedTotalSeconds,
        renderPhase,
        renderStartTime,
        message: statusResult.done ? 'Render complete!' : 
          renderPhase === 'initializing' ? 'Initializing Lambda render...' :
          renderPhase === 'encoding' ? `Encoding video... ${progressPercent}%` :
          `Rendering video... ${progressPercent}%`,
      });
    } catch (progressError: any) {
      console.error(`[UniversalVideo] Error getting render progress for ${projectId}:`, progressError.message);
      
      // Handle rate limit errors gracefully - tell frontend to slow down
      const isRateLimited = progressError.message?.includes('Rate Exceeded') || 
                            progressError.message?.includes('TooManyRequests') ||
                            progressError.name === 'TooManyRequestsException';
      
      if (isRateLimited) {
        console.log(`[UniversalVideo] Rate limited - advising frontend to slow polling for ${projectId}`);
        return res.json({
          success: true,
          done: false,
          progress: projectData.progress.steps.rendering.progress / 100 || 0.1,
          outputUrl: null,
          errors: [],
          project: projectData,
          rateLimited: true,
          retryAfter: 10, // Suggest 10 second delay
        });
      }
      
      // If we can't get progress and it's been too long, mark as error
      if (elapsedTime > LAMBDA_TIMEOUT_MS) {
        projectData.status = 'error';
        projectData.progress.steps.rendering.status = 'error';
        projectData.progress.steps.rendering.message = 'Unable to get render status - render may have failed';
        projectData.progress.errors.push(`Render status check failed: ${progressError.message}`);
        
        await saveProjectToDb(projectData, projectData.ownerId);
        
        return res.json({ 
          success: false, 
          error: progressError.message || 'Failed to get render status',
          project: projectData,
          timeout: true,
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: progressError.message || 'Failed to get render status' 
      });
    }
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting render status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/generate-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { prompt, sceneId, aspectRatio } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt required' });
    }
    
    universalVideoService.clearNotifications();
    const result = await universalVideoService.generateImage(prompt, sceneId || 'standalone', false, 'content', aspectRatio || '16:9');
    const notifications = universalVideoService.getNotifications();
    
    res.json({
      success: result.success,
      url: result.url,
      source: result.source,
      error: result.error,
      notifications,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error generating image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/generate-voiceover', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { text, voiceId } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text required' });
    }
    
    universalVideoService.clearNotifications();
    const result = await universalVideoService.generateVoiceover(text, voiceId);
    const notifications = universalVideoService.getNotifications();
    
    res.json({
      success: result.success,
      url: result.url,
      duration: result.duration,
      error: result.error,
      notifications,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error generating voiceover:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/voices', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) {
      return res.status(500).json({ success: false, error: 'ElevenLabs not configured' });
    }

    console.log('[UniversalVideo] Fetching voices from ElevenLabs...');
    
    // Fetch user's available voices (includes premade, cloned, and added from library)
    const response = await fetch('https://api.elevenlabs.io/v1/voices?show_legacy=true', {
      headers: {
        'xi-api-key': elevenLabsKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    console.log(`[UniversalVideo] ElevenLabs returned ${data.voices?.length || 0} voices from user library`);
    
    // Format all available voices
    const voices = (data.voices || [])
      .map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description || '',
        preview_url: v.preview_url || '',
        labels: {
          accent: v.labels?.accent || '',
          age: v.labels?.age || '',
          gender: v.labels?.gender || '',
          use_case: v.labels?.use_case || v.labels?.['use case'] || '',
        },
      }))
      // Sort with best voices first
      .sort((a: any, b: any) => {
        // These are ElevenLabs' most natural-sounding voices
        const priority = ['Rachel', 'Drew', 'Clyde', 'Paul', 'Domi', 'Dave', 'Fin', 'Sarah', 'Antoni', 'Thomas', 'Charlotte', 'Alice', 'Matilda'];
        const aIndex = priority.indexOf(a.name);
        const bIndex = priority.indexOf(b.name);
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (aIndex >= 0) return -1;
        if (bIndex >= 0) return 1;
        return a.name.localeCompare(b.name);
      });

    console.log(`[UniversalVideo] Returning ${voices.length} formatted voices`);
    res.json({ success: true, voices });
  } catch (error: any) {
    console.error('[UniversalVideo] Error fetching voices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint for chunked render service diagnostics
router.get('/test-chunked-render', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const testScenes = [
      { id: 'test1', duration: 30, narration: 'Test scene 1', type: 'hook' },
      { id: 'test2', duration: 30, narration: 'Test scene 2', type: 'benefit' },
      { id: 'test3', duration: 30, narration: 'Test scene 3', type: 'explanation' },
      { id: 'test4', duration: 30, narration: 'Test scene 4', type: 'cta' },
    ];
    
    const totalDuration = testScenes.reduce((acc, s) => acc + s.duration, 0);
    const shouldChunk = chunkedRenderService.shouldUseChunkedRendering(testScenes, CHUNK_THRESHOLD_SEC);
    const chunks = chunkedRenderService.calculateChunks(testScenes, 30, 120);
    
    // Check FFmpeg
    let ffmpegAvailable = false;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const result = await execAsync('which ffmpeg');
      ffmpegAvailable = !!result.stdout;
    } catch (e) {
      ffmpegAvailable = false;
    }
    
    // Check AWS credentials
    const awsConfigured = !!process.env.REMOTION_AWS_ACCESS_KEY_ID && !!process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    
    res.json({
      success: true,
      diagnostics: {
        testDuration: totalDuration,
        shouldUseChunked: shouldChunk,
        chunkThreshold: 90,
        chunkCount: chunks.length,
        chunks: chunks.map(c => ({
          index: c.chunkIndex,
          scenes: c.scenes.length,
          startFrame: c.startFrame,
          endFrame: c.endFrame,
          duration: c.scenes.reduce((acc: number, s: any) => acc + (s.duration || 0), 0),
        })),
        ffmpegAvailable,
        awsConfigured,
        tempDir: '/tmp/video-chunks',
      },
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Test chunked render failed:', error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

router.get('/service-status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const services = {
      'fal.ai': {
        configured: !!process.env.FAL_KEY,
        role: 'PRIMARY - Image Generation',
      },
      'elevenlabs': {
        configured: !!process.env.ELEVENLABS_API_KEY,
        role: 'PRIMARY - Voiceover',
      },
      'anthropic': {
        configured: !!(process.env.PIAPI_API_KEY || process.env.ANTHROPIC_API_KEY),
        role: 'Script Generation (PiAPI primary, Anthropic fallback)',
      },
      'huggingface': {
        configured: !!process.env.HUGGINGFACE_API_TOKEN,
        role: 'FALLBACK - Image Generation',
      },
      'pexels': {
        configured: !!process.env.PEXELS_API_KEY,
        role: 'FALLBACK - Stock Images/Videos',
      },
      'unsplash': {
        configured: !!process.env.UNSPLASH_ACCESS_KEY,
        role: 'FALLBACK - Stock Images',
      },
      'remotion-lambda': {
        configured: !!process.env.REMOTION_AWS_ACCESS_KEY_ID && !!process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
        role: 'Video Rendering',
      },
    };
    
    res.json({ success: true, services });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting service status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== PHASE 12A: Motion Graphics Router Test Endpoint =====
router.post('/test-motion-graphics-routing', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { visualDirection, narration, sceneType, duration } = req.body;
    
    if (!visualDirection) {
      return res.status(400).json({ 
        success: false, 
        error: 'visualDirection is required' 
      });
    }
    
    // Test the routing decision
    const routingDecision = motionGraphicsRouter.analyzeVisualDirection(
      visualDirection,
      narration || '',
      sceneType || 'content'
    );
    
    // If routing to motion graphics, generate config
    let motionGraphicsConfig = null;
    if (routingDecision.useMotionGraphics && routingDecision.suggestedType) {
      const result = await motionGraphicsGenerator.generateMotionGraphic(
        visualDirection,
        narration || '',
        sceneType || 'content',
        duration || 5
      );
      
      if (result.success) {
        motionGraphicsConfig = {
          config: result.config,
          renderInstructions: result.renderInstructions,
        };
      }
    }
    
    res.json({
      success: true,
      routing: {
        useMotionGraphics: routingDecision.useMotionGraphics,
        confidence: routingDecision.confidence,
        confidencePercent: `${(routingDecision.confidence * 100).toFixed(0)}%`,
        detectedKeywords: routingDecision.detectedKeywords,
        suggestedType: routingDecision.suggestedType,
        reasoning: routingDecision.reasoning,
        fallbackToAI: routingDecision.fallbackToAI,
      },
      motionGraphicsConfig,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Motion graphics routing test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// ===== END PHASE 12A =====

router.post('/upload-url', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    console.log('[UniversalVideo] Getting presigned upload URL for user:', userId);
    const { uploadUrl, objectPath } = await objectStorageService.getObjectEntityUploadURL(userId);
    
    res.json({
      success: true,
      uploadUrl,
      objectPath,
      message: 'Upload URL generated. Use PUT request to upload image.',
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting upload URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13D: Reference image upload endpoint for I2I, I2V, and Style Reference
router.post('/upload-reference-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    console.log('[UniversalVideo] Getting presigned upload URL for reference image, user:', userId);
    const { uploadUrl, objectPath } = await objectStorageService.getObjectEntityUploadURL(userId);
    
    res.json({
      success: true,
      uploadUrl,
      objectPath,
      message: 'Upload URL generated for reference image. Use PUT request to upload image.',
      constraints: {
        maxSizeMB: 20,
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
        recommendedResolution: '1024x1024 or higher',
      },
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting reference image upload URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13: Motion reference video upload endpoint
router.post('/upload-motion-reference', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    console.log('[UniversalVideo] Getting presigned upload URL for motion reference video, user:', userId);
    const { uploadUrl, objectPath } = await objectStorageService.getObjectEntityUploadURL(userId);
    
    res.json({
      success: true,
      uploadUrl,
      objectPath,
      message: 'Upload URL generated for motion reference video. Use PUT request to upload video (3-30 seconds, max 100MB).',
      constraints: {
        minDuration: 3,
        maxDuration: 30,
        maxSizeMB: 100,
        supportedFormats: ['video/mp4', 'video/webm', 'video/quicktime'],
      },
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting motion reference upload URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13: Apply generation settings to project scenes
router.post('/projects/:projectId/apply-generation-settings', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    const settings = generationSettingsSchema.parse(req.body);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Apply audio and motion settings to all scenes
    const updatedScenes = projectData.scenes.map((scene: any) => ({
      ...scene,
      audioSettings: settings.audio,
      motionControlSettings: settings.motionControl,
    }));
    
    projectData.scenes = updatedScenes;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, userId);
    
    console.log('[UniversalVideo] Applied generation settings to project:', projectId, {
      audioEnabled: settings.audio?.enabled,
      motionControlEnabled: settings.motionControl?.enabled,
      preferredProvider: settings.preferredProvider,
    });
    
    res.json({
      success: true,
      message: 'Generation settings applied to all scenes',
      appliedSettings: {
        audio: settings.audio,
        motionControl: settings.motionControl,
        preferredProvider: settings.preferredProvider,
      },
      scenesUpdated: updatedScenes.length,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error applying generation settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13D: Apply reference config to a specific scene
router.post('/projects/:projectId/scenes/:sceneId/reference-config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    const referenceConfig = referenceConfigSchema.parse(req.body);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex((s: any) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    projectData.scenes[sceneIndex].referenceConfig = referenceConfig;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, userId);
    
    console.log('[UniversalVideo] Applied reference config to scene:', sceneId, {
      mode: referenceConfig.mode,
      sourceType: referenceConfig.sourceType,
      hasI2iSettings: !!referenceConfig.i2iSettings,
      hasI2vSettings: !!referenceConfig.i2vSettings,
      hasStyleSettings: !!referenceConfig.styleSettings,
    });
    
    res.json({
      success: true,
      message: `Reference config applied to scene ${sceneId}`,
      referenceConfig,
      scene: projectData.scenes[sceneIndex],
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error applying reference config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13D: Clear reference config from a scene
router.delete('/projects/:projectId/scenes/:sceneId/reference-config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex((s: any) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    delete projectData.scenes[sceneIndex].referenceConfig;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, userId);
    
    console.log('[UniversalVideo] Cleared reference config from scene:', sceneId);
    
    res.json({
      success: true,
      message: `Reference config cleared from scene ${sceneId}`,
      scene: projectData.scenes[sceneIndex],
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error clearing reference config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/product-images', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { objectPath, name, description, isPrimary } = req.body;
    
    const userId = (req.user as any)?.id?.toString();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(objectPath);
    
    if (!objectStorageService.verifyPresignedUpload(normalizedPath, userId)) {
      console.warn('[UniversalVideo] Upload verification failed, allowing anyway for flexibility');
    }
    
    await objectStorageService.trySetObjectEntityAclPolicy(
      normalizedPath,
      { owner: userId, visibility: 'public' }
    );
    
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newImage: ProductImage = {
      id: imageId,
      url: normalizedPath,
      name: name || `Product Image ${projectData.assets.productImages.length + 1}`,
      description: description || '',
      isPrimary: isPrimary || projectData.assets.productImages.length === 0,
    };
    
    if (isPrimary) {
      projectData.assets.productImages.forEach((img: ProductImage) => {
        img.isPrimary = false;
      });
    }
    
    projectData.assets.productImages.push(newImage);
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log('[UniversalVideo] Added product image to project:', projectId, imageId);
    
    res.json({
      success: true,
      image: newImage,
      totalImages: projectData.assets.productImages.length,
      message: 'Product image added successfully',
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error adding product image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects/:projectId/product-images', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    res.json({
      success: true,
      images: projectData.assets.productImages,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error getting product images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/projects/:projectId/product-images/:imageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, imageId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const imageIndex = projectData.assets.productImages.findIndex((img: ProductImage) => img.id === imageId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    
    const wasDeleted = projectData.assets.productImages.splice(imageIndex, 1);
    
    if (wasDeleted[0]?.isPrimary && projectData.assets.productImages.length > 0) {
      projectData.assets.productImages[0].isPrimary = true;
    }
    
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    res.json({
      success: true,
      message: 'Product image removed',
      remainingImages: projectData.assets.productImages.length,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error removing product image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/projects/:projectId/scenes/:sceneId/assign-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { imageId, useAI } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const scene = projectData.scenes[sceneIndex];
    
    if (useAI) {
      if (!scene.assets) {
        scene.assets = {};
      }
      scene.assets.imageUrl = undefined;
      scene.assets.useAIImage = true;
      
      projectData.updatedAt = new Date().toISOString();
      await saveProjectToDb(projectData, projectData.ownerId);
      
      res.json({
        success: true,
        message: 'Scene set to use AI-generated image',
        scene,
      });
    } else if (imageId) {
      const productImage = projectData.assets.productImages.find((img: ProductImage) => img.id === imageId);
      if (!productImage) {
        return res.status(404).json({ success: false, error: 'Product image not found' });
      }
      
      if (!scene.assets) {
        scene.assets = {};
      }
      scene.assets.imageUrl = productImage.url;
      scene.assets.useAIImage = false;
      scene.assets.assignedProductImageId = imageId;
      
      projectData.updatedAt = new Date().toISOString();
      await saveProjectToDb(projectData, projectData.ownerId);
      
      res.json({
        success: true,
        message: 'Product image assigned to scene',
        scene,
      });
    } else {
      return res.status(400).json({ success: false, error: 'Either imageId or useAI must be provided' });
    }
  } catch (error: any) {
    console.error('[UniversalVideo] Error assigning image to scene:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:projectId/scene/:sceneId/overlay', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { useProductOverlay } = req.body;
    
    if (typeof useProductOverlay !== 'boolean') {
      return res.status(400).json({ success: false, error: 'useProductOverlay must be a boolean' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const scene = projectData.scenes[sceneIndex];
    
    if (!scene.assets) {
      scene.assets = {};
    }
    scene.assets.useProductOverlay = useProductOverlay;
    
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    res.json({
      success: true,
      message: useProductOverlay ? 'Product overlay enabled' : 'Product overlay disabled',
      project: projectData,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Error updating scene overlay:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/scenes/:sceneId/regenerate-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { prompt, provider, generationMode, sourceImageUrl } = req.body;
    
    console.log(`[Phase9B] Regenerating image for scene ${sceneId} with provider: ${provider || 'default'}, mode: ${generationMode || 'auto'}`);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const projectAspectRatio = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
    const result = await universalVideoService.regenerateSceneImage(projectData, sceneId, prompt, provider, generationMode, sourceImageUrl, projectAspectRatio);
    
    if (result.success && result.newImageUrl) {
      const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
      if (sceneIndex >= 0) {
        const oldUrl = projectData.scenes[sceneIndex].assets?.imageUrl;
        if (oldUrl) {
          if (!projectData.scenes[sceneIndex].assets!.alternativeImages) {
            projectData.scenes[sceneIndex].assets!.alternativeImages = [];
          }
          projectData.scenes[sceneIndex].assets!.alternativeImages!.push({
            url: oldUrl,
            prompt: 'previous',
            source: 'previous'
          });
        }
        
        projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {};
        projectData.scenes[sceneIndex].assets!.imageUrl = result.newImageUrl;
        projectData.scenes[sceneIndex].assets!.backgroundUrl = result.newImageUrl;
        projectData.scenes[sceneIndex].background!.type = 'image';
        
        // Track generation method based on source type
        if (result.source === 'stock' || result.source?.includes('pexels') || result.source?.includes('unsplash')) {
          projectData.scenes[sceneIndex].generationMethod = 'stock';
        } else {
          const hasReferenceImage = projectData.scenes[sceneIndex].referenceConfig?.mode !== 'none' && 
                                    projectData.scenes[sceneIndex].referenceConfig?.imageUrl;
          projectData.scenes[sceneIndex].generationMethod = hasReferenceImage ? 'I2I' : 'T2I';
        }
        
        if (!projectData.regenerationHistory) projectData.regenerationHistory = [];
        projectData.regenerationHistory.push({
          id: `regen_${Date.now()}`,
          sceneId,
          assetType: 'image',
          previousUrl: oldUrl,
          newUrl: result.newImageUrl,
          prompt,
          timestamp: new Date().toISOString(),
          success: true
        });
        
        await saveProjectToDb(projectData, projectData.ownerId);
        
        // Phase 8A: Trigger background analysis for regenerated scene
        if (sceneAnalysisService.isAvailable()) {
          (async () => {
            try {
              let fullUrl = result.newImageUrl!;
              if (fullUrl.startsWith('/')) {
                const baseUrl = process.env.REPLIT_DEV_DOMAIN 
                  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
                  : 'http://localhost:5000';
                fullUrl = `${baseUrl}${fullUrl}`;
              }
              
              const imgResponse = await fetch(fullUrl, { headers: { 'Accept': 'image/*' } });
              if (imgResponse.ok) {
                const buffer = Buffer.from(await imgResponse.arrayBuffer());
                const base64 = buffer.toString('base64');
                
                const context: SceneContext = {
                  sceneIndex,
                  sceneType: projectData.scenes[sceneIndex].type || 'content',
                  narration: projectData.scenes[sceneIndex].narration || '',
                  visualDirection: projectData.scenes[sceneIndex].visualDirection || '',
                  expectedContentType: 'lifestyle',
                  totalScenes: projectData.scenes.length,
                };
                
                const analysis = await sceneAnalysisService.analyzeScenePhase8(base64, context);
                projectData.scenes[sceneIndex].analysisResult = analysis;
                projectData.scenes[sceneIndex].qualityScore = analysis.overallScore;
                await saveProjectToDb(projectData, projectData.ownerId);
                console.log(`[Phase8A] Scene ${sceneIndex + 1} analyzed after regeneration: score=${analysis.overallScore}`);
              }
            } catch (err: any) {
              console.warn('[Phase8A] Post-regeneration analysis failed:', err.message);
            }
          })();
        }
      }
      
      return res.json({ 
        success: true, 
        newImageUrl: result.newImageUrl,
        source: result.source,
        project: projectData
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Regenerate image error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/scenes/:sceneId/regenerate-video', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { query, provider, sourceImageUrl, sourceImageUrls: reqImageUrls, i2vSettings, motionControl, forceRegenerate, generationMode } = req.body;
    
    console.log(`[Phase9B-Async] Creating async video generation job for scene ${sceneId} with provider: ${provider || 'default'}${sourceImageUrl ? ', using I2V with source image' : ''}${i2vSettings ? ', with I2V settings' : ''}${forceRegenerate ? ', FORCE REGENERATE' : ''}`);
    console.log(`[Phase9B-Async] Generation mode: ${generationMode || 'auto'}`);
    console.log(`[Phase9B-Async] Source image URL from request: ${sourceImageUrl?.substring(0, 80) || 'none'}`);
    console.log(`[Phase9B-Async] I2V settings: ${JSON.stringify(i2vSettings || 'none')}`);
    console.log(`[Phase9B-Async] Motion control: ${JSON.stringify(motionControl || 'auto (intelligent)')}`);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Find the scene to get the visual direction/prompt FIRST (needed for job validation)
    const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    // Use provided query or scene's visual direction
    const prompt = query || scene.visualDirection || (scene as any).description || 'Professional wellness video';
    console.log(`[Phase9B-Async] Current visual direction: ${scene.visualDirection?.substring(0, 100) || 'none'}`);
    console.log(`[Phase9B-Async] Resolved prompt for generation: ${prompt.substring(0, 100)}...`);
    
    // Check if there's already an active job for this scene
    const { videoGenerationWorker } = await import('../services/video-generation-worker');
    const existingJob = await videoGenerationWorker.getActiveJobForScene(projectId, sceneId);
    if (existingJob && !forceRegenerate) {
      // Check if the existing job's prompt AND provider match the current request
      // If either differs, we need to create a new job
      const existingPrompt = existingJob.prompt || '';
      const existingProvider = existingJob.provider || '';
      const requestedProvider = provider || 'runway'; // Default provider
      
      const promptsMatch = existingPrompt.trim().toLowerCase() === prompt.trim().toLowerCase();
      const providersMatch = existingProvider.toLowerCase() === requestedProvider.toLowerCase();
      
      const existingSourceImage = (existingJob as any).sourceImageUrl || '';
      const sourceImagesMatch = !sourceImageUrl || existingSourceImage === sourceImageUrl;
      const jobAgeMs = Date.now() - new Date(existingJob.createdAt).getTime();
      const isStale = existingJob.status === 'pending' && jobAgeMs > 5 * 60 * 1000;
      
      if (promptsMatch && providersMatch && sourceImagesMatch && !isStale) {
        console.log(`[Phase9B-Async] Scene ${sceneId} already has active job with matching settings: ${existingJob.jobId}`);
        return res.json({ 
          success: true, 
          jobId: existingJob.jobId,
          status: existingJob.status,
          progress: existingJob.progress,
          message: 'Video generation already in progress'
        });
      } else {
        const changes = [];
        if (!promptsMatch) changes.push('prompt');
        if (!providersMatch) changes.push(`provider (${existingProvider} → ${requestedProvider})`);
        if (!sourceImagesMatch) changes.push('source image');
        if (isStale) changes.push(`stale (${Math.round(jobAgeMs / 60000)}min old, still ${existingJob.status})`);
        console.log(`[Phase9B-Async] Scene ${sceneId} has active job but ${changes.join(' and ')} changed - creating new job`);
        // Cancel the old stale job
        const { storage } = await import('../storage');
        await storage.updateVideoGenerationJob(existingJob.jobId, { status: 'failed' as any });
        // Continue to create new job with updated settings
      }
    } else if (existingJob && forceRegenerate) {
      console.log(`[Phase9B-Async] Scene ${sceneId} has active job but force regenerate requested - creating new job`);
    }
    const fallbackPrompt = (scene as any).summary || 'professional video';
    
    // Check if visual direction requires AI-generated people/activities (not compatible with location assets)
    const visualDir = (scene.visualDirection || '').toLowerCase();
    const requiresPeopleContent = visualDir.includes('montage') || 
                                   visualDir.includes('people') || 
                                   visualDir.includes('person') ||
                                   visualDir.includes('adults') ||
                                   visualDir.includes('yoga') ||
                                   visualDir.includes('cooking') ||
                                   visualDir.includes('hiking') ||
                                   visualDir.includes('activity');
    
    // Determine source image for I2V - use provided sourceImageUrl or scene's brandAssetUrl
    // BUT skip brandAssetUrl if the visual direction requires AI-generated people content
    // If explicit generationMode is "t2v", skip all source images (user chose text-to-video)
    const explicitMode = generationMode || 'auto';
    const forceT2V = explicitMode === 't2v';
    const forceI2V = explicitMode === 'i2v';
    const shouldUseBrandAsset = !forceT2V && scene.brandAssetUrl && !requiresPeopleContent;
    const relativeSourceUrl = forceT2V ? undefined : (sourceImageUrl || (shouldUseBrandAsset ? scene.brandAssetUrl : undefined));
    console.log(`[Phase9B-Async] Explicit generation mode: ${explicitMode}`);
    console.log(`[Phase9B-Async] Scene brandAssetUrl: ${scene.brandAssetUrl?.substring(0, 80) || 'none'}`);
    console.log(`[Phase9B-Async] Requires people content: ${requiresPeopleContent}, will use brandAsset: ${shouldUseBrandAsset}`);
    console.log(`[Phase9B-Async] Relative source image URL: ${relativeSourceUrl?.substring(0, 80) || 'none (T2V mode)'}`);
    
    // Convert relative URL to signed public URL for external video providers
    // Pad/crop the source image to match the project's target aspect ratio
    // because providers like Kling I2V use the source image dimensions for output
    let finalSourceImageUrl: string | undefined = undefined;
    if (relativeSourceUrl) {
      const projectAspectRatio = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
      console.log(`[Phase9B-Async] Target aspect ratio for I2V source image: ${projectAspectRatio}`);
      const publicUrl = await getPublicUrlForBrandAsset(relativeSourceUrl, projectAspectRatio);
      if (publicUrl) {
        finalSourceImageUrl = publicUrl;
        console.log(`[Phase9B-Async] ✓ Converted to public URL for I2V (padded to ${projectAspectRatio})`);
      } else {
        console.log(`[Phase9B-Async] ⚠ Could not convert to public URL, falling back to T2V mode`);
      }
    }
    
    if (!finalSourceImageUrl && !forceT2V) {
      const { isStylizedPreset: isStylizedCheck, getVisualArtPreset: getPreset } = await import('../../shared/config/visual-art-presets');
      const sceneArtPresetId = (scene as any).artPresetId || (projectData as any).progress?.artPresetId || (projectData as any).artPresetId;
      const sceneArtPreset = sceneArtPresetId ? getPreset(sceneArtPresetId) : null;
      const isStylizedScene = sceneArtPresetId ? isStylizedCheck(sceneArtPresetId) : false;

      if (sceneArtPreset && sceneArtPreset.generationStrategy === 'i2v') {
        console.log(`[Phase9B-Async] Art preset "${sceneArtPreset.name}" requires image-first I2V (universal pipeline)`);

        const existingImage = scene.assets?.imageUrl;
        if (existingImage) {
          finalSourceImageUrl = existingImage;
          console.log(`[Phase9B-Async] Using existing scene image for I2V: ${existingImage.substring(0, 80)}...`);
        } else {
          const falKey = process.env.FAL_KEY;
          if (!falKey) {
            console.warn(`[Phase9B-Async] FAL_KEY not configured — falling back to T2V`);
          } else {
            const { fal } = await import("@fal-ai/client");
            fal.config({ credentials: falKey });
            const { sanitizePromptForAI } = await import('../services/prompt-sanitizer');
            const sceneImagePrompt = (scene as any).imagePrompt;
            const imagePrompt = sceneImagePrompt
              ? sceneImagePrompt
              : `${sceneArtPreset.imagePromptPrefix} ${sanitizePromptForAI(prompt, scene.type || 'content').cleanPrompt}, ${sceneArtPreset.imagePromptSuffix}`;

            const projectAR = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
            const falSize = projectAR === '9:16' ? 'portrait_16_9' as const
              : projectAR === '1:1' ? 'square' as const
              : 'landscape_16_9' as const;

            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                if (attempt > 0) {
                  console.log(`[Phase9B-Async] Retry attempt ${attempt + 1} for stylized image...`);
                  await new Promise(r => setTimeout(r, 2000));
                }
                console.log(`[Phase9B-Async] Generating stylized image (attempt ${attempt + 1}): ${imagePrompt.substring(0, 120)}...`);

                const imgResult = await fal.subscribe("fal-ai/flux-pro/v1.1", {
                  input: { prompt: imagePrompt, image_size: falSize, num_images: 1, safety_tolerance: "2", enable_safety_checker: true },
                  logs: true,
                });

                if (imgResult.data?.images?.[0]?.url) {
                  finalSourceImageUrl = imgResult.data.images[0].url;
                  console.log(`[Phase9B-Async] Stylized image generated for I2V: ${finalSourceImageUrl.substring(0, 80)}...`);
                  break;
                } else {
                  console.warn(`[Phase9B-Async] No image returned (attempt ${attempt + 1})`);
                }
              } catch (imgErr: any) {
                console.warn(`[Phase9B-Async] Image generation failed (attempt ${attempt + 1}): ${imgErr.message}`);
              }
            }

            if (!finalSourceImageUrl) {
              console.warn(`[Phase9B-Async] All image attempts failed — falling back to T2V`);
            }
          }
        }
      }
    }

    if (finalSourceImageUrl) {
      console.log(`[Phase9B-Async] ✓ I2V mode active - will animate source image`);
    } else {
      console.log(`[Phase9B-Async] ✓ T2V mode - will generate from text prompt only`);
    }

    const sceneMotionPrompt = (scene as any).motionPrompt;
    const effectivePrompt = (finalSourceImageUrl && sceneMotionPrompt) ? sceneMotionPrompt : prompt;
    if (finalSourceImageUrl && sceneMotionPrompt) {
      console.log(`[Phase9B-Async] Using motionPrompt for I2V: "${sceneMotionPrompt.substring(0, 80)}..."`);
    }

    const sceneProviderHint = (scene as any).providerHint;
    const effectiveProvider = provider || undefined;
    if (!provider && sceneProviderHint) {
      console.log(`[Phase9B-Async] Pipeline providerHint: ${sceneProviderHint} (soft preference via i2vSettings)`);
    }

    let finalSourceImageUrls: string[] | undefined = undefined;
    const sceneRefImages = (scene as any).assets?.referenceImages as string[] | undefined;
    const allRefImages = (reqImageUrls && Array.isArray(reqImageUrls) && reqImageUrls.length > 0)
      ? reqImageUrls
      : (sceneRefImages && sceneRefImages.length > 0 ? sceneRefImages : undefined);
    if (allRefImages && allRefImages.length > 0 && !forceT2V) {
      const projectAR = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
      const resolvedUrls = await Promise.all(
        allRefImages.map((url: string) => getPublicUrlForBrandAsset(url, projectAR))
      );
      finalSourceImageUrls = resolvedUrls.filter((u): u is string => !!u);
      if (finalSourceImageUrls.length > 0) {
        console.log(`[Phase9B-Async] ✓ Multi-image I2V: ${finalSourceImageUrls.length} reference images resolved`);
        if (!finalSourceImageUrl && finalSourceImageUrls.length > 0) {
          finalSourceImageUrl = finalSourceImageUrls[0];
        }
      } else {
        finalSourceImageUrls = undefined;
      }
    }
    
    let normalizedMotionControl: { camera_movement: string; intensity: number } | undefined = undefined;
    if (motionControl && motionControl.cameraMovement && motionControl.cameraMovement !== 'auto') {
      normalizedMotionControl = {
        camera_movement: motionControl.cameraMovement,
        intensity: (motionControl.intensity ?? 50) / 100,
      };
      console.log(`[Phase16] Motion control override: ${normalizedMotionControl.camera_movement} @ ${normalizedMotionControl.intensity}`);
    } else {
      console.log(`[Phase16] Using intelligent motion control for scene type: ${scene.type || 'content'}`);
    }
    
    const jobI2vWithHint = {
      ...(i2vSettings || {}),
      ...(!provider && sceneProviderHint ? { providerHint: sceneProviderHint } : {}),
    };

    const job = await videoGenerationWorker.createJob({
      projectId,
      sceneId,
      provider: effectiveProvider,
      prompt: effectivePrompt,
      fallbackPrompt,
      duration: scene.duration || 6,
      aspectRatio: (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9',
      style: (projectData as any).settings?.visualStyle || 'professional',
      triggeredBy: userId,
      sourceImageUrl: finalSourceImageUrl,
      sourceImageUrls: finalSourceImageUrls,
      i2vSettings: Object.keys(jobI2vWithHint).length > 0 ? jobI2vWithHint : undefined,
      motionControl: normalizedMotionControl,
      sceneType: scene.type || 'content',
    });
    
    console.log(`[Phase9B-Async] Created job ${job.jobId} for scene ${sceneId}`);
    
    return res.json({ 
      success: true, 
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      message: 'Video generation job created'
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Regenerate video error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/scenes/:sceneId/micro-scene/:microSceneIndex/regenerate-video', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId, microSceneIndex } = req.params;
    const { provider, generationMode, query, sourceImageUrl } = req.body;
    const msIdx = parseInt(microSceneIndex, 10);

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const microScenes = (scene as any).microScenes || [];
    if (msIdx < 0 || msIdx >= microScenes.length) {
      return res.status(404).json({ success: false, error: 'Micro-scene not found' });
    }

    const ms = microScenes[msIdx];
    const prompt = query || ms.visualDirection || scene.visualDirection || 'Professional video';
    console.log(`[MicroScene-Regen] Regenerating micro-scene ${msIdx} for scene ${sceneId}, prompt: ${prompt.substring(0, 100)}`);

    let finalSourceImageUrl: string | undefined = undefined;
    if (sourceImageUrl && generationMode !== 't2v') {
      const projectAspectRatio = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
      const publicUrl = await getPublicUrlForBrandAsset(sourceImageUrl, projectAspectRatio);
      if (publicUrl) {
        finalSourceImageUrl = publicUrl;
        console.log(`[MicroScene-Regen] I2V mode with user-provided source image`);
      }
    }

    const { isStylizedPreset, getVisualArtPreset } = await import('../../shared/config/visual-art-presets');
    const projectArtPresetId = (scene as any).artPresetId || (projectData as any).progress?.artPresetId || (projectData as any).artPresetId;
    const artPreset = projectArtPresetId ? getVisualArtPreset(projectArtPresetId) : null;
    const isStylizedArt = projectArtPresetId ? isStylizedPreset(projectArtPresetId) : false;
    console.log(`[MicroScene-Regen] Art preset: ${projectArtPresetId || 'none'} (${artPreset?.name || 'N/A'}), stylized: ${isStylizedArt}, strategy: ${artPreset?.generationStrategy || 'N/A'}, generationMode: ${generationMode || 'auto'}`);
    const msData = (scene as any).microScenes?.[msIdx];
    const needsImageFirst = artPreset && artPreset.generationStrategy === 'i2v'
      && !finalSourceImageUrl && generationMode !== 't2v';

    if (needsImageFirst) {
      console.log(`[MicroScene-Regen] Art preset "${artPreset!.name}" requires image-first I2V — generating FRESH intermediate image`);

      let stylizedImageUrl: string | undefined = undefined;

      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        console.warn(`[MicroScene-Regen] FAL_KEY not configured — falling back to T2V`);
      } else {
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: falKey });
        const { sanitizePromptForAI } = await import('../services/prompt-sanitizer');
        const msImagePrompt = msData?.imagePrompt;
        const imagePrompt = msImagePrompt
          ? msImagePrompt
          : `${artPreset!.imagePromptPrefix} ${sanitizePromptForAI(prompt, scene.type || 'content').cleanPrompt}, ${artPreset!.imagePromptSuffix}`;

        const projectAspectRatio = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
        const falSize = projectAspectRatio === '9:16' ? 'portrait_16_9' as const
          : projectAspectRatio === '1:1' ? 'square' as const
          : 'landscape_16_9' as const;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`[MicroScene-Regen] Retry attempt ${attempt + 1} for stylized image...`);
              await new Promise(r => setTimeout(r, 2000));
            }
            console.log(`[MicroScene-Regen] Generating stylized image (attempt ${attempt + 1}): ${imagePrompt.substring(0, 120)}...`);

            const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
              input: {
                prompt: imagePrompt,
                image_size: falSize,
                num_images: 1,
                safety_tolerance: "2",
                enable_safety_checker: true,
              },
              logs: true,
            });

            if (result.data?.images?.[0]?.url) {
              stylizedImageUrl = result.data.images[0].url;
              console.log(`[MicroScene-Regen] Stylized image generated: ${stylizedImageUrl.substring(0, 80)}...`);

              const { updateMicroSceneImageUrl } = await import('./video-project-db');
              const saved = await updateMicroSceneImageUrl(projectId, sceneId, msIdx, stylizedImageUrl);
              if (saved) {
                console.log(`[MicroScene-Regen] Atomically saved stylized image URL to micro-scene ${msIdx}`);
              } else {
                console.warn(`[MicroScene-Regen] Failed to save stylized image URL — project/scene/ms not found`);
              }
              break;
            } else {
              console.warn(`[MicroScene-Regen] No image returned (attempt ${attempt + 1})`);
            }
          } catch (imgErr: any) {
            console.warn(`[MicroScene-Regen] Image generation failed (attempt ${attempt + 1}): ${imgErr.message}`);
          }
        }

        if (!stylizedImageUrl) {
          console.warn(`[MicroScene-Regen] All image attempts failed — falling back to T2V`);
        }
      }

      if (stylizedImageUrl) {
        finalSourceImageUrl = stylizedImageUrl;
        console.log(`[MicroScene-Regen] Using stylized image for I2V video generation`);
      }
    } else if (isStylizedArt && artPreset) {
      console.log(`[MicroScene-Regen] Stylized art preset "${artPreset.name}" active but using T2V (generationMode=${generationMode || 'auto'}, hasSourceImage=${!!finalSourceImageUrl})`);
    }

    const { videoGenerationWorker } = await import('../services/video-generation-worker');

    const msMotionPrompt = msData?.motionPrompt || (scene as any).motionPrompt;
    const effectiveMsPrompt = (finalSourceImageUrl && msMotionPrompt) ? msMotionPrompt : prompt;
    if (finalSourceImageUrl && msMotionPrompt) {
      console.log(`[MicroScene-Regen] Using motionPrompt for I2V: "${msMotionPrompt.substring(0, 80)}..."`);
    }

    const msProviderHint = msData?.providerHint || (scene as any).providerHint;
    const effectiveMsProvider = provider || undefined;
    if (!provider && msProviderHint) {
      console.log(`[MicroScene-Regen] Pipeline providerHint: ${msProviderHint} (preference, not strict lock)`);
    }

    const msI2vWithHint = !provider && msProviderHint ? { providerHint: msProviderHint } : undefined;

    const job = await videoGenerationWorker.createJob({
      projectId,
      sceneId: `${sceneId}__micro_${msIdx}`,
      provider: effectiveMsProvider,
      prompt: effectiveMsPrompt,
      fallbackPrompt: ms.narration || 'professional video',
      duration: ms.duration || 5,
      aspectRatio: (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9',
      style: (projectData as any).settings?.visualStyle || 'professional',
      triggeredBy: userId,
      sourceImageUrl: finalSourceImageUrl,
      i2vSettings: msI2vWithHint,
      sceneType: scene.type || 'content',
    });

    console.log(`[MicroScene-Regen] Created job ${job.jobId} for micro-scene ${msIdx}${finalSourceImageUrl ? ' (I2V with image)' : ' (T2V)'}`);

    return res.json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      microSceneIndex: msIdx,
      message: 'Micro-scene video generation job created'
    });
  } catch (error: any) {
    console.error('[MicroScene-Regen] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/scenes/:sceneId/regenerate-all-micro-scene-videos', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { provider, generationMode } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const microScenes = (scene as any).microScenes || [];
    if (microScenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No micro-scenes to generate' });
    }

    const { isStylizedPreset, getVisualArtPreset } = await import('../../shared/config/visual-art-presets');
    const projectArtPresetId = (scene as any).artPresetId || (projectData as any).progress?.artPresetId || (projectData as any).artPresetId;
    const artPreset = projectArtPresetId ? getVisualArtPreset(projectArtPresetId) : null;
    const isStylizedArt = projectArtPresetId ? isStylizedPreset(projectArtPresetId) : false;
    const needsImageFirst = artPreset && artPreset.generationStrategy === 'i2v'
      && generationMode !== 't2v';

    console.log(`[BatchMicroRegen] Regenerating ALL ${microScenes.length} micro-scenes for scene ${sceneId}`);
    console.log(`[BatchMicroRegen] Art preset: ${artPreset?.name || 'none'} (stylized=${isStylizedArt}, needsImageFirst=${needsImageFirst})`);

    const projectAspectRatio = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';

    const imageUpdates: Array<{ msIdx: number; imageUrl: string }> = [];
    const msSourceImages: (string | undefined)[] = new Array(microScenes.length).fill(undefined);

    if (needsImageFirst) {
      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        console.warn(`[BatchMicroRegen] FAL_KEY not configured — all micro-scenes will use T2V`);
      } else {
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: falKey });
        const { sanitizePromptForAI } = await import('../services/prompt-sanitizer');

        const falSize = projectAspectRatio === '9:16' ? 'portrait_16_9' as const
          : projectAspectRatio === '1:1' ? 'square' as const
          : 'landscape_16_9' as const;

        for (let i = 0; i < microScenes.length; i++) {
          const ms = microScenes[i];

          const msImagePromptFromPipeline = ms.imagePrompt;
          const msPrompt = ms.visualDirection || scene.visualDirection || 'Professional video';
          const imagePrompt = msImagePromptFromPipeline
            ? msImagePromptFromPipeline
            : `${artPreset!.imagePromptPrefix} ${sanitizePromptForAI(msPrompt, scene.type || 'content').cleanPrompt}, ${artPreset!.imagePromptSuffix}`;

          let generated = false;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              if (attempt > 0) {
                console.log(`[BatchMicroRegen] MS ${i}: Retry attempt ${attempt + 1}...`);
                await new Promise(r => setTimeout(r, 2000));
              }
              console.log(`[BatchMicroRegen] MS ${i}: Generating stylized image (attempt ${attempt + 1})...`);

              const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
                input: {
                  prompt: imagePrompt,
                  image_size: falSize,
                  num_images: 1,
                  safety_tolerance: "2",
                  enable_safety_checker: true,
                },
                logs: true,
              });

              if (result.data?.images?.[0]?.url) {
                msSourceImages[i] = result.data.images[0].url;
                imageUpdates.push({ msIdx: i, imageUrl: result.data.images[0].url });
                console.log(`[BatchMicroRegen] MS ${i}: Stylized image generated: ${result.data.images[0].url.substring(0, 60)}...`);
                generated = true;
                break;
              } else {
                console.warn(`[BatchMicroRegen] MS ${i}: No image returned (attempt ${attempt + 1})`);
              }
            } catch (imgErr: any) {
              console.warn(`[BatchMicroRegen] MS ${i}: Image generation failed (attempt ${attempt + 1}): ${imgErr.message}`);
            }
          }

          if (!generated) {
            console.warn(`[BatchMicroRegen] MS ${i}: All image attempts failed — will use T2V fallback`);
          }
        }
      }

      if (imageUpdates.length > 0) {
        const { batchUpdateMicroSceneImageUrls } = await import('./video-project-db');
        const saved = await batchUpdateMicroSceneImageUrls(projectId, sceneId, imageUpdates);
        if (saved) {
          console.log(`[BatchMicroRegen] Atomically saved ${imageUpdates.length} stylized image URLs`);
        } else {
          console.warn(`[BatchMicroRegen] Failed to save image URLs — project/scene not found`);
        }
      }
    }

    const { videoGenerationWorker } = await import('../services/video-generation-worker');
    const jobResults: Array<{ msIdx: number; jobId: string; mode: string }> = [];

    for (let i = 0; i < microScenes.length; i++) {
      const ms = microScenes[i];
      const msPrompt = ms.visualDirection || scene.visualDirection || 'Professional video';

      const msMotionPrompt = ms.motionPrompt || (scene as any).motionPrompt;
      const effectiveBatchPrompt = (msSourceImages[i] && msMotionPrompt) ? msMotionPrompt : msPrompt;

      const msProviderHint = ms.providerHint || (scene as any).providerHint;
      const effectiveBatchProvider = provider || undefined;

      const jobI2vSettings: any = {};
      if (projectArtPresetId) {
        jobI2vSettings.snapshotArtPresetId = projectArtPresetId;
      }
      if (!provider && msProviderHint) {
        jobI2vSettings.providerHint = msProviderHint;
      }

      const job = await videoGenerationWorker.createJob({
        projectId,
        sceneId: `${sceneId}__micro_${i}`,
        provider: effectiveBatchProvider,
        prompt: effectiveBatchPrompt,
        fallbackPrompt: ms.narration || 'professional video',
        duration: ms.duration || 5,
        aspectRatio: projectAspectRatio,
        style: (projectData as any).settings?.visualStyle || 'professional',
        triggeredBy: userId,
        sourceImageUrl: msSourceImages[i],
        sceneType: scene.type || 'content',
        i2vSettings: Object.keys(jobI2vSettings).length > 0 ? jobI2vSettings : undefined,
      });

      const mode = msSourceImages[i] ? 'I2V' : 'T2V';
      jobResults.push({ msIdx: i, jobId: job.jobId, mode });
      console.log(`[BatchMicroRegen] MS ${i}: Created job ${job.jobId} (${mode})`);
    }

    console.log(`[BatchMicroRegen] All ${jobResults.length} jobs created for scene ${sceneId}`);

    return res.json({
      success: true,
      jobs: jobResults,
      message: `${jobResults.length} micro-scene video generation jobs created`,
    });
  } catch (error: any) {
    console.error('[BatchMicroRegen] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:projectId/scenes/:sceneId/micro-scene-jobs', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const projectData = await getProjectFromDb(projectId);
    if (!projectData || projectData.ownerId !== userId) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const runningJobs = await db.select().from(videoGenerationJobs)
      .where(and(
        eq(videoGenerationJobs.projectId, projectId),
        like(videoGenerationJobs.sceneId, `${sceneId}__micro_%`),
        or(
          eq(videoGenerationJobs.status, 'pending'),
          eq(videoGenerationJobs.status, 'running')
        )
      ));
    const activeJobs: Record<number, { jobId: string; status: string; createdAt: string }> = {};
    for (const job of runningJobs) {
      const match = job.sceneId.match(/__micro_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]);
        if (!activeJobs[idx] || new Date(job.createdAt!) > new Date(activeJobs[idx].createdAt)) {
          activeJobs[idx] = { jobId: job.jobId, status: job.status, createdAt: job.createdAt!.toISOString() };
        }
      }
    }
    return res.json({ success: true, activeJobs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get video generation job status
router.get('/:projectId/scenes/:sceneId/video-job/:jobId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId, jobId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const { videoGenerationWorker } = await import('../services/video-generation-worker');
    const job = await videoGenerationWorker.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    // If job succeeded, also return updated scene data
    let updatedProject = projectData;
    if (job.status === 'succeeded' && job.videoUrl) {
      // Update scene with new video URL
      const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
      if (sceneIndex >= 0) {
        const oldUrl = projectData.scenes[sceneIndex].assets?.videoUrl;
        if (oldUrl && oldUrl !== job.videoUrl) {
          if (!projectData.scenes[sceneIndex].assets!.alternativeVideos) {
            projectData.scenes[sceneIndex].assets!.alternativeVideos = [];
          }
          projectData.scenes[sceneIndex].assets!.alternativeVideos!.push({
            url: oldUrl,
            query: 'previous',
            source: 'previous'
          });
        }
        
        projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {};
        projectData.scenes[sceneIndex].assets!.videoUrl = job.videoUrl;
        projectData.scenes[sceneIndex].background = projectData.scenes[sceneIndex].background || { type: 'video', source: '' };
        projectData.scenes[sceneIndex].background!.type = 'video';
        projectData.scenes[sceneIndex].background!.videoUrl = job.videoUrl;
        
        // Track generation method based on source type and job metadata
        if (job.source === 'stock' || job.provider?.includes('pexels') || job.provider?.includes('pixabay')) {
          projectData.scenes[sceneIndex].generationMethod = 'stock';
        } else {
          // Check if we used a source video (V2V) or source image (I2V) or just text prompt (T2V)
          const hadSourceVideo = projectData.scenes[sceneIndex].background?.videoUrl && 
                                 projectData.scenes[sceneIndex].background?.videoUrl !== job.videoUrl;
          const hadSourceImage = projectData.scenes[sceneIndex].assets?.imageUrl || 
                                 projectData.scenes[sceneIndex].assets?.backgroundUrl ||
                                 projectData.scenes[sceneIndex].brandAssetUrl;
          
          if (hadSourceVideo) {
            projectData.scenes[sceneIndex].generationMethod = 'V2V';
          } else if (hadSourceImage) {
            projectData.scenes[sceneIndex].generationMethod = 'I2V';
          } else {
            projectData.scenes[sceneIndex].generationMethod = 'T2V';
          }
        }
        
        if (!projectData.regenerationHistory) projectData.regenerationHistory = [];
        projectData.regenerationHistory.push({
          id: `regen_${Date.now()}`,
          sceneId,
          assetType: 'video',
          previousUrl: oldUrl,
          newUrl: job.videoUrl,
          prompt: job.prompt || undefined,
          timestamp: new Date().toISOString(),
          success: true
        });
        
        // Record to scene regeneration history for UI tracking
        const priorHistory = await intelligentRegenerationService.getSceneHistory(sceneId, projectId);
        const attemptNumber = priorHistory.length + 1;
        try {
          await db.insert(sceneRegenerationHistory).values({
            sceneId,
            projectId,
            attemptNumber,
            provider: job.provider || 'unknown',
            strategy: projectData.scenes[sceneIndex].generationMethod || 'T2V',
            prompt: job.prompt || '',
            result: 'success',
            qualityScore: projectData.scenes[sceneIndex].qualityScore?.toString() || null,
            issues: null,
            reasoning: `Video generation completed via ${job.provider || 'unknown'}`,
            confidenceScore: '1.0',
          });
          console.log(`[Regeneration] Recorded successful attempt #${attemptNumber} for scene ${sceneId}`);
        } catch (historyErr) {
          console.warn('[Regeneration] Failed to record history:', historyErr);
        }
        
        await saveProjectToDb(projectData, projectData.ownerId);
        updatedProject = projectData;
      }
    }
    
    // Record failed attempts to history
    if (job.status === 'failed') {
      try {
        const priorHistory = await intelligentRegenerationService.getSceneHistory(sceneId, projectId);
        const attemptNumber = priorHistory.length + 1;
        await db.insert(sceneRegenerationHistory).values({
          sceneId,
          projectId,
          attemptNumber,
          provider: job.provider || 'unknown',
          strategy: 'T2V',
          prompt: job.prompt || '',
          result: 'failure',
          qualityScore: null,
          issues: job.errorMessage || 'Unknown error',
          reasoning: `Video generation failed: ${job.errorMessage || 'Unknown error'}`,
          confidenceScore: '0',
        });
        console.log(`[Regeneration] Recorded failed attempt #${attemptNumber} for scene ${sceneId}`);
      } catch (historyErr) {
        console.warn('[Regeneration] Failed to record failure history:', historyErr);
      }
    }
    
    return res.json({
      success: true,
      job: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        videoUrl: job.videoUrl,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
      project: job.status === 'succeeded' ? updatedProject : undefined,
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Get job status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get active jobs for a scene
router.get('/:projectId/scenes/:sceneId/active-jobs', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const { videoGenerationWorker } = await import('../services/video-generation-worker');
    const jobs = await videoGenerationWorker.getJobsByScene(projectId, sceneId);
    const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');
    
    return res.json({
      success: true,
      jobs: activeJobs.map(job => ({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        provider: job.provider,
        startedAt: job.startedAt,
        createdAt: job.createdAt,
      })),
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Get active jobs error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:projectId/scenes/:sceneId/latest-job-status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const sinceMs = req.query.since ? parseInt(req.query.since as string, 10) : 0;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const { videoGenerationWorker } = await import('../services/video-generation-worker');
    const jobs = await videoGenerationWorker.getJobsByScene(projectId, sceneId);
    const filtered = sinceMs > 0
      ? jobs.filter(j => (j.createdAt?.getTime() || 0) >= sinceMs)
      : jobs;
    const sorted = filtered.sort((a, b) => {
      const aTime = a.completedAt?.getTime() || a.createdAt?.getTime() || 0;
      const bTime = b.completedAt?.getTime() || b.createdAt?.getTime() || 0;
      return bTime - aTime;
    });
    const latest = sorted[0];
    
    if (!latest) {
      return res.json({ success: true, status: 'none' });
    }
    
    return res.json({
      success: true,
      status: latest.status,
      error: latest.errorMessage || null,
      provider: latest.provider,
      completedAt: latest.completedAt,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Get latest job status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Video Object Replacement Schema
const replaceObjectSchema = z.object({
  replacementImageUrl: z.string().min(1, 'Replacement image URL is required').refine(
    (url) => {
      // Accept full URLs or relative paths starting with /api or https
      return url.startsWith('http') || url.startsWith('/api') || url.startsWith('blob:');
    },
    { message: 'Invalid replacement image URL format' }
  ),
  objectDescription: z.string().max(200).optional().default('the product bottle'),
  prompt: z.string().max(500).optional(),
});

// Video Object Replacement - Replace product/object in existing video with brand asset
router.post('/:projectId/scenes/:sceneId/replace-object', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    
    // Debug logging
    console.log('[ObjectReplace] Raw request body:', JSON.stringify(req.body, null, 2));
    
    // Validate request body with Zod
    const validationResult = replaceObjectSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('[ObjectReplace] Validation failed:', validationResult.error.errors);
      console.error('[ObjectReplace] Received replacementImageUrl:', req.body?.replacementImageUrl);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request: ' + validationResult.error.errors.map(e => e.message).join(', ')
      });
    }
    
    const { replacementImageUrl, objectDescription, prompt } = validationResult.data;
    console.log('[ObjectReplace] Validated replacementImageUrl:', replacementImageUrl);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Find the scene
    const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    // Get the current video URL
    const currentVideoUrl = scene.assets?.videoUrl;
    if (!currentVideoUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Scene has no video to edit - generate a video first' 
      });
    }
    
    console.log(`[ObjectReplace] Starting object replacement for scene ${sceneId}`);
    console.log(`[ObjectReplace] Source video: ${currentVideoUrl.substring(0, 80)}...`);
    console.log(`[ObjectReplace] Replacement image (raw): ${replacementImageUrl.substring(0, 80)}...`);
    
    // Resolve internal URLs to public HTTPS URLs for external API access
    let resolvedImageUrl = replacementImageUrl;
    if (replacementImageUrl.startsWith('/api/brand-assets/file/')) {
      const assetId = parseInt(replacementImageUrl.split('/').pop() || '0');
      console.log(`[ObjectReplace] Resolving brand asset ID: ${assetId}`);
      
      if (assetId > 0) {
        try {
          const [asset] = await db.select().from(brandAssets).where(eq(brandAssets.id, assetId));
          if (asset) {
            const settings = asset.settings as any;
            if (settings?.storagePath) {
              const parts = settings.storagePath.split('|');
              const bucketName = parts[0];
              const filePath = parts[1];
              
              if (bucketName && filePath) {
                const { signObjectURL } = await import('@replit/object-storage');
                resolvedImageUrl = await signObjectURL({
                  bucketName,
                  objectName: filePath,
                  method: 'GET',
                  ttlSec: 3600,
                });
                console.log(`[ObjectReplace] Resolved to signed URL: ${resolvedImageUrl.substring(0, 80)}...`);
              }
            }
          }
        } catch (error) {
          console.error(`[ObjectReplace] Error resolving URL:`, error);
        }
      }
    }
    
    // Import and use the PiAPI service for object replacement
    const { piapiVideoService } = await import('../services/piapi-video-service');
    
    const replacementPrompt = prompt || 
      `Replace the product/bottle in this video with the brand product shown in the reference image. Maintain the same motion, lighting, and camera movement.`;
    
    const result = await piapiVideoService.replaceObjectInVideo({
      videoUrl: currentVideoUrl,
      replacementImageUrl: resolvedImageUrl,
      prompt: replacementPrompt,
      objectDescription: objectDescription || 'the product bottle',
      duration: scene.duration || 5,
      aspectRatio: (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9',
    });
    
    if (!result.success) {
      console.error(`[ObjectReplace] Failed:`, result.error);
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Object replacement failed'
      });
    }
    
    // Store the old video as an alternative
    if (!scene.assets!.alternativeVideos) {
      scene.assets!.alternativeVideos = [];
    }
    scene.assets!.alternativeVideos.push({
      url: currentVideoUrl,
      query: 'before-object-replacement',
      source: scene.assets!.videoSource || 'ai-generated',
    });
    
    // Update scene with new video
    scene.assets!.videoUrl = result.s3Url || result.videoUrl;
    scene.assets!.videoSource = 'object-replacement';
    scene.generatedAt = new Date().toISOString();
    
    // Record in regeneration history
    if (!projectData.regenerationHistory) projectData.regenerationHistory = [];
    projectData.regenerationHistory.push({
      id: `objreplace_${Date.now()}`,
      sceneId,
      assetType: 'video',
      previousUrl: currentVideoUrl,
      newUrl: result.s3Url || result.videoUrl,
      prompt: replacementPrompt,
      timestamp: new Date().toISOString(),
      success: true,
      method: 'object-replacement',
    });
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    console.log(`[ObjectReplace] Success! New video: ${(result.s3Url || result.videoUrl || '').substring(0, 80)}...`);
    
    return res.json({
      success: true,
      newVideoUrl: result.s3Url || result.videoUrl,
      scene,
      project: projectData,
      generationTimeMs: result.generationTimeMs,
      cost: result.cost,
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Replace object error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/scenes/:sceneId/switch-background', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { preferVideo } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const result = await universalVideoService.switchSceneBackgroundType(
      projectData, 
      sceneId, 
      preferVideo === true
    );
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
      return res.json({ success: true, scene, project: projectData });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Switch background error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Set scene media from external source (Pexels, Unsplash, Brand Media, Asset Library)
router.patch('/:projectId/scenes/:sceneId/set-media', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { mediaUrl, mediaType, source } = req.body;
    
    if (!mediaUrl || !mediaType || !source) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: mediaUrl, mediaType, source' 
      });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Find the scene
    const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
    if (sceneIndex === -1) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const scene = projectData.scenes[sceneIndex];
    
    // Push to history before making changes
    universalVideoService.pushToHistory(projectData, `Set ${mediaType} from ${source}`, ['scenes']);
    
    // Initialize assets if needed
    if (!scene.assets) {
      scene.assets = {} as any;
    }
    
    // Update scene based on media type
    if (mediaType === 'video') {
      // Set as b-roll video
      const existingPrompt = (scene.background as any)?.prompt;
      scene.background = {
        type: 'video',
        videoUrl: mediaUrl,
        source: source as any,
        prompt: existingPrompt
      } as any;
      // Clear any existing image background
      if (scene.assets) {
        (scene.assets as any).backgroundUrl = undefined;
        (scene.assets as any).backgroundSource = undefined;
      }
    } else {
      // Set as image background - update both background and assets for proper UI rendering
      const existingPrompt = (scene.background as any)?.prompt;
      scene.background = {
        type: 'image',
        imageUrl: mediaUrl,
        source: source as any,
        prompt: existingPrompt
      } as any;
      scene.assets!.backgroundUrl = mediaUrl;
      (scene.assets as any).backgroundSource = source;
    }
    
    await saveProjectToDb(projectData, projectData.ownerId);
    const historyStatus = universalVideoService.getHistoryStatus(projectData);
    
    return res.json({ 
      success: true, 
      scene: projectData.scenes[sceneIndex],
      project: projectData,
      historyStatus 
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Set media error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 2: Product Overlay Editor
router.patch('/:projectId/scenes/:sceneId/product-overlay', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { enabled, position, scale, animation } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Push to history before making changes
    universalVideoService.pushToHistory(projectData, 'Update overlay settings', ['scenes']);
    
    const result = universalVideoService.updateProductOverlay(projectData, sceneId, {
      enabled,
      position,
      scale,
      animation,
    });
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      const scene = projectData.scenes.find((s: Scene) => s.id === sceneId);
      const historyStatus = universalVideoService.getHistoryStatus(projectData);
      return res.json({ success: true, scene, project: projectData, historyStatus });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Product overlay update error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 2: Voiceover Regeneration
router.post('/:projectId/regenerate-voiceover', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { voiceId, sceneIds } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    console.log(`[UniversalVideo] Regenerating voiceover for project ${projectId}, voice: ${voiceId || 'default'}`);
    
    const result = await universalVideoService.regenerateVoiceover(projectData, {
      voiceId,
      sceneIds,
    });
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      return res.json({ 
        success: true, 
        voiceoverUrl: result.voiceoverUrl,
        duration: result.duration,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Voiceover regeneration error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 2: Regenerate Music with Udio AI
router.post('/:projectId/regenerate-music', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { style, mood, musicStyle, customPrompt } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    console.log(`[UniversalVideo] Regenerating music for project ${projectId}, mood: ${mood || 'inspirational'}, style: ${musicStyle || 'wellness'}`);
    
    const result = await universalVideoService.regenerateMusic(projectData, style, {
      mood: mood || 'inspirational',
      musicStyle: musicStyle || 'wellness',
      customPrompt,
    });
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      return res.json({ 
        success: true, 
        musicUrl: result.musicUrl,
        duration: result.duration,
        source: result.source,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Music regeneration error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// In-memory storage for bulk regeneration status (per project)
const bulkRegenerationStatus: Map<string, {
  status: 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  failed: number;
  errors: string[];
  startedAt: Date;
}> = new Map();

// Bulk regenerate all videos for a project
router.post('/:projectId/regenerate-all-videos', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scenes = projectData.scenes || [];
    if (scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No scenes to regenerate' });
    }
    
    console.log(`[UniversalVideo] Starting bulk video regeneration for project ${projectId} with ${scenes.length} scenes`);
    
    // Initialize status tracking
    bulkRegenerationStatus.set(projectId, {
      status: 'running',
      total: scenes.length,
      completed: 0,
      failed: 0,
      errors: [],
      startedAt: new Date()
    });
    
    // Start async regeneration process (don't await - return immediately)
    (async () => {
      const status = bulkRegenerationStatus.get(projectId)!;
      
      for (const scene of scenes) {
        try {
          // Determine provider: use existing scene's videoSource, or default to 'runway'
          const existingProvider = scene.background?.videoSource || 
                                   (scene.assets as any)?.requestedProvider || 
                                   'runway';
          console.log(`[BulkRegen] Regenerating video for scene ${scene.id} with provider: ${existingProvider}`);
          
          // Use the existing video regeneration logic with proper parameters
          const customQuery = scene.visualDirection || scene.title;
          const result = await universalVideoService.regenerateSceneVideo(
            projectData, 
            scene.id,
            customQuery,
            existingProvider
          );
          
          if (result.success && result.newVideoUrl) {
            // Update the scene with the new video URL
            const sceneIndex = projectData.scenes.findIndex((s: any) => s.id === scene.id);
            if (sceneIndex >= 0) {
              const updatedScene = projectData.scenes[sceneIndex];
              updatedScene.background = updatedScene.background || { type: 'video', source: '' };
              updatedScene.background.videoUrl = result.newVideoUrl;
              updatedScene.background.mediaUrl = result.newVideoUrl; // Keep mediaUrl in sync
              updatedScene.background.type = 'video';
              updatedScene.background.videoSource = result.source || existingProvider;
              updatedScene.assets = updatedScene.assets || {};
              updatedScene.assets.videoUrl = result.newVideoUrl;
              console.log(`[BulkRegen] Updated scene ${scene.id} with new video URL: ${result.newVideoUrl.substring(0, 80)}...`);
            }
            status.completed++;
            console.log(`[BulkRegen] Scene ${scene.id} completed (${status.completed}/${status.total})`);
          } else {
            status.failed++;
            status.errors.push(`Scene ${scene.id}: ${result.error || 'No video URL returned'}`);
            console.error(`[BulkRegen] Scene ${scene.id} failed:`, result.error);
          }
          
          // Save progress periodically
          await saveProjectToDb(projectData, projectData.ownerId);
          
        } catch (err: any) {
          status.failed++;
          status.errors.push(`Scene ${scene.id}: ${err.message}`);
          console.error(`[BulkRegen] Error regenerating scene ${scene.id}:`, err);
        }
      }
      
      status.status = status.failed === status.total ? 'failed' : 'completed';
      console.log(`[BulkRegen] Bulk regeneration completed: ${status.completed} success, ${status.failed} failed`);
      
      // Clear status after 30 minutes
      setTimeout(() => {
        bulkRegenerationStatus.delete(projectId);
      }, 30 * 60 * 1000);
    })();
    
    return res.json({ 
      success: true, 
      message: 'Bulk video regeneration started',
      totalScenes: scenes.length
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Bulk regeneration error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get bulk regeneration status
router.get('/:projectId/regenerate-all-videos/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const status = bulkRegenerationStatus.get(projectId);
    
    if (!status) {
      return res.json({ 
        success: true, 
        status: 'not_started',
        total: 0,
        completed: 0
      });
    }
    
    return res.json({
      success: true,
      status: status.status,
      total: status.total,
      completed: status.completed,
      failed: status.failed,
      errors: status.errors.slice(0, 10) // Only return first 10 errors
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Bulk regeneration status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const cinematicFlowStatus: Map<string, {
  status: 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  failed: number;
  currentScene: string;
  errors: string[];
  startedAt: Date;
}> = new Map();

async function extractLastFrame(videoUrl: string): Promise<string | undefined> {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { execFileSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    try {
      const parsed = new URL(videoUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error('Invalid video URL protocol');
      }
    } catch {
      throw new Error('Invalid video URL');
    }

    const tmpDir = os.tmpdir();
    const tmpVideo = path.join(tmpDir, `cinflow-${Date.now()}.mp4`);
    const tmpFrame = path.join(tmpDir, `cinflow-frame-${Date.now()}.jpg`);

    execFileSync('curl', ['-sL', '-o', tmpVideo, videoUrl], { timeout: 30000 });

    const durationStr = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', tmpVideo
    ], { timeout: 10000 }).toString().trim();
    const duration = parseFloat(durationStr);
    if (isNaN(duration) || duration <= 0) {
      throw new Error('Could not determine video duration');
    }

    const lastFrameTime = Math.max(0, duration - 0.1);
    execFileSync('ffmpeg', [
      '-y', '-ss', String(lastFrameTime), '-i', tmpVideo,
      '-vframes', '1', '-q:v', '2', tmpFrame
    ], { timeout: 15000 });

    if (!fs.existsSync(tmpFrame)) {
      throw new Error('FFmpeg did not produce output frame');
    }

    const frameBuffer = fs.readFileSync(tmpFrame);
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    const bucket = process.env.AWS_S3_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
    const key = `cinematic-flow/last-frame-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: frameBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));

    try { fs.unlinkSync(tmpVideo); } catch {}
    try { fs.unlinkSync(tmpFrame); } catch {}

    const frameUrl = `https://${bucket}.s3.amazonaws.com/${key}`;
    console.log(`[CinematicFlow] Extracted last frame: ${frameUrl.substring(0, 80)}...`);
    return frameUrl;
  } catch (err: any) {
    console.warn(`[CinematicFlow] Last-frame extraction failed: ${err.message}`);
    return undefined;
  }
}

router.post('/:projectId/cinematic-flow-regenerate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { provider } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scenes = (projectData.scenes || []).filter((s: any) => s.type !== 'chapter-title');
    if (scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No content scenes to regenerate' });
    }

    const existing = cinematicFlowStatus.get(projectId);
    if (existing && existing.status === 'running') {
      return res.status(409).json({ success: false, error: 'Cinematic flow regeneration already in progress' });
    }

    console.log(`[CinematicFlow] Starting cinematic flow regeneration for ${scenes.length} content scenes`);

    cinematicFlowStatus.set(projectId, {
      status: 'running',
      total: scenes.length,
      completed: 0,
      failed: 0,
      currentScene: scenes[0]?.id || '',
      errors: [],
      startedAt: new Date(),
    });

    (async () => {
      const status = cinematicFlowStatus.get(projectId)!;
      let previousLastFrameUrl: string | undefined = undefined;

      const { getVisualArtPreset } = await import('../../shared/config/visual-art-presets');

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        status.currentScene = scene.id;

        try {
          const sceneArtPresetId = scene.artPresetId || (projectData as any).progress?.artPresetId || (projectData as any).artPresetId;
          const artPreset = sceneArtPresetId ? getVisualArtPreset(sceneArtPresetId) : null;

          if (i > 0 && scenes[i - 1]?.artPresetId && scene.artPresetId && scenes[i - 1].artPresetId !== scene.artPresetId) {
            console.log(`[CinematicFlow] Style boundary at scene ${i} (${scenes[i - 1].artPresetId} → ${scene.artPresetId}) — breaking chain`);
            previousLastFrameUrl = undefined;
          }

          const sceneImagePrompt = scene.imagePrompt || scene.visualDirection || 'Professional cinematic scene';
          const sceneMotionPrompt = scene.motionPrompt;

          let sourceImageUrl: string | undefined = undefined;

          if (previousLastFrameUrl) {
            sourceImageUrl = previousLastFrameUrl;
            console.log(`[CinematicFlow] Scene ${i}: Using previous scene's last frame as I2V source`);
          } else if (artPreset && artPreset.generationStrategy === 'i2v') {
            const falKey = process.env.FAL_KEY;
            if (falKey) {
              const { fal } = await import("@fal-ai/client");
              fal.config({ credentials: falKey });
              const projectAR = (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9';
              const falSize = projectAR === '9:16' ? 'portrait_16_9' as const
                : projectAR === '1:1' ? 'square' as const
                : 'landscape_16_9' as const;

              try {
                const imgResult = await fal.subscribe("fal-ai/flux-pro/v1.1", {
                  input: { prompt: sceneImagePrompt, image_size: falSize, num_images: 1, safety_tolerance: "2", enable_safety_checker: true },
                  logs: true,
                });
                if (imgResult.data?.images?.[0]?.url) {
                  sourceImageUrl = imgResult.data.images[0].url;
                  console.log(`[CinematicFlow] Scene ${i}: Generated fresh Flux image for I2V`);
                }
              } catch (imgErr: any) {
                console.warn(`[CinematicFlow] Scene ${i}: Flux image failed: ${imgErr.message}`);
              }
            }
          }

          const sceneProviderHint = scene.providerHint;
          const effectiveProvider = provider || undefined;
          const effectivePrompt = (sourceImageUrl && sceneMotionPrompt) ? sceneMotionPrompt : (scene.visualDirection || 'Professional video');

          const cinFlowI2v: any = {};
          if (!provider && sceneProviderHint) {
            cinFlowI2v.providerHint = sceneProviderHint;
          }

          const { videoGenerationWorker } = await import('../services/video-generation-worker');
          const job = await videoGenerationWorker.createJob({
            projectId,
            sceneId: scene.id,
            provider: effectiveProvider,
            prompt: effectivePrompt,
            fallbackPrompt: scene.narration || 'professional video',
            duration: scene.duration || 6,
            aspectRatio: (projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9',
            style: (projectData as any).settings?.visualStyle || 'professional',
            triggeredBy: userId,
            sourceImageUrl,
            sceneType: scene.type || 'content',
            i2vSettings: Object.keys(cinFlowI2v).length > 0 ? cinFlowI2v : undefined,
          });

          console.log(`[CinematicFlow] Scene ${i}: Created job ${job.jobId}, waiting for completion...`);

          const maxWait = 5 * 60 * 1000;
          const pollInterval = 5000;
          const startTime = Date.now();
          let jobCompleted = false;
          let completedVideoUrl: string | undefined;

          while (Date.now() - startTime < maxWait) {
            await new Promise(r => setTimeout(r, pollInterval));
            const jobStatus = await videoGenerationWorker.getJob(job.jobId);
            if (!jobStatus) break;

            if (jobStatus.status === 'completed' && jobStatus.result?.videoUrl) {
              completedVideoUrl = jobStatus.result.videoUrl;
              jobCompleted = true;
              break;
            } else if (jobStatus.status === 'failed') {
              throw new Error(`Job failed: ${jobStatus.error || 'Unknown'}`);
            }
          }

          if (jobCompleted && completedVideoUrl) {
            console.log(`[CinematicFlow] Scene ${i}: Video completed, extracting last frame for continuity`);
            previousLastFrameUrl = await extractLastFrame(completedVideoUrl);
            status.completed++;
          } else {
            console.warn(`[CinematicFlow] Scene ${i}: Job did not complete within timeout`);
            previousLastFrameUrl = undefined;
            status.failed++;
            status.errors.push(`Scene ${scene.id}: Timeout waiting for video completion`);
          }

          console.log(`[CinematicFlow] Progress: ${status.completed + status.failed}/${status.total}`);

        } catch (err: any) {
          status.failed++;
          status.errors.push(`Scene ${scene.id}: ${err.message}`);
          console.error(`[CinematicFlow] Scene ${i} error:`, err.message);
          previousLastFrameUrl = undefined;
        }
      }

      status.status = status.failed === status.total ? 'failed' : 'completed';
      console.log(`[CinematicFlow] Complete: ${status.completed} success, ${status.failed} failed`);

      setTimeout(() => { cinematicFlowStatus.delete(projectId); }, 30 * 60 * 1000);
    })();

    return res.json({
      success: true,
      message: 'Cinematic flow regeneration started',
      totalScenes: scenes.length,
    });
  } catch (error: any) {
    console.error('[CinematicFlow] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:projectId/cinematic-flow-regenerate/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const projectData = await getProjectFromDb(projectId);
    if (!projectData || projectData.ownerId !== userId) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const status = cinematicFlowStatus.get(projectId);
    if (!status) {
      return res.json({ success: true, status: 'not_started', total: 0, completed: 0 });
    }

    return res.json({
      success: true,
      status: status.status,
      total: status.total,
      completed: status.completed,
      failed: status.failed,
      currentScene: status.currentScene,
      errors: status.errors.slice(0, 10),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 2: Update Music Volume
router.patch('/:projectId/music-volume', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { volume } = req.body;
    
    if (typeof volume !== 'number') {
      return res.status(400).json({ success: false, error: 'Volume must be a number' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const result = universalVideoService.updateMusicVolume(projectData, volume);
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      return res.json({ 
        success: true, 
        volume: projectData.assets.music?.volume,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Music volume update error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 2: Disable Music
router.delete('/:projectId/music', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    universalVideoService.disableMusic(projectData);
    await saveProjectToDb(projectData, projectData.ownerId);
    
    return res.json({ 
      success: true, 
      message: 'Music disabled',
      project: projectData,
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Music disable error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// PHASE 4: UNDO/REDO & SCENE REORDERING
// =============================================

// Phase 4: Undo action
router.post('/:projectId/undo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const result = universalVideoService.undo(projectData);
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      const status = universalVideoService.getHistoryStatus(projectData);
      return res.json({ 
        success: true, 
        undoneAction: result.action,
        historyStatus: status,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Undo error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 4: Redo action
router.post('/:projectId/redo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const result = universalVideoService.redo(projectData);
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      const status = universalVideoService.getHistoryStatus(projectData);
      return res.json({ 
        success: true, 
        redoneAction: result.action,
        historyStatus: status,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Redo error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 4: Get history status
router.get('/:projectId/history', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const status = universalVideoService.getHistoryStatus(projectData);
    return res.json({ success: true, ...status });
  } catch (error: any) {
    console.error('[UniversalVideo] History status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 10A: Analyze quality endpoint for QA Dashboard
router.post('/:projectId/analyze-quality', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('[Phase10A] ANALYZE-QUALITY ENDPOINT CALLED');
    console.log(`[Phase10A] Project ID: ${projectId}`);
    console.log(`[Phase10A] ANTHROPIC_API_KEY configured: ${!!process.env.ANTHROPIC_API_KEY}`);
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scenes = projectData.scenes || [];
    console.log(`[Phase10A] Analyzing ${scenes.length} scenes for quality report`);
    
    const analyses: Phase8AnalysisResult[] = [];
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imageUrl = scene.assets?.imageUrl || scene.assets?.videoUrl || (scene.background as any)?.url;
      
      if (!imageUrl) {
        console.log(`[Phase10A] Scene ${i + 1} has no image, creating placeholder analysis`);
        const placeholderAnalysis: Phase8AnalysisResult = {
          sceneIndex: i,
          overallScore: 0,
          technicalScore: 0,
          contentMatchScore: 0,
          brandComplianceScore: 0,
          compositionScore: 0,
          aiArtifactsDetected: false,
          aiArtifactDetails: [],
          contentMatchDetails: 'No media to analyze',
          brandComplianceDetails: 'No media to analyze',
          frameAnalysis: {
            subjectPosition: 'center' as const,
            faceDetected: false,
            busyRegions: [],
            dominantColors: [],
            lightingType: 'neutral' as const,
            safeTextZones: [],
          },
          issues: [{ 
            category: 'technical' as const, 
            severity: 'critical' as const, 
            description: 'No media available for this scene', 
            suggestion: 'Generate image or video for this scene' 
          }],
          recommendation: 'critical_fail',
          analysisTimestamp: new Date().toISOString(),
          analysisModel: 'none',
        };
        analyses.push(placeholderAnalysis);
        continue;
      }
      
      try {
        // Resolve URL
        let fullUrl = imageUrl;
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : 'http://localhost:5000';
          fullUrl = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        }
        
        // Detect if this is a video file
        const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(imageUrl) || scene.assets?.videoUrl;
        let base64: string;
        
        if (isVideo) {
          console.log(`[Phase10A] Scene ${i + 1}: Extracting frame from video ${fullUrl.substring(0, 80)}...`);
          const frameResult = await videoFrameExtractor.extractFrameAsBase64(fullUrl, 1);
          if (!frameResult) {
            throw new Error('Failed to extract frame from video');
          }
          base64 = frameResult.base64;
          console.log(`[Phase10A] Scene ${i + 1}: Frame extracted successfully`);
        } else {
          console.log(`[Phase10A] Scene ${i + 1}: Fetching image from ${fullUrl.substring(0, 80)}...`);
          
          const response = await fetch(fullUrl, { headers: { 'Accept': 'image/*' } });
          if (!response.ok) {
            console.warn(`[Phase10A] Failed to fetch scene ${i + 1} image: ${response.status}`);
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          
          const buffer = Buffer.from(await response.arrayBuffer());
          base64 = buffer.toString('base64');
        }
        
        const context: SceneContext = {
          sceneIndex: i,
          sceneType: scene.type || 'content',
          narration: scene.narration || '',
          visualDirection: scene.visualDirection || '',
          expectedContentType: (scene as any).contentType || 'lifestyle',
          totalScenes: scenes.length,
        };
        
        console.log(`[Phase10A] Scene ${i + 1}: Calling Claude Vision for analysis...`);
        const analysisResult = await sceneAnalysisService.analyzeScenePhase8(base64, context);
        console.log(`[Phase10A] Scene ${i + 1}: Analysis complete - Score: ${analysisResult.overallScore}, Model: ${analysisResult.analysisModel}`);
        
        analyses.push(analysisResult);
        
        // Store on scene
        scenes[i].analysisResult = analysisResult;
        scenes[i].qualityScore = analysisResult.overallScore;
        
        // Rate limiting between Claude Vision calls
        if (i < scenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (sceneError: any) {
        console.warn(`[Phase10A] Scene ${i + 1} analysis failed:`, sceneError.message);
        const fallbackAnalysis: Phase8AnalysisResult = {
          sceneIndex: i,
          overallScore: 50,
          technicalScore: 50,
          contentMatchScore: 50,
          brandComplianceScore: 50,
          compositionScore: 50,
          aiArtifactsDetected: false,
          aiArtifactDetails: [],
          contentMatchDetails: 'Analysis failed',
          brandComplianceDetails: 'Analysis failed',
          frameAnalysis: {
            subjectPosition: 'center' as const,
            faceDetected: false,
            busyRegions: [],
            dominantColors: [],
            lightingType: 'neutral' as const,
            safeTextZones: [],
          },
          issues: [{ 
            category: 'technical' as const, 
            severity: 'major' as const, 
            description: `Analysis failed: ${sceneError.message}`, 
            suggestion: 'Retry analysis' 
          }],
          recommendation: 'needs_review',
          analysisTimestamp: new Date().toISOString(),
          analysisModel: 'fallback',
        };
        analyses.push(fallbackAnalysis);
        scenes[i].analysisResult = fallbackAnalysis;
        scenes[i].qualityScore = fallbackAnalysis.overallScore;
      }
    }
    
    // Save updated project with analysis results
    projectData.scenes = scenes;
    await saveProjectToDb(projectData, userId);
    
    const overallScore = analyses.length > 0
      ? Math.round(analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length)
      : 0;
    
    console.log(`[Phase10A] Quality analysis complete - Overall: ${overallScore}, Scenes: ${analyses.length}`);
    
    return res.json({
      success: true,
      projectId,
      overallScore,
      sceneCount: analyses.length,
      analyses: analyses.map(a => ({
        sceneIndex: a.sceneIndex,
        score: a.overallScore,
        issues: a.issues,
        recommendation: a.recommendation,
      })),
    });
    
  } catch (error: any) {
    console.error('[Phase10A] Analyze quality error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 4: Reorder scenes
router.patch('/:projectId/reorder-scenes', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { sceneOrder } = req.body;
    
    if (!Array.isArray(sceneOrder)) {
      return res.status(400).json({ success: false, error: 'sceneOrder must be an array of scene IDs' });
    }
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Push current state to history before reordering
    universalVideoService.pushToHistory(projectData, 'Reorder scenes', ['scenes']);
    
    const result = universalVideoService.reorderScenes(projectData, sceneOrder);
    
    if (result.success) {
      await saveProjectToDb(projectData, projectData.ownerId);
      const historyStatus = universalVideoService.getHistoryStatus(projectData);
      return res.json({ 
        success: true, 
        message: 'Scenes reordered',
        historyStatus,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('[UniversalVideo] Scene reorder error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 4: Generate Preview
router.post('/projects/:projectId/preview', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (projectData.status !== 'ready' && projectData.status !== 'complete') {
      return res.status(400).json({ 
        success: false, 
        error: 'Project must be ready or complete to generate preview' 
      });
    }
    
    const { inputProps, compositionId, previewConfig } = universalVideoService.getPreviewRenderProps(projectData);
    
    // Return preview configuration - actual rendering would happen on frontend or via Lambda
    return res.json({
      success: true,
      preview: {
        inputProps,
        compositionId,
        config: previewConfig,
        projectId: projectData.id,
        duration: projectData.totalDuration,
        message: 'Preview configuration ready. Use Remotion Player for client-side preview.',
      },
    });
  } catch (error: any) {
    console.error('[UniversalVideo] Preview generation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 1E: Generate Product Image
router.post('/projects/:projectId/generate-product-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { 
      productName, 
      productDescription, 
      imageType = 'overlay',
      style = 'natural',
      aspectRatio = '1:1',
    } = req.body;
    
    if (!productName) {
      return res.status(400).json({ success: false, error: 'Product name is required' });
    }

    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { productImageService } = await import('../services/product-image-service');
    
    const image = await productImageService.generateProductImage({
      productName,
      productDescription,
      imageType,
      style,
      aspectRatio,
    });

    if (!image) {
      return res.status(500).json({ success: false, error: 'Image generation failed' });
    }

    (projectData as any).generatedProductImages = (projectData as any).generatedProductImages || {};
    (projectData as any).generatedProductImages[productName] = (projectData as any).generatedProductImages[productName] || [];
    (projectData as any).generatedProductImages[productName].push(image);

    await saveProjectToDb(projectData, projectData.ownerId);

    return res.json({
      success: true,
      image,
    });

  } catch (error: any) {
    console.error('[UniversalVideo] Product image generation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 1E: Get Product Image Styles
router.get('/product-image-styles', (req: Request, res: Response) => {
  res.json({
    imageTypes: ['product-shot', 'lifestyle', 'hero', 'overlay'],
    styles: ['studio', 'natural', 'dramatic', 'minimal'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    backgrounds: ['white', 'gradient', 'natural', 'transparent'],
    lighting: ['soft', 'dramatic', 'natural', 'studio'],
  });
});

// Phase 3: Quality Evaluation Endpoints

// GET quality report for a project
router.get('/projects/:projectId/quality-report', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const qualityReport = projectData.qualityReport;
    
    if (!qualityReport) {
      return res.status(404).json({ success: false, error: 'No quality report available for this project' });
    }
    
    // Phase 5E: Add recommendation status and summary
    const criticalCount = qualityReport.criticalIssues?.length || 0;
    const majorCount = qualityReport.sceneScores?.reduce((sum: number, s: any) => 
      sum + (s.issues?.filter((i: any) => i.severity === 'major')?.length || 0), 0) || 0;
    const overallScore = qualityReport.overallScore;
    
    let recommendation: 'approved' | 'needs-fixes' | 'needs-review' | 'pending' = 'pending';
    if (qualityReport.sceneScores?.length > 0) {
      if (criticalCount > 0) {
        recommendation = 'needs-fixes';
      } else if (majorCount > 2 || overallScore < 70) {
        recommendation = 'needs-review';
      } else {
        recommendation = 'approved';
      }
    }
    
    const generateSummary = () => {
      if (overallScore === null || overallScore === undefined) {
        return 'Quality evaluation pending. Generate assets to see results.';
      }
      if (criticalCount > 0) {
        const aiTextIssues = qualityReport.criticalIssues?.filter((i: any) => i.type === 'ai-text-detected')?.length || 0;
        if (aiTextIssues > 0) {
          return `${aiTextIssues} scene(s) contain AI-generated text artifacts. Regeneration recommended.`;
        }
        return `${criticalCount} critical issue(s) detected. Review and regenerate affected scenes.`;
      }
      if (overallScore >= 85) {
        return 'Excellent quality! Your video is ready for rendering.';
      }
      if (overallScore >= 70) {
        return 'Good quality with minor issues. Review before rendering.';
      }
      return 'Several issues detected. Consider regenerating problematic scenes.';
    };
    
    return res.json({
      success: true,
      qualityReport: {
        ...qualityReport,
        recommendation,
        summary: generateSummary(),
        issues: {
          total: (qualityReport.criticalIssues?.length || 0) + 
                 (qualityReport.sceneScores?.reduce((sum: number, s: any) => sum + (s.issues?.length || 0), 0) || 0),
          critical: criticalCount,
          major: majorCount,
          minor: qualityReport.sceneScores?.reduce((sum: number, s: any) => 
            sum + (s.issues?.filter((i: any) => i.severity === 'minor')?.length || 0), 0) || 0,
        },
      },
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Get quality report error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST trigger quality evaluation manually
router.post('/projects/:projectId/evaluate-quality', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (!projectData.outputUrl) {
      return res.status(400).json({ success: false, error: 'Project has no rendered video to evaluate' });
    }
    
    if (!qualityEvaluationService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Quality evaluation service not available' });
    }
    
    console.log(`[UniversalVideo] Starting manual quality evaluation for ${projectId}`);
    
    const qualityReport = await qualityEvaluationService.evaluateVideo(
      projectData.outputUrl,
      {
        projectId: projectData.id,
        scenes: projectData.scenes.map(s => ({
          id: s.id,
          type: s.type,
          narration: s.narration || '',
          duration: s.duration,
          textOverlays: s.textOverlays,
        })),
      }
    );
    
    projectData.qualityReport = qualityReport;
    await saveProjectToDb(projectData, userId);
    
    return res.json({
      success: true,
      qualityReport,
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Quality evaluation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST regenerate failed scenes
router.post('/projects/:projectId/regenerate-scenes', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { sceneIndices } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const qualityReport = projectData.qualityReport as VideoQualityReport | undefined;
    
    if (!qualityReport) {
      return res.status(400).json({ success: false, error: 'No quality report available. Run quality evaluation first.' });
    }
    
    let scenesToRegenerate = qualityReport.sceneScores.filter(s => s.needsRegeneration);
    
    if (sceneIndices && Array.isArray(sceneIndices)) {
      scenesToRegenerate = qualityReport.sceneScores.filter(s => 
        sceneIndices.includes(s.sceneIndex)
      );
    }
    
    if (scenesToRegenerate.length === 0) {
      return res.json({
        success: true,
        message: 'No scenes need regeneration',
        regenerated: [],
      });
    }
    
    console.log(`[UniversalVideo] Regenerating ${scenesToRegenerate.length} scenes for ${projectId}`);
    
    const results = await sceneRegenerationService.regenerateFailedScenes(
      {
        id: projectData.id,
        outputFormat: projectData.outputFormat,
        scenes: projectData.scenes,
      },
      scenesToRegenerate
    );
    
    for (const result of results) {
      if (result.success && result.newVideoUrl) {
        const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === result.sceneId);
        if (sceneIndex >= 0) {
          projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {} as any;
          (projectData.scenes[sceneIndex].assets as any).videoUrl = result.newVideoUrl;
          if (result.newAnalysis) {
            (projectData.scenes[sceneIndex] as any).analysis = result.newAnalysis;
          }
          if (result.newInstructions) {
            (projectData.scenes[sceneIndex] as any).compositionInstructions = result.newInstructions;
          }
        }
      }
    }
    
    // Mark project for re-render if any scenes were successfully regenerated
    if (results.some(r => r.success)) {
      projectData.status = 'ready';
      projectData.progress.steps.rendering.status = 'pending';
      projectData.progress.steps.rendering.message = 'Scene(s) regenerated - ready to re-render';
    }
    
    await saveProjectToDb(projectData, userId);
    
    return res.json({
      success: true,
      regenerated: results,
      needsRerender: results.some(r => r.success),
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Scene regeneration error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /projects/:projectId/scenes/:sceneId - Update individual scene (Phase 5C)
router.patch('/projects/:projectId/scenes/:sceneId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const updates = req.body;
    
    console.log(`[UniversalVideo] Updating scene ${sceneId} in project ${projectId}`);
    
    const project = await getProjectFromDb(projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const scenes = project.scenes || [];
    const sceneIndex = scenes.findIndex((s: Scene) => s.id === sceneId);
    
    if (sceneIndex === -1) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    
    scenes[sceneIndex] = {
      ...scenes[sceneIndex],
      ...updates,
    };
    
    project.scenes = scenes;
    project.updatedAt = new Date().toISOString();
    
    const userId = (req.user as any)?.id || 'unknown';
    await saveProjectToDb(project, userId);
    
    console.log(`[UniversalVideo] Scene ${sceneId} updated successfully`);
    
    res.json({ 
      success: true, 
      scene: scenes[sceneIndex] 
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Update scene failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /ai/suggest-visual-direction - AI suggestion for visual direction (Phase 5C)
router.post('/ai/suggest-visual-direction', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { narration, sceneType, currentDirection } = req.body;
    
    if (!narration) {
      return res.status(400).json({ error: 'Narration is required' });
    }
    
    const { llmClient } = await import('../services/piapi-llm-client');
    
    const result = await llmClient.createChatCompletion({
      systemPrompt: 'You are a visual director for video content. Generate concise, actionable visual directions.',
      messages: [
        {
          role: 'user',
          content: `Generate a concise visual direction for a video scene.

Scene type: ${sceneType || 'general'}
Narration: "${narration}"
${currentDirection ? `Current direction (improve this): ${currentDirection}` : ''}

Write 1-2 sentences describing:
- Camera angle/movement
- Lighting style
- Key visual elements
- Mood/atmosphere

Keep it brief and actionable for AI video generation. No preamble, just the direction.`,
        },
      ],
      maxTokens: 200,
    });
    
    const suggestion = result.text;
    
    console.log(`[UniversalVideo] Generated visual direction for ${sceneType} scene`);
    
    res.json({ suggestion });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Visual direction suggestion failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Background quality evaluation function
async function runQualityEvaluation(project: VideoProject, outputUrl: string, ownerId: string) {
  console.log(`[QualityEval] Starting background evaluation for ${project.id}`);
  
  try {
    const qualityReport = await qualityEvaluationService.evaluateVideo(
      outputUrl,
      {
        projectId: project.id,
        scenes: project.scenes.map(s => ({
          id: s.id,
          type: s.type,
          narration: s.narration || '',
          duration: s.duration,
          textOverlays: s.textOverlays,
        })),
      }
    );
    
    const latestProject = await getProjectFromDb(project.id);
    if (latestProject) {
      latestProject.qualityReport = qualityReport;
      await saveProjectToDb(latestProject, ownerId);
      
      console.log(`[QualityEval] Report saved: Score ${qualityReport.overallScore}/100, ${qualityReport.passesQuality ? 'PASSED' : 'NEEDS REVIEW'}`);
      
      if (!qualityReport.passesQuality) {
        console.log(`[QualityEval] Issues detected: ${qualityReport.criticalIssues.length} critical`);
        console.log(`[QualityEval] Recommendations:`, qualityReport.recommendations);
        
        const failedScenes = qualityReport.sceneScores.filter(s => s.needsRegeneration);
        if (failedScenes.length > 0 && failedScenes.length <= 2) {
          console.log(`[QualityEval] Auto-regenerating ${failedScenes.length} failed scenes...`);
          
          const regenResults = await sceneRegenerationService.regenerateFailedScenes(
            {
              id: latestProject.id,
              outputFormat: latestProject.outputFormat,
              scenes: latestProject.scenes,
            },
            failedScenes
          );
          
          for (const result of regenResults) {
            if (result.success && result.newVideoUrl) {
              const sceneIndex = latestProject.scenes.findIndex((s: Scene) => s.id === result.sceneId);
              if (sceneIndex >= 0) {
                latestProject.scenes[sceneIndex].assets = latestProject.scenes[sceneIndex].assets || {} as any;
                (latestProject.scenes[sceneIndex].assets as any).videoUrl = result.newVideoUrl;
                if (result.newAnalysis) {
                  (latestProject.scenes[sceneIndex] as any).analysis = result.newAnalysis;
                }
                if (result.newInstructions) {
                  (latestProject.scenes[sceneIndex] as any).compositionInstructions = result.newInstructions;
                }
              }
            }
          }
          
          // Store regeneration results in progress for tracking
          (latestProject.progress as any).lastRegenerationResults = regenResults;
          
          // Mark project for re-render if scenes were regenerated successfully
          if (regenResults.some(r => r.success)) {
            latestProject.status = 'ready';
            latestProject.progress.steps.rendering.status = 'pending';
            latestProject.progress.steps.rendering.message = 'Scene(s) regenerated - ready to re-render';
            console.log(`[QualityEval] Project marked for re-render due to regenerated scenes`);
          }
          
          await saveProjectToDb(latestProject, ownerId);
          
          console.log(`[QualityEval] Regeneration complete: ${regenResults.filter(r => r.success).length}/${regenResults.length} succeeded`);
        }
      }
    }
  } catch (error: any) {
    console.error(`[QualityEval] Background evaluation failed:`, error.message);
  }
}

// GET /projects/:projectId/generation-estimate - Estimate generation cost/time (Phase 5D)
router.get('/projects/:projectId/generation-estimate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const project = await getProjectFromDb(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const scenes = project.scenes || [];
    const visualStyle = (project as any).visualStyle || 'professional';
    // Use actual project brand settings, don't override with defaults
    const brandSettings = (project as any).brandSettings || {};
    const musicEnabled = (project as any).musicEnabled !== false;
    
    // Build scenes for intelligent provider selection
    const scenesForSelection: SceneForSelection[] = scenes.map((scene: Scene, index: number) => ({
      sceneIndex: index,
      sceneType: scene.type,
      contentType: (scene as any).contentType || 'lifestyle',
      narration: scene.narration || '',
      visualDirection: scene.visualDirection || '',
      duration: scene.duration || 5,
    }));
    
    // Get quality tier for provider selection - prefer query param over stored value
    const tierParam = req.query.tier as string;
    const validTiers = ['ultra', 'premium', 'standard', 'draft'] as const;
    const qualityTier = (tierParam && validTiers.includes(tierParam as any)) 
      ? tierParam as 'ultra' | 'premium' | 'standard' | 'draft'
      : ((project as any).qualityTier || 'standard') as 'ultra' | 'premium' | 'standard' | 'draft';
    console.log(`[GenerationEstimate] Project ${projectId} using qualityTier: ${qualityTier} (param: ${tierParam}, stored: ${(project as any).qualityTier})`);
    
    // Use intelligent provider selector for all scenes with quality tier
    const providerSelections = videoProviderSelector.selectProvidersForProject(
      scenesForSelection,
      visualStyle,
      qualityTier
    );
    
    // Get provider summary counts and cost breakdown
    const providerCounts = videoProviderSelector.getProviderSummary(providerSelections);
    const { total: videoCost, breakdown: videoCostBreakdown } = videoProviderSelector.calculateTotalCost(
      providerSelections,
      scenesForSelection
    );
    
    // Phase 7D: Compute transitions for all scenes upfront
    const transitionsData = transitionService.planTransitions(
      scenes.map((s: any, i: number) => ({
        sceneIndex: i,
        sceneType: s.type || 'general',
        duration: s.duration || 5,
      })),
      visualStyle
    );
    
    // Build scene providers array for response with explicit fallbacks
    const sceneProviders = Array.from(providerSelections.entries()).map(([index, selection]) => {
      const scene = scenes[index];
      const provider = selection?.provider;
      const sceneTransition = transitionsData.transitions.find((t: any) => t.fromSceneIndex === index);
      
      // Phase 15G: Predict media type based on quality tier
      const mediaDecision = selectMediaSource(
        { 
          id: String(index), 
          visualDirection: scene?.visualDirection || '', 
          duration: scene?.duration || 5,
          type: scene?.type,
        },
        [], // Empty for now - will be populated by asset matching
        qualityTier
      );
      
      return {
        sceneIndex: index,
        sceneType: scene?.type || 'unknown',
        contentType: (scene as any)?.contentType || 'lifestyle',
        duration: scene?.duration || 5,
        provider: provider?.id || 'runway',
        providerName: provider?.displayName || 'Runway Gen-4',
        fallbackProvider: selection?.alternatives?.[0] || 'kling',
        costPerSecond: provider?.costPerSecond || 0.03,
        providerReason: selection?.reason || 'Default selection',
        confidence: selection?.confidence ?? 50,
        alternatives: selection?.alternatives || ['runway', 'hailuo'],
        // Phase 15G: Media type prediction
        mediaType: mediaDecision.mediaType,
        mediaTypeReason: mediaDecision.reason,
        forcedByTier: mediaDecision.forcedByTier,
        // Phase 7D: Per-scene intelligence
        intelligence: {
          analysisStatus: 'pending' as const,
          textPlacement: {
            position: scene?.type === 'hook' || scene?.type === 'cta' ? 'center' : 'lower-third',
            alignment: 'center' as const,
          },
          transitionToNext: sceneTransition ? {
            type: sceneTransition.config.type,
            duration: sceneTransition.config.duration,
            moodMatch: sceneTransition.moodFlow || 'smooth',
            reason: sceneTransition.reason || 'Default transition',
          } : undefined,
        },
      };
    });
    
    // Use pre-calculated video cost from provider selector
    const VIDEO_COST = videoCost;
    
    const totalDuration = scenes.reduce((sum: number, s: Scene) => sum + (s.duration || 5), 0);
    
    // Use intelligent image provider selection
    const scenesForImageSelection = scenes.map((scene: Scene, index: number) => ({
      sceneIndex: index,
      contentType: (scene as any).contentType || 'lifestyle',
      sceneType: scene.type || 'unknown',
      visualDirection: scene.visualDirection || '',
      needsImage: scene.type === 'product' || scene.type === 'cta' || 
                  scene.type === 'hook' || scene.type === 'benefit' || 
                  scene.type === 'testimonial' || !(scene as any).videoUrl,
    }));
    
    const imageProviderSelections = imageProviderSelector.selectProvidersForScenes(scenesForImageSelection, qualityTier);
    const rawImageProviderCounts = imageProviderSelector.getProviderSummary(imageProviderSelections);
    const imageProviderCounts = {
      midjourney: rawImageProviderCounts.midjourney || 0,
      flux: rawImageProviderCounts.flux || 0,
      falai: rawImageProviderCounts.falai || 0,
    };
    const IMAGE_COST = imageProviderSelector.calculateImageCost(imageProviderCounts);
    
    // Quality tier multipliers for costs
    const TIER_MULTIPLIERS: Record<string, number> = {
      ultra: 3.5,
      premium: 2.0,
      standard: 1.0,
    };
    const tierMultiplier = TIER_MULTIPLIERS[qualityTier] || 1.0;
    
    // Calculate costs with quality tier adjustments
    const BASE_VOICEOVER_COST = 0.015 * totalDuration;
    const BASE_MUSIC_COST = musicEnabled ? 0.10 : 0;
    const BASE_SOUND_FX_COST = 0.05;
    const BASE_SCENE_ANALYSIS_COST = scenes.length * 0.02;
    const BASE_QA_COST = 0.02;
    
    // Apply tier multipliers
    const ADJUSTED_VIDEO_COST = VIDEO_COST * tierMultiplier;
    const ADJUSTED_IMAGE_COST = IMAGE_COST * tierMultiplier;
    const VOICEOVER_COST = BASE_VOICEOVER_COST * (qualityTier === 'ultra' ? 1.5 : qualityTier === 'premium' ? 1.2 : 1.0);
    const MUSIC_COST = BASE_MUSIC_COST * tierMultiplier;
    const SOUND_FX_COST = BASE_SOUND_FX_COST * tierMultiplier;
    const SCENE_ANALYSIS_COST = BASE_SCENE_ANALYSIS_COST * tierMultiplier;
    const QA_COST = BASE_QA_COST * tierMultiplier;
    
    const totalCost = ADJUSTED_VIDEO_COST + ADJUSTED_IMAGE_COST + VOICEOVER_COST + MUSIC_COST + SOUND_FX_COST + SCENE_ANALYSIS_COST + QA_COST;
    
    // Estimate time
    const avgSceneGenTime = 45; // seconds per scene
    const parallelFactor = 0.6;
    const estimatedTimeMin = Math.ceil((scenes.length * avgSceneGenTime * parallelFactor) / 60);
    const estimatedTimeMax = Math.ceil((scenes.length * avgSceneGenTime) / 60);
    
    // Build provider cost breakdown with display names
    const videoCostByProvider: Record<string, { displayName: string; scenes: number; cost: string }> = {};
    Object.entries(videoCostBreakdown).forEach(([id, cost]) => {
      videoCostByProvider[id] = {
        displayName: VIDEO_PROVIDERS[id]?.displayName || id,
        scenes: providerCounts[id] || 0,
        cost: cost.toFixed(2),
      };
    });
    
    // Brand elements summary - only add if actually enabled in project settings
    const brandElements: Array<{ type: string; name: string; description: string; scene: string }> = [];
    if (brandSettings.includeIntroLogo === true) {
      brandElements.push({
        type: 'intro',
        name: 'Intro Logo Animation',
        description: '3 second logo with zoom effect',
        scene: 'Scene 1',
      });
    }
    if (brandSettings.includeWatermark === true) {
      brandElements.push({
        type: 'watermark',
        name: 'Corner Watermark',
        description: `${Math.round((brandSettings.watermarkOpacity || 0.7) * 100)}% opacity, ${brandSettings.watermarkPosition || 'bottom-right'}`,
        scene: `Scenes 2-${Math.max(2, scenes.length - 1)}`,
      });
    }
    if (brandSettings.includeCTAOutro === true) {
      brandElements.push({
        type: 'cta',
        name: 'CTA Outro',
        description: 'Call-to-action with brand URL',
        scene: `Scene ${scenes.length}`,
      });
    }
    
    // Generate warnings
    const warnings: string[] = [];
    const longScenes = scenes.filter((s: Scene) => (s.duration || 5) > 10);
    if (longScenes.length > 0) {
      warnings.push(`${longScenes.length} scene(s) are over 10 seconds - may require multiple video segments`);
    }
    if (scenes.length > 10) {
      warnings.push('Large number of scenes may increase generation time significantly');
    }
    const missingContentType = scenes.filter((s: Scene) => !(s as any).contentType);
    if (missingContentType.length > 0) {
      warnings.push(`${missingContentType.length} scene(s) will use default content type based on style`);
    }
    
    // Calculate tier summaries for all tiers so frontend can display correct prices
    // IMPORTANT: Must use the SAME calculation logic as the main estimate to ensure costs match
    const calculateTierCosts = (tier: 'ultra' | 'premium' | 'standard') => {
      const tierProviderSelections = videoProviderSelector.selectProvidersForProject(scenesForSelection, visualStyle, tier);
      const { total: tierVideoCostRaw } = videoProviderSelector.calculateTotalCost(tierProviderSelections, scenesForSelection);
      const tierImageSelections = imageProviderSelector.selectProvidersForScenes(scenesForImageSelection, tier);
      const tierImageCounts = imageProviderSelector.getProviderSummary(tierImageSelections);
      const tierImageCostRaw = imageProviderSelector.calculateImageCost(tierImageCounts);
      
      // Get top video providers for this tier - convert IDs to display names
      const tierProviderCounts = videoProviderSelector.getProviderSummary(tierProviderSelections);
      const topVideoProviders = Object.entries(tierProviderCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => VIDEO_PROVIDERS[id]?.displayName || id);
      
      // Get image providers used - normalize to display names
      const midjourneyCount = tierImageCounts.midjourney || 0;
      const fluxCount = tierImageCounts.flux || 0;
      const falaiCount = tierImageCounts.falai || 0;
      const imageProviders: string[] = [];
      if (midjourneyCount > 0) {
        imageProviders.push('Midjourney');
      }
      if (fluxCount > 0) {
        imageProviders.push(tier === 'standard' ? 'Flux Schnell' : 'Flux Pro');
      }
      if (falaiCount > 0) {
        imageProviders.push('fal.ai');
      }
      if (imageProviders.length === 0) {
        imageProviders.push(tier === 'ultra' ? 'Midjourney' : tier === 'premium' ? 'Flux Pro' : 'fal.ai');
      }
      
      // Apply SAME multipliers as main estimate (lines 4058-4065)
      const multipliers: Record<string, number> = { ultra: 3.5, premium: 2.0, standard: 1.0 };
      const tierMult = multipliers[tier];
      const voiceMultipliers: Record<string, number> = { ultra: 1.5, premium: 1.2, standard: 1.0 };
      
      // CRITICAL: Apply tier multiplier to video and image costs (same as ADJUSTED_VIDEO_COST, ADJUSTED_IMAGE_COST)
      const tierVideoCost = tierVideoCostRaw * tierMult;
      const tierImageCost = tierImageCostRaw * tierMult;
      const tierVoiceover = BASE_VOICEOVER_COST * voiceMultipliers[tier];
      const tierMusic = BASE_MUSIC_COST * tierMult;
      const tierSoundFx = BASE_SOUND_FX_COST * tierMult;
      const tierAnalysis = BASE_SCENE_ANALYSIS_COST * tierMult;
      const tierQA = BASE_QA_COST * tierMult;
      
      // Video/image costs already factor in provider quality via tier-aware selection
      const total = tierVideoCost + tierImageCost + tierVoiceover + tierMusic + tierSoundFx + tierAnalysis + tierQA;
      
      return {
        total: parseFloat(total.toFixed(2)),
        video: parseFloat(tierVideoCost.toFixed(2)),
        images: parseFloat(tierImageCost.toFixed(2)),
        voiceover: parseFloat(tierVoiceover.toFixed(2)),
        music: parseFloat(tierMusic.toFixed(2)),
        soundFx: parseFloat(tierSoundFx.toFixed(2)),
        sceneAnalysis: parseFloat(tierAnalysis.toFixed(2)),
        qualityAssurance: parseFloat(tierQA.toFixed(2)),
        topVideoProviders,
        imageProviders,
      };
    };
    
    const tierSummaries = {
      ultra: calculateTierCosts('ultra'),
      premium: calculateTierCosts('premium'),
      standard: calculateTierCosts('standard'),
    };
    
    res.json({
      project: {
        title: project.title,
        sceneCount: scenes.length,
        totalDuration,
        visualStyle,
      },
      providers: {
        video: providerCounts,
        videoCostByProvider,
        images: {
          midjourney: imageProviderCounts.midjourney,
          flux: imageProviderCounts.flux,
          falai: imageProviderCounts.falai,
        },
        imageCosts: {
          midjourney: {
            count: imageProviderCounts.midjourney,
            cost: (imageProviderCounts.midjourney * 0.05).toFixed(2),
            useCase: 'premium',
          },
          flux: { 
            count: imageProviderCounts.flux, 
            cost: (imageProviderCounts.flux * 0.03).toFixed(2),
            useCase: 'products',
          },
          falai: { 
            count: imageProviderCounts.falai, 
            cost: (imageProviderCounts.falai * 0.02).toFixed(2),
            useCase: 'lifestyle',
          },
        },
        voiceover: 'ElevenLabs',
        music: musicEnabled ? 'Udio AI (via PiAPI)' : 'Disabled',
        soundFx: 'Kling Sound',
      },
      // Phase 7D: Transition Design (uses pre-computed transitionsData)
      transitions: {
        total: transitionsData.transitions.length,
        summary: transitionsData.summary,
      },
      intelligence: {
        sceneAnalysis: { provider: 'Claude Vision', enabled: true },
        textPlacement: { enabled: true, overlayCount: scenes.length },
        transitions: { enabled: true, moodMatched: true },
      },
      qualityAssurance: {
        enabled: true,
        provider: 'Claude Vision',
        checks: ['Brand compliance', 'Visual quality', 'Content accuracy'],
      },
      // Phase 7C: Sound Design Info for UI
      soundDesign: (() => {
        const soundInfo = soundDesignService.designProjectSoundInfo(
          scenes.map((s: any, i: number) => ({
            sceneIndex: i,
            sceneType: s.type || 'general',
            narration: s.narration || '',
            duration: s.duration || 5,
            visualDirection: s.visualDirection || '',
          })),
          {
            musicEnabled: musicEnabled !== false,
            musicMood: 'uplifting',
            voiceId: 'Rachel',
          }
        );
        return {
          voiceover: soundInfo.voiceover,
          music: soundInfo.music,
          ambientCount: soundInfo.soundEffects.ambientCount,
          transitionCount: soundInfo.soundEffects.transitionCount,
          accentCount: soundInfo.soundEffects.accentCount,
        };
      })(),
      musicEnabled,
      sceneBreakdown: sceneProviders,
      costs: {
        video: ADJUSTED_VIDEO_COST.toFixed(2),
        videoCostBreakdown: videoCostByProvider,
        images: ADJUSTED_IMAGE_COST.toFixed(2),
        voiceover: VOICEOVER_COST.toFixed(2),
        music: MUSIC_COST.toFixed(2),
        soundFx: SOUND_FX_COST.toFixed(2),
        sceneAnalysis: SCENE_ANALYSIS_COST.toFixed(2),
        qualityAssurance: QA_COST.toFixed(2),
        total: totalCost.toFixed(2),
      },
      time: {
        estimatedMinutes: `${estimatedTimeMin}-${estimatedTimeMax}`,
        perScene: avgSceneGenTime,
      },
      brandElements,
      brandName: (await getAnyBrandContext()).brandName || '',
      warnings,
      qualityTier,
      tierSummaries,
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Generation estimate failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Phase 8A: Analyze individual scene with Claude Vision
router.post('/projects/:projectId/scenes/:sceneIndex/analyze', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    const sceneIdx = parseInt(sceneIndex, 10);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scenes = projectData.scenes || [];
    if (sceneIdx < 0 || sceneIdx >= scenes.length) {
      return res.status(400).json({ success: false, error: 'Invalid scene index' });
    }
    
    const scene = scenes[sceneIdx];
    const imageUrl = scene.assets?.imageUrl || (scene.background as any)?.url;
    
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Scene has no generated content to analyze' });
    }
    
    console.log(`[Phase8A] Analyzing scene ${sceneIdx + 1}/${scenes.length} for project ${projectId}`);
    
    // Fetch image and convert to base64
    let fullUrl = imageUrl;
    if (imageUrl.startsWith('/objects')) {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      fullUrl = `${baseUrl}${imageUrl}`;
    } else if (imageUrl.startsWith('/')) {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      fullUrl = `${baseUrl}${imageUrl}`;
    }
    
    const response = await fetch(fullUrl, { headers: { 'Accept': 'image/*' } });
    if (!response.ok) {
      return res.status(400).json({ success: false, error: 'Failed to fetch scene image' });
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');
    
    // Get matched brand assets and workflow path for I2V context
    const matchedAssets = (scene as any).matchedBrandAssets || [];
    const selectedProduct = matchedAssets.find((a: any) => a.assetType === 'product');
    const workflowPath = (scene as any).workflowPath || (selectedProduct ? 'product-hero' : undefined);
    
    const context: SceneContext = {
      sceneIndex: sceneIdx,
      sceneType: scene.type || 'content',
      narration: scene.narration || '',
      visualDirection: scene.visualDirection || '',
      expectedContentType: (scene as any).contentType || 'lifestyle',
      totalScenes: scenes.length,
      selectedBrandAsset: selectedProduct ? {
        name: selectedProduct.name || selectedProduct.assetName || 'Unknown Product',
        type: selectedProduct.assetType || 'product',
        url: selectedProduct.url || selectedProduct.assetUrl,
      } : undefined,
      workflowPath,
    };
    
    const analysisResult = await sceneAnalysisService.analyzeScenePhase8(base64, context);
    
    // Store analysis result on the scene
    scenes[sceneIdx].analysisResult = analysisResult;
    scenes[sceneIdx].qualityScore = analysisResult.overallScore;
    
    // Save updated project
    projectData.scenes = scenes;
    await saveProjectToDb(projectData, userId);
    
    console.log(`[Phase8A] Scene ${sceneIdx + 1} analysis complete: score=${analysisResult.overallScore}, recommendation=${analysisResult.recommendation}`);
    
    // Phase 11E: Auto-save to asset library if quality score >= 70
    if (analysisResult.overallScore >= 70) {
      try {
        const { saveToLibrary } = await import('../services/asset-library-service');
        const sceneForLibrary = {
          id: scene.id,
          type: scene.type || 'content',
          visualDirection: scene.visualDirection || '',
          imageUrl: imageUrl,
          provider: (scene.assets as any)?.imageProvider || 'unknown',
          analysisResult: {
            overallScore: analysisResult.overallScore,
            contentMatchDetails: {
              presentElements: typeof analysisResult.contentMatchDetails === 'string' 
                ? [analysisResult.contentMatchDetails]
                : [],
            },
          },
        };
        await saveToLibrary(sceneForLibrary, { projectId }, userId);
        console.log(`[Phase11E] Auto-saved scene ${sceneIdx + 1} image to asset library (score: ${analysisResult.overallScore})`);
      } catch (libErr) {
        console.error('[Phase11E] Failed to save to asset library:', libErr);
      }
    }
    
    return res.json({
      success: true,
      analysis: analysisResult,
    });
    
  } catch (error: any) {
    console.error('[Phase8A] Scene analysis error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 8A: Check if an image is blank or gradient
router.post('/check-blank-gradient', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'imageBase64 is required' });
    }
    
    const isBlank = await sceneAnalysisService.isBlankOrGradient(imageBase64);
    
    return res.json({
      success: true,
      isBlankOrGradient: isBlank,
    });
    
  } catch (error: any) {
    console.error('[Phase8A] Blank/gradient check error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 8A: Analyze all scenes in a project (batch analysis)
// Phase 10A: Added diagnostic logging
router.post('/projects/:projectId/analyze-all-scenes', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('[Phase10A] ANALYZE-ALL-SCENES ENDPOINT CALLED');
    console.log(`[Phase10A] Project ID: ${projectId}`);
    console.log(`[Phase10A] ANTHROPIC_API_KEY configured: ${!!process.env.ANTHROPIC_API_KEY}`);
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scenes = projectData.scenes || [];
    console.log(`[Phase10A] Batch analyzing ${scenes.length} scenes for project ${projectId}`);
    
    const results: Phase8AnalysisResult[] = [];
    let scenesAnalyzed = 0;
    let scenesFailed = 0;
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imageUrl = scene.assets?.imageUrl || (scene.background as any)?.url;
      
      if (!imageUrl) {
        console.log(`[Phase8A] Scene ${i + 1} has no image, skipping`);
        continue;
      }
      
      try {
        // Resolve URL
        let fullUrl = imageUrl;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          fullUrl = imageUrl;
        } else if (imageUrl.startsWith('/objects')) {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : 'http://localhost:5000';
          fullUrl = `${baseUrl}${imageUrl}`;
        } else if (imageUrl.startsWith('/')) {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : 'http://localhost:5000';
          fullUrl = `${baseUrl}${imageUrl}`;
        }
        
        const response = await fetch(fullUrl, { headers: { 'Accept': 'image/*' } });
        if (!response.ok) {
          console.warn(`[Phase8A] Failed to fetch scene ${i + 1} image: ${response.status}`);
          scenesFailed++;
          continue;
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        
        const context: SceneContext = {
          sceneIndex: i,
          sceneType: scene.type || 'content',
          narration: scene.narration || '',
          visualDirection: scene.visualDirection || '',
          expectedContentType: (scene as any).contentType || 'lifestyle',
          totalScenes: scenes.length,
        };
        
        const analysisResult = await sceneAnalysisService.analyzeScenePhase8(base64, context);
        results.push(analysisResult);
        
        // Store on scene
        scenes[i].analysisResult = analysisResult;
        scenes[i].qualityScore = analysisResult.overallScore;
        scenesAnalyzed++;
        
        // Phase 11E: Auto-save to asset library if quality score >= 70
        if (analysisResult.overallScore >= 70) {
          try {
            const { saveToLibrary } = await import('../services/asset-library-service');
            const sceneForLibrary = {
              id: scene.id,
              type: scene.type || 'content',
              visualDirection: scene.visualDirection || '',
              imageUrl: imageUrl,
              provider: (scene.assets as any)?.imageProvider || 'unknown',
              analysisResult: {
                overallScore: analysisResult.overallScore,
                contentMatchDetails: {
                  presentElements: typeof analysisResult.contentMatchDetails === 'string' 
                    ? [analysisResult.contentMatchDetails]
                    : [],
                },
              },
            };
            await saveToLibrary(sceneForLibrary, { projectId }, userId);
            console.log(`[Phase11E] Batch: Auto-saved scene ${i + 1} image to asset library`);
          } catch (libErr) {
            console.error('[Phase11E] Batch: Failed to save to asset library:', libErr);
          }
        }
        
        // Rate limiting: wait 500ms between Claude Vision calls to avoid overwhelming the API
        if (i < scenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (sceneError: any) {
        console.warn(`[Phase8A] Scene ${i + 1} analysis failed:`, sceneError.message);
        scenesFailed++;
      }
    }
    
    // Save updated project
    projectData.scenes = scenes;
    await saveProjectToDb(projectData, userId);
    
    // Calculate summary
    const avgScore = results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
      : 0;
    const needsRegeneration = results.filter(r => r.recommendation === 'regenerate' || r.recommendation === 'critical_fail').length;
    const approved = results.filter(r => r.recommendation === 'approved').length;
    
    console.log(`[Phase8A] Batch analysis complete: ${scenesAnalyzed}/${scenes.length} scenes, avg score: ${avgScore}`);
    
    return res.json({
      success: true,
      summary: {
        totalScenes: scenes.length,
        scenesAnalyzed,
        scenesFailed,
        averageScore: avgScore,
        approved,
        needsReview: results.filter(r => r.recommendation === 'needs_review').length,
        needsRegeneration,
        criticalFail: results.filter(r => r.recommendation === 'critical_fail').length,
      },
      results,
    });
    
  } catch (error: any) {
    console.error('[Phase8A] Batch scene analysis error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 7E: Run QA Review (uses Claude Vision when available, falls back to simulated scoring)
router.post('/projects/:projectId/run-qa', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const scenes = projectData.scenes || [];
    console.log(`[UniversalVideo] Running QA review for project ${projectId} with ${scenes.length} scenes`);
    
    let qualityReport: VideoQualityReport | null = null;
    let usedClaudeVision = false;
    
    // Try using the real Claude Vision quality evaluation service
    const renderedVideoUrl = projectData.outputUrl || (projectData as any).renderedVideoUrl;
    
    if (qualityEvaluationService.isAvailable()) {
      // If we have a rendered video, analyze the full video
      if (renderedVideoUrl) {
        try {
          console.log('[UniversalVideo] Using Claude Vision for QA review with rendered video:', renderedVideoUrl);
          qualityReport = await qualityEvaluationService.evaluateVideo(
            renderedVideoUrl,
            {
              projectId,
              scenes: scenes.map((s, i) => ({
                id: s.id,
                type: s.type,
                narration: s.narration || '',
                duration: s.duration || 5,
                textOverlays: s.textOverlays || [],
                visualDirection: s.visualDirection || (s as any).description || undefined,
              })),
            }
          );
          usedClaudeVision = true;
        } catch (claudeError: any) {
          console.warn('[UniversalVideo] Claude Vision QA failed:', claudeError.message);
        }
      } else {
        // Pre-render QA: Evaluate individual scene images with Claude Vision
        console.log('[UniversalVideo] Running pre-render QA - evaluating individual scene assets');
        
        const sceneScores: Array<{
          sceneId: string;
          sceneIndex: number;
          overallScore: number;
          scores: { composition: number; visibility: number; technicalQuality: number; contentMatch: number; professionalLook: number };
          issues: Array<{ type: string; severity: 'critical' | 'major' | 'minor'; description: string; sceneIndex?: number }>;
          passesThreshold: boolean;
          needsRegeneration: boolean;
        }> = [];
        
        let scenesEvaluated = 0;
        
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const imageUrl = scene.assets?.imageUrl || (scene.background as any)?.url;
          
          if (imageUrl) {
            try {
              // Resolve image URL to a fetchable endpoint
              let fullUrl = imageUrl;
              
              // Handle various URL formats
              if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                fullUrl = imageUrl;
              } else if (imageUrl.startsWith('/objects')) {
                // Object storage path - use internal server URL
                const baseUrl = process.env.REPLIT_DEV_DOMAIN 
                  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
                  : 'http://localhost:5000';
                fullUrl = `${baseUrl}${imageUrl}`;
              } else if (imageUrl.startsWith('/replit-objstore-')) {
                // Legacy object storage format
                const baseUrl = process.env.REPLIT_DEV_DOMAIN 
                  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
                  : 'http://localhost:5000';
                fullUrl = `${baseUrl}/objects${imageUrl}`;
              } else if (imageUrl.startsWith('/')) {
                const baseUrl = process.env.REPLIT_DEV_DOMAIN 
                  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
                  : 'http://localhost:5000';
                fullUrl = `${baseUrl}${imageUrl}`;
              }
              
              console.log(`[UniversalVideo] Evaluating scene ${i + 1} image: ${imageUrl.substring(0, 60)}...`);
              
              const response = await fetch(fullUrl, { 
                headers: { 
                  'Accept': 'image/*',
                  // Add any auth headers if needed for internal requests
                }
              });
              
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const base64 = buffer.toString('base64');
                
                const result = await qualityEvaluationService.evaluateSceneComprehensive(
                  base64,
                  {
                    sceneIndex: i,
                    sceneType: scene.type || 'general',
                    narration: scene.narration || '',
                    totalScenes: scenes.length,
                    expectedContentType: (scene as any).contentType || 'lifestyle',
                    visualDirection: scene.visualDirection || (scene as any).description || undefined,
                  }
                );
                
                sceneScores.push({
                  sceneId: scene.id,
                  sceneIndex: i,
                  overallScore: result.overallScore,
                  scores: {
                    composition: result.scores.composition,
                    visibility: 80,
                    technicalQuality: result.scores.technical,
                    contentMatch: result.scores.brand.total,
                    professionalLook: 80,
                  },
                  issues: result.issues.map(issue => ({ ...issue, sceneIndex: i })),
                  passesThreshold: result.recommendation === 'pass' || result.recommendation === 'adjust',
                  needsRegeneration: result.recommendation === 'regenerate',
                });
                
                scenesEvaluated++;
                usedClaudeVision = true;
              }
            } catch (sceneError: any) {
              console.warn(`[UniversalVideo] Failed to evaluate scene ${i + 1} with Claude Vision:`, sceneError.message);
              // Continue to next scene - will use simulated data if no scenes evaluated
            }
          }
        }
        
        if (scenesEvaluated > 0) {
          const avgScore = Math.round(sceneScores.reduce((sum, s) => sum + s.overallScore, 0) / sceneScores.length);
          const allIssues = sceneScores.flatMap(s => s.issues) as QualityIssue[];
          const criticalIssues = allIssues.filter(i => i.severity === 'critical');
          
          qualityReport = {
            projectId,
            overallScore: avgScore,
            passesQuality: avgScore >= 70 && criticalIssues.length === 0,
            sceneScores: sceneScores as any,
            criticalIssues,
            recommendations: avgScore >= 85 
              ? ['Video meets all quality standards'] 
              : criticalIssues.length > 0
                ? ['Address critical issues before rendering']
                : ['Consider minor improvements for best results'],
            evaluatedAt: new Date().toISOString(),
          };
          
          console.log(`[UniversalVideo] Pre-render QA complete: ${scenesEvaluated} scenes evaluated, avg score ${avgScore}`);
        }
      }
    }
    
    // Phase 10C: Return pending status when Claude Vision is not available
    // DO NOT generate fake random scores - UI should show "Pending" state
    if (!qualityReport) {
      console.warn('═══════════════════════════════════════════════════════════════════════════════');
      console.warn('[Phase10C] Claude Vision analysis not available');
      console.warn('[Phase10C] ANTHROPIC_API_KEY configured:', !!process.env.ANTHROPIC_API_KEY);
      console.warn('[Phase10C] Returning pending status - NO FAKE SCORES');
      console.warn('═══════════════════════════════════════════════════════════════════════════════');
      
      // Phase 10C: Return pending status for each scene instead of fake scores
      const sceneScores = scenes.map((scene, i) => ({
        sceneId: scene.id,
        sceneIndex: i,
        overallScore: 0,  // Phase 10C: Zero indicates pending (no fake score)
        scores: {
          composition: 0,
          visibility: 0,
          technicalQuality: 0,
          contentMatch: 0,
          professionalLook: 0,
        },
        issues: [] as QualityIssue[],
        passesThreshold: false,  // Cannot pass without real analysis
        needsRegeneration: false,
      }));
      
      qualityReport = {
        projectId,
        overallScore: 0,  // Phase 10C: Zero indicates pending
        passesQuality: false,  // Cannot pass without real analysis
        sceneScores,
        criticalIssues: [],
        recommendations: ['Configure ANTHROPIC_API_KEY to enable real quality analysis'],
        evaluatedAt: new Date().toISOString(),
      };
    }
    
    // Save the quality report to project (uses existing qualityReport field)
    projectData.qualityReport = qualityReport;
    projectData.updatedAt = new Date().toISOString();
    await saveProjectToDb(projectData, projectData.ownerId);
    
    // Transform to QA Gate format for frontend
    const criticalIssues = qualityReport.criticalIssues || [];
    const majorIssues = qualityReport.sceneScores?.flatMap(s => 
      (s.issues || []).filter(i => i.severity === 'major')
    ) || [];
    
    const allIssues = [
      ...criticalIssues.map(i => ({ ...i, sceneIndex: i.sceneIndex || 0 })),
      ...qualityReport.sceneScores?.flatMap(s => 
        (s.issues || []).map(i => ({ ...i, sceneIndex: s.sceneIndex }))
      ) || [],
    ];
    
    const aiArtifactsClear = !allIssues.some(i => 
      i.type === 'ai-text-detected' || i.type === 'ai-ui-detected'
    );
    
    const avgScores = qualityReport.sceneScores?.length > 0 ? {
      technical: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.technicalQuality || 75), 0) / qualityReport.sceneScores.length),
      composition: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.composition || 75), 0) / qualityReport.sceneScores.length),
      brand: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.contentMatch || 75), 0) / qualityReport.sceneScores.length),
    } : { technical: 75, composition: 75, brand: 75 };
    
    let recommendation: 'approved' | 'needs-review' | 'needs-fixes' = 'approved';
    if (criticalIssues.length > 0) {
      recommendation = 'needs-fixes';
    } else if (majorIssues.length > 2 || qualityReport.overallScore < 70) {
      recommendation = 'needs-review';
    }
    
    const qaResult = {
      overallScore: qualityReport.overallScore,
      technicalScore: avgScores.technical,
      brandComplianceScore: avgScores.brand,
      compositionScore: avgScores.composition,
      aiArtifactsClear,
      issues: allIssues.map(i => ({
        sceneIndex: i.sceneIndex || 0,
        severity: i.severity,
        description: i.description,
      })),
      recommendation,
      usedClaudeVision,
      evaluatedAt: qualityReport.evaluatedAt,
    };
    
    console.log(`[UniversalVideo] QA review complete: score ${qualityReport.overallScore}/100, recommendation: ${recommendation}, Claude Vision: ${usedClaudeVision}`);
    
    res.json({
      success: true,
      qaResult,
      qualityReport, // Also return full report for detailed view
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] QA review failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 7E: Get QA Result
router.get('/projects/:projectId/qa-result', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const qualityReport = projectData.qualityReport;
    
    if (!qualityReport) {
      return res.json({
        success: true,
        qaResult: null,
      });
    }
    
    // Transform existing qualityReport to QA Gate format
    const criticalIssues = qualityReport.criticalIssues || [];
    const allIssues = [
      ...criticalIssues.map(i => ({ ...i, sceneIndex: i.sceneIndex || 0 })),
      ...qualityReport.sceneScores?.flatMap(s => 
        (s.issues || []).map(i => ({ ...i, sceneIndex: s.sceneIndex }))
      ) || [],
    ];
    
    const aiArtifactsClear = !allIssues.some(i => 
      i.type === 'ai-text-detected' || i.type === 'ai-ui-detected'
    );
    
    const avgScores = qualityReport.sceneScores?.length > 0 ? {
      technical: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.technicalQuality || 75), 0) / qualityReport.sceneScores.length),
      composition: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.composition || 75), 0) / qualityReport.sceneScores.length),
      brand: Math.round(qualityReport.sceneScores.reduce((sum, s) => sum + (s.scores?.contentMatch || 75), 0) / qualityReport.sceneScores.length),
    } : { technical: 75, composition: 75, brand: 75 };
    
    let recommendation: 'approved' | 'needs-review' | 'needs-fixes' = 'approved';
    if (criticalIssues.length > 0) {
      recommendation = 'needs-fixes';
    } else if (allIssues.filter(i => i.severity === 'major').length > 2 || qualityReport.overallScore < 70) {
      recommendation = 'needs-review';
    }
    
    const qaResult = {
      overallScore: qualityReport.overallScore,
      technicalScore: avgScores.technical,
      brandComplianceScore: avgScores.brand,
      compositionScore: avgScores.composition,
      aiArtifactsClear,
      issues: allIssues.map(i => ({
        sceneIndex: i.sceneIndex || 0,
        severity: i.severity,
        description: i.description,
      })),
      recommendation,
      evaluatedAt: qualityReport.evaluatedAt,
    };
    
    res.json({
      success: true,
      qaResult,
      qualityReport,
    });
    
  } catch (error: any) {
    console.error('[UniversalVideo] Get QA result failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Phase 8B: Auto-Regeneration Endpoints
// ============================================

router.post('/projects/:projectId/scenes/:sceneIndex/auto-regenerate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    const sceneIdx = parseInt(sceneIndex, 10);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (sceneIdx < 0 || sceneIdx >= projectData.scenes.length) {
      return res.status(400).json({ success: false, error: 'Invalid scene index' });
    }
    
    const scene = projectData.scenes[sceneIdx];
    
    // Create a default analysis result if none exists to allow regeneration
    const analysisResult: Phase8AnalysisResult = scene.analysisResult || {
      sceneIndex: sceneIdx,
      overallScore: 50,
      technicalScore: 50,
      contentMatchScore: 50,
      brandComplianceScore: 50,
      compositionScore: 50,
      aiArtifactsDetected: false,
      aiArtifactDetails: [],
      contentMatchDetails: 'User requested regeneration',
      brandComplianceDetails: 'Pending analysis',
      frameAnalysis: {
        subjectPosition: 'center' as const,
        faceDetected: false,
        busyRegions: [],
        dominantColors: [],
        lightingType: 'neutral' as const,
        safeTextZones: [],
      },
      issues: [{ 
        category: 'technical' as const, 
        severity: 'minor' as const, 
        description: 'User requested regeneration', 
        suggestion: 'Regenerating...' 
      }],
      recommendation: 'regenerate' as const,
      analysisTimestamp: new Date().toISOString(),
      analysisModel: 'user-requested',
    };
    
    console.log(`[Phase8B] Starting auto-regeneration for scene ${sceneIdx + 1}`);
    
    // Check if this scene uses video (B-Roll) - if so, trigger video regeneration instead
    const isVideoScene = scene.background?.type === 'video' || scene.assets?.videoUrl;
    
    if (isVideoScene) {
      console.log(`[Phase8B] Scene ${sceneIdx + 1} is a video scene - triggering async video regeneration`);
      
      const { videoGenerationWorker } = await import('../services/video-generation-worker');
      
      // Check if there's already an active job for this scene
      const existingJob = await videoGenerationWorker.getActiveJobForScene(projectId, scene.id);
      if (existingJob) {
        console.log(`[Phase8B] Scene ${scene.id} already has active job: ${existingJob.jobId}`);
        return res.json({ 
          success: true, 
          jobId: existingJob.jobId,
          status: existingJob.status,
          progress: existingJob.progress,
          message: 'Video generation already in progress',
          isVideoRegeneration: true,
        });
      }
      
      // Create async video generation job
      const prompt = scene.visualDirection || (scene as any).description || 'Professional wellness video';
      const fallbackPrompt = (scene as any).summary || 'professional video';
      
      const job = await videoGenerationWorker.createJob({
        projectId,
        sceneId: scene.id,
        provider: 'runway', // Default to Runway for auto-regeneration
        prompt,
        fallbackPrompt,
        duration: scene.duration || 6,
        aspectRatio: projectData.outputFormat?.aspectRatio || '16:9',
        style: (projectData as any).settings?.visualStyle || 'professional',
        triggeredBy: userId,
      });
      
      console.log(`[Phase8B] Created video job ${job.jobId} for scene ${scene.id}`);
      
      return res.json({ 
        success: true, 
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        message: 'Video regeneration job created',
        isVideoRegeneration: true,
        project: projectData,
      });
    }
    
    // Image regeneration path (original logic)
    const sceneForRegen: SceneForRegeneration = {
      id: scene.id,
      sceneIndex: sceneIdx,
      sceneType: scene.type || 'content',
      contentType: (scene as any).contentType || 'lifestyle',
      narration: scene.narration || '',
      visualDirection: scene.visualDirection || '',
      duration: scene.duration || 0,
      currentProvider: (scene.assets as any)?.provider || 'flux',
      currentAssetUrl: scene.assets?.imageUrl || scene.assets?.videoUrl,
      analysisResult: analysisResult,
      projectId,
      aspectRatio: projectData.outputFormat?.aspectRatio || '16:9',
      totalScenes: projectData.scenes.length,
      qualityTier: projectData.qualityTier || 'standard',
      mediaMode: (projectData as any).mediaMode,
    };
    
    const result = await autoRegenerationService.regenerateScene(sceneForRegen);
    
    if (result.success && result.newAssetUrl) {
      const oldUrl = scene.assets?.imageUrl;
      
      if (!scene.assets) scene.assets = {};
      scene.assets.imageUrl = result.newAssetUrl;
      scene.assets.backgroundUrl = result.newAssetUrl;
      scene.analysisResult = result.newAnalysis;
      scene.qualityScore = result.finalScore;
      
      if (!projectData.regenerationHistory) projectData.regenerationHistory = [];
      projectData.regenerationHistory.push({
        id: `autoregen_${Date.now()}`,
        sceneId: scene.id,
        assetType: 'image',
        previousUrl: oldUrl,
        newUrl: result.newAssetUrl,
        prompt: result.attempts[result.attempts.length - 1]?.prompt || '',
        timestamp: new Date().toISOString(),
        success: true,
      });
      
      await saveProjectToDb(projectData, projectData.ownerId);
    } else if (result.escalatedToUser) {
      await autoRegenerationService.escalateToUserReview(sceneForRegen, result);
      (scene as any).needsUserReview = true;
      await saveProjectToDb(projectData, projectData.ownerId);
    }
    
    res.json({
      success: result.success,
      finalScore: result.finalScore,
      attempts: result.attempts.length,
      escalatedToUser: result.escalatedToUser,
      newAssetUrl: result.newAssetUrl,
      isVideoRegeneration: false,
      project: projectData,
    });
    
  } catch (error: any) {
    console.error('[Phase8B] Auto-regeneration failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/auto-regenerate-failed', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const failedScenes: SceneForRegeneration[] = [];
    
    for (let i = 0; i < projectData.scenes.length; i++) {
      const scene = projectData.scenes[i];
      if (scene.analysisResult && 
          (scene.analysisResult.recommendation === 'regenerate' || 
           scene.analysisResult.recommendation === 'critical_fail' ||
           scene.analysisResult.overallScore < 70)) {
        
        failedScenes.push({
          id: scene.id,
          sceneIndex: i,
          sceneType: scene.type || 'content',
          contentType: (scene as any).contentType || 'lifestyle',
          narration: scene.narration || '',
          visualDirection: scene.visualDirection || '',
          duration: scene.duration || 0,
          currentProvider: (scene.assets as any)?.provider || 'flux',
          currentAssetUrl: scene.assets?.imageUrl || scene.assets?.videoUrl,
          analysisResult: scene.analysisResult,
          projectId,
          aspectRatio: projectData.outputFormat?.aspectRatio || '16:9',
          totalScenes: projectData.scenes.length,
          mediaMode: (projectData as any).mediaMode,
        });
      }
    }
    
    if (failedScenes.length === 0) {
      return res.json({
        success: true,
        message: 'No scenes need regeneration',
        succeeded: 0,
        escalated: 0,
      });
    }
    
    console.log(`[Phase8B] Auto-regenerating ${failedScenes.length} failed scenes`);
    
    const batchResult = await autoRegenerationService.regenerateAllFailedScenes(failedScenes);
    
    for (const result of batchResult.results) {
      const sceneForRegen = failedScenes.find(s => s.sceneIndex === result.newAnalysis?.sceneIndex);
      if (sceneForRegen && result.success && result.newAssetUrl) {
        const scene = projectData.scenes[sceneForRegen.sceneIndex];
        if (!scene.assets) scene.assets = {};
        scene.assets.imageUrl = result.newAssetUrl;
        scene.analysisResult = result.newAnalysis;
        scene.qualityScore = result.finalScore;
      }
    }
    
    await saveProjectToDb(projectData, projectData.ownerId);
    
    res.json({
      success: true,
      totalProcessed: failedScenes.length,
      succeeded: batchResult.succeeded,
      escalated: batchResult.escalated,
      project: projectData,
    });
    
  } catch (error: any) {
    console.error('[Phase8B] Batch auto-regeneration failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects/:projectId/review-queue', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const queue = autoRegenerationService.getReviewQueue(projectId);
    
    res.json({
      success: true,
      queue,
      count: queue.length,
    });
    
  } catch (error: any) {
    console.error('[Phase8B] Get review queue failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/review-queue/:sceneId/resolve', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { action, customPrompt } = req.body;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (action === 'approve') {
      autoRegenerationService.clearReviewQueueEntry(projectId, sceneId);
      
      const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
      if (sceneIndex >= 0) {
        (projectData.scenes[sceneIndex] as any).needsUserReview = false;
        (projectData.scenes[sceneIndex] as any).userApproved = true;
        await saveProjectToDb(projectData, projectData.ownerId);
      }
      
      return res.json({ success: true, message: 'Scene approved by user' });
    }
    
    if (action === 'regenerate') {
      autoRegenerationService.clearReviewQueueEntry(projectId, sceneId);
      
      const sceneIndex = projectData.scenes.findIndex((s: Scene) => s.id === sceneId);
      if (sceneIndex < 0) {
        return res.status(404).json({ success: false, error: 'Scene not found' });
      }
      
      const scene = projectData.scenes[sceneIndex];
      
      if (customPrompt) {
        scene.visualDirection = customPrompt;
      }
      
      const sceneForRegen: SceneForRegeneration = {
        id: scene.id,
        sceneIndex,
        sceneType: scene.type || 'content',
        contentType: (scene as any).contentType || 'lifestyle',
        narration: scene.narration || '',
        visualDirection: scene.visualDirection || '',
        duration: scene.duration || 0,
        currentProvider: (scene.assets as any)?.provider || 'flux',
        currentAssetUrl: scene.assets?.imageUrl,
        analysisResult: scene.analysisResult!,
        projectId,
        aspectRatio: projectData.outputFormat?.aspectRatio || '16:9',
        totalScenes: projectData.scenes.length,
        qualityTier: projectData.qualityTier || 'standard',
        mediaMode: (projectData as any).mediaMode,
      };
      
      const result = await autoRegenerationService.regenerateScene(sceneForRegen);
      
      if (result.success && result.newAssetUrl) {
        if (!scene.assets) scene.assets = {};
        scene.assets.imageUrl = result.newAssetUrl;
        scene.analysisResult = result.newAnalysis;
        scene.qualityScore = result.finalScore;
        (scene as any).needsUserReview = false;
        await saveProjectToDb(projectData, projectData.ownerId);
      }
      
      return res.json({
        success: result.success,
        finalScore: result.finalScore,
        newAssetUrl: result.newAssetUrl,
        project: projectData,
      });
    }
    
    return res.status(400).json({ success: false, error: 'Invalid action. Use "approve" or "regenerate"' });
    
  } catch (error: any) {
    console.error('[Phase8B] Resolve review queue failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/auto-regeneration/config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const config = autoRegenerationService.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// INTELLIGENT PROMPT IMPROVEMENT (Issue-Aware)
// ============================================================

router.post('/projects/:projectId/scenes/:sceneIndex/improve-prompt', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    const { issues, scores } = req.body;
    
    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);
    
    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    const projectData = dbRowToVideoProject(projectRows[0]);
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIdx = parseInt(sceneIndex, 10);
    if (sceneIdx < 0 || sceneIdx >= projectData.scenes.length) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const scene = projectData.scenes[sceneIdx];
    
    // Determine if scene has brand assets
    const hasBrandAssets = !!(scene.brandAssetId || (scene as any).matchedBrandAssets?.length > 0);
    const brandAssetTypes = (scene as any).matchedBrandAssets?.map((a: any) => a.assetType) || [];
    
    // Determine generation type based on quality tier and brand assets
    const qualityTier = projectData.qualityTier || 'standard';
    let generationType: 'T2I' | 'T2V' | 'I2I' | 'I2V' = 'T2I';
    
    if (qualityTier === 'premium' || qualityTier === 'ultra') {
      generationType = hasBrandAssets ? 'I2V' : 'T2V';
    } else {
      generationType = hasBrandAssets ? 'I2I' : 'T2I';
    }
    
    console.log(`[PromptImprover] Scene ${sceneIdx + 1}: ${generationType}, hasBrandAssets: ${hasBrandAssets}`);
    
    const sceneRequirements = {
      sceneIndex: sceneIdx,
      sceneType: scene.type || 'content',
      narration: scene.narration || '',
      originalPrompt: scene.visualDirection || '',
      hasBrandAssets,
      brandAssetTypes,
      generationType,
      qualityTier: qualityTier as 'standard' | 'premium' | 'ultra',
      aspectRatio: ((projectData as any).outputFormat?.aspectRatio || (projectData as any).settings?.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1',
    };
    
    const issueContext = {
      issues: issues || (scene.analysisResult as any)?.issues || [],
      overallScore: scores?.overall || (scene.analysisResult as any)?.overallScore || 50,
      scores: {
        technical: scores?.technical || (scene.analysisResult as any)?.technicalScore || 70,
        contentMatch: scores?.contentMatch || (scene.analysisResult as any)?.contentMatchScore || 70,
        composition: scores?.composition || (scene.analysisResult as any)?.compositionScore || 70,
      },
    };
    
    const result = await intelligentPromptImprover.improvePrompt(sceneRequirements, issueContext);
    
    res.json({
      success: true,
      sceneIndex: sceneIdx,
      originalPrompt: scene.visualDirection,
      improvedPrompt: result.improvedPrompt,
      promptStrategy: result.promptStrategy,
      keyChanges: result.keyChanges,
      confidence: result.confidence,
      generationType,
      hasBrandAssets,
    });
    
  } catch (error: any) {
    console.error('[PromptImprover] Failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PHASE 13E: INTELLIGENT REGENERATION SYSTEM
// ============================================================

router.post('/projects/:projectId/scenes/:sceneIndex/intelligent-regenerate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneIndex } = req.params;
    
    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);
    
    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    const projectData = dbRowToVideoProject(projectRows[0]);
    
    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneIdx = parseInt(sceneIndex, 10);
    if (sceneIdx < 0 || sceneIdx >= projectData.scenes.length) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const scene = projectData.scenes[sceneIdx];
    const issues: QualityIssue[] = (scene.analysisResult as any)?.issues || [];
    
    console.log(`[Phase13E] Intelligent regeneration for scene ${sceneIdx + 1}`);
    
    const result = await intelligentRegenerationService.regenerateScene(
      {
        id: scene.id,
        type: scene.type || 'content',
        duration: scene.duration || 5,
        narration: scene.narration,
        visualDirection: scene.visualDirection,
        textOverlays: scene.textOverlays,
        assets: scene.assets,
        background: (scene as any).background,
      },
      {
        id: projectId,
        outputFormat: projectData.outputFormat,
        scenes: projectData.scenes.map(s => ({
          id: s.id,
          type: s.type || 'content',
          duration: s.duration || 5,
          narration: s.narration,
          visualDirection: s.visualDirection,
          textOverlays: s.textOverlays,
          assets: s.assets,
          background: (s as any).background,
        })),
      },
      issues,
      sceneIdx
    );
    
    if (result.success && result.newVideoUrl) {
      if (!scene.assets) scene.assets = {};
      scene.assets.videoUrl = result.newVideoUrl;
      // Keep all video URL fields in sync
      if (!(scene as any).background) (scene as any).background = { type: 'video', source: '' };
      (scene as any).background.videoUrl = result.newVideoUrl;
      (scene as any).background.mediaUrl = result.newVideoUrl;
      (scene as any).analysis = result.newAnalysis;
      (scene as any).compositionInstructions = result.newInstructions;
      
      if (!projectData.regenerationHistory) projectData.regenerationHistory = [];
      projectData.regenerationHistory.push({
        id: `intelligent_regen_${Date.now()}`,
        sceneId: scene.id,
        assetType: 'video',
        previousUrl: (scene.assets as any)?.previousVideoUrl || '',
        newUrl: result.newVideoUrl,
        prompt: result.strategy.changes.prompt || scene.visualDirection || '',
        timestamp: new Date().toISOString(),
        success: true,
      });
      
      await saveProjectToDb(projectData, projectData.ownerId);
    }
    
    res.json({
      success: result.success,
      sceneIndex: sceneIdx,
      attempt: result.attempt,
      strategy: {
        approach: result.strategy.approach,
        reasoning: result.strategy.reasoning,
        confidence: result.strategy.confidenceScore,
        warning: result.strategy.warning,
      },
      newVideoUrl: result.newVideoUrl,
      usedStockFootage: result.usedStockFootage,
      error: result.error,
      project: projectData,
    });
    
  } catch (error: any) {
    console.error('[Phase13E] Intelligent regeneration failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects/:projectId/scenes/:sceneId/regeneration-history', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    
    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);
    
    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    const projectData = dbRowToVideoProject(projectRows[0]);
    const projectOwnerId = projectRows[0].ownerId;
    
    if (String(projectOwnerId) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sceneExists = projectData.scenes.some((s: Scene) => s.id === sceneId);
    if (!sceneExists) {
      return res.status(404).json({ success: false, error: 'Scene not found in project' });
    }
    
    const history = await intelligentRegenerationService.getSceneHistory(sceneId, projectId);
    
    res.json({
      success: true,
      sceneId,
      projectId,
      history,
      attemptCount: history.length,
    });
    
  } catch (error: any) {
    console.error('[Phase13E] Get regeneration history failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/analyze-prompt-complexity', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }
    
    const complexity = promptComplexityAnalyzer.analyze(prompt);
    
    res.json({
      success: true,
      complexity: {
        score: complexity.score,
        category: complexity.category,
        factors: complexity.factors,
        recommendations: complexity.recommendations,
        warning: complexity.userWarning,
      },
    });
    
  } catch (error: any) {
    console.error('[Phase13E] Prompt complexity analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/regeneration/preview-strategy', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { prompt, attemptCount = 0, currentMediaUrl, previousIssues = [] } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }
    
    const complexity = promptComplexityAnalyzer.analyze(prompt);
    
    const mockAttempts = Array(attemptCount).fill(null).map((_, i) => ({
      attemptNumber: i + 1,
      timestamp: new Date(),
      provider: 'kling-2.5-turbo',
      prompt,
      result: 'failure' as const,
      issues: previousIssues,
    }));
    
    const strategy = regenerationStrategyEngine.determineStrategy({
      attempts: mockAttempts,
      complexity,
      currentPrompt: prompt,
      currentMediaUrl,
    });
    
    res.json({
      success: true,
      complexity: {
        score: complexity.score,
        category: complexity.category,
        warning: complexity.userWarning,
      },
      strategy: {
        approach: strategy.approach,
        reasoning: strategy.reasoning,
        confidence: strategy.confidenceScore,
        warning: strategy.warning,
        changes: strategy.changes,
      },
      suggestion: regenerationStrategyEngine.getNextSuggestion(strategy),
    });
    
  } catch (error: any) {
    console.error('[Phase13E] Preview strategy failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PHASE 8C: SMART TEXT PLACEMENT
// ============================================================

const textOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['lower_third', 'title', 'subtitle', 'caption', 'cta']),
});

router.post('/projects/:projectId/scenes/:sceneIndex/calculate-text-placements', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneIndex } = req.params;
    const { overlays, sceneDuration, fps = 30 } = req.body;

    if (!overlays || !Array.isArray(overlays)) {
      return res.status(400).json({ success: false, error: 'Overlays array is required' });
    }

    const validatedOverlays = overlays.map((o: any) => textOverlaySchema.parse(o)) as TextOverlayType[];
    const inputCount = validatedOverlays.length;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    const sceneIdx = parseInt(sceneIndex, 10);

    if (sceneIdx < 0 || sceneIdx >= projectData.scenes.length) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const scene = projectData.scenes[sceneIdx];
    const duration = sceneDuration || scene.duration || 5;

    let sceneAnalysis = null;
    if (scene.analysisResult) {
      try {
        sceneAnalysis = {
          faces: {
            detected: (scene.analysisResult as any).faceDetected || false,
            count: (scene.analysisResult as any).faceCount || 0,
            positions: (scene.analysisResult as any).facePositions || [],
          },
          composition: {
            focalPoint: { x: 0.5, y: 0.5 },
            brightness: 'normal' as const,
            dominantColors: (scene.analysisResult as any).dominantColors || [],
          },
          safeZones: (scene.analysisResult as any).safeZones || {
            topLeft: true, topCenter: true, topRight: true,
            middleLeft: true, middleCenter: true, middleRight: true,
            bottomLeft: true, bottomCenter: true, bottomRight: true,
          },
          recommendations: {
            textPosition: { vertical: 'lower-third' as const, horizontal: 'center' as const },
            textColor: '#FFFFFF',
            needsTextShadow: true,
            needsTextBackground: false,
            productOverlayPosition: { x: 'right' as const, y: 'bottom' as const },
            productOverlaySafe: true,
          },
          contentType: 'mixed' as const,
          mood: 'positive' as const,
        };
      } catch (e) {
        console.warn('[TextPlacement] Could not parse scene analysis:', e);
      }
    }

    const result = textPlacementService.calculatePlacements(
      validatedOverlays,
      sceneAnalysis,
      duration,
      fps
    );

    res.json({
      success: true,
      sceneIndex: sceneIdx,
      placements: result.placements,
      stats: {
        inputCount,
        uniqueCount: result.stats.uniqueCount,
        outputCount: result.placements.length,
        duplicatesRemoved: inputCount - result.stats.uniqueCount,
        placementsBlocked: result.stats.skipped,
      },
    });

  } catch (error: any) {
    console.error('[Phase8C] Calculate text placements failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/text-placement/styles', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const styles = textPlacementService.getDefaultStyles();
    const positions = textPlacementService.getPositionCoords();
    res.json({ success: true, styles, positions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PHASE 8D: MOOD-MATCHED TRANSITIONS
// ============================================================

router.post('/projects/:projectId/plan-transitions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { visualStyle } = req.body;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    const style = visualStyle || (projectData as any).style || 'professional';

    const scenesForTransition = projectData.scenes.map((scene, index) => ({
      sceneIndex: index,
      sceneType: scene.type || 'content',
      duration: scene.duration || 5,
      analysisResult: scene.analysisResult,
    }));

    const transitionPlan = transitionService.planTransitions(scenesForTransition, style);

    res.json({
      success: true,
      projectId,
      visualStyle: style,
      plan: transitionPlan,
    });

  } catch (error: any) {
    console.error('[Phase8D] Plan transitions failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects/:projectId/transitions/:transitionIndex/remotion-props', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, transitionIndex } = req.params;
    const { fps = 30 } = req.query;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    const style = (projectData as any).style || 'professional';

    const scenesForTransition = projectData.scenes.map((scene, index) => ({
      sceneIndex: index,
      sceneType: scene.type || 'content',
      duration: scene.duration || 5,
      analysisResult: scene.analysisResult,
    }));

    const transitionPlan = transitionService.planTransitions(scenesForTransition, style);
    const idx = parseInt(transitionIndex, 10);

    if (idx < 0 || idx >= transitionPlan.transitions.length) {
      return res.status(404).json({ success: false, error: 'Transition not found' });
    }

    const transition = transitionPlan.transitions[idx];
    const remotionType = transitionService.getRemotionTransition(transition.config.type);
    const remotionProps = transitionService.getRemotionTransitionProps(transition, Number(fps));
    const audioConfig = transitionService.getAudioCrossfadeConfig(transition);

    res.json({
      success: true,
      transitionIndex: idx,
      transition,
      remotion: {
        type: remotionType,
        props: remotionProps,
      },
      audio: audioConfig,
    });

  } catch (error: any) {
    console.error('[Phase8D] Get transition props failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/transitions/mood-mapping', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const moodMapping = transitionService.getMoodMapping();
    const transitionTypes = transitionService.getAvailableTransitionTypes();
    const stylePreferences = transitionService.getStylePreferences();

    res.json({
      success: true,
      moodMapping,
      transitionTypes,
      stylePreferences,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PHASE 8E: Brand Asset Injection Endpoints
// ============================================

router.get('/projects/:projectId/brand-injection', isAuthenticated, async (_req: Request, res: Response) => {
  res.json({ success: true, plan: null, message: 'Brand injection has been consolidated into scene overlay system' });
});

router.put('/projects/:projectId/brand-injection', isAuthenticated, async (_req: Request, res: Response) => {
  res.json({ success: true, plan: null, message: 'Brand injection has been consolidated into scene overlay system' });
});

router.get('/projects/:projectId/brand-injection/remotion-props', isAuthenticated, async (_req: Request, res: Response) => {
  res.json({ success: true, remotionProps: null, message: 'Brand injection has been consolidated into scene overlay system' });
});

router.get('/brand-injection/defaults', isAuthenticated, async (_req: Request, res: Response) => {
  res.json({ success: true, defaults: null, hasAssets: false, message: 'Brand injection has been consolidated into scene overlay system' });
});

// ============================================
// PHASE 8F: Quality Assurance Dashboard Endpoints
// ============================================

router.get('/projects/:projectId/quality-report', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    
    const analyses: Phase8AnalysisResult[] = projectData.scenes.map((scene, idx) => {
      if (scene.analysisResult) {
        return scene.analysisResult;
      }
      return {
        sceneIndex: idx,
        overallScore: 0,
        technicalScore: 0,
        contentMatchScore: 0,
        brandComplianceScore: 0,
        compositionScore: 0,
        aiArtifactsDetected: false,
        aiArtifactDetails: [],
        contentMatchDetails: 'Not yet analyzed',
        brandComplianceDetails: 'Not yet analyzed',
        frameAnalysis: {
          subjectPosition: 'center' as const,
          faceDetected: false,
          busyRegions: [],
          dominantColors: [],
          lightingType: 'neutral' as const,
          safeTextZones: [],
        },
        issues: [{ 
          category: 'technical' as const, 
          severity: 'critical' as const, 
          description: 'Scene has not been analyzed yet', 
          suggestion: 'Run quality analysis on all scenes' 
        }],
        recommendation: 'regenerate' as const,
        analysisTimestamp: '',
        analysisModel: 'pending',
      };
    });
    
    const overallScore = analyses.length > 0
      ? Math.round(analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length)
      : 0;

    res.json({
      success: true,
      report: {
        projectId,
        overallScore,
        sceneCount: analyses.length,
      },
    });

  } catch (error: any) {
    console.error('[Phase8F] Get quality report failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/analyze-all', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    const analyses: Phase8AnalysisResult[] = [];

    for (let i = 0; i < projectData.scenes.length; i++) {
      const scene = projectData.scenes[i];
      
      if (scene.analysisResult) {
        analyses.push(scene.analysisResult);
        continue;
      }
      
      const sceneAssets = scene.assets;
      const mediaUrl = sceneAssets?.videoUrl || sceneAssets?.imageUrl || (sceneAssets as any)?.primaryImageUrl;
      
      if (mediaUrl) {
        try {
          const context = {
            sceneIndex: i,
            sceneType: scene.type || 'content',
            narration: scene.narration || '',
            visualDirection: scene.visualDirection || '',
            expectedContentType: 'video',
            totalScenes: projectData.scenes.length,
          };
          
          const analysis = await sceneAnalysisService.analyzeScenePhase8(mediaUrl, context);
          analyses.push(analysis);
          
          projectData.scenes[i] = {
            ...scene,
            analysisResult: analysis,
          };
        } catch (analysisError: any) {
          console.error(`[Phase8F] Scene ${i} analysis failed:`, analysisError.message);
          const fallbackAnalysis: Phase8AnalysisResult = {
            sceneIndex: i,
            overallScore: 50,
            technicalScore: 50,
            contentMatchScore: 50,
            brandComplianceScore: 50,
            compositionScore: 50,
            aiArtifactsDetected: false,
            aiArtifactDetails: [],
            contentMatchDetails: 'Analysis failed',
            brandComplianceDetails: 'Analysis failed',
            frameAnalysis: {
              subjectPosition: 'center' as const,
              faceDetected: false,
              busyRegions: [],
              dominantColors: [],
              lightingType: 'neutral' as const,
              safeTextZones: [],
            },
            issues: [{ 
              category: 'technical' as const, 
              severity: 'major' as const, 
              description: `Analysis failed: ${analysisError.message}`, 
              suggestion: 'Retry analysis' 
            }],
            recommendation: 'needs_review',
            analysisTimestamp: new Date().toISOString(),
            analysisModel: 'fallback',
          };
          analyses.push(fallbackAnalysis);
          projectData.scenes[i] = {
            ...scene,
            analysisResult: fallbackAnalysis,
          };
        }
      } else {
        const noMediaAnalysis: Phase8AnalysisResult = {
          sceneIndex: i,
          overallScore: 0,
          technicalScore: 0,
          contentMatchScore: 0,
          brandComplianceScore: 0,
          compositionScore: 0,
          aiArtifactsDetected: false,
          aiArtifactDetails: [],
          contentMatchDetails: 'No media to analyze',
          brandComplianceDetails: 'No media to analyze',
          frameAnalysis: {
            subjectPosition: 'center' as const,
            faceDetected: false,
            busyRegions: [],
            dominantColors: [],
            lightingType: 'neutral' as const,
            safeTextZones: [],
          },
          issues: [{ 
            category: 'technical' as const, 
            severity: 'critical' as const, 
            description: 'No media URL available for analysis', 
            suggestion: 'Generate video/image for this scene first' 
          }],
          recommendation: 'regenerate',
          analysisTimestamp: new Date().toISOString(),
          analysisModel: 'none',
        };
        analyses.push(noMediaAnalysis);
        projectData.scenes[i] = {
          ...scene,
          analysisResult: noMediaAnalysis,
        };
      }
    }

    await db.update(universalVideoProjects)
      .set({
        scenes: projectData.scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    const overallScore = analyses.length > 0
      ? Math.round(analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length)
      : 0;

    res.json({
      success: true,
      report: {
        projectId,
        overallScore,
        sceneCount: analyses.length,
      },
      analyzedCount: analyses.length,
    });

  } catch (error: any) {
    console.error('[Phase8F] Analyze all scenes failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneIndex/approve', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneIndex } = req.params;
    const idx = parseInt(sceneIndex, 10);

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    
    if (idx < 0 || idx >= projectData.scenes.length) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    projectData.scenes[idx] = {
      ...projectData.scenes[idx],
      userApproved: true,
    } as any;

    await db.update(universalVideoProjects)
      .set({
        scenes: projectData.scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, sceneIndex: idx, approved: true });

  } catch (error: any) {
    console.error('[Phase8F] Approve scene failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneIndex/reject', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneIndex } = req.params;
    const { reason } = req.body;
    const idx = parseInt(sceneIndex, 10);

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    
    if (idx < 0 || idx >= projectData.scenes.length) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    projectData.scenes[idx] = {
      ...projectData.scenes[idx],
      userApproved: false,
      rejectionReason: reason || 'User rejected',
    } as any;

    await db.update(universalVideoProjects)
      .set({
        scenes: projectData.scenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, sceneIndex: idx, rejected: true, reason });

  } catch (error: any) {
    console.error('[Phase8F] Reject scene failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/approve-all', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const projectRows = await db.select().from(universalVideoProjects)
      .where(eq(universalVideoProjects.projectId, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const projectData = dbRowToVideoProject(projectRows[0]);
    let approvedCount = 0;

    const updatedScenes = projectData.scenes.map((scene, idx) => {
      if (scene.analysisResult && 
          scene.analysisResult.recommendation === 'needs_review' &&
          !(scene as any).userApproved) {
        approvedCount++;
        return {
          ...scene,
          userApproved: true,
        } as any;
      }
      return scene;
    });

    await db.update(universalVideoProjects)
      .set({
        scenes: updatedScenes,
        updatedAt: new Date(),
      })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, approvedCount });

  } catch (error: any) {
    console.error('[Phase8F] Approve all scenes failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Phase 10C: Score Integrity Check - Debug endpoint to verify real vs fake scores
router.get('/api/debug/score-integrity', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id || '';
    
    // Get all video projects for this user
    const userProjects = await db.select({ projectId: universalVideoProjects.projectId })
      .from(universalVideoProjects)
      .where(eq(universalVideoProjects.ownerId, userId))
      .limit(50);
    const projectIds = userProjects.map(p => p.projectId);
    
    const report = {
      totalProjects: projectIds.length,
      totalScenes: 0,
      withRealAnalysis: 0,
      withoutAnalysis: 0,
      scoreMismatches: [] as Array<{
        projectId: string;
        sceneId: string;
        sceneIndex: number;
        storedScore: number | null;
        analysisScore: number | null;
      }>,
      suspiciousScores: [] as Array<{
        projectId: string;
        sceneId: string;
        sceneIndex: number;
        score: number;
        reason: string;
      }>,
      allScores: [] as number[],
      warning: null as string | null,
    };
    
    for (const projectId of projectIds.slice(0, 10)) { // Limit to 10 projects for performance
      const projectData = await getProjectFromDb(projectId);
      if (!projectData?.scenes) continue;
      
      for (const scene of projectData.scenes) {
        report.totalScenes++;
        const sceneIndex = projectData.scenes.indexOf(scene);
        
        const analysisResult = scene.analysisResult;
        const qualityScore = scene.qualityScore || projectData.qualityReport?.sceneScores?.find(
          s => s.sceneId === scene.id || s.sceneIndex === sceneIndex
        )?.overallScore;
        
        if (analysisResult?.overallScore !== undefined && analysisResult.overallScore > 0) {
          report.withRealAnalysis++;
          report.allScores.push(analysisResult.overallScore);
          
          // Check for score mismatch
          if (qualityScore !== undefined && qualityScore !== analysisResult.overallScore) {
            report.scoreMismatches.push({
              projectId,
              sceneId: scene.id,
              sceneIndex,
              storedScore: qualityScore,
              analysisScore: analysisResult.overallScore,
            });
          }
        } else {
          report.withoutAnalysis++;
          
          // Scene has score but no real analysis = suspicious
          if (qualityScore && qualityScore > 0) {
            report.suspiciousScores.push({
              projectId,
              sceneId: scene.id,
              sceneIndex,
              score: qualityScore,
              reason: 'Has score but no analysisResult with valid score',
            });
          }
        }
      }
    }
    
    // Check for suspiciously uniform scores (all in 90-93 range = likely fake)
    const uniqueScores = new Set(report.allScores);
    if (report.allScores.length > 5 && uniqueScores.size < 5) {
      report.warning = 'Scores are suspiciously uniform - may indicate fake scoring still active';
    }
    
    // Check for all scores in narrow range
    if (report.allScores.length > 0) {
      const min = Math.min(...report.allScores);
      const max = Math.max(...report.allScores);
      if (max - min < 10 && report.allScores.length > 5) {
        report.warning = `All ${report.allScores.length} scores in narrow range (${min}-${max}) - may indicate fake scoring`;
      }
    }
    
    res.json({
      success: true,
      phase: '10C',
      purpose: 'Verify quality scores come from real Claude Vision analysis',
      report,
      conclusion: report.suspiciousScores.length === 0 && report.scoreMismatches.length === 0
        ? 'PASS: All displayed scores appear to come from real analysis'
        : 'FAIL: Found suspicious or mismatched scores - fake scoring may still be active',
    });
    
  } catch (error: any) {
    console.error('[Phase10C] Score integrity check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13: Provider Registry API - Expose the updated provider registry to the UI
import { VIDEO_PROVIDERS as PHASE13_PROVIDERS, getAllVideoProviders, getProvidersByStrength } from '../config/video-providers';
import { selectProvidersForSceneSmart, analyzePromptComplexity, mapToLegacyProviderId, isProviderExecutable } from '../config/ai-video-providers';

router.get('/provider-registry', isAuthenticated, async (req, res) => {
  try {
    const providers = Object.values(PHASE13_PROVIDERS).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      costPer10Seconds: p.costPer10Seconds,
      capabilities: {
        imageToVideo: p.capabilities.imageToVideo,
        textToVideo: p.capabilities.textToVideo,
        imageToImage: p.capabilities.imageToImage,
        maxResolution: p.capabilities.maxResolution,
        maxFps: p.capabilities.maxFps,
        maxDuration: p.capabilities.maxDuration,
        strengths: p.capabilities.strengths,
        weaknesses: p.capabilities.weaknesses,
        motionQuality: p.capabilities.motionQuality,
        temporalConsistency: p.capabilities.temporalConsistency,
        nativeAudio: p.capabilities.nativeAudio,
        lipSync: p.capabilities.lipSync,
        effectsPresets: p.capabilities.effectsPresets,
      },
      apiProvider: p.apiProvider,
      modelId: p.modelId,
      isExecutable: isProviderExecutable(p.id),
      legacyId: mapToLegacyProviderId(p.id),
    }));

    // Group by family
    const families = {
      kling: providers.filter(p => p.id.startsWith('kling')),
      wan: providers.filter(p => p.id.startsWith('wan')),
      veo: providers.filter(p => p.id.startsWith('veo')),
      other: providers.filter(p => 
        !p.id.startsWith('kling') && 
        !p.id.startsWith('wan') && 
        !p.id.startsWith('veo')
      ),
    };

    res.json({
      success: true,
      totalProviders: providers.length,
      providers,
      families,
      videoProviders: getAllVideoProviders().map(p => ({
        id: p.id,
        name: p.name,
        costPer10Seconds: p.costPer10Seconds,
        isExecutable: isProviderExecutable(p.id),
      })),
    });
  } catch (error: any) {
    console.error('[Phase13] Provider registry fetch failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 13: Smart provider routing endpoint
router.post('/smart-route', isAuthenticated, async (req, res) => {
  try {
    const { visualPrompt, sceneType } = req.body;
    
    if (!visualPrompt) {
      return res.status(400).json({ success: false, error: 'visualPrompt is required' });
    }

    const routingDecision = selectProvidersForSceneSmart(sceneType || 'b-roll', visualPrompt);
    const complexityAnalysis = analyzePromptComplexity(visualPrompt);

    res.json({
      success: true,
      routing: routingDecision,
      complexity: complexityAnalysis,
    });
  } catch (error: any) {
    console.error('[Phase13] Smart routing failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 14A: Brand Requirement Analyzer
import { brandRequirementAnalyzer } from '../services/brand-requirement-analyzer';
import { brandAssetMatcher } from '../services/brand-asset-matcher';

const brandAnalysisInputSchema = z.object({
  visualDirection: z.string().min(1),
  narration: z.string().optional(),
});

const brandAnalysisSchema = z.object({
  requiresBrandAssets: z.boolean(),
  confidence: z.number(),
  requirements: z.object({
    productMentioned: z.boolean(),
    productNames: z.array(z.string()),
    productVisibility: z.enum(['featured', 'prominent', 'visible', 'background']),
    logoRequired: z.boolean(),
    logoType: z.enum(['primary', 'watermark', 'certification']).nullable(),
    brandingVisibility: z.enum(['prominent', 'visible', 'subtle']),
    sceneType: z.enum(['product-hero', 'product-in-context', 'branded-environment', 'standard']),
    outputType: z.enum(['image', 'video']),
    motionStyle: z.enum(['static', 'subtle', 'environmental', 'reveal']).nullable(),
  }),
  matchedAssets: z.object({
    products: z.array(z.any()),
    logos: z.array(z.any()),
    locations: z.array(z.any()),
  }),
});

const brandAssetBestInputSchema = z.object({
  purpose: z.enum(['product-hero', 'logo-overlay', 'watermark', 'product-group', 'location']),
  productName: z.string().optional(),
});

const brandAssetSearchInputSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
});

router.post('/brand-analysis/analyze', isAuthenticated, async (req, res) => {
  try {
    const parseResult = brandAnalysisInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.message });
    }
    
    const { visualDirection, narration } = parseResult.data;
    const analysis = brandRequirementAnalyzer.analyze(visualDirection, narration);
    
    res.json({
      success: true,
      phase: '14A',
      analysis,
    });
  } catch (error: any) {
    console.error('[Phase14A] Brand analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/brand-analysis/analyze-with-assets', isAuthenticated, async (req, res) => {
  try {
    const parseResult = brandAnalysisInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: parseResult.error.message });
    }
    
    const { visualDirection, narration } = parseResult.data;
    const analysis = brandRequirementAnalyzer.analyze(visualDirection, narration);
    const analysisWithAssets = await brandAssetMatcher.matchAssets(analysis);
    
    res.json({
      success: true,
      phase: '14A+14B',
      analysis: analysisWithAssets,
    });
  } catch (error: any) {
    console.error('[Phase14A+14B] Brand analysis with assets failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/brand-analysis/patterns', isAuthenticated, async (req, res) => {
  try {
    const patterns = brandRequirementAnalyzer.getPatterns();
    res.json({
      success: true,
      phase: '14A',
      patterns,
    });
  } catch (error: any) {
    console.error('[Phase14A] Get patterns failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 14B: Brand Asset Matcher
router.post('/brand-assets/match', isAuthenticated, async (req, res) => {
  try {
    const { analysis } = req.body;
    
    if (!analysis) {
      return res.status(400).json({ success: false, error: 'analysis is required (from /brand-analysis/analyze)' });
    }
    
    const parseResult = brandAnalysisSchema.safeParse(analysis);
    if (!parseResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid analysis object structure',
        details: parseResult.error.issues.map(i => i.message).join(', ')
      });
    }

    const matchedAnalysis = await brandAssetMatcher.matchAssets(parseResult.data);
    
    res.json({
      success: true,
      phase: '14B',
      matchedAssets: matchedAnalysis.matchedAssets,
    });
  } catch (error: any) {
    console.error('[Phase14B] Asset matching failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/brand-assets/best', isAuthenticated, async (req, res) => {
  try {
    const parseResult = brandAssetBestInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'purpose is required (product-hero, logo-overlay, watermark, product-group, location)',
        details: parseResult.error.message
      });
    }

    const { purpose, productName } = parseResult.data;
    const asset = await brandAssetMatcher.getBestAsset(purpose, productName);
    
    res.json({
      success: true,
      phase: '14B',
      purpose,
      asset,
      hasMatch: asset !== null,
    });
  } catch (error: any) {
    console.error('[Phase14B] Get best asset failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/brand-assets/search', isAuthenticated, async (req, res) => {
  try {
    const parseResult = brandAssetSearchInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'keywords array is required',
        details: parseResult.error.message
      });
    }

    const { keywords } = parseResult.data;
    const results = await brandAssetMatcher.searchByKeywords(keywords);
    
    res.json({
      success: true,
      phase: '14B',
      totalMatches: results.length,
      results,
    });
  } catch (error: any) {
    console.error('[Phase14B] Asset search failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 14: Analyze all scenes in a project for brand requirements
router.get('/projects/:projectId/brand-analysis', isAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const projectData = await getProjectFromDb(projectId);
    
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const sceneAnalyses = await Promise.all(
      projectData.scenes.map(async (scene, index) => {
        const analysis = brandRequirementAnalyzer.analyze(
          scene.visualDirection || '',
          scene.narration || ''
        );
        
        const analysisWithAssets = analysis.requiresBrandAssets 
          ? await brandAssetMatcher.matchAssets(analysis)
          : analysis;
        
        return {
          sceneIndex: index,
          sceneId: scene.id,
          sceneType: scene.type,
          visualDirection: scene.visualDirection?.substring(0, 100) + '...',
          analysis: analysisWithAssets,
        };
      })
    );

    const summary = {
      totalScenes: sceneAnalyses.length,
      scenesRequiringBrandAssets: sceneAnalyses.filter(s => s.analysis.requiresBrandAssets).length,
      scenesByType: {
        'product-hero': sceneAnalyses.filter(s => s.analysis.requirements.sceneType === 'product-hero').length,
        'product-in-context': sceneAnalyses.filter(s => s.analysis.requirements.sceneType === 'product-in-context').length,
        'branded-environment': sceneAnalyses.filter(s => s.analysis.requirements.sceneType === 'branded-environment').length,
        'standard': sceneAnalyses.filter(s => s.analysis.requirements.sceneType === 'standard').length,
      },
      totalProductMatches: sceneAnalyses.reduce((sum, s) => sum + s.analysis.matchedAssets.products.length, 0),
      totalLogoMatches: sceneAnalyses.reduce((sum, s) => sum + s.analysis.matchedAssets.logos.length, 0),
    };

    res.json({
      success: true,
      phase: '14A+14B',
      projectId,
      summary,
      scenes: sceneAnalyses,
    });
  } catch (error: any) {
    console.error('[Phase14] Project brand analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Phase 14C: Image Composition - Generate composed product images
const compositionRequestSchema = z.object({
  sceneId: z.string(),
  visualDirection: z.string(),
  environment: z.object({
    prompt: z.string(),
    style: z.enum(['photorealistic', 'lifestyle', 'studio', 'natural']),
    lighting: z.enum(['warm', 'cool', 'natural', 'dramatic', 'soft']),
    colorPalette: z.array(z.string()).optional(),
  }),
  products: z.array(z.object({
    assetId: z.string(),
    assetUrl: z.string(),
    position: z.object({
      x: z.number(),
      y: z.number(),
      anchor: z.enum(['center', 'bottom-center', 'top-center']),
    }),
    scale: z.number(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    rotation: z.number().optional(),
    flip: z.enum(['horizontal', 'vertical', 'none']).optional(),
    shadow: z.object({
      enabled: z.boolean(),
      angle: z.number(),
      blur: z.number(),
      opacity: z.number(),
    }),
    zIndex: z.number(),
  })),
  logoOverlay: z.object({
    assetId: z.string(),
    position: z.enum(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']),
    size: z.enum(['small', 'medium', 'large']),
    opacity: z.number(),
  }).optional(),
  output: z.object({
    width: z.number(),
    height: z.number(),
    format: z.enum(['png', 'jpg', 'webp']),
    quality: z.number(),
  }),
});

router.post('/compose-image', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedRequest = compositionRequestSchema.parse(req.body) as CompositionRequest;
    
    console.log(`[Phase14C] Composing image for scene ${validatedRequest.sceneId}`);
    
    const result = await imageCompositionService.compose(validatedRequest);
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Composition failed' 
      });
    }
    
    res.json({
      ...result,
      phase: '14C',
    });
  } catch (error: any) {
    console.error('[Phase14C] Image composition failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/compose-image/simple', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { sceneId, environmentPrompt, productUrls, options } = req.body;
    
    if (!sceneId || !environmentPrompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'sceneId and environmentPrompt are required' 
      });
    }
    
    console.log(`[Phase14C] Simple composition for scene ${sceneId}`);
    
    const request = compositionRequestBuilder.buildFromSimpleParams(
      sceneId,
      environmentPrompt,
      productUrls || [],
      options
    );
    
    const result = await imageCompositionService.compose(request);
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Composition failed' 
      });
    }
    
    res.json({
      ...result,
      phase: '14C',
    });
  } catch (error: any) {
    console.error('[Phase14C] Simple composition failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/compose-image/from-analysis', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { sceneId, visualDirection, analysis, outputType } = req.body;
    
    if (!sceneId || !visualDirection || !analysis) {
      return res.status(400).json({ 
        success: false, 
        error: 'sceneId, visualDirection, and analysis are required' 
      });
    }
    
    console.log(`[Phase14C] Composition from analysis for scene ${sceneId}`);
    
    const request = await compositionRequestBuilder.build(
      sceneId,
      visualDirection,
      analysis,
      outputType || 'image'
    );
    
    const result = await imageCompositionService.compose(request);
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Composition failed' 
      });
    }
    
    res.json({
      ...result,
      phase: '14C',
      request,
    });
  } catch (error: any) {
    console.error('[Phase14C] Analysis composition failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/compose', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const { options } = req.body;
    
    console.log(`[Phase14C] Composing scene ${sceneId} in project ${projectId}`);
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    
    const analysis = brandRequirementAnalyzer.analyze(
      scene.visualDirection || '',
      scene.narration || ''
    );
    
    const analysisWithAssets = analysis.requiresBrandAssets 
      ? await brandAssetMatcher.matchAssets(analysis)
      : analysis;
    
    const request = await compositionRequestBuilder.build(
      sceneId,
      scene.visualDirection || '',
      analysisWithAssets,
      'image'
    );
    
    if (options?.width) request.output.width = options.width;
    if (options?.height) request.output.height = options.height;
    if (options?.format) request.output.format = options.format;
    
    const result = await imageCompositionService.compose(request);
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Composition failed' 
      });
    }
    
    res.json({
      ...result,
      phase: '14C',
      projectId,
      sceneId,
      analysis: analysisWithAssets,
    });
  } catch (error: any) {
    console.error('[Phase14C] Scene composition failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/image-to-video/generate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      sourceImageUrl, 
      sourceType = 'composed',
      sceneId,
      visualDirection,
      motion,
      productRegions,
      output = { width: 1920, height: 1080, fps: 30, format: 'mp4' },
    } = req.body;

    if (!sourceImageUrl || !sceneId || !visualDirection) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sourceImageUrl, sceneId, visualDirection' 
      });
    }

    console.log(`[Phase14D] Starting I2V generation for scene ${sceneId}`);

    let motionConfig = motion;
    if (!motionConfig) {
      motionConfig = motionStyleDetector.detect(visualDirection);
      console.log(`[Phase14D] Auto-detected motion style: ${motionConfig.style}`);
    }

    const result = await imageToVideoService.generate({
      sourceImageUrl,
      sourceType,
      sceneId,
      visualDirection,
      motion: {
        style: motionConfig.style || 'subtle',
        intensity: motionConfig.intensity || 'low',
        duration: motionConfig.duration || 5,
        cameraMovement: motionConfig.cameraMovement,
        environmentalEffects: motionConfig.environmentalEffects,
        revealDirection: motionConfig.revealDirection,
      },
      productRegions: productRegions || [],
      output,
    });

    res.json({
      ...result,
      phase: '14D',
      motionConfig,
    });
  } catch (error: any) {
    console.error('[Phase14D] I2V generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/image-to-video/detect-motion', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { visualDirection, sceneType } = req.body;

    if (!visualDirection && !sceneType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Provide visualDirection or sceneType' 
      });
    }

    let result;
    if (sceneType) {
      result = motionStyleDetector.detectFromSceneType(sceneType);
    } else {
      result = motionStyleDetector.detect(visualDirection);
    }

    res.json({
      success: true,
      ...result,
      phase: '14D',
    });
  } catch (error: any) {
    console.error('[Phase14D] Motion detection failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/image-to-video/providers', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const providers = getAllI2VProviders().map(id => ({
      id,
      ...I2V_PROVIDER_CAPABILITIES[id],
    }));

    res.json({
      success: true,
      providers,
      phase: '14D',
    });
  } catch (error: any) {
    console.error('[Phase14D] Failed to get I2V providers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/image-to-video/select-provider', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { motionStyle, duration, preferQuality = true } = req.body;

    if (!motionStyle) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: motionStyle' 
      });
    }

    const selectedProviderId = selectI2VProvider(motionStyle, duration || 5, preferQuality);
    const provider = I2V_PROVIDER_CAPABILITIES[selectedProviderId];

    res.json({
      success: true,
      provider: {
        id: selectedProviderId,
        ...provider,
      },
      phase: '14D',
    });
  } catch (error: any) {
    console.error('[Phase14D] Provider selection failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/generate-video-from-composed', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const { composedImageUrl, motion, duration = 5 } = req.body;

    if (!composedImageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: composedImageUrl' 
      });
    }

    console.log(`[Phase14D] Generating video from composed image for scene ${sceneId}`);

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    let motionConfig = motion;
    if (!motionConfig) {
      motionConfig = motionStyleDetector.detect(scene.visualDirection || '');
    }

    const productRegions: Array<{ bounds: { x: number; y: number; width: number; height: number } }> = [];

    const result = await imageToVideoService.generateFromComposedImage(
      sceneId,
      scene.visualDirection || '',
      composedImageUrl,
      productRegions,
      duration,
      motionConfig
    );

    res.json({
      ...result,
      phase: '14D',
      projectId,
      sceneId,
    });
  } catch (error: any) {
    console.error('[Phase14D] Scene I2V generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/build-config', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      sceneId, 
      sceneDuration, 
      analysis, 
      productRegions,
      width = 1920,
      height = 1080,
      fps = 30,
    } = req.body;

    if (!sceneId || !sceneDuration) {
      return res.status(400).json({ 
        success: false, 
        error: 'sceneId and sceneDuration are required' 
      });
    }

    const config = await logoCompositionService.buildConfig(
      sceneId,
      sceneDuration,
      analysis || { requirements: { logoRequired: true, productMentioned: false, brandingVisibility: 'visible' } },
      productRegions,
      { width, height, fps }
    );

    res.json({
      success: true,
      phase: '14E',
      config,
    });
  } catch (error: any) {
    console.error('[Phase14E] Logo config build failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/build-simple', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      sceneId, 
      sceneDuration, 
      logoTypes = ['primary', 'watermark'],
      productRegions,
      width = 1920,
      height = 1080,
      fps = 30,
    } = req.body;

    if (!sceneId || !sceneDuration) {
      return res.status(400).json({ 
        success: false, 
        error: 'sceneId and sceneDuration are required' 
      });
    }

    const config = await logoCompositionService.buildSimpleConfig(
      sceneId,
      sceneDuration,
      logoTypes as LogoType[],
      { width, height, fps, productRegions }
    );

    res.json({
      success: true,
      phase: '14E',
      config,
    });
  } catch (error: any) {
    console.error('[Phase14E] Simple logo config failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/generate-props', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { config } = req.body;

    if (!config || !config.logos) {
      return res.status(400).json({ 
        success: false, 
        error: 'config with logos array is required' 
      });
    }

    const props = await logoCompositionService.generateRemotionProps(config);

    res.json({
      success: true,
      phase: '14E',
      remotionProps: props,
      count: props.length,
    });
  } catch (error: any) {
    console.error('[Phase14E] Remotion props generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/logo-composition/select-logo/:type', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { preferredName } = req.query;

    const validTypes: LogoType[] = ['primary', 'watermark', 'certification', 'partner'];
    if (!validTypes.includes(type as LogoType)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid logo type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    const asset = await logoAssetSelector.selectLogo(
      type as LogoType, 
      preferredName as string | undefined
    );

    if (!asset) {
      return res.status(404).json({ 
        success: false, 
        error: `No ${type} logo found in brand media library` 
      });
    }

    res.json({
      success: true,
      phase: '14E',
      asset,
    });
  } catch (error: any) {
    console.error('[Phase14E] Logo selection failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/calculate-placement', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { placement, logoAsset, config } = req.body;

    if (!placement || !logoAsset || !config) {
      return res.status(400).json({ 
        success: false, 
        error: 'placement, logoAsset, and config are required' 
      });
    }

    const calculated = logoPlacementCalculator.calculate(placement, logoAsset, config);

    res.json({
      success: true,
      phase: '14E',
      calculated,
    });
  } catch (error: any) {
    console.error('[Phase14E] Placement calculation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/add-logo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { config, logoType, overrides } = req.body;

    if (!config || !logoType) {
      return res.status(400).json({ 
        success: false, 
        error: 'config and logoType are required' 
      });
    }

    const updatedConfig = await logoCompositionService.addLogoToConfig(
      config,
      logoType as LogoType,
      overrides
    );

    res.json({
      success: true,
      phase: '14E',
      config: updatedConfig,
    });
  } catch (error: any) {
    console.error('[Phase14E] Add logo failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logo-composition/resolve-assets', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ 
        success: false, 
        error: 'config is required' 
      });
    }

    const resolvedConfig = await logoCompositionService.resolveAllAssetUrls(config);

    res.json({
      success: true,
      phase: '14E',
      config: resolvedConfig,
    });
  } catch (error: any) {
    console.error('[Phase14E] Asset resolution failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/compose-logos', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const { 
      logoTypes = ['primary', 'watermark'],
      productRegions,
      width = 1920,
      height = 1080,
    } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const sceneDuration = scene.duration || 5;
    const fps = projectData.fps || 30;
    const sceneDurationFrames = sceneDuration * fps;

    const config = await logoCompositionService.buildSimpleConfig(
      sceneId,
      sceneDurationFrames,
      logoTypes as LogoType[],
      { width, height, fps, productRegions }
    );

    const resolvedConfig = await logoCompositionService.resolveAllAssetUrls(config);
    const remotionProps = await logoCompositionService.generateRemotionProps(resolvedConfig);

    res.json({
      success: true,
      phase: '14E',
      projectId,
      sceneId,
      config: resolvedConfig,
      remotionProps,
    });
  } catch (error: any) {
    console.error('[Phase14E] Scene logo composition failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/workflow/analyze', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { visualDirection, narration, outputType = 'video' } = req.body;

    if (!visualDirection) {
      return res.status(400).json({ 
        success: false, 
        error: 'visualDirection is required' 
      });
    }

    const { analysis, decision } = await brandWorkflowOrchestrator.analyzeOnly(
      visualDirection,
      narration || '',
      outputType
    );

    res.json({
      success: true,
      phase: '14F',
      analysis: {
        requiresBrandAssets: analysis.requiresBrandAssets,
        confidence: analysis.confidence,
        requirements: analysis.requirements,
      },
      matchedAssets: {
        products: analysis.matchedAssets.products.map((p: any) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          thumbnailUrl: p.thumbnailUrl || p.url,
          mediaType: p.mediaType || 'product',
          matchScore: p.matchScore,
        })),
        logos: analysis.matchedAssets.logos.map((l: any) => ({
          id: l.id,
          name: l.name,
          url: l.url,
          thumbnailUrl: l.thumbnailUrl || l.url,
          mediaType: l.mediaType || 'logo',
          matchScore: l.matchScore,
        })),
        locations: analysis.matchedAssets.locations.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          url: loc.url,
          thumbnailUrl: loc.thumbnailUrl || loc.url,
          mediaType: loc.mediaType || 'location',
          matchScore: loc.matchScore,
        })),
      },
      decision: {
        path: decision.path,
        confidence: decision.confidence,
        reasons: decision.reasons,
        steps: decision.steps,
        qualityImpact: decision.qualityImpact,
        costMultiplier: decision.costMultiplier,
      },
    });
  } catch (error: any) {
    console.error('[Phase14F] Workflow analysis failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/workflow/execute', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      sceneId,
      visualDirection,
      narration,
      duration = 5,
      outputType = 'video'
    } = req.body;

    if (!sceneId || !visualDirection) {
      return res.status(400).json({ 
        success: false, 
        error: 'sceneId and visualDirection are required' 
      });
    }

    const result = await brandWorkflowOrchestrator.execute(
      sceneId,
      visualDirection,
      narration || '',
      duration,
      outputType
    );

    const { success, ...restResult } = result;
    res.json({
      success,
      phase: '14F',
      ...restResult,
    });
  } catch (error: any) {
    console.error('[Phase14F] Workflow execution failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/workflow/paths', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const paths = brandWorkflowOrchestrator.getWorkflowPaths();
    
    const pathDetails = paths.map(path => ({
      id: path,
      description: brandWorkflowOrchestrator.describeWorkflow(path),
    }));

    res.json({
      success: true,
      phase: '14F',
      paths: pathDetails,
    });
  } catch (error: any) {
    console.error('[Phase14F] Failed to get workflow paths:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/workflow', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const { outputType = 'video' } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const result = await brandWorkflowOrchestrator.execute(
      sceneId,
      scene.visualDirection || '',
      scene.narration || '',
      scene.duration || 5,
      outputType
    );

    const { success, ...restResult } = result;
    res.json({
      success,
      phase: '14F',
      projectId,
      sceneId,
      ...restResult,
    });
  } catch (error: any) {
    console.error('[Phase14F] Scene workflow execution failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/workflow-preview', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const sceneWorkflows = await Promise.all(
      projectData.scenes.map(async (scene: any) => {
        const { analysis, decision } = await brandWorkflowOrchestrator.analyzeOnly(
          scene.visualDirection || '',
          scene.narration || '',
          'video'
        );
        
        return {
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          path: decision.path,
          confidence: decision.confidence,
          reasons: decision.reasons,
          qualityImpact: decision.qualityImpact,
          costMultiplier: decision.costMultiplier,
          matchedAssets: {
            products: analysis.matchedAssets.products.length,
            logos: analysis.matchedAssets.logos.length,
          },
        };
      })
    );

    const totalCost = sceneWorkflows.reduce((sum, s) => sum + s.costMultiplier, 0);
    const avgCost = sceneWorkflows.length > 0 ? totalCost / sceneWorkflows.length : 1;
    
    const pathCounts = sceneWorkflows.reduce((acc, s) => {
      acc[s.path] = (acc[s.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      phase: '14F',
      projectId,
      totalScenes: sceneWorkflows.length,
      averageCostMultiplier: avgCost,
      pathDistribution: pathCounts,
      scenes: sceneWorkflows,
    });
  } catch (error: any) {
    console.error('[Phase14F] Project workflow preview failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/pipeline-step', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { stepName, intermediates = {}, provider, qualityTier } = req.body;

    if (!stepName) {
      return res.status(400).json({ success: false, error: 'stepName is required' });
    }

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    console.log(`[Pipeline] Executing step "${stepName}" for scene ${sceneId}`);

    const result = await brandWorkflowOrchestrator.executeStep(
      stepName,
      sceneId,
      scene.visualDirection || '',
      scene.narration || '',
      scene.duration || 6,
      intermediates,
      provider,
      qualityTier
    );

    if (result.success && result.resultUrl) {
      const sceneIndex = projectData.scenes.findIndex((s: any) => s.id === sceneId);
      if (sceneIndex >= 0) {
        if (!projectData.scenes[sceneIndex].pipelineIntermediates) {
          projectData.scenes[sceneIndex].pipelineIntermediates = {};
        }
        projectData.scenes[sceneIndex].pipelineIntermediates = result.intermediates;
        
        if (stepName === 'Animate Image' && result.resultUrl) {
          projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {};
          projectData.scenes[sceneIndex].assets.videoUrl = result.resultUrl;
          // Keep all video URL fields in sync
          projectData.scenes[sceneIndex].background = projectData.scenes[sceneIndex].background || { type: 'video', source: '' };
          projectData.scenes[sceneIndex].background.videoUrl = result.resultUrl;
          projectData.scenes[sceneIndex].background.mediaUrl = result.resultUrl;
        } else if ((stepName === 'Generate Environment' || stepName === 'Compose Products') && result.resultUrl) {
          projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {};
          projectData.scenes[sceneIndex].assets.imageUrl = result.resultUrl;
        }
        
        await saveProjectToDb(projectData, userId);
      }
    }

    res.json({
      success: result.success,
      stepName: result.stepName,
      resultUrl: result.resultUrl,
      intermediates: result.intermediates,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[Pipeline] Step execution failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/scenes/:sceneId/run-full-pipeline', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId, sceneId } = req.params;
    const { provider, qualityTier } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (!projectData) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (projectData.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const scene = projectData.scenes.find((s: any) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    console.log(`[Pipeline] Running full pipeline for scene ${sceneId}`);

    const result = await brandWorkflowOrchestrator.executeFullPipeline(
      sceneId,
      scene.visualDirection || '',
      scene.narration || '',
      scene.duration || 6,
      provider,
      qualityTier
    );

    if (result.success) {
      const sceneIndex = projectData.scenes.findIndex((s: any) => s.id === sceneId);
      if (sceneIndex >= 0) {
        projectData.scenes[sceneIndex].pipelineIntermediates = result.intermediates;
        projectData.scenes[sceneIndex].assets = projectData.scenes[sceneIndex].assets || {};
        if (result.videoUrl) {
          projectData.scenes[sceneIndex].assets.videoUrl = result.videoUrl;
          // Keep all video URL fields in sync
          projectData.scenes[sceneIndex].background = projectData.scenes[sceneIndex].background || { type: 'video', source: '' };
          projectData.scenes[sceneIndex].background.videoUrl = result.videoUrl;
          projectData.scenes[sceneIndex].background.mediaUrl = result.videoUrl;
        }
        if (result.intermediates.composedImage) {
          projectData.scenes[sceneIndex].assets.imageUrl = result.intermediates.composedImage;
        }
        
        await saveProjectToDb(projectData, userId);
      }
    }

    res.json({
      success: result.success,
      path: result.path,
      videoUrl: result.videoUrl,
      intermediates: result.intermediates,
      quality: result.quality,
      executionTimeMs: result.executionTimeMs,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[Pipeline] Full pipeline failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export async function recoverStaleRenders() {
  try {
    const staleThresholdMs = 5 * 60 * 1000;
    const staleThreshold = new Date(Date.now() - staleThresholdMs);
    
    const staleProjects = await db.select()
      .from(universalVideoProjects)
      .where(inArray(universalVideoProjects.status, ['rendering', 'lambda_pending']));
    
    let recoveredCount = 0;
    for (const row of staleProjects) {
      const updatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date(0);
      if (updatedAt < staleThreshold) {
        const progress = (row.progress as any) || {};
        progress.steps = progress.steps || {};
        progress.steps.rendering = progress.steps.rendering || {};
        progress.steps.rendering.status = 'error';
        progress.steps.rendering.message = 'Render interrupted by server restart. Please retry.';
        progress.errors = progress.errors || [];
        progress.errors.push('Render interrupted by server restart at ' + new Date().toISOString());
        
        await db.update(universalVideoProjects)
          .set({
            status: 'error',
            progress: progress,
            updatedAt: new Date(),
          })
          .where(eq(universalVideoProjects.projectId, row.projectId));
        
        recoveredCount++;
        console.log(`[UniversalVideo] Recovered stale rendering project: ${row.projectId} (last updated: ${updatedAt.toISOString()})`);
      }
    }
    
    if (recoveredCount > 0) {
      console.log(`[UniversalVideo] Recovered ${recoveredCount} stale rendering project(s) on startup`);
    }
  } catch (error: any) {
    console.error('[UniversalVideo] Failed to recover stale renders:', error.message);
  }
}

recoverStaleRenders();

// =====================================================
// Character Profile & Library Endpoints
// =====================================================

router.put('/projects/:projectId/characters', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { characters } = req.body;
    if (!Array.isArray(characters)) {
      return res.status(400).json({ success: false, error: 'characters must be an array' });
    }
    if (characters.length > 5) {
      return res.status(400).json({ success: false, error: 'Maximum 5 characters allowed' });
    }

    const [project] = await db.select().from(universalVideoProjects)
      .where(and(eq(universalVideoProjects.projectId, projectId), eq(universalVideoProjects.ownerId, userId)));
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    await db.update(universalVideoProjects)
      .set({ characters: characters, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    res.json({ success: true, characters });
  } catch (error: any) {
    console.error('[Characters] Save failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/generate-character-reference', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { name, role, physicalDescription, wardrobe, personalityNotes, referencePhotoUrl } = req.body;
    if (!name || !physicalDescription) {
      return res.status(400).json({ success: false, error: 'Character must have a name and physical description' });
    }

    const prompt = `Disney/Pixar 3D CGI character sheet, ${name}, ${role || 'character'}. ${physicalDescription}. Wearing ${wardrobe || 'casual clothing'}. Expression: ${personalityNotes || 'friendly and approachable'}. Full front-facing portrait, clean pure white background, subsurface skin scattering, soft studio lighting, expressive rounded facial features, vibrant warm color palette, 4K cinematic render. Character reference sheet — single character, solid white background, no environment.`;

    console.log(`[Characters] Standalone: Generating reference image for "${name}"${referencePhotoUrl ? ' (reference photo uploaded for visual guidance)' : ''}`);
    console.log(`[Characters] Prompt: ${prompt.substring(0, 120)}...`);
    console.log(`[Characters] Using T2I (text-to-image) for consistent Disney/Pixar style`);

    const timeoutMs = 120000;
    const generationPromise = imageGenerationService.generateImage({
      prompt,
      provider: 'flux-1.1-pro',
      width: 1024,
      height: 1024,
      qualityTier: 'premium',
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Reference image generation timed out after 2 minutes')), timeoutMs)
    );

    let generated: any;
    try {
      generated = await Promise.race([generationPromise, timeoutPromise]);
    } catch (genError: any) {
      console.error(`[Characters] Standalone generation failed for "${name}":`, genError.message);
      return res.status(500).json({ success: false, error: genError.message });
    }

    if (!generated?.url || generated.url.startsWith('placeholder:') || generated.url.startsWith('pending:')) {
      return res.status(500).json({ success: false, error: 'Image generation did not return a valid URL' });
    }

    let finalUrl = generated.url;
    try {
      const sharp = (await import('sharp')).default;
      const imageResponse = await fetch(generated.url);
      if (imageResponse.ok) {
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const resizedBuffer = await sharp(imageBuffer)
          .resize({ width: 1024, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        console.log(`[Characters] Standalone resized: ${imageBuffer.length} → ${resizedBuffer.length} bytes (WebP)`);

        if (s3Client) {
          const s3Key = `character-references/standalone/${userId}_${Date.now()}.webp`;
          await s3Client.send(new PutObjectCommand({
            Bucket: REMOTION_BUCKET_NAME,
            Key: s3Key,
            Body: resizedBuffer,
            ContentType: 'image/webp',
            ACL: 'public-read',
          }));
          finalUrl = `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${s3Key}`;
          console.log(`[Characters] Standalone uploaded to S3: ${finalUrl}`);
        } else {
          const piapiUrl = await uploadImageToPiAPIStorage(resizedBuffer, `char_ref_standalone_${Date.now()}.webp`);
          if (piapiUrl) {
            finalUrl = piapiUrl;
            console.log(`[Characters] Standalone uploaded to PiAPI storage: ${finalUrl}`);
          }
        }
      }
    } catch (uploadErr: any) {
      console.warn(`[Characters] Standalone image optimization/upload failed, using original URL:`, uploadErr.message);
    }

    console.log(`[Characters] ✓ Standalone reference image generated for "${name}": ${finalUrl.substring(0, 80)}`);
    res.json({ success: true, referenceImageUrl: finalUrl });

  } catch (error: any) {
    console.error('[Characters] Standalone generate reference failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/characters/:characterId/generate-reference', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, characterId } = req.params;
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const [project] = await db.select().from(universalVideoProjects)
      .where(and(eq(universalVideoProjects.projectId, projectId), eq(universalVideoProjects.ownerId, userId)));
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const characters = (project.characters as any[]) || [];
    const charIndex = characters.findIndex((c: any) => c.id === characterId);
    if (charIndex === -1) return res.status(404).json({ success: false, error: 'Character not found' });

    const character = characters[charIndex];
    if (!character.name || !character.physicalDescription) {
      return res.status(400).json({ success: false, error: 'Character must have a name and physical description' });
    }

    const referencePhotoUrl = (req.body || {}).referencePhotoUrl || character.referencePhotoUrl || null;
    
    characters[charIndex] = { ...character, generationStatus: 'generating', generationError: undefined };
    await db.update(universalVideoProjects)
      .set({ characters, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    const prompt = `Disney/Pixar 3D CGI character sheet, ${character.name}, ${character.role || 'character'}. ${character.physicalDescription}. Wearing ${character.wardrobe || 'casual clothing'}. Expression: ${character.personalityNotes || 'friendly and approachable'}. Full front-facing portrait, clean pure white background, subsurface skin scattering, soft studio lighting, expressive rounded facial features, vibrant warm color palette, 4K cinematic render. Character reference sheet — single character, solid white background, no environment.`;

    console.log(`[Characters] Generating reference image for "${character.name}" (${characterId})${referencePhotoUrl ? ' (reference photo uploaded for visual guidance)' : ''}`);
    console.log(`[Characters] Prompt: ${prompt.substring(0, 120)}...`);
    console.log(`[Characters] Using T2I (text-to-image) for consistent Disney/Pixar style`);

    const timeoutMs = 120000;
    const generationPromise = imageGenerationService.generateImage({
      prompt,
      provider: 'flux-1.1-pro',
      width: 1024,
      height: 1024,
      qualityTier: 'premium',
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Reference image generation timed out after 2 minutes')), timeoutMs)
    );

    let generated: any;
    try {
      generated = await Promise.race([generationPromise, timeoutPromise]);
    } catch (genError: any) {
      console.error(`[Characters] Generation failed for "${character.name}":`, genError.message);
      const updatedChars = [...characters];
      updatedChars[charIndex] = { ...character, generationStatus: 'failed', generationError: genError.message };
      await db.update(universalVideoProjects)
        .set({ characters: updatedChars, updatedAt: new Date() })
        .where(eq(universalVideoProjects.projectId, projectId));
      return res.status(500).json({ success: false, error: genError.message });
    }

    if (!generated?.url || generated.url.startsWith('placeholder:') || generated.url.startsWith('pending:')) {
      const errorMsg = 'Image generation did not return a valid URL';
      const updatedChars = [...characters];
      updatedChars[charIndex] = { ...character, generationStatus: 'failed', generationError: errorMsg };
      await db.update(universalVideoProjects)
        .set({ characters: updatedChars, updatedAt: new Date() })
        .where(eq(universalVideoProjects.projectId, projectId));
      return res.status(500).json({ success: false, error: errorMsg });
    }

    let finalUrl = generated.url;
    try {
      const sharp = (await import('sharp')).default;
      const imageResponse = await fetch(generated.url);
      if (imageResponse.ok) {
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const resizedBuffer = await sharp(imageBuffer)
          .resize({ width: 1024, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        console.log(`[Characters] Resized: ${imageBuffer.length} → ${resizedBuffer.length} bytes (WebP)`);

        if (s3Client) {
          const s3Key = `character-references/${projectId}/${characterId}_${Date.now()}.webp`;
          await s3Client.send(new PutObjectCommand({
            Bucket: REMOTION_BUCKET_NAME,
            Key: s3Key,
            Body: resizedBuffer,
            ContentType: 'image/webp',
            ACL: 'public-read',
          }));
          finalUrl = `https://${REMOTION_BUCKET_NAME}.s3.${REMOTION_REGION}.amazonaws.com/${s3Key}`;
          console.log(`[Characters] Uploaded to S3: ${finalUrl}`);
        } else {
          const piapiUrl = await uploadImageToPiAPIStorage(resizedBuffer, `char_ref_${characterId}.webp`);
          if (piapiUrl) {
            finalUrl = piapiUrl;
            console.log(`[Characters] Uploaded to PiAPI storage: ${finalUrl}`);
          }
        }
      }
    } catch (uploadErr: any) {
      console.warn(`[Characters] Image optimization/upload failed, using original URL:`, uploadErr.message);
    }

    const updatedChars = [...characters];
    updatedChars[charIndex] = {
      ...character,
      referenceImageUrl: finalUrl,
      generationStatus: 'completed',
      generationError: undefined,
    };
    await db.update(universalVideoProjects)
      .set({ characters: updatedChars, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[Characters] ✓ Reference image generated for "${character.name}": ${finalUrl.substring(0, 80)}`);
    res.json({ success: true, referenceImageUrl: finalUrl, character: updatedChars[charIndex] });

  } catch (error: any) {
    console.error('[Characters] Generate reference failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/projects/:projectId/characters/:characterId/lock', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, characterId } = req.params;
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const [project] = await db.select().from(universalVideoProjects)
      .where(and(eq(universalVideoProjects.projectId, projectId), eq(universalVideoProjects.ownerId, userId)));
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const characters = (project.characters as any[]) || [];
    const charIndex = characters.findIndex((c: any) => c.id === characterId);
    if (charIndex === -1) return res.status(404).json({ success: false, error: 'Character not found' });

    const character = characters[charIndex];
    if (!character.referenceImageUrl) {
      return res.status(400).json({ success: false, error: 'Character must have a reference image before locking' });
    }

    characters[charIndex] = { ...character, locked: true };
    await db.update(universalVideoProjects)
      .set({ characters, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[Characters] Locked character "${character.name}" (${characterId})`);
    res.json({ success: true, character: characters[charIndex] });
  } catch (error: any) {
    console.error('[Characters] Lock failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/character-library', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const entries = await db.select().from(characterLibrary)
      .where(eq(characterLibrary.ownerId, userId))
      .orderBy(desc(characterLibrary.createdAt));

    res.json({ success: true, characters: entries });
  } catch (error: any) {
    console.error('[CharacterLibrary] List failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/character-library', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { name, role, physicalDescription, wardrobe, personalityNotes, referenceImageUrl } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Character name is required' });
    if (!referenceImageUrl) return res.status(400).json({ success: false, error: 'Reference image URL is required' });

    const [entry] = await db.insert(characterLibrary).values({
      ownerId: userId,
      name,
      role: role || '',
      physicalDescription: physicalDescription || '',
      wardrobe: wardrobe || '',
      personalityNotes: personalityNotes || '',
      referenceImageUrl,
    }).returning();

    console.log(`[CharacterLibrary] Saved "${name}" to library (id: ${entry.id})`);
    res.json({ success: true, character: entry });
  } catch (error: any) {
    console.error('[CharacterLibrary] Save failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/character-library/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const [entry] = await db.select().from(characterLibrary)
      .where(and(eq(characterLibrary.id, id), eq(characterLibrary.ownerId, userId)));
    if (!entry) return res.status(404).json({ success: false, error: 'Character not found in library' });

    await db.delete(characterLibrary).where(eq(characterLibrary.id, id));

    try {
      const matchingAssets = await db.select().from(assetLibrary)
        .where(and(
          eq(assetLibrary.assetUrl, entry.referenceImageUrl),
          eq(assetLibrary.createdBy, userId),
        ));
      for (const asset of matchingAssets) {
        await db.delete(assetLibrary).where(eq(assetLibrary.id, asset.id));
        console.log(`[CharacterLibrary] Also removed asset library entry (id: ${asset.id})`);
      }
    } catch (cleanupErr: any) {
      console.warn(`[CharacterLibrary] Asset library cleanup failed:`, cleanupErr.message);
    }

    console.log(`[CharacterLibrary] Removed "${entry.name}" from library (id: ${id})`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[CharacterLibrary] Delete failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/character-library/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const [existing] = await db.select().from(characterLibrary)
      .where(and(eq(characterLibrary.id, id), eq(characterLibrary.ownerId, userId)));
    if (!existing) return res.status(404).json({ success: false, error: 'Character not found in library' });

    const { name, role, physicalDescription, wardrobe, personalityNotes } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (physicalDescription !== undefined) updates.physicalDescription = physicalDescription;
    if (wardrobe !== undefined) updates.wardrobe = wardrobe;
    if (personalityNotes !== undefined) updates.personalityNotes = personalityNotes;

    const [updated] = await db.update(characterLibrary)
      .set(updates)
      .where(and(eq(characterLibrary.id, id), eq(characterLibrary.ownerId, userId)))
      .returning();

    if (existing.referenceImageUrl && (name !== undefined || role !== undefined)) {
      const newPrompt = `Character: ${updated.name}${updated.role ? ` — ${updated.role}` : ''}`;
      await db.update(assetLibrary)
        .set({ prompt: newPrompt, updatedAt: new Date() })
        .where(and(
          eq(assetLibrary.assetUrl, existing.referenceImageUrl),
          eq(assetLibrary.createdBy, userId),
          eq(assetLibrary.contentType, 'character')
        ));
    }

    console.log(`[CharacterLibrary] Updated "${updated.name}" (id: ${id})`);
    res.json({ success: true, character: updated });
  } catch (error: any) {
    console.error('[CharacterLibrary] Update failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/projects/:projectId/characters/import', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { libraryCharacterId } = req.body;
    if (!libraryCharacterId) return res.status(400).json({ success: false, error: 'libraryCharacterId is required' });

    const [project] = await db.select().from(universalVideoProjects)
      .where(and(eq(universalVideoProjects.projectId, projectId), eq(universalVideoProjects.ownerId, userId)));
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [libEntry] = await db.select().from(characterLibrary)
      .where(and(eq(characterLibrary.id, parseInt(libraryCharacterId)), eq(characterLibrary.ownerId, userId)));
    if (!libEntry) return res.status(404).json({ success: false, error: 'Character not found in library' });

    const characters = (project.characters as any[]) || [];
    if (characters.length >= 5) {
      return res.status(400).json({ success: false, error: 'Maximum 5 characters per project' });
    }

    const newCharacter = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: libEntry.name,
      role: libEntry.role || '',
      physicalDescription: libEntry.physicalDescription || '',
      wardrobe: libEntry.wardrobe || '',
      personalityNotes: libEntry.personalityNotes || '',
      referenceImageUrl: libEntry.referenceImageUrl,
      locked: true,
      generationStatus: 'completed' as const,
      sortOrder: characters.length,
      savedToLibrary: true,
    };

    characters.push(newCharacter);
    await db.update(universalVideoProjects)
      .set({ characters, updatedAt: new Date() })
      .where(eq(universalVideoProjects.projectId, projectId));

    console.log(`[Characters] Imported "${libEntry.name}" from library into project ${projectId}`);
    res.json({ success: true, character: newCharacter, characters });
  } catch (error: any) {
    console.error('[Characters] Import failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// AI TEXT OVERLAY SUGGESTIONS
// ============================================================
router.post('/projects/:projectId/scenes/:sceneId/suggest-text-overlays', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, sceneId } = req.params;
    const userId = (req as any).user?.id;
    const { narration, sceneType, brandColors } = req.body;

    const projectData = await getProjectFromDb(projectId);
    if (projectData.ownerId !== userId) return res.status(403).json({ success: false, error: 'Access denied' });

    if (!narration) {
      return res.status(400).json({ success: false, error: 'narration is required' });
    }

    const { llmClient } = await import('./piapi-llm-client');
    if (!llmClient.isAvailable()) {
      return res.status(503).json({ success: false, error: 'No LLM API configured' });
    }

    const systemPrompt = `You are a professional video text overlay designer. Given a scene's narration and type, suggest compelling text overlays. Return a JSON array of overlay suggestions. Each suggestion should have:
- "presetType": one of "headline", "script-accent", "body", "bullet-list", "stat-callout", "lower-third", "cta-badge", "caption-bar"
- "text": the overlay text content
- "bulletPoints": array of strings (only for bullet-list preset)
- "reason": brief explanation of why this overlay works

Guidelines:
- For "hook" scenes: bold headline + optional stat-callout
- For "benefit"/"feature" scenes: bullet-list or body text highlighting key points
- For "cta" scenes: cta-badge with action text + lower-third with supporting info
- For "testimonial"/"proof" scenes: quote-style body or stat-callout
- For "intro"/"brand" scenes: headline with brand identity
- Extract key numbers/stats for stat-callout when available
- Keep headlines under 6 words
- Keep CTA text under 4 words
- Extract 2-4 bullet points from narration when using bullet-list
- Suggest 2-4 overlays total, not more

Return ONLY a valid JSON array, no markdown fences.`;

    const userMessage = `Scene type: ${sceneType || 'general'}
Narration: "${narration}"
${brandColors?.length ? `Brand colors available: ${brandColors.join(', ')}` : ''}

Suggest text overlays for this scene.`;

    const result = await llmClient.createChatCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
      temperature: 0.7,
    });

    let suggestions: any[] = [];
    try {
      const cleaned = result.text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      console.error('[TextSuggestions] Failed to parse LLM response:', result.text.substring(0, 200));
      return res.status(500).json({ success: false, error: 'Failed to parse AI response' });
    }

    const PRESET_DEFAULTS: Record<string, any> = {
      'headline': { fontSize: 72, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', width: 85, height: 18, x: 7, y: 30, enterAnimation: 'rise', exitAnimation: 'fade', textShadow: true },
      'script-accent': { fontSize: 36, fontWeight: '500', color: '#FFFFFF', textAlign: 'center', width: 70, height: 10, x: 15, y: 50, enterAnimation: 'fade', exitAnimation: 'fade', textShadow: true },
      'body': { fontSize: 24, fontWeight: '400', color: '#D1D5DB', textAlign: 'left', width: 60, height: 14, x: 10, y: 55, enterAnimation: 'fade', exitAnimation: 'fade', textShadow: true },
      'bullet-list': { fontSize: 28, fontWeight: '500', color: '#FFFFFF', textAlign: 'left', width: 65, height: 20, x: 10, y: 35, enterAnimation: 'rise', exitAnimation: 'fade', textShadow: true },
      'stat-callout': { fontSize: 56, fontWeight: '700', color: '#34D399', textAlign: 'center', width: 30, height: 14, x: 35, y: 35, enterAnimation: 'scale-pop', exitAnimation: 'scale-down', textShadow: false, backgroundColor: '#000000', backgroundOpacity: 50 },
      'lower-third': { fontSize: 28, fontWeight: '600', color: '#FFFFFF', textAlign: 'left', width: 50, height: 8, x: 5, y: 82, enterAnimation: 'wipe-left', exitAnimation: 'fade', textShadow: false, backgroundColor: '#000000', backgroundOpacity: 55 },
      'cta-badge': { fontSize: 32, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', width: 35, height: 8, x: 32, y: 78, enterAnimation: 'scale-pop', exitAnimation: 'fade', textShadow: false, backgroundColor: '#7C3AED', backgroundOpacity: 90 },
      'caption-bar': { fontSize: 22, fontWeight: '400', color: '#E0E0E0', textAlign: 'center', width: 60, height: 6, x: 20, y: 88, enterAnimation: 'fade', exitAnimation: 'fade', textShadow: false, backgroundColor: '#000000', backgroundOpacity: 40 },
    };

    const overlayItems = suggestions.map((s: any, idx: number) => {
      const preset = PRESET_DEFAULTS[s.presetType] || PRESET_DEFAULTS['body'];
      return {
        type: 'text' as const,
        id: `sug_${Date.now()}_${idx}`,
        name: s.presetType || 'body',
        text: s.text || '',
        textPreset: s.presetType || 'body',
        fontFamily: 'Inter',
        opacity: 100,
        locked: false,
        animationDuration: 0.4,
        ...preset,
        bulletPoints: s.presetType === 'bullet-list' ? s.bulletPoints : undefined,
        bulletDelay: s.presetType === 'bullet-list' ? 0.3 : undefined,
        reason: s.reason || '',
      };
    });

    console.log(`[TextSuggestions] Generated ${overlayItems.length} suggestions for scene ${sceneId}`);
    res.json({ success: true, suggestions: overlayItems });
  } catch (error: any) {
    console.error('[TextSuggestions] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
