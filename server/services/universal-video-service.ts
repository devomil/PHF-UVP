import { llmClient } from "./piapi-llm-client";
import { fal } from "@fal-ai/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { playHTClient } from "./playht-client";
import {
  VideoProject,
  Scene,
  ProductVideoInput,
  ScriptVideoInput,
  ProductionProgress,
  ServiceFailure,
  TextOverlay,
  CharacterProfile,
  createEmptyVideoProject,
  calculateTotalDuration,
  OUTPUT_FORMATS,
  SCENE_OVERLAY_DEFAULTS,
} from "../../shared/video-types";
import { videoFrameExtractor } from "./video-frame-extractor";
import { brandAssetService } from "./brand-asset-service";
import { brandRequirementAnalyzer } from "./brand-requirement-analyzer";
import { brandAssetMatcher } from "./brand-asset-matcher";
import { aiVideoService } from "./ai-video-service";
import { soundDesignService, SceneSoundDesign } from "./sound-design-service";
import { aiMusicService, GeneratedMusic } from "./ai-music-service";
import { productImageService, GeneratedProductImage } from "./product-image-service";
import { sceneAnalysisService, SceneAnalysis } from "./scene-analysis-service";
import { compositionInstructionsService, SceneCompositionInstructions } from "./composition-instructions-service";
import { brandBibleService } from "./brand-bible-service";
import { scriptParserService, ParsedScript } from "./script-parser-service";
import { brandContextService } from "./brand-context-service";
import { detectTextOverlayRequirements, TextOverlayRequirement } from "./text-overlay-detector";
import { generateTextOverlays, RemotionTextOverlay } from "./text-overlay-generator";
import { sanitizePromptForAI, SanitizedPrompt } from "./prompt-sanitizer";
import { motionGraphicsRouter } from "./motion-graphics-router";
import { resolveClonedVoice, generatePlayhtSpeech } from "./voice-clone-routes";
import { motionGraphicsGenerator } from "./motion-graphics-generator";
import { MotionGraphicConfig, RoutingDecision } from "../../shared/types/motion-graphics-types";
// ---------------------------------------------------------------------------
// Inline helpers (formerly in health-script-context.ts – Pine Hill persona removed)
// ---------------------------------------------------------------------------

const HEALTH_SCRIPT_SYSTEM_PROMPT = `You are a health and wellness marketing scriptwriter for a family-owned organic supplement company.

## YOUR ROLE
Create compelling video scripts that:
1. Highlight genuine health benefits (not medical claims)
2. Include relevant statistics when they strengthen the message
3. Focus on lifestyle improvement and wellness support
4. Maintain FDA/FTC compliance (no disease claims)

## BRAND VOICE
- Warm, authentic, family-owned feel
- Trustworthy and transparent
- Health-conscious but not preachy
- Community and local focus
- Quality and care in every product

## SCRIPT STRUCTURE FOR VIDEO
Each scene should be designed for AI video generation:
- HOOK: Grab attention in first 3 seconds (relatable problem or aspiration)
- PROBLEM: The challenge your audience faces (keep brief, 1 scene)
- SOLUTION: Introduce the product naturally (show, don't just tell)
- BENEFIT: How life improves with the product (emotional payoff)
- SOCIAL PROOF: Statistic or testimonial reference (builds credibility)
- CTA: Clear next step (visit website, try today, etc.)

## COMPLIANCE RULES (CRITICAL)
✅ CAN SAY: "supports healthy lifestyle", "made with organic ingredients", "may help support wellness"
❌ CANNOT SAY: "cures", "treats", "prevents disease", "FDA approved", "guaranteed results", "eliminates", "fixes"

## OUTPUT FORMAT
Return a JSON object with this structure:
{
  "title": "Video title",
  "targetDuration": 30,
  "scenes": [
    {
      "type": "hook|problem|solution|benefit|social_proof|cta",
      "narration": "What the voiceover says",
      "visualDirection": "Simple description for video generation",
      "duration": 5,
      "includeProduct": true/false,
      "textOverlays": [{ "text": "on-screen text", "style": "title|subtitle|headline|cta" }]
    }
  ],
  "suggestedStatistic": "Optional relevant statistic to include",
  "keyMessage": "The one thing viewers should remember"
}

## VISUAL DESCRIPTION RULES (CRITICAL)
Keep visual descriptions SIMPLE. These will be used for AI video generation.

✅ GOOD: "A woman in her 40s taking supplements with morning coffee in a sunny kitchen"
✅ GOOD: "Hands opening a supplement bottle on a wooden table"
✅ GOOD: "Happy family having breakfast together, warm morning light"

❌ BAD: "Cinematic shot with golden hour lighting, shallow depth of field, 35mm lens"
❌ BAD: "Rule of thirds composition, film grain texture, teal and orange color grading"
❌ BAD: "A tub with a label reading [Brand Name]" (NEVER describe text on labels)

Focus on: WHO is doing WHAT, WHERE, with WHAT MOOD
Avoid: Camera jargon, lighting instructions, film terminology, lens specifications

## NO TEXT IN VIDEO (CRITICAL)
- NEVER describe text, words, labels, brand names, logos, or typography in visual directions
- AI video models CANNOT render readable text — any mentioned text appears as garbled characters
- Describe PHYSICAL APPEARANCE of products (shape, color, size) but NOT what is written on them
- Text overlays are added separately in post-production by Remotion`;

function detectProductType(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('immune') || desc.includes('elderberry') || desc.includes('vitamin c') || desc.includes('zinc')) return 'immune-support';
  if (desc.includes('weight') || desc.includes('metabolism') || desc.includes('fat') || desc.includes('slim')) return 'weight-support';
  if (desc.includes('sleep') || desc.includes('relax') || desc.includes('calm') || desc.includes('melatonin')) return 'sleep-support';
  if (desc.includes('joint') || desc.includes('mobility') || desc.includes('glucosamine') || desc.includes('arthrit')) return 'joint-support';
  if (desc.includes('digest') || desc.includes('gut') || desc.includes('probiotic') || desc.includes('bloat')) return 'digestive-support';
  return 'general-supplement';
}

function isClaimRisky(claim: string): boolean {
  const riskyPatterns = [
    /\bcure[sd]?\b/i, /\btreat[s]?\b/i, /\bprevent[s]?\b/i, /\bdiagnos/i,
    /\bFDA\s*approved\b/i, /\bclinically\s+proven\b/i, /\bguarantee[d]?\b/i,
    /\bmiracle\b/i, /\bbreakthrough\b/i, /\beliminate[s]?\b/i, /\bfix(es)?\b/i,
    /\bheal[s]?\b/i, /\breverse[s]?\b/i, /\bno\s+side\s+effects\b/i,
    /\b100%\s+(safe|effective|natural)\b/i,
  ];
  return riskyPatterns.some(p => p.test(claim));
}

interface _HealthStatistic { claim: string; statistic: string; source: string; year: number; }
const _HEALTH_STATISTICS: _HealthStatistic[] = [
  { claim: 'supplement usage', statistic: '57% of U.S. adults use dietary supplements', source: 'CRN Consumer Survey', year: 2023 },
  { claim: 'organic preference', statistic: '76% of consumers seek organic options when available', source: 'Organic Trade Association', year: 2023 },
  { claim: 'natural ingredients', statistic: '73% of supplement users prioritize natural ingredients', source: 'Natural Products Association', year: 2023 },
  { claim: 'immune health', statistic: '72% of adults actively seek immune support products', source: 'IQVIA Consumer Health Survey', year: 2024 },
  { claim: 'sleep concerns', statistic: '35% of adults report getting less than recommended sleep', source: 'CDC Sleep Statistics', year: 2023 },
  { claim: 'joint health', statistic: '54% of adults over 40 are concerned about joint health', source: 'Arthritis Foundation Survey', year: 2023 },
  { claim: 'weight management', statistic: '45% of American adults are trying to lose weight', source: 'CDC National Health Statistics', year: 2023 },
];

function getRelevantStatistics(topic: string, limit: number = 2): _HealthStatistic[] {
  const keywords = topic.toLowerCase().split(/\s+/);
  return _HEALTH_STATISTICS
    .map(stat => ({ stat, score: keywords.filter(kw => kw.length > 3 && `${stat.claim} ${stat.statistic}`.toLowerCase().includes(kw)).length }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.stat);
}

function buildHealthScriptContext(description: string, productType?: string, platform: string = 'youtube'): string {
  const PRODUCT_BENEFITS: Record<string, { category: string; audience: string; benefits: string[]; ingredients: string[]; safeClaims: string[]; avoidClaims: string[] }> = {
    'immune-support':    { category: 'immune health',        audience: 'adults looking to support their immune health naturally',         benefits: ['supports immune system function', 'contains vitamin C and zinc'],      ingredients: ['elderberry', 'vitamin C', 'zinc', 'echinacea'],           safeClaims: ['supports immune system', 'daily wellness support'],     avoidClaims: ['prevents illness', 'cures colds or flu'] },
    'weight-support':    { category: 'weight management',    audience: 'adults pursuing weight management goals with healthy habits',      benefits: ['supports healthy metabolism', 'supports energy levels'],              ingredients: ['green tea extract', 'garcinia', 'chromium', 'B vitamins'], safeClaims: ['supports metabolism', 'natural energy support'],         avoidClaims: ['causes weight loss', 'burns fat'] },
    'sleep-support':     { category: 'sleep and relaxation', audience: 'adults seeking natural support for occasional sleeplessness',      benefits: ['supports restful sleep', 'non-habit forming'],                        ingredients: ['melatonin', 'valerian root', 'chamomile', 'magnesium'],   safeClaims: ['supports relaxation', 'calming formula'],               avoidClaims: ['cures insomnia', 'treats sleep disorders'] },
    'joint-support':     { category: 'joint and mobility',   audience: 'active adults wanting to support joint health',                   benefits: ['supports joint comfort', 'promotes flexibility'],                     ingredients: ['glucosamine', 'chondroitin', 'MSM', 'turmeric'],          safeClaims: ['supports joint health', 'promotes flexibility'],         avoidClaims: ['cures arthritis', 'eliminates pain'] },
    'digestive-support': { category: 'digestive health',     audience: 'adults seeking digestive wellness support',                       benefits: ['supports digestive comfort', 'contains probiotics'],                  ingredients: ['probiotics', 'digestive enzymes', 'ginger', 'peppermint'], safeClaims: ['supports digestion', 'gut-friendly formula'],            avoidClaims: ['cures digestive disorders', 'treats IBS'] },
    'general-supplement':{ category: 'dietary supplements',  audience: 'health-conscious adults seeking natural wellness solutions',       benefits: ['supports overall wellness', 'made with organic ingredients'],         ingredients: ['organic herbs', 'natural vitamins', 'plant-based minerals'], safeClaims: ['supports healthy lifestyle', 'quality ingredients'],     avoidClaims: ['cures disease', 'FDA approved'] },
  };
  const key = productType && PRODUCT_BENEFITS[productType] ? productType : 'general-supplement';
  const p = PRODUCT_BENEFITS[key];
  const stats = getRelevantStatistics(description, 3);
  return `
## PRODUCT CONTEXT
Product Category: ${p.category}
Target Audience: ${p.audience}
Key Benefits: ${p.benefits.join(', ')}
Key Ingredients: ${p.ingredients.join(', ')}

## AVAILABLE STATISTICS (use if relevant)
${stats.length > 0 ? stats.map(s => `- ${s.statistic} (${s.source}, ${s.year})`).join('\n') : '- 57% of U.S. adults use dietary supplements (CRN Consumer Survey, 2023)'}

## SAFE CLAIMS FOR THIS PRODUCT
${p.safeClaims.map(c => `- "${c}"`).join('\n')}

## CLAIMS TO AVOID
${p.avoidClaims.map(c => `- "${c}"`).join('\n')}

## PLATFORM: ${platform.toUpperCase()}
${platform === 'tiktok' || platform === 'reels' ? 'Keep fast-paced, hook in first 1-2 seconds, vertical format mindset, trendy and relatable tone' : ''}
${platform === 'youtube' ? 'Can be more detailed, horizontal format, allow for story development, professional but warm' : ''}
${platform === 'facebook' ? 'Community-focused, shareable content, appeal to family values' : ''}
`;
}
import { optimizePrompt, logPromptOptimization } from "./video-prompt-optimizer";
import { intelligentProviderSelector, SceneContent } from "./intelligent-provider-selector";
import { getVisualArtPreset, VisualArtPreset, isStylizedPreset } from "../../shared/config/visual-art-presets";

const AWS_REGION = process.env.REMOTION_AWS_REGION || "us-east-2";
const REMOTION_BUCKET = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || "remotionlambda-useast2-1vc2l6a56o";

interface ImageGenerationResult {
  url: string;
  source: string;
  success: boolean;
  error?: string;
}

type FalImageSize = "portrait_16_9" | "square" | "landscape_4_3" | "landscape_16_9" | "square_hd" | "portrait_4_3";

// ===== Shared product-reference gating =====
// Used in two places:
//   1) Project-level reference-image distribution (~line 3829)
//   2) Per-scene image-generation attachment (~line 1047) — guards against
//      stale `brandAssetUrl` from prior runs hijacking a lifestyle scene.
// Returns true when the scene's visualDirection/narration describes a clear
// human/lifestyle subject without any product mention, OR when the scene has
// `useReferenceImage === false` set explicitly. In those cases the product
// reference must NOT be force-attached as an I2I source.
const _PRODUCT_FALLBACK_KEYWORDS = ['product','bottle','jar','package','label','powder','capsule','pill','box','pouch','tin','can'];
const _SUBJECT_KEYWORDS = ['woman','women','man','men','person','people','guy','girl','boy','athlete','runner','mother','father','family','couple','child','kid','drinking','eating','walking','running','jogging','cooking','sitting','smiling','face','portrait','lifestyle'];
function shouldSkipProductReferenceForScene(
  scene: any,
  productDescription: string,
): { skip: boolean; reason?: string } {
  if (!scene) return { skip: false };
  if (scene.useReferenceImage === false) {
    return { skip: true, reason: 'scene has useReferenceImage=false' };
  }
  const text = `${scene.visualDirection || ''} ${scene.narration || ''}`.toLowerCase();
  if (!text.trim()) return { skip: false };
  const productKeywords = new Set<string>(_PRODUCT_FALLBACK_KEYWORDS);
  for (const w of String(productDescription || '').toLowerCase().split(/[^a-z0-9]+/i)) {
    if (w.length >= 4) productKeywords.add(w);
  }
  let mentionsProduct = false;
  for (const k of productKeywords) {
    if (k && text.includes(k)) { mentionsProduct = true; break; }
  }
  const mentionsHuman = _SUBJECT_KEYWORDS.some(k => new RegExp(`\\b${k}\\b`).test(text));
  if (mentionsHuman && !mentionsProduct) {
    return { skip: true, reason: 'visual direction describes a human subject without product mention' };
  }
  return { skip: false };
}

function getImageDimensionsForAspectRatio(aspectRatio: string): { width: number; height: number; falSize: FalImageSize } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920, falSize: 'portrait_16_9' as FalImageSize };
    case '1:1':
      return { width: 1024, height: 1024, falSize: 'square' as FalImageSize };
    case '4:3':
      return { width: 1440, height: 1080, falSize: 'landscape_4_3' as FalImageSize };
    case '16:9':
    default:
      return { width: 1920, height: 1080, falSize: 'landscape_16_9' as FalImageSize };
  }
}

interface VoiceoverResult {
  url: string;
  duration: number;
  success: boolean;
  error?: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

interface ServiceNotification {
  type: 'error' | 'warning' | 'info';
  service: string;
  message: string;
  timestamp: string;
  fallbackUsed?: string;
}

class UniversalVideoService {
  private notifications: ServiceNotification[] = [];
  private projectCallbacks: Map<string, (progress: ProductionProgress) => void> = new Map();
  private s3Client: S3Client | null = null;
  private usedVideoUrls: Set<string> = new Set();

  constructor() {
    console.log('[UniversalVideoService] Initializing service...');
    
    if (llmClient.isAvailable()) {
      console.log('[UniversalVideoService] LLM client configured (PiAPI + Anthropic fallback)');
    }
    
    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    console.log(`[UniversalVideoService] AWS credentials check: accessKeyId=${accessKeyId ? 'SET' : 'MISSING'}, secretAccessKey=${secretAccessKey ? 'SET' : 'MISSING'}`);
    
    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: AWS_REGION,
        credentials: { accessKeyId, secretAccessKey },
      });
      console.log(`[UniversalVideoService] S3 client configured for bucket: ${REMOTION_BUCKET}`);
    } else {
      console.warn('[UniversalVideoService] S3 client NOT configured - asset caching will be DISABLED');
    }
  }

  private async uploadToS3(buffer: Buffer, key: string, contentType: string): Promise<string | null> {
    if (!this.s3Client) {
      console.error('[UniversalVideoService] S3 client not configured');
      return null;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: REMOTION_BUCKET,
        Key: `video-assets/${key}`,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      });

      await this.s3Client.send(command);
      
      const publicUrl = `https://${REMOTION_BUCKET}.s3.${AWS_REGION}.amazonaws.com/video-assets/${key}`;
      console.log(`[UniversalVideoService] Uploaded to S3: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      console.error('[UniversalVideoService] S3 upload failed:', error.message);
      return null;
    }
  }

  private async extractCharacterReferenceFrame(videoUrl: string, projectId: string): Promise<string | null> {
    try {
      console.log(`[CharRef] Extracting character reference frame from: ${videoUrl.substring(0, 80)}...`);
      const frameDataUrl = await videoFrameExtractor.extractFrame(videoUrl, 1.0);
      if (!frameDataUrl) {
        console.warn(`[CharRef] Frame extraction returned null for ${videoUrl.substring(0, 60)}`);
        return null;
      }

      const base64Match = frameDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) {
        console.warn(`[CharRef] Invalid data URL format from frame extraction`);
        return null;
      }

      const contentType = base64Match[1];
      const buffer = Buffer.from(base64Match[2], 'base64');
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      const key = `character-references/${projectId}/${Date.now()}_ref.${ext}`;
      const s3Url = await this.uploadToS3(buffer, key, contentType);

      if (s3Url) {
        console.log(`[CharRef] Character reference frame uploaded to S3: ${s3Url}`);
      } else {
        console.warn(`[CharRef] Failed to upload character reference frame to S3`);
      }
      return s3Url;
    } catch (err: any) {
      console.error(`[CharRef] Error extracting character reference frame: ${err.message}`);
      return null;
    }
  }

  /**
   * Download a file from external URL and return as Buffer
   */
  private async downloadExternalFile(
    url: string, 
    timeoutMs: number = 60000
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!url || !url.startsWith('http')) {
      console.warn(`[AssetDownload] Invalid URL: ${url}`);
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      console.log(`[AssetDownload] Downloading: ${url.substring(0, 80)}...`);
      const startTime = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'VideoProducer/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[AssetDownload] Failed (${response.status}): ${url}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      const downloadTime = Date.now() - startTime;
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      console.log(`[AssetDownload] Complete: ${sizeMB}MB in ${downloadTime}ms`);

      return { buffer, contentType };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`[AssetDownload] Timeout after ${timeoutMs}ms: ${url}`);
      } else {
        console.warn(`[AssetDownload] Error: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Download external video and upload to S3
   * Returns S3 URL or null if failed
   */
  private async cacheVideoToS3(
    externalUrl: string,
    sceneId: string
  ): Promise<string | null> {
    if (!externalUrl || !this.s3Client) {
      return null;
    }

    // Skip if already an S3 URL
    if (externalUrl.includes('s3.') && externalUrl.includes('amazonaws.com')) {
      console.log(`[CacheVideo] Already S3 URL: ${externalUrl.substring(0, 60)}`);
      return externalUrl;
    }

    try {
      console.log(`[CacheVideo] Caching video for scene ${sceneId}...`);
      const downloadResult = await this.downloadExternalFile(externalUrl, 90000); // 90s timeout for videos

      if (!downloadResult) {
        console.warn(`[CacheVideo] Download failed for scene ${sceneId}`);
        return null;
      }

      // Determine file extension from content type
      let extension = 'mp4';
      if (downloadResult.contentType.includes('webm')) {
        extension = 'webm';
      } else if (downloadResult.contentType.includes('quicktime') || downloadResult.contentType.includes('mov')) {
        extension = 'mov';
      }

      const fileName = `broll/${sceneId}_${Date.now()}.${extension}`;
      const s3Url = await this.uploadToS3(
        downloadResult.buffer,
        fileName,
        downloadResult.contentType
      );

      if (s3Url) {
        console.log(`[CacheVideo] Cached to S3: ${s3Url}`);
        return s3Url;
      }

      return null;
    } catch (error: any) {
      console.error(`[CacheVideo] Error caching video for ${sceneId}:`, error.message);
      return null;
    }
  }

  /**
   * Download external image and upload to S3
   * Returns S3 URL or null if failed
   */
  private async cacheImageToS3(
    externalUrl: string,
    sceneId: string,
    imageType: 'background' | 'content' | 'stock' = 'background'
  ): Promise<string | null> {
    if (!externalUrl || !this.s3Client) {
      return null;
    }

    // Skip if already an S3 URL
    if (externalUrl.includes('s3.') && externalUrl.includes('amazonaws.com')) {
      console.log(`[CacheImage] Already S3 URL: ${externalUrl.substring(0, 60)}`);
      return externalUrl;
    }

    // Skip data URLs (need different handling)
    if (externalUrl.startsWith('data:')) {
      return null; // Will be handled by existing base64 upload logic
    }

    try {
      console.log(`[CacheImage] Caching ${imageType} image for scene ${sceneId}...`);
      const downloadResult = await this.downloadExternalFile(externalUrl, 30000); // 30s timeout for images

      if (!downloadResult) {
        console.warn(`[CacheImage] Download failed for scene ${sceneId}`);
        return null;
      }

      // Determine file extension
      let extension = 'jpg';
      if (downloadResult.contentType.includes('png')) {
        extension = 'png';
      } else if (downloadResult.contentType.includes('webp')) {
        extension = 'webp';
      }

      const fileName = `images/${imageType}_${sceneId}_${Date.now()}.${extension}`;
      const s3Url = await this.uploadToS3(
        downloadResult.buffer,
        fileName,
        downloadResult.contentType
      );

      if (s3Url) {
        console.log(`[CacheImage] Cached to S3: ${s3Url}`);
        return s3Url;
      }

      return null;
    } catch (error: any) {
      console.error(`[CacheImage] Error caching image for ${sceneId}:`, error.message);
      return null;
    }
  }

  /**
   * Cache all external assets to S3 for a project
   * Call this AFTER asset generation but BEFORE rendering
   */
  async cacheAllAssetsToS3(project: VideoProject): Promise<{
    success: boolean;
    cachedCount: number;
    failedCount: number;
    details: string[];
  }> {
    console.log(`[CacheAssets] Called for project ${project.id}, S3 client status: ${this.s3Client ? 'CONFIGURED' : 'NULL'}`);
    
    // Early return if S3 client is not available
    if (!this.s3Client) {
      console.warn('[CacheAssets] S3 client not configured - skipping asset caching (will use original URLs)');
      return {
        success: true,
        cachedCount: 0,
        failedCount: 0,
        details: ['S3 caching skipped - credentials not configured'],
      };
    }
    
    const details: string[] = [];
    let cachedCount = 0;
    let failedCount = 0;

    console.log('[CacheAssets] Starting S3 asset caching...');
    const startTime = Date.now();

    // Cache voiceover (usually already S3, but verify)
    if (project.assets?.voiceover?.fullTrackUrl) {
      const url = project.assets.voiceover.fullTrackUrl;
      if (!url.includes('s3.amazonaws.com') && !url.startsWith('data:') && url.startsWith('http')) {
        const downloadResult = await this.downloadExternalFile(url, 30000);
        if (downloadResult) {
          const s3Url = await this.uploadToS3(
            downloadResult.buffer,
            `voiceover/${project.id}_${Date.now()}.mp3`,
            'audio/mpeg'
          );
          if (s3Url) {
            project.assets.voiceover.fullTrackUrl = s3Url;
            cachedCount++;
            details.push(`✓ Voiceover cached to S3`);
          }
        }
      }
    }

    // Cache music
    if (project.assets?.music?.url) {
      const url = project.assets.music.url;
      if (!url.includes('s3.amazonaws.com') && !url.startsWith('data:') && url.startsWith('http')) {
        const downloadResult = await this.downloadExternalFile(url, 60000);
        if (downloadResult) {
          const s3Url = await this.uploadToS3(
            downloadResult.buffer,
            `music/${project.id}_${Date.now()}.mp3`,
            'audio/mpeg'
          );
          if (s3Url) {
            project.assets.music.url = s3Url;
            cachedCount++;
            details.push(`✓ Music cached to S3`);
          }
        }
      }
    }

    // Cache scene assets (images and videos)
    for (let i = 0; i < (project.scenes || []).length; i++) {
      const scene = project.scenes[i];
      
      // Cache B-roll video
      if (scene.assets?.videoUrl && scene.background?.type === 'video') {
        const s3VideoUrl = await this.cacheVideoToS3(scene.assets.videoUrl, scene.id);
        if (s3VideoUrl) {
          project.scenes[i].assets!.videoUrl = s3VideoUrl;
          project.scenes[i].background!.videoUrl = s3VideoUrl;
          cachedCount++;
          details.push(`✓ Scene ${i} video cached`);
        } else {
          // Video cache failed - fall back to image
          console.warn(`[CacheAssets] Scene ${i} video cache failed, switching to image`);
          project.scenes[i].background!.type = 'image';
          project.scenes[i].background!.videoUrl = undefined;
          project.scenes[i].assets!.videoUrl = undefined;
          failedCount++;
          details.push(`✗ Scene ${i} video failed - using image`);
        }
      }

      // Cache micro-scene videos to S3 (ephemeral URLs expire)
      if (scene.microScenes && Array.isArray(scene.microScenes)) {
        for (let j = 0; j < scene.microScenes.length; j++) {
          const ms = scene.microScenes[j];
          if (ms.videoUrl) {
            const s3MsUrl = await this.cacheVideoToS3(ms.videoUrl, `${scene.id}_ms${j}`);
            if (s3MsUrl) {
              project.scenes[i].microScenes[j].videoUrl = s3MsUrl;
              if (s3MsUrl !== ms.videoUrl) {
                cachedCount++;
                details.push(`✓ Scene ${i} micro-scene ${j} video cached`);
              }
            } else {
              console.warn(`[CacheAssets] Scene ${i} micro-scene ${j} video cache failed, clearing dead URL`);
              project.scenes[i].microScenes[j].videoUrl = undefined;
              failedCount++;
              details.push(`✗ Scene ${i} micro-scene ${j} video failed - cleared`);
            }
          }
        }

        const msWithVideo = project.scenes[i].microScenes.filter(ms => !!ms.videoUrl);
        if (msWithVideo.length >= 2) {
          try {
            const { ffmpegAssemblyService } = await import('./ffmpeg-assembly-service');

            const existingManifest = project.scenes[i].assemblyManifest;
            const sceneVoiceoverWords = project.scenes[i].voiceoverWords || project.scenes[i].captions?.words;
            const isStale = !existingManifest || ffmpegAssemblyService.isAssemblyStale(existingManifest, project.scenes[i].microScenes, sceneVoiceoverWords);

            if (!isStale && existingManifest?.assembledClipUrl) {
              console.log(`[CacheAssets] Scene ${i}: Assembly still valid, skipping re-assembly`);
              details.push(`✓ Scene ${i} FFmpeg assembly cached (reused)`);
            } else {
              if (existingManifest && isStale) {
                console.log(`[CacheAssets] Scene ${i}: Assembly stale (micro-scenes changed), re-assembling...`);
                project.scenes[i].assemblyManifest = undefined;
              }

              console.log(`[CacheAssets] Scene ${i}: Assembling ${msWithVideo.length} micro-scene clips with FFmpeg...`);
              const manifest = await ffmpegAssemblyService.assembleScene(
                scene.id,
                project.scenes[i].microScenes,
                project.id,
                project.scenes[i].voiceoverWords || project.scenes[i].captions?.words
              );
              project.scenes[i].assemblyManifest = manifest;
              if (!manifest.assemblyFailed) {
                cachedCount++;
                details.push(`✓ Scene ${i} FFmpeg assembly complete (${manifest.totalDurationSec.toFixed(1)}s)`);
              } else {
                details.push(`⚠ Scene ${i} FFmpeg assembly skipped: ${manifest.error}`);
              }
            }
          } catch (assemblyErr: any) {
            console.warn(`[CacheAssets] Scene ${i} FFmpeg assembly error: ${assemblyErr.message}`);
            project.scenes[i].assemblyManifest = {
              assemblyFailed: true,
              assembledClipValid: false,
              totalDurationSec: 0,
              clips: [],
              sceneId: scene.id,
              createdAt: new Date().toISOString(),
              error: assemblyErr.message,
            };
            details.push(`⚠ Scene ${i} FFmpeg assembly error: ${assemblyErr.message}`);
          }
        }
      }

      // Cache background image
      if (scene.assets?.backgroundUrl) {
        const s3ImageUrl = await this.cacheImageToS3(
          scene.assets.backgroundUrl,
          scene.id,
          'background'
        );
        if (s3ImageUrl) {
          project.scenes[i].assets!.backgroundUrl = s3ImageUrl;
          project.scenes[i].assets!.imageUrl = s3ImageUrl;
          cachedCount++;
          details.push(`✓ Scene ${i} background cached`);
        } else if (!scene.assets.backgroundUrl.startsWith('data:') && !scene.assets.backgroundUrl.includes('s3.amazonaws.com')) {
          failedCount++;
          details.push(`✗ Scene ${i} background cache failed`);
        }
      }

      // Cache standalone image (if different from background)
      if (scene.assets?.imageUrl && scene.assets.imageUrl !== scene.assets.backgroundUrl) {
        const s3ImageUrl = await this.cacheImageToS3(
          scene.assets.imageUrl,
          scene.id,
          'content'
        );
        if (s3ImageUrl) {
          project.scenes[i].assets!.imageUrl = s3ImageUrl;
          cachedCount++;
          details.push(`✓ Scene ${i} image cached`);
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CacheAssets] Complete: ${cachedCount} cached, ${failedCount} failed in ${totalTime}s`);

    return {
      success: failedCount === 0,
      cachedCount,
      failedCount,
      details,
    };
  }

  private addNotification(notification: Omit<ServiceNotification, 'timestamp'>) {
    const fullNotification = {
      ...notification,
      timestamp: new Date().toISOString(),
    };
    this.notifications.push(fullNotification);
    console.log(`[UniversalVideoService] ${notification.type.toUpperCase()}: ${notification.service} - ${notification.message}`);
  }

  getNotifications(): ServiceNotification[] {
    return this.notifications;
  }

  clearNotifications() {
    this.notifications = [];
  }

  async generateProductScript(input: ProductVideoInput): Promise<Scene[]> {
    if (!llmClient.isAvailable()) {
      throw new Error("No LLM API configured");
    }

    console.log("[UniversalVideoService] Generating health-focused script...");

    const productType = detectProductType(input.productDescription);
    const healthContext = buildHealthScriptContext(
      input.productDescription,
      productType,
      'youtube'
    );
    
    const statistics = getRelevantStatistics(input.productDescription, 2);
    console.log(`[UniversalVideoService] Detected product type: ${productType}`);
    console.log(`[UniversalVideoService] Found ${statistics.length} relevant statistics`);

    const benefitsText = input.benefits?.length 
      ? `Key Benefits: ${input.benefits.join(', ')}` 
      : 'Key Benefits: (derive from product description)';
    
    const userPrompt = `Create a ${input.duration}-second video script for:
Product: ${input.productName}
Description: ${input.productDescription}
Target Audience: ${input.targetAudience}
${benefitsText}
Style: ${input.style}
CTA: ${input.callToAction}

${healthContext}

Return a JSON object with this exact structure (no markdown, just pure JSON):
{
  "title": "Video title",
  "targetDuration": ${input.duration},
  "scenes": [
    {
      "type": "hook|problem|solution|benefit|social_proof|cta",
      "duration": number,
      "narration": "voiceover text for this scene",
      "visualDirection": "Simple description: WHO is doing WHAT, WHERE, with WHAT MOOD",
      "includeProduct": true/false,
      "textOverlays": [
        {
          "text": "on-screen text",
          "style": "title|subtitle|headline|bullet|cta",
          "timing": { "startAt": 0, "duration": 3 }
        }
      ]
    }
  ],
  "suggestedStatistic": "Optional relevant statistic used",
  "keyMessage": "The one thing viewers should remember"
}

Guidelines for ${input.duration}-second video:
${input.duration === 15 ? `
- Hook scene: 5 seconds, instant attention grab with bold statement or question
- Benefit/Solution scene: 5 seconds, show the product solving the problem
- CTA scene: 5 seconds, strong call to action with urgency
Total: 15 seconds (ONLY 2-3 scenes - keep it punchy and fast-paced)
IMPORTANT: This is a short-form video for TikTok/Reels. Every second counts. Use short, impactful narration (2-3 sentences max per scene). Visual text overlays should be bold and readable.` : ''}
${input.duration === 20 ? `
- Hook scene: 5 seconds, grab attention immediately with a bold claim or relatable problem
- Product/Solution scene: 8 seconds, showcase the product with key benefit
- CTA scene: 7 seconds, compelling call to action
Total: 20 seconds (ONLY 3 scenes - concise and impactful)
IMPORTANT: This is a short-form social media video. Keep narration tight (2-4 sentences per scene). Make visual text overlays bold and eye-catching.` : ''}
${input.duration === 30 ? `
- Hook scene: 5 seconds, grab attention with relatable problem or aspiration
- Problem/Solution: 8 seconds combined
- Benefit scene: 8 seconds with emotional payoff
- Social proof: 4 seconds (use a statistic if relevant)
- CTA scene: 5 seconds with clear call to action
Total: 30 seconds` : ''}
${input.duration === 60 ? `
- Hook scene: 6 seconds, relatable problem or aspiration
- Problem scene: 10 seconds
- Solution intro: 10 seconds, introduce product naturally
- 2 Benefit scenes: 10 seconds each
- Social proof: 6 seconds (use statistics)
- CTA scene: 8 seconds
Total: 60 seconds` : ''}
${input.duration === 90 ? `
- Hook scene: 8 seconds
- Problem scene: 12 seconds
- Solution intro: 12 seconds
- 3 Benefit scenes: 10 seconds each
- Social proof: 10 seconds (use statistics)
- Brand scene: 8 seconds
- CTA scene: 10 seconds
Total: 90 seconds` : ''}

CRITICAL VISUAL DIRECTION RULES:
- Keep visual descriptions SIMPLE (15-25 words max)
- Focus on: WHO is doing WHAT, WHERE, with WHAT MOOD
- AVOID camera jargon: NO "cinematic", "35mm", "shallow DOF", "golden hour", "color grading"
- NEVER describe text, words, labels, or what is written on product packaging — AI video models CANNOT render readable text and it will appear garbled
- Describe products by PHYSICAL APPEARANCE (shape, color, container type) NOT by label text
- Good example: "A white supplement tub sits on a clean kitchen counter next to a glass of green juice"
- Bad example: "A tub with a label reading Cultivating Wellness Ultra Greens Concentrated Superfood"
- Bad example: "Cinematic shot with golden hour lighting, shallow depth of field, 35mm lens"

Narration should be conversational, warm, and ${input.style.toLowerCase()}.
Make sure durations add up exactly to ${input.duration} seconds.`;

    try {
      const result = await llmClient.createChatCompletion({
        systemPrompt: HEALTH_SCRIPT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 4000,
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const rawScenes = parsed.scenes || [];

      if (parsed.suggestedStatistic) {
        console.log(`[UniversalVideoService] Script uses statistic: ${parsed.suggestedStatistic}`);
      }
      if (parsed.keyMessage) {
        console.log(`[UniversalVideoService] Key message: ${parsed.keyMessage}`);
      }

      const allNarration = rawScenes.map((s: any) => s.narration || '').join(' ');
      if (isClaimRisky(allNarration)) {
        console.warn("[UniversalVideoService] Warning: Script may contain FDA/FTC risky claims - review recommended");
      }

      return rawScenes.map((s: any, index: number) => this.createSceneFromRaw(s, index));
    } catch (error: any) {
      console.error("[UniversalVideoService] Script generation failed:", error);
      throw error;
    }
  }

  async parseScript(input: ScriptVideoInput): Promise<Scene[]> {
    console.log("[UniversalVideoService] Starting brand-aware script parsing...");
    
    try {
      const parsed = await scriptParserService.parseScript(input.script, {
        platform: input.platform || "youtube",
        visualStyle: input.style || "warm",
        targetDuration: input.targetDuration,
        artPresetId: input.artPresetId,
      });

      return parsed.scenes.map((s, index: number) => this.createSceneFromRaw({
        ...s,
        duration: s.duration || Math.ceil((s.narration?.split(' ').length || 0) / 2.5),
        textOverlays: s.keyPoints ? s.keyPoints.map((kp: string, i: number) => ({
          text: kp,
          style: i === 0 ? 'title' : 'subtitle',
          timing: { startAt: i * 3, duration: 4 }
        })) : [],
        serviceMatch: s.serviceMatch,
        productMatch: s.productMatch,
        conditionMatch: s.conditionMatch,
        audienceResonance: s.audienceResonance,
        brandOpportunity: s.brandOpportunity,
      }, index));
    } catch (error: any) {
      console.error("[UniversalVideoService] Script parsing failed:", error);
      throw error;
    }
  }

  async parseScriptWithBrandMatches(input: ScriptVideoInput): Promise<{
    scenes: Scene[];
    brandMatches: { services: string[]; products: string[]; conditions: string[] };
    summary: {
      totalDuration: number;
      sceneCount: number;
      primaryService?: string | null;
      targetConditions?: string[];
      brandAlignment?: string;
    };
  }> {
    console.log("[UniversalVideoService] Parsing script with full brand context...");
    
    try {
      const parsed = await scriptParserService.parseScript(input.script, {
        platform: input.platform || "youtube",
        visualStyle: input.style || "warm",
        targetDuration: input.targetDuration,
        artPresetId: input.artPresetId,
        productContext: input.productContext || undefined,
        scriptPresets: input.scriptPresets || undefined,
        projectType: input.projectType || undefined,
        contentStructure: input.contentStructure || undefined,
      });

      const scenes = parsed.scenes.map((s, index: number) => this.createSceneFromRaw({
        ...s,
        duration: s.duration || Math.ceil((s.narration?.split(' ').length || 0) / 2.5),
        textOverlays: s.keyPoints ? s.keyPoints.map((kp: string, i: number) => ({
          text: kp,
          style: i === 0 ? 'title' : 'subtitle',
          timing: { startAt: i * 3, duration: 4 }
        })) : [],
        serviceMatch: s.serviceMatch,
        productMatch: s.productMatch,
        conditionMatch: s.conditionMatch,
        audienceResonance: s.audienceResonance,
        brandOpportunity: s.brandOpportunity,
      }, index));

      return {
        scenes,
        brandMatches: parsed.brandMatches,
        summary: parsed.summary,
      };
    } catch (error: any) {
      console.error("[UniversalVideoService] Script parsing with brand matches failed:", error);
      throw error;
    }
  }

  private getTransitionTypeForScene(sceneType: string, index: number, direction: 'in' | 'out'): 'fade' | 'zoom' | 'crossfade' | 'none' | 'slide' | 'wipe' {
    // First scene always fades in
    if (index === 0 && direction === 'in') return 'fade';
    
    // Choose transitions based on scene type for visual variety
    switch (sceneType) {
      case 'hook':
        return direction === 'in' ? 'zoom' : 'fade';
      case 'intro':
        return direction === 'in' ? 'fade' : 'slide';
      case 'benefit':
      case 'feature':
        // Alternate between slide for feature scenes
        return direction === 'in' ? 'slide' : 'fade';
      case 'cta':
        return direction === 'in' ? 'zoom' : 'fade';
      case 'outro':
        return 'fade';
      case 'testimonial':
        return direction === 'in' ? 'fade' : 'fade';
      default:
        // Default to crossfade for smooth transitions
        return 'crossfade';
    }
  }

  private createSceneFromRaw(raw: any, index: number): Scene {
    const id = `scene_${String(index + 1).padStart(3, '0')}_${raw.type || 'content'}`;
    const duration = raw.duration || 10;

    const textOverlays: TextOverlay[] = (raw.textOverlays || []).map((to: any, i: number) => ({
      id: `text_${id}_${i}`,
      text: to.text || '',
      style: to.style || 'subtitle',
      position: {
        vertical: to.style === 'title' ? 'center' : 'lower-third',
        horizontal: 'center',
        padding: 60,
      },
      timing: {
        startAt: to.timing?.startAt || 0,
        duration: to.timing?.duration || 4,
      },
      animation: {
        enter: to.style === 'title' ? 'fade' : 'slide-up',
        exit: 'fade',
        duration: 0.5,
      },
    }));

    return {
      id,
      order: index + 1,
      type: raw.type || 'content',
      duration,
      narration: raw.narration || '',
      visualDirection: raw.visualDirection || '',
      searchQuery: raw.searchQuery || '',
      fallbackQuery: raw.fallbackQuery || '',
      textOverlays,
      background: {
        type: 'image',
        source: raw.visualDirection || '',
        effect: {
          type: 'ken-burns',
          intensity: 'subtle',
          direction: index % 2 === 0 ? 'in' : 'out',
        },
        overlay: {
          type: 'gradient',
          color: '#000000',
          opacity: 0.4,
        },
      },
      transitionIn: {
        type: this.getTransitionTypeForScene(raw.type || 'content', index, 'in'),
        duration: 0.6,
        easing: 'ease-in-out',
      },
      transitionOut: {
        type: this.getTransitionTypeForScene(raw.type || 'content', index, 'out'),
        duration: 0.5,
        easing: 'ease-in-out',
      },
      serviceMatch: raw.serviceMatch || null,
      productMatch: raw.productMatch || null,
      conditionMatch: raw.conditionMatch || null,
      audienceResonance: raw.audienceResonance || null,
      brandOpportunity: raw.brandOpportunity || null,
    };
  }

  /**
   * Sanitize prompt to remove any product/bottle/packaging terms
   * This prevents AI from generating synthetic product imagery
   */
  private sanitizeProductTermsFromPrompt(prompt: string): string {
    // Remove product-related terms that could trigger bottle/packaging generation
    const productTerms = [
      /\b(bottle|bottles)\b/gi,
      /\b(jar|jars)\b/gi,
      /\b(container|containers)\b/gi,
      /\b(packaging|package)\b/gi,
      /\b(supplement|supplements)\b/gi,
      /\b(vitamin|vitamins)\b/gi,
      /\b(pill|pills|capsule|capsules)\b/gi,
      /\b(product shot|product image|product photo)\b/gi,
      /\b(medicine|medication)\b/gi,
      /\b(lotion|cream|serum)\b/gi,
      /\b(skincare|cosmetic)\b/gi,
      /\b(extract|tincture)\b/gi,
      /\b(label|labels)\b/gi,
      /\bBlack Cohosh Extract Plus\b/gi,
      /\bBlack Cohosh\b/gi,
    ];
    
    let sanitized = prompt;
    for (const regex of productTerms) {
      sanitized = sanitized.replace(regex, '');
    }
    
    // Clean up leftover whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    console.log('[SanitizePrompt] Original:', prompt.substring(0, 100));
    console.log('[SanitizePrompt] Sanitized:', sanitized.substring(0, 100));
    
    return sanitized;
  }

  async generateImage(prompt: string, sceneId: string, isProductVideo: boolean = false, sceneType: string = 'content', aspectRatio: string = '16:9', scene?: any): Promise<ImageGenerationResult> {
    const { isTextHeavyScene, imageGenerationService } = await import('./image-generation-service');
    
    if (scene && isTextHeavyScene(scene)) {
      try {
        console.log(`[GenerateImage] Text-heavy scene ${sceneId} — routing to GPT-Image-1 with brand context`);
        
        let brandContext = '';
        try {
          const brandBible = await brandBibleService.getBrandBible();
          if (brandBible?.brandName) {
            const colors = [brandBible.primaryColor, brandBible.secondaryColor, brandBible.accentColor].filter(Boolean);
            brandContext = `Brand: "${brandBible.brandName}". ${colors.length > 0 ? `Brand color palette: ${colors.join(', ')}. ` : ''}Use the brand name and colors in the design where contextually appropriate.`;
          }
        } catch (e: any) {
          console.warn(`[GenerateImage] Could not load brand context: ${e.message}`);
        }
        
        const sceneArtPreset = scene.artPresetId ? getVisualArtPreset(scene.artPresetId) : null;
        const artStyle = sceneArtPreset ? `${sceneArtPreset.name} style. ` : '';
        const imagePrompt = scene.imagePrompt || scene.visualDirection || prompt;
        const narration = scene.narration || '';
        
        const textImgPrompt = `${artStyle}${imagePrompt}. ${brandContext} The scene narration is: "${narration}". All text in the image must be perfectly legible, sharp, and professionally typeset. ${sceneArtPreset?.imagePromptSuffix || 'High quality render.'}`;
        
        console.log(`[GenerateImage] GPT-Image-1 prompt: ${textImgPrompt.substring(0, 150)}...`);
        
        const gptWidth = aspectRatio === '9:16' ? 1024 : aspectRatio === '1:1' ? 1024 : 1536;
        const gptHeight = aspectRatio === '9:16' ? 1536 : aspectRatio === '1:1' ? 1024 : 1024;
        const textImage = await imageGenerationService.generateWithOpenAI({
          prompt: textImgPrompt,
          width: gptWidth,
          height: gptHeight,
        });
        
        if (textImage.url) {
          console.log(`[GenerateImage] GPT-Image-1 success for scene ${sceneId}: ${textImage.url.substring(0, 80)}...`);
          return {
            url: textImage.url,
            source: 'gpt-image-1 (text-heavy)',
            success: true,
          };
        }
      } catch (textErr: any) {
        console.warn(`[GenerateImage] GPT-Image-1 failed for scene ${sceneId}: ${textErr.message} — falling back to Flux/PiAPI`);
      }
    }

    const falKey = process.env.FAL_KEY;

    // Decide text routing FIRST so we can ask the sanitizer to preserve
    // signage/typography sentences when we're going to a model that can
    // actually render them (Recraft V3). Otherwise the sanitizer strips
    // the brand-sign sentence and Recraft receives a prompt with no
    // signage instruction.
    let earlyTextRouting: { useRecraft: boolean; reason: string } = { useRecraft: false, reason: '' };
    try {
      const { evaluateSceneTextRouting } = await import('../utils/recraft-scene-policy');
      earlyTextRouting = evaluateSceneTextRouting({
        narration: scene?.narration,
        visualDirection: scene?.visualDirection ?? scene?.imagePrompt ?? prompt,
        sceneType: scene?.type || sceneType,
      });
    } catch (routingErr: any) {
      console.warn(`[GenerateImage] early text-routing check failed for scene ${sceneId}: ${routingErr.message}`);
    }

    // Phase 11A: Sanitize prompt to remove text/logo requests before AI generation
    const _needsLogoComp = !!(earlyTextRouting as any).needsLogoComposition;
    const sanitized = sanitizePromptForAI(prompt, sceneType, {
      preserveText: earlyTextRouting.useRecraft,
      preserveLogos: _needsLogoComp,
    });
    console.log(`[GenerateImage] Sanitized prompt for scene ${sceneId} (preserveText=${earlyTextRouting.useRecraft}, preserveLogos=${_needsLogoComp})`);
    console.log(`[GenerateImage] Removed elements: ${sanitized.removedElements.length}`);
    console.log(`[GenerateImage] Extracted text for overlays: ${sanitized.extractedText.join(', ') || 'none'}`);
    
    // Only sanitize product terms for product video context to avoid AI-generated bottles
    // Non-product videos can keep full context for better image relevance
    const basePrompt = isProductVideo 
      ? this.sanitizeProductTermsFromPrompt(sanitized.cleanPrompt)
      : sanitized.cleanPrompt;
    const enhancedPrompt = this.enhanceImagePrompt(basePrompt);

    const imgDims = getImageDimensionsForAspectRatio(aspectRatio);
    console.log(`[GenerateImage] Aspect ratio: ${aspectRatio} → ${imgDims.width}x${imgDims.height}`);

    // ──────────────────────────────────────────────────────────────
    // Smart provider routing — Nano Banana 2 / Recraft / Flux
    // The image-generation-policy module knows which model is best for
    // a given visual style + scene content type. Previously this whole
    // flow went straight to Flux, ignoring NB2 (great for photoreal +
    // brand-aware scenes) and Recraft (great for typography / product
    // shots). We now consult the policy and dispatch to the right
    // service via imageGenerationService — falling back to the existing
    // Flux paths on any failure so reliability is unchanged.
    // ──────────────────────────────────────────────────────────────
    try {
      const { selectImageProvider } = await import('../utils/image-generation-policy');
      const { imageGenerationService } = await import('./image-generation-service');

      const tagLower = (scene?.contentTag || '').toString().toLowerCase();
      const policyVisualStyle = tagLower.includes('lifestyle') ? 'lifestyle'
        : tagLower.includes('product') ? 'product'
        : tagLower.includes('social') ? 'social'
        : tagLower.includes('education') ? 'educational'
        : 'default';
      const policySceneType = (scene?.type || sceneType || '').toString().toLowerCase();

      // Brand-test bias: if a brand bible exists with name + colors, prefer
      // Nano Banana 2 (its Gemini-backed conditioning produces cleaner
      // brand-aware photoreal scenes than raw Flux). Recraft still wins
      // for text-heavy / product / CTA scenes via the policy below.
      let brandAware = false;
      try {
        const brand = await brandBibleService.getBrandBible();
        const c = (brand as any)?.colors || {};
        brandAware = !!(brand?.brandName && (c.primary || c.secondary || c.accent));
      } catch {}

      const candidatePool = ['nano-banana-2', 'recraft-v4-pro', 'recraft-v3-text', 'flux-1.1-pro'];
      let selected = selectImageProvider(policyVisualStyle, policySceneType, candidatePool);
      if (selected === 'flux-1.1-pro' && brandAware) {
        // Brand context present and policy didn't pick a typography model →
        // upgrade Flux to Nano Banana 2 for better brand fidelity.
        selected = 'nano-banana-2';
      }

      // Narration-aware Recraft routing: if narration references a known brand
      // or named location, or the visual direction explicitly mentions a sign,
      // override whatever the provider policy chose and send to Recraft V3
      // (typography-accurate) so environmental signage renders legibly.
      let lockedForText = false;
      if (earlyTextRouting.useRecraft) {
        if (selected !== 'recraft-v3-text' && selected !== 'recraft-v4-pro') {
          console.log(`[SceneImage] Scene ${sceneId} → Recraft | reason: ${earlyTextRouting.reason}`);
          selected = 'recraft-v3-text';
        }
        lockedForText = true;
      }

      // Logo composition: prompt asks for a real brand LOGO. Recraft can only
      // render typography, not reproduce a PNG mark. Force NB2 so we can pass
      // the brand's actual logo asset as a reference image.
      let lockedForLogo = false;
      if ((earlyTextRouting as any).needsLogoComposition && !lockedForText) {
        if (selected !== 'nano-banana-2') {
          console.log(`[SceneImage] Scene ${sceneId} → nano-banana-2 (was ${selected}) | reason: ${earlyTextRouting.reason}`);
          selected = 'nano-banana-2';
        }
        lockedForLogo = true;
      }

      // ===== Phase 43: FORCE NB2 when reference images exist =====
      // Other providers (Recraft, Flux) silently drop referenceImages, which
      // defeats product grounding and character continuity. If the scene has
      // a brand asset OR character reference, route to NB2 unconditionally.
      // BUT first apply the product-reference gating heuristic so that scenes
      // describing a non-product subject (e.g. "athletic woman drinking water")
      // do NOT get hijacked by a stale brandAssetUrl into I2I product zoom.
      // Product description isn't in scope here; rely on the built-in fallback
      // product keyword set (bottle/jar/powder/package/etc.) inside the helper.
      const _gateProduct = shouldSkipProductReferenceForScene(scene, '');
      const sceneProductRef = _gateProduct.skip ? undefined : (scene as any)?.brandAssetUrl;
      if (_gateProduct.skip && (scene as any)?.brandAssetUrl) {
        console.log(`[GenerateImage] Scene ${sceneId}: ignoring product brandAssetUrl — ${_gateProduct.reason}`);
      }
      const sceneCharRef = (scene as any)?.characterRefImageUrl;
      if ((sceneProductRef || sceneCharRef) && selected !== 'nano-banana-2' && !lockedForText) {
        console.log(`[GenerateImage] Phase 43: forcing nano-banana-2 (was ${selected}) — scene has reference images that other providers cannot consume`);
        selected = 'nano-banana-2';
      } else if ((sceneProductRef || sceneCharRef) && lockedForText) {
        console.log(`[GenerateImage] Scene ${sceneId}: keeping ${selected} for text accuracy despite reference images (Phase 43 override suppressed)`);
      }

      if (selected && selected !== 'flux-1.1-pro' && selected !== 'flux') {
        console.log(`[GenerateImage] Smart routing for scene ${sceneId}: ${selected} (style=${policyVisualStyle}, type=${policySceneType}, brandAware=${brandAware})`);

        // ===== Phase 43: Reference image attachment =====
        // For NB2 (Gemini-conditioned), pass scene-level reference images so
        // the model can ground generation in the user's actual product photo
        // and maintain character consistency across scenes.
        const refImageList: string[] = [];
        const productRef = (scene as any)?.brandAssetUrl;
        const charRef = (scene as any)?.characterRefImageUrl;
        if (productRef && typeof productRef === 'string') {
          refImageList.push(productRef);
          console.log(`[GenerateImage] Scene ${sceneId} attaching product reference: ${productRef.substring(0, 80)}`);
        }
        if (charRef && typeof charRef === 'string' && charRef !== productRef) {
          refImageList.push(charRef);
          console.log(`[GenerateImage] Scene ${sceneId} attaching character reference: ${charRef.substring(0, 80)}`);
        }

        // Logo composition: attach the brand's actual logo PNG so NB2 can
        // place it accurately into the scene (sign, wall plaque, packaging).
        if (lockedForLogo && selected === 'nano-banana-2') {
          try {
            const bb = await brandBibleService.getBrandBible();
            const logoAsset = bb?.logos?.main || bb?.logos?.intro || bb?.logos?.outro || bb?.logos?.watermark;
            const logoUrl = logoAsset?.url;
            if (logoUrl && typeof logoUrl === 'string' && !refImageList.includes(logoUrl)) {
              refImageList.push(logoUrl);
              console.log(`[GenerateImage] Scene ${sceneId} attaching brand LOGO reference: ${logoUrl.substring(0, 80)}`);
            } else if (!logoUrl) {
              console.log(`[GenerateImage] Scene ${sceneId} requested logo composition but no brand logo asset found`);
            }
          } catch (e) {
            console.warn(`[GenerateImage] Scene ${sceneId} failed to load brand logo:`, (e as Error).message);
          }
        }

        // When routing to Recraft V3 with extracted text from sanitizer,
        // forward a coarse default text-layout so the typography model
        // actually renders the brand/sign words instead of a blank surface.
        let recraftTextLayout: Array<{ text: string; x: number; y: number; width?: number }> | undefined;
        if (selected === 'recraft-v3-text' && sanitized.extractedText.length > 0) {
          // Recraft rejects non-ASCII chars (em-dashes, smart quotes, NBSP, etc.)
          // in text_layout. Normalize, strip to printable ASCII, then dedupe.
          const cleaned = sanitized.extractedText
            .map((t) => t
              .normalize('NFKD')
              .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
              .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
              .replace(/[\u2013\u2014\u2212]/g, '-')
              .replace(/[^\x20-\x7E]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
            )
            .filter((t) => t.length > 0);
          const seen = new Set<string>();
          const unique = cleaned.filter((t) => {
            const k = t.toUpperCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (unique.length > 0) {
            recraftTextLayout = unique.slice(0, 3).map((text, idx) => ({
              text,
              x: 0.25,
              y: 0.30 + idx * 0.18,
              width: 0.5,
            }));
            console.log(`[GenerateImage] Recraft text_layout: ${recraftTextLayout.map(t => `"${t.text}"`).join(', ')}`);
          }
        }

        const smartResult = await imageGenerationService.generateImage({
          prompt: enhancedPrompt,
          provider: selected,
          aspectRatio,
          width: imgDims.width,
          height: imgDims.height,
          ...(refImageList.length > 0 ? { referenceImages: refImageList } : {}),
          ...(recraftTextLayout ? { textLayout: recraftTextLayout } : {}),
        });
        if (smartResult?.url) {
          if (smartResult.providerWarning) {
            this.addNotification({
              type: 'warning',
              service: selected,
              message: smartResult.providerWarning,
              fallbackUsed: smartResult.provider,
            });
          }
          return {
            url: smartResult.url,
            source: smartResult.provider || selected,
            success: true,
          };
        }
      } else {
        console.log(`[GenerateImage] Policy chose Flux for scene ${sceneId} (style=${policyVisualStyle}, type=${policySceneType}, brandAware=${brandAware})`);
      }
    } catch (smartErr: any) {
      console.warn(`[GenerateImage] Smart routing failed for scene ${sceneId}: ${smartErr.message} — falling back to Flux`);
    }

    if (falKey) {
      const falResult = await this.generateImageWithFalPrimary(enhancedPrompt, falKey, aspectRatio);
      if (falResult.success) {
        return falResult;
      }
      
      this.addNotification({
        type: 'error',
        service: 'fal.ai',
        message: `Primary image generation failed for scene ${sceneId}: ${falResult.error}`,
        fallbackUsed: 'Hugging Face SDXL',
      });
    } else {
      const piapiResult = await this.generateImageWithPiAPI(enhancedPrompt, aspectRatio);
      if (piapiResult.success) {
        this.addNotification({
          type: 'info',
          service: 'PiAPI Flux',
          message: `Image generated for scene ${sceneId} via PiAPI Flux`,
        });
        return piapiResult;
      }

      this.addNotification({
        type: 'warning',
        service: 'PiAPI Flux',
        message: `PiAPI image generation failed: ${piapiResult.error}. Trying fallbacks.`,
      });
    }

    const hfResult = await this.generateImageWithHuggingFace(enhancedPrompt);
    if (hfResult.success) {
      this.addNotification({
        type: 'info',
        service: 'Hugging Face',
        message: `Fallback image generated for scene ${sceneId}`,
      });
      return hfResult;
    }

    this.addNotification({
      type: 'warning',
      service: 'Hugging Face',
      message: `Fallback image generation failed: ${hfResult.error}. Using stock images.`,
    });

    const stockResult = await this.getStockImage(prompt);
    if (stockResult.success) {
      return stockResult;
    }

    return {
      url: '',
      source: 'none',
      success: false,
      error: 'All image generation methods failed',
    };
  }

  private enhanceImagePrompt(prompt: string): string {
    const promptLower = prompt.toLowerCase();
    
    // Detect subject type from prompt - supports ANY subject (humans, pets, products, etc.)
    let subjectEnforcement = '';
    
    // Pet/Animal detection
    const petIndicators = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'animal', 'golden retriever', 'labrador', 'poodle', 'horse', 'bird'];
    const hasPetIndicator = petIndicators.some(ind => promptLower.includes(ind));
    
    if (hasPetIndicator) {
      // For pets - no human-related enforcement needed
      console.log('[EnhancePrompt] Pet/animal subject detected - no gender enforcement');
    } else {
      // Human subject detection - enforce gender only when specified
      const femaleWords = ['she', 'her', 'hers', 'herself', 'woman', 'women', 'female', 'lady', 'mother', 'wife', 'grandmother', 'girl'];
      const maleWords = ['he', 'his', 'him', 'himself', 'man', 'men', 'male', 'father', 'husband', 'grandfather', 'boy', 'guy'];
      const childWords = ['child', 'children', 'kid', 'kids', 'baby', 'infant', 'toddler', 'teen', 'teenager'];
      const coupleWords = ['couple', 'pair', 'together', 'family'];
      const tokens = new Set(promptLower.split(/\W+/).filter(Boolean));
      const hasAny = (words: string[]) => words.some(w => tokens.has(w));
      const hasFemaleIndicator = hasAny(femaleWords);
      const hasMaleIndicator = hasAny(maleWords);
      const hasChildIndicator = hasAny(childWords);
      const hasCoupleIndicator = hasAny(coupleWords);
      
      // Only enforce when clear single-gender is specified
      if (hasFemaleIndicator && !hasMaleIndicator && !hasCoupleIndicator) {
        subjectEnforcement += hasChildIndicator
          ? 'MUST be a female child only, NO MEN, '
          : 'MUST be an adult woman (age 25-45), fully grown, NO CHILDREN, NO TEENAGERS, NO MEN, ';
        console.log(`[EnhancePrompt] Enforcing female subject${hasChildIndicator ? ' (child)' : ' (adult)'}`);
      } else if (hasMaleIndicator && !hasFemaleIndicator && !hasCoupleIndicator) {
        subjectEnforcement += hasChildIndicator
          ? 'MUST be a male child only, NO WOMEN, '
          : 'MUST be an adult man (age 25-45), fully grown, NO CHILDREN, NO TEENAGERS, NO WOMEN, ';
        console.log(`[EnhancePrompt] Enforcing male subject${hasChildIndicator ? ' (child)' : ' (adult)'}`);
      } else if (hasCoupleIndicator) {
        console.log('[EnhancePrompt] Couple/family detected - allowing mixed genders');
      }
      
      // Age enforcement - only when age is specified in prompt
      const ageMatch = promptLower.match(/(\d{2})[- ]?(year[- ]?old|years old|yo)/);
      if (ageMatch && !hasChildIndicator) {
        const age = parseInt(ageMatch[1]);
        if (age >= 40 && age < 55) {
          subjectEnforcement += `MUST appear to be in their ${age}s with visible signs of maturity, NOT YOUNG, NOT in 20s or 30s, mature face with subtle age lines, `;
          console.log(`[EnhancePrompt] Enforcing age ${age} - mature middle-aged`);
        } else if (age >= 55 && age < 70) {
          subjectEnforcement += `MUST appear to be in their ${age}s with visible maturity, grey or greying hair acceptable, NOT YOUNG, `;
          console.log(`[EnhancePrompt] Enforcing age ${age} - senior`);
        } else if (age >= 70) {
          subjectEnforcement += 'MUST be an ELDERLY person with silver/white hair, dignified mature appearance, ';
          console.log(`[EnhancePrompt] Enforcing age ${age} - elderly`);
        } else if (age >= 20 && age < 40) {
          subjectEnforcement += `MUST appear to be a young adult in their ${age}s, youthful appearance, `;
          console.log(`[EnhancePrompt] Enforcing age ${age} - young adult`);
        }
      } else if (promptLower.includes('mature') || promptLower.includes('middle-aged') || promptLower.includes('middle aged')) {
        subjectEnforcement += 'MUST be MATURE MIDDLE-AGED in their 40s-50s, NOT YOUNG, ';
        console.log('[EnhancePrompt] Enforcing mature/middle-aged from keywords');
      } else if (promptLower.includes('senior') || promptLower.includes('elderly') || promptLower.includes('older adult')) {
        subjectEnforcement += 'MUST be SENIOR/ELDERLY in their 60s-70s, grey hair, NOT YOUNG, ';
        console.log('[EnhancePrompt] Enforcing senior/elderly from keywords');
      } else if (promptLower.includes('young') && !hasChildIndicator) {
        subjectEnforcement += 'MUST be a YOUNG ADULT in their 20s-30s, youthful appearance, ';
        console.log('[EnhancePrompt] Enforcing young adult from keywords');
      }
    }
    
    const styleModifiers = [
      'professional photography',
      'warm natural lighting',
      'clean composition',
      '4K ultra detailed',
      'soft color palette',
      'no text anywhere',
      'no writing',
      'no letters',
      'no signs with words',
    ];
    
    const focusClause = 'Focus on lifestyle, people, or environmental scenes. All signs, screens, papers, and surfaces must be blank with no visible text or writing.';
    
    return `${subjectEnforcement}${prompt}, ${styleModifiers.join(', ')}. ${focusClause}`;
  }

  private async generateImageWithFalPrimary(prompt: string, falKey: string, aspectRatio: string = '16:9'): Promise<ImageGenerationResult> {
    fal.config({ credentials: falKey });
    
    const dims = getImageDimensionsForAspectRatio(aspectRatio);
    console.log(`[FAL] Using dimensions ${dims.width}x${dims.height} for aspect ratio ${aspectRatio}`);

    const models = [
      {
        id: "fal-ai/flux-pro/v1.1",
        name: "FLUX-Pro-1.1",
        params: {
          prompt,
          image_size: { width: dims.width, height: dims.height },
          num_inference_steps: 28,
          guidance_scale: 3.5,
        },
      },
      {
        id: "fal-ai/flux/dev",
        name: "FLUX-Dev",
        params: {
          prompt,
          image_size: { width: dims.width, height: dims.height },
          num_inference_steps: 28,
        },
      },
      {
        id: "fal-ai/flux/schnell",
        name: "FLUX-Schnell",
        params: {
          prompt,
          image_size: { width: dims.width, height: dims.height },
          num_inference_steps: 4,
        },
      },
    ];

    for (const model of models) {
      try {
        console.log(`[UniversalVideoService] Generating image with fal.ai ${model.name}...`);

        const result = await fal.subscribe(model.id, {
          input: model.params,
          logs: false,
        }) as any;

        const imageUrl =
          result?.data?.images?.[0]?.url ||
          result?.images?.[0]?.url ||
          result?.data?.image?.url ||
          result?.image?.url;

        if (imageUrl) {
          console.log(`[UniversalVideoService] ${model.name} generated image successfully`);
          return {
            url: imageUrl,
            source: `fal.ai ${model.name}`,
            success: true,
          };
        }
      } catch (e: any) {
        const errorMessage = e.message || String(e);
        console.warn(`[UniversalVideoService] ${model.name} error:`, errorMessage.substring(0, 200));

        if (
          errorMessage.includes("payment") ||
          errorMessage.includes("quota") ||
          errorMessage.includes("billing")
        ) {
          return {
            url: '',
            source: `fal.ai ${model.name}`,
            success: false,
            error: `Billing issue: ${errorMessage}`,
          };
        }
      }
    }

    return {
      url: '',
      source: 'fal.ai',
      success: false,
      error: 'All fal.ai models failed',
    };
  }

  // Phase 13D: Image-to-Image generation using reference image
  async generateImageWithReference(
    prompt: string,
    referenceImageUrl: string,
    settings: { strength?: number; preserveComposition?: boolean; preserveColors?: boolean },
    sceneId: string
  ): Promise<ImageGenerationResult> {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      console.warn('[I2I] FAL_KEY not configured - falling back to text-to-image');
      return this.generateImage(prompt, sceneId, false);
    }

    fal.config({ credentials: falKey });
    
    // User slider: 0 = "Closer to reference", 1 = "More variation"
    // fal.ai strength: 0 = full reference preservation, 1 = full prompt influence (complete remake)
    // fal.ai FLUX dev default is 0.95 - "higher strength values are better for this model"
    const userStrength = settings.strength ?? 0.95;
    const falStrength = userStrength;
    
    console.log(`[I2I] Generating image-to-image for scene ${sceneId}`);
    console.log(`[I2I] Reference URL: ${referenceImageUrl}`);
    console.log(`[I2I] Strength: ${falStrength} (1.0=complete remake, 0.0=preserve original)`);

    // Fetch reference image and convert to base64 data URI
    // This is necessary because our object storage URLs require authentication
    let imageDataUri: string | null = null;
    try {
      let fetchUrl = referenceImageUrl;
      if (referenceImageUrl.startsWith('/')) {
        // For local paths, we need to use the internal server
        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000';
        fetchUrl = `${baseUrl}${referenceImageUrl}`;
      }
      
      console.log(`[I2I] Fetching reference image from: ${fetchUrl}`);
      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        console.warn(`[I2I] Failed to fetch reference image: ${response.status} ${response.statusText}`);
      } else {
        const contentType = response.headers.get('content-type') || 'image/png';
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        imageDataUri = `data:${contentType};base64,${base64}`;
        console.log(`[I2I] Converted reference image to base64 (${Math.round(base64.length / 1024)}KB, ${contentType})`);
      }
    } catch (fetchError: any) {
      console.warn(`[I2I] Error fetching reference image: ${fetchError.message}`);
    }
    
    if (!imageDataUri) {
      console.warn('[I2I] Could not load reference image - falling back to text-to-image');
      return this.generateImage(prompt, sceneId, false);
    }

    // fal.ai flux image-to-image endpoints
    const i2iModels = [
      {
        id: "fal-ai/flux/dev/image-to-image",
        name: "FLUX-Dev-I2I",
        params: {
          prompt,
          image_url: imageDataUri,
          strength: falStrength,
          image_size: { width: 1920, height: 1080 },
          num_inference_steps: 28,
        },
      },
      {
        id: "fal-ai/flux/schnell/image-to-image",
        name: "FLUX-Schnell-I2I",
        params: {
          prompt,
          image_url: imageDataUri,
          strength: falStrength,
          image_size: { width: 1920, height: 1080 },
          num_inference_steps: 4,
        },
      },
    ];

    for (const model of i2iModels) {
      try {
        console.log(`[I2I] Trying fal.ai ${model.name}...`);

        const result = await fal.subscribe(model.id, {
          input: model.params,
          logs: false,
        }) as any;

        const imageUrl =
          result?.data?.images?.[0]?.url ||
          result?.images?.[0]?.url ||
          result?.data?.image?.url ||
          result?.image?.url;

        if (imageUrl) {
          console.log(`[I2I] ${model.name} generated image successfully`);
          console.log(`[I2I] Generated URL: ${imageUrl}`);
          return {
            url: imageUrl,
            source: `fal.ai ${model.name}`,
            success: true,
          };
        }
      } catch (e: any) {
        const errorMessage = e.message || String(e);
        console.warn(`[I2I] ${model.name} error:`, errorMessage.substring(0, 200));
      }
    }

    // Fallback to text-to-image if I2I fails
    console.warn('[I2I] All I2I models failed, falling back to text-to-image');
    return this.generateImage(prompt, sceneId, false);
  }

  private async generateImageWithPiAPI(prompt: string, aspectRatio: string = '16:9'): Promise<ImageGenerationResult> {
    const piapiKey = process.env.PIAPI_API_KEY;
    if (!piapiKey) {
      return { url: '', source: 'piapi-flux', success: false, error: 'PIAPI_API_KEY not configured' };
    }

    const dims = getImageDimensionsForAspectRatio(aspectRatio);
    // Flux Schnell on PiAPI rejects anything over 1024x1024.
    const maxDim = 1024;
    let piapiWidth: number, piapiHeight: number;
    if (dims.width >= dims.height) {
      piapiWidth = Math.min(dims.width, maxDim);
      piapiHeight = Math.round(piapiWidth * (dims.height / dims.width));
    } else {
      piapiHeight = Math.min(dims.height, maxDim);
      piapiWidth = Math.round(piapiHeight * (dims.width / dims.height));
    }
    // Round to nearest multiple of 8 for diffusion-model compatibility
    piapiWidth = Math.round(piapiWidth / 8) * 8;
    piapiHeight = Math.round(piapiHeight / 8) * 8;
    console.log(`[PiAPI Flux] Using dimensions ${piapiWidth}x${piapiHeight} for aspect ratio ${aspectRatio}`);

    try {
      console.log('[PiAPI Flux] Generating image with Flux Schnell...');
      const createRes = await fetch('https://api.piapi.ai/api/v1/task', {
        method: 'POST',
        headers: {
          'X-API-Key': piapiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'Qubico/flux1-schnell',
          task_type: 'txt2img',
          input: {
            prompt: prompt,
            negative_prompt: 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, titles, subtitles, UI elements, buttons, banners, badges, stamps, certificates, menus, price tags, phone numbers, URLs, addresses, blurry, low quality, distorted',
            width: piapiWidth,
            height: piapiHeight,
          },
        }),
      });

      if (!createRes.ok) {
        return { url: '', source: 'piapi-flux', success: false, error: `HTTP ${createRes.status}: ${createRes.statusText}` };
      }

      let createData: any;
      try {
        createData = await createRes.json();
      } catch {
        return { url: '', source: 'piapi-flux', success: false, error: 'Invalid JSON response from PiAPI' };
      }

      if (createData.code !== 200 || !createData.data?.task_id) {
        return { url: '', source: 'piapi-flux', success: false, error: createData.message || 'Task creation failed' };
      }

      const taskId = createData.data.task_id;
      console.log(`[PiAPI Flux] Task created: ${taskId}`);

      for (let attempt = 0; attempt < 45; attempt++) {
        const delay = attempt < 5 ? 1000 : 2000;
        await new Promise(r => setTimeout(r, delay));

        let pollData: any;
        try {
          const pollRes = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
            headers: { 'X-API-Key': piapiKey },
          });
          if (!pollRes.ok) {
            console.warn(`[PiAPI Flux] Poll HTTP ${pollRes.status}, retrying...`);
            continue;
          }
          pollData = await pollRes.json();
        } catch (pollErr: any) {
          console.warn(`[PiAPI Flux] Poll error: ${pollErr.message}, retrying...`);
          continue;
        }

        const status = pollData.data?.status;

        if (status === 'completed') {
          const output = pollData.data?.output;
          const imageUrl = output?.image_url ||
            (Array.isArray(output?.images) && output.images[0]?.url) ||
            output?.url;
          if (imageUrl) {
            console.log(`[PiAPI Flux] Image generated: ${imageUrl.substring(0, 80)}...`);
            return { url: imageUrl, source: 'piapi-flux', success: true };
          }
          console.warn('[PiAPI Flux] Completed but no image URL. Output:', JSON.stringify(output).substring(0, 200));
          return { url: '', source: 'piapi-flux', success: false, error: 'No image URL in completed response' };
        }

        if (status === 'failed') {
          const errMsg = pollData.data?.error?.message || pollData.data?.error || 'Generation failed';
          console.error(`[PiAPI Flux] Failed: ${errMsg}`);
          return { url: '', source: 'piapi-flux', success: false, error: String(errMsg) };
        }

        if (attempt % 10 === 9) {
          console.log(`[PiAPI Flux] Still polling... status=${status}, attempt ${attempt + 1}/45`);
        }
      }

      return { url: '', source: 'piapi-flux', success: false, error: 'Timeout after 90s' };
    } catch (error: any) {
      console.error('[PiAPI Flux] Error:', error.message);
      return { url: '', source: 'piapi-flux', success: false, error: error.message };
    }
  }

  private async generateImageWithHuggingFace(prompt: string): Promise<ImageGenerationResult> {
    const hfToken = process.env.HUGGINGFACE_API_TOKEN;
    if (!hfToken) {
      return { url: '', source: 'huggingface', success: false, error: 'No API token' };
    }

    const models = [
      { id: "stabilityai/stable-diffusion-xl-base-1.0", name: "SDXL" },
      { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX-Schnell" },
    ];

    for (const model of models) {
      try {
        console.log(`[UniversalVideoService] Trying Hugging Face ${model.name}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const response = await fetch(
          `https://router.huggingface.co/hf-inference/models/${model.id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy",
                num_inference_steps: 25,
                guidance_scale: 7.5,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("image")) {
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mimeType = contentType.includes("jpeg") ? "image/jpeg" : "image/png";

            return {
              url: `data:${mimeType};base64,${base64}`,
              source: `Hugging Face ${model.name}`,
              success: true,
            };
          }
        }
      } catch (e: any) {
        console.warn(`[UniversalVideoService] HF ${model.name} error:`, e.message || e);
      }
    }

    return { url: '', source: 'huggingface', success: false, error: 'All models failed' };
  }

  private getBackgroundEnvironmentPrompt(sceneType: string): string {
    const environments: Record<string, string> = {
      hook: 'dramatic lighting with soft shadows, elegant minimalist setting',
      intro: 'clean white studio environment with subtle reflections on surface',
      benefit: 'natural setting with soft morning light, serene peaceful atmosphere',
      feature: 'modern clean laboratory or wellness space with professional lighting',
      explanation: 'educational setting with soft gradient background and subtle textures',
      process: 'clean production environment with professional studio lighting',
      testimonial: 'warm inviting home-like environment with natural window light',
      social_proof: 'professional office or wellness center setting',
      story: 'cinematic atmospheric background with bokeh lighting effects',
      cta: 'premium studio setting with spotlight and elegant backdrop',
      outro: 'soft gradient background transitioning to brand colors',
    };
    return environments[sceneType] || 'professional studio environment with clean composition';
  }

  private async generateAIBackground(
    backgroundPrompt: string,
    sceneType: string,
    aspectRatio: string = '16:9'
  ): Promise<{ backgroundUrl: string | null; source: string; extractedText?: string[]; extractedLogos?: string[] }> {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      console.log('[UniversalVideoService] FAL_KEY not available - cannot generate AI background');
      return { backgroundUrl: null, source: 'none' };
    }

    try {
      console.log(`[UniversalVideoService] Generating AI background for ${sceneType} scene...`);
      
      // Phase 11A: Sanitize prompt to remove text/logo requests
      const sanitized = sanitizePromptForAI(backgroundPrompt, sceneType);
      console.log(`[GenerateBackground] Sanitized prompt for ${sceneType} scene`);
      console.log(`[GenerateBackground] Removed elements: ${sanitized.removedElements.length}`);
      console.log(`[GenerateBackground] Extracted text: ${sanitized.extractedText.join(', ') || 'none'}`);
      
      const environmentContext = this.getBackgroundEnvironmentPrompt(sceneType);
      
      // Use sanitized prompt as base (already has "no text" instruction)
      const cleanedPrompt = sanitized.cleanPrompt
        .replace(/product\s*(shot|image|photo|photography)?/gi, '')
        .replace(/bottle/gi, '')
        .replace(/packaging/gi, '')
        .replace(/label/gi, '')
        .replace(/(Black Cohosh|Extract|Plus)/gi, '')
        .trim();

      const environmentOnlyPrompt = `Empty background scene for product photography: ${environmentContext}. ${cleanedPrompt} NO PEOPLE, NO FACES, NO HUMANS - ONLY the background environment and setting. Empty clean surface ready for product placement. Professional studio lighting, high quality, 4K, photorealistic background plate.`;
      
      console.log(`[UniversalVideoService] Environment-only prompt: ${environmentOnlyPrompt}`);

      const bgDims = getImageDimensionsForAspectRatio(aspectRatio);
      console.log(`[GenerateBackground] Using ${bgDims.falSize} for aspect ratio ${aspectRatio}`);
      
      const backgroundResult = await fal.subscribe("fal-ai/flux-pro/v1.1", {
        input: {
          prompt: environmentOnlyPrompt,
          image_size: bgDims.falSize,
          num_images: 1,
          safety_tolerance: "2",
          enable_safety_checker: true,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            console.log(`[UniversalVideoService] Background generation in progress for ${sceneType}...`);
          }
        },
      });

      if (backgroundResult.data?.images?.[0]?.url) {
        console.log(`[UniversalVideoService] AI background generated successfully for ${sceneType}`);
        return {
          backgroundUrl: backgroundResult.data.images[0].url,
          source: 'fal.ai/flux-pro',
          extractedText: sanitized.extractedText,
          extractedLogos: sanitized.extractedLogos,
        };
      }
    } catch (error: any) {
      console.warn('[UniversalVideoService] Background generation failed:', error.message);
    }

    return { backgroundUrl: null, source: 'failed', extractedText: [], extractedLogos: [] };
  }

  private isContentScene(sceneType: string): boolean {
    const contentScenes = ['hook', 'benefit', 'story', 'explanation', 'process', 'testimonial', 'social_proof', 'problem'];
    return contentScenes.includes(sceneType);
  }

  private async generateContentImage(
    scene: Scene,
    productName: string,
    aspectRatio: string = '16:9',
    artPresetId?: string
  ): Promise<{ imageUrl: string | null; source: string; extractedText?: string[]; extractedLogos?: string[] }> {
    const { isTextHeavyScene, imageGenerationService } = await import('./image-generation-service');
    
    if (isTextHeavyScene(scene)) {
      try {
        console.log(`[UniversalVideoService] Text-heavy scene ${scene.id} — routing to GPT-Image-1 with brand context`);
        
        let brandContext = '';
        try {
          const brandBible = await brandBibleService.getBrandBible();
          if (brandBible?.brandName) {
            const colors = [brandBible.primaryColor, brandBible.secondaryColor, brandBible.accentColor].filter(Boolean);
            brandContext = `Brand: "${brandBible.brandName}". ${colors.length > 0 ? `Brand color palette: ${colors.join(', ')}. ` : ''}Use the brand name and colors in the design where contextually appropriate.`;
            console.log(`[TextImage] Brand context: ${brandContext}`);
          }
        } catch (e: any) {
          console.warn(`[TextImage] Could not load brand context: ${e.message}`);
        }
        
        const sceneArtPreset = artPresetId ? getVisualArtPreset(artPresetId) : null;
        const artStyle = sceneArtPreset ? `${sceneArtPreset.name} style. ` : '';
        const imagePrompt = (scene as any).imagePrompt || scene.visualDirection || '';
        const narration = scene.narration || '';
        
        const textImgPrompt = `${artStyle}${imagePrompt}. ${brandContext} The scene narration is: "${narration}". All text in the image must be perfectly legible, sharp, and professionally typeset. ${sceneArtPreset?.imagePromptSuffix || 'High quality render.'}`;
        
        console.log(`[TextImage] GPT-Image-1 prompt: ${textImgPrompt.substring(0, 150)}...`);
        
        const gptWidth = aspectRatio === '9:16' ? 1024 : aspectRatio === '1:1' ? 1024 : 1536;
        const gptHeight = aspectRatio === '9:16' ? 1536 : aspectRatio === '1:1' ? 1024 : 1024;
        const textImage = await imageGenerationService.generateWithOpenAI({
          prompt: textImgPrompt,
          width: gptWidth,
          height: gptHeight,
        });
        
        if (textImage.url) {
          console.log(`[TextImage] GPT-Image-1 success for scene ${scene.id}: ${textImage.url.substring(0, 80)}...`);
          return {
            imageUrl: textImage.url,
            source: 'gpt-image-1 (text-heavy)',
            extractedText: [],
            extractedLogos: [],
          };
        }
      } catch (textErr: any) {
        console.warn(`[TextImage] GPT-Image-1 failed for scene ${scene.id}: ${textErr.message} — falling back to Flux`);
      }
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      console.log('[UniversalVideoService] FAL_KEY not available - trying stock images');
      const stockResult = await this.getContentStockImage(scene);
      return { ...stockResult, extractedText: [], extractedLogos: [] };
    }

    try {
      console.log(`[UniversalVideoService] Generating content image for ${scene.type} scene...`);
      
      const contentPromptResult = this.buildContentPrompt(scene, productName, artPresetId);
      console.log(`[UniversalVideoService] Content prompt: ${contentPromptResult.prompt}`);

      const contentDims = getImageDimensionsForAspectRatio(aspectRatio);
      console.log(`[GenerateContent] Using ${contentDims.falSize} for aspect ratio ${aspectRatio}`);
      
      const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
        input: {
          prompt: contentPromptResult.prompt,
          image_size: contentDims.falSize,
          num_images: 1,
          safety_tolerance: "2",
          enable_safety_checker: true,
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            console.log(`[UniversalVideoService] Content image generation in progress for ${scene.type}...`);
          }
        },
      });

      if (result.data?.images?.[0]?.url) {
        console.log(`[UniversalVideoService] Content image generated successfully for ${scene.type}`);
        return {
          imageUrl: result.data.images[0].url,
          source: 'fal.ai/flux-pro (content)',
          extractedText: contentPromptResult.extractedText,
          extractedLogos: contentPromptResult.extractedLogos,
        };
      }
    } catch (error: any) {
      console.warn('[UniversalVideoService] Content image generation failed:', error.message);
    }

    const stockResult = await this.getContentStockImage(scene);
    return { ...stockResult, extractedText: [], extractedLogos: [] };
  }

  private buildContentPrompt(scene: Scene, productName: string, artPresetId?: string): { prompt: string; extractedText: string[]; extractedLogos: string[] } {
    const sceneType = scene.type;
    const visualDirection = scene.visualDirection || '';
    const narration = scene.narration || '';
    
    const artPresetForPrompt = artPresetId ? getVisualArtPreset(artPresetId) : null;
    
    // Phase 11A: Sanitize visual direction to remove text/logo requests
    const sanitized = sanitizePromptForAI(visualDirection, sceneType);
    const cleanVisualDirection = sanitized.cleanPrompt;
    
    console.log(`[BuildContentPrompt] Scene ${scene.id} sanitized:`);
    console.log(`  Removed: ${sanitized.removedElements.length} elements`);
    console.log(`  Extracted text: ${sanitized.extractedText.join(', ') || 'none'}`);
    console.log(`  Visual direction: ${cleanVisualDirection.substring(0, 80)}...`);
    
    // PHASE 14C FIX: Use visual direction as PRIMARY prompt source
    // Only add demographic heuristics if visual direction is empty or very short
    const hasSubstantiveVisualDirection = cleanVisualDirection.length > 30;
    
    // Check if visual direction explicitly wants people or is environment-only
    const lowerVisualDir = cleanVisualDirection.toLowerCase();
    const personIndicators = ['woman', 'man', 'person', 'people', 'she ', 'he ', 'her ', 'his ', 
                              'mother', 'father', 'family', 'customer', 'patient', 'client',
                              'sitting', 'standing', 'walking', 'looking', 'smiling'];
    const environmentIndicators = ['setting', 'room', 'space', 'background', 'scene', 'environment',
                                   'desk', 'table', 'kitchen', 'office', 'studio', 'outdoor', 'indoor',
                                   'lighting', 'atmosphere', 'minimalist', 'modern', 'natural light'];
    
    const wantsPeople = personIndicators.some(ind => lowerVisualDir.includes(ind));
    const isEnvironmentFocused = environmentIndicators.some(ind => lowerVisualDir.includes(ind)) && !wantsPeople;
    
    let fullPrompt: string;
    
    if (hasSubstantiveVisualDirection) {
      // Use visual direction as the primary prompt - respect what the user wrote
      console.log(`[BuildContentPrompt] Using visual direction as PRIMARY prompt (${wantsPeople ? 'includes people' : isEnvironmentFocused ? 'environment-only' : 'general'}, artPreset: ${artPresetForPrompt?.name || 'none'})`);
      
      const isStylizedArt = artPresetForPrompt ? isStylizedPreset(artPresetForPrompt.id) : false;
      
      if (isEnvironmentFocused) {
        fullPrompt = `${cleanVisualDirection}. No people, only the setting and objects described. High quality.`;
      } else if (isStylizedArt) {
        fullPrompt = `${cleanVisualDirection}. NO text, NO logos. High quality ${artPresetForPrompt!.name} render.`;
      } else if (wantsPeople) {
        fullPrompt = `${cleanVisualDirection}. Photorealistic, natural look. NO text, NO logos. Adults only.`;
      } else {
        fullPrompt = `${cleanVisualDirection}. Photorealistic, high quality. NO text, NO logos.`;
      }
    } else {
      // Fallback: No substantial visual direction, use old heuristic-based approach
      console.log(`[BuildContentPrompt] Visual direction too short - using demographic heuristics`);
      
      const lowerNarration = narration.toLowerCase();
      const lowerProduct = productName.toLowerCase();
      let demographicContext = '';
      
      if (lowerProduct.includes('menopause') || lowerNarration.includes('menopause') ||
          lowerProduct.includes('hormone') || lowerNarration.includes('hot flash')) {
        demographicContext = 'mature woman in her 40s-60s, graceful confident, healthy glowing, ';
      } else if (lowerProduct.includes('senior') || lowerNarration.includes('elderly')) {
        demographicContext = 'senior woman, dignified healthy, active lifestyle, ';
      } else if (lowerNarration.includes('woman') || lowerNarration.includes('female') || lowerNarration.includes('women')) {
        demographicContext = 'adult woman, healthy natural, ';
      }
      
      let baseContext = '';
      switch (sceneType) {
        case 'hook':
          baseContext = `${demographicContext}Everyday objects or environment showing the problem described in the narration — a scale, a cluttered desk, an empty plate.`;
          break;
        case 'benefit':
          baseContext = `${demographicContext}Visual showing positive change — fresh ingredients, bright natural setting, organized space.`;
          break;
        case 'story':
          baseContext = `${demographicContext}Authentic real-life moment, natural setting, everyday objects that tell the story.`;
          break;
        case 'explanation':
        case 'process':
          baseContext = `${demographicContext}Simple visual showing the concept clearly — ingredients, products, or nature imagery.`;
          break;
        case 'testimonial':
        case 'social_proof':
          baseContext = `${demographicContext}Warm, inviting home environment with natural light, cozy and genuine.`;
          break;
        case 'problem':
          baseContext = `${demographicContext}Objects or environment conveying the struggle — a bathroom scale, pill bottles, an empty fridge.`;
          break;
        default:
          baseContext = `${demographicContext}Natural everyday setting with relevant objects, warm and authentic.`;
      }
      
      const extractedConcepts = this.extractVisualConcepts(cleanVisualDirection, narration);
      const isStylizedFallback = artPresetForPrompt ? isStylizedPreset(artPresetForPrompt.id) : false;
      const styleQualifier = isStylizedFallback ? `High quality, 4K, ${artPresetForPrompt!.name} style` : 'High quality, 4K, photorealistic';
      fullPrompt = `${baseContext} ${extractedConcepts}. ${styleQualifier}. NO text, NO logos, NO product shots, NO watermarks. IMPORTANT: Show ADULTS only.`;
    }
    
    if (artPresetForPrompt) {
      let promptBody = fullPrompt;
      if (isStylizedPreset(artPresetForPrompt.id)) {
        promptBody = promptBody
          .replace(/\bphotorealistic\b/gi, '')
          .replace(/\bnatural look\b/gi, '')
          .replace(/\.\s*\./g, '.')
          .trim();
      }
      fullPrompt = `${artPresetForPrompt.imagePromptPrefix} ${promptBody}, ${artPresetForPrompt.imagePromptSuffix}`;
      console.log(`[BuildContentPrompt] Art preset "${artPresetForPrompt.name}" applied to image prompt${isStylizedPreset(artPresetForPrompt.id) ? ' (photorealistic terms stripped)' : ''}`);
    }
    
    console.log(`[BuildContentPrompt] Final prompt: ${fullPrompt.substring(0, 100)}...`);
    
    return {
      prompt: fullPrompt,
      extractedText: sanitized.extractedText,
      extractedLogos: sanitized.extractedLogos,
    };
  }

  private extractVisualConcepts(visualDirection: string, narration: string): string {
    const combined = `${visualDirection} ${narration}`.toLowerCase();
    
    const concepts: string[] = [];
    
    // Specify adult/mature for menopause content
    if (combined.includes('menopause') || combined.includes('hot flash') || combined.includes('hormonal')) {
      concepts.push('mature woman in her 50s, wellness journey, natural health, serene confident expression');
    }
    // Specify adult for sleep content
    if (combined.includes('sleep') || combined.includes('restful') || combined.includes('night')) {
      concepts.push('adult peaceful sleep, comfortable bedroom, restful atmosphere');
    }
    if (combined.includes('energy') || combined.includes('vitality') || combined.includes('active')) {
      concepts.push('energetic adult, active lifestyle, vibrant health');
    }
    if (combined.includes('stress') || combined.includes('anxiety') || combined.includes('mood')) {
      concepts.push('calm relaxed adult, peaceful moment, stress relief');
    }
    if (combined.includes('natural') || combined.includes('herb') || combined.includes('botanical')) {
      concepts.push('natural herbs, botanical elements, organic wellness');
    }
    // Ensure woman means adult woman
    if (combined.includes('woman') || combined.includes('female') || combined.includes('her')) {
      concepts.push('adult woman in natural setting, feminine wellness');
    }
    if (combined.includes('science') || combined.includes('study') || combined.includes('research') || combined.includes('clinical')) {
      concepts.push('scientific visualization, research imagery, medical illustration style');
    }
    
    if (concepts.length === 0) {
      concepts.push('adult wellness lifestyle, healthy living, natural setting');
    }
    
    return concepts.join(', ');
  }

  private async getContentStockImage(scene: Scene): Promise<{ imageUrl: string | null; source: string }> {
    const searchQuery = this.buildStockSearchQuery(scene);
    console.log(`[UniversalVideoService] Searching stock images for: ${searchQuery}`);
    
    const result = await this.getStockImage(searchQuery);
    if (result.success) {
      return { imageUrl: result.url, source: result.source };
    }
    
    return { imageUrl: null, source: 'failed' };
  }

  private buildStockSearchQuery(scene: Scene): string {
    const sceneType = scene.type;
    const narration = (scene.narration || '').toLowerCase();
    
    if (narration.includes('menopause') || narration.includes('hot flash')) {
      return 'woman wellness health natural';
    }
    if (narration.includes('sleep') || narration.includes('restful')) {
      return 'peaceful sleep relaxation bedroom';
    }
    if (narration.includes('energy') || narration.includes('vitality')) {
      return 'active healthy lifestyle energy';
    }
    if (narration.includes('hormone') || narration.includes('estrogen')) {
      return 'woman health wellness botanical';
    }
    
    const stockQueries: Record<string, string> = {
      hook: 'woman wellness challenge lifestyle',
      benefit: 'happy healthy woman nature',
      story: 'authentic lifestyle moment',
      explanation: 'natural herbs botanical wellness',
      process: 'science nature botanical',
      testimonial: 'happy satisfied customer portrait',
      social_proof: 'people wellness community',
      problem: 'woman stress health concern',
    };
    
    return stockQueries[sceneType] || 'wellness lifestyle health';
  }

  private resolveProductImageUrl(url: string): string {
    if (!url) return '';
    
    if (url.startsWith('http')) return url;
    
    if (url.startsWith('/objects/')) {
      return url;
    }
    
    if (url.startsWith('public/') || url.startsWith('/public/')) {
      return `/objects/${url.replace(/^\//, '')}`;
    }
    
    return `/objects/${url.replace(/^\//, '')}`;
  }

  private async getStockImage(query: string): Promise<ImageGenerationResult> {
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (pexelsKey) {
      try {
        const response = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
          { headers: { Authorization: pexelsKey } }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.photos && data.photos[0]) {
            return {
              url: data.photos[0].src.large2x || data.photos[0].src.large,
              source: 'Pexels Stock',
              success: true,
            };
          }
        }
      } catch (e) {
        console.warn("[UniversalVideoService] Pexels error:", e);
      }
    }

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      try {
        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
          { headers: { Authorization: `Client-ID ${unsplashKey}` } }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results[0]) {
            return {
              url: data.results[0].urls.regular,
              source: 'Unsplash Stock',
              success: true,
            };
          }
        }
      } catch (e) {
        console.warn("[UniversalVideoService] Unsplash error:", e);
      }
    }

    return { url: '', source: 'stock', success: false, error: 'No stock images found' };
  }

  /**
   * Pre-process narration text to help TTS pronounce specialty words correctly
   * Uses phonetic hints that ElevenLabs can interpret better
   */
  private preprocessNarrationForTTS(text: string): string {
    // ElevenLabs eleven_multilingual_v2 model handles pronunciation well natively
    // REMOVED: Phonetic substitutions with spaces caused unnatural pauses
    // Now we only do minimal text cleanup for natural flow
    
    let processedText = text;
    
    // Only fix brand name spacing (no phonetic syllable breaks)
    const brandFixes: Record<string, string> = {
      'PineHillFarm': 'Pine Hill Farm',
      'pinehillfarm': 'Pine Hill Farm',
      'Pinehillfarm': 'Pine Hill Farm',
    };
    
    for (const [original, fixed] of Object.entries(brandFixes)) {
      const regex = new RegExp(`\\b${original}\\b`, 'g');
      processedText = processedText.replace(regex, fixed);
    }
    
    // Remove any abbreviations that might be read incorrectly
    // Expand common abbreviations for natural speech
    const abbreviations: Record<string, string> = {
      'mg': 'milligrams',
      'mcg': 'micrograms',
      'oz': 'ounces',
      'fl oz': 'fluid ounces',
      'Dr.': 'Doctor',
      'vs.': 'versus',
      'etc.': 'etcetera',
      '%': ' percent',
    };
    
    for (const [abbrev, expanded] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      processedText = processedText.replace(regex, expanded);
    }
    
    // Clean up any awkward punctuation that might cause pauses
    processedText = processedText
      .replace(/\s*-\s*/g, ' ') // Replace hyphens with spaces
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
    
    return processedText;
  }

  /**
   * Parse a narration string for an inline @voice:<id> tag and return
   * the extracted voiceId plus the cleaned narration text.
   * Supports: "@voice:cloned:42" or "@voice:someElevenLabsId".
   * If no tag is present, voiceId is undefined and narration is unchanged.
   */
  private parseVoiceFromNarration(text: string): { voiceId?: string; narration: string } {
    const match = text.match(/@voice:([^\s,]+)/i);
    if (!match) return { narration: text };
    const voiceId = match[1];
    const narration = text.replace(match[0], '').trim();
    return { voiceId, narration };
  }

  /**
   * Generate TTS audio for a cloned voice via Play.ht, then upload to S3 and
   * return a VoiceoverResult. Returns success:false with a descriptive error
   * message if the voice cannot be resolved or generation fails.
   * `userId` must be the owner of the cloned voice record (enforces ownership).
   */
  private async generateVoiceoverForClonedVoice(
    text: string,
    clonedVoiceRef: string,
    fallbackVoiceId?: string,
    options?: { stability?: number; similarityBoost?: number; style?: number },
    userId?: string,
  ): Promise<VoiceoverResult> {
    try {
      const voiceIdNum = parseInt(clonedVoiceRef.replace('cloned:', ''), 10);
      if (isNaN(voiceIdNum)) {
        return { url: '', duration: 0, success: false, error: `Invalid cloned voice reference: ${clonedVoiceRef}` };
      }

      const { db: dbInstance } = await import('../db');
      const { clonedVoices: cvTable } = await import('../../shared/schema');
      const { eq, and } = await import('drizzle-orm');

      // Enforce ownership unconditionally — a missing userId is an authorization failure.
      if (!userId) {
        console.error(`[ClonedVoice] Cannot resolve cloned voice ${clonedVoiceRef}: no userId in context (access denied).`);
        return { url: '', duration: 0, success: false, error: 'Cannot use cloned voice: user identity could not be verified' };
      }

      const [row] = await dbInstance
        .select()
        .from(cvTable)
        .where(and(eq(cvTable.id, voiceIdNum), eq(cvTable.userId, userId))!)
        .limit(1);

      if (!row) {
        console.error(`[ClonedVoice] Voice ${clonedVoiceRef} not found or not owned by user ${userId} (access denied).`);
        return { url: '', duration: 0, success: false, error: 'Cloned voice not found or you do not have access to it' };
      }

      if (row.status !== 'ready') {
        console.warn(`[ClonedVoice] Voice ${clonedVoiceRef} not ready (status=${row.status})`);
        return { url: '', duration: 0, success: false, error: `Cloned voice "${row.name}" is not ready yet (status: ${row.status})` };
      }

      if (!row.providerVoiceId) {
        console.warn(`[ClonedVoice] Voice ${clonedVoiceRef} has no providerVoiceId (Play.ht not configured?)`);
        return { url: '', duration: 0, success: false, error: `Cloned voice "${row.name}" has no provider voice ID — try re-cloning the voice` };
      }

      console.log(`[ClonedVoice] Generating speech via Play.ht for voice ${row.name} (${row.providerVoiceId})`);
      const audioBuffer = await generatePlayhtSpeech(text, row.providerVoiceId);
      if (!audioBuffer) {
        return { url: '', duration: 0, success: false, error: `Failed to generate speech for cloned voice "${row.name}" via Play.ht` };
      }

      let actualDuration = 0;
      try {
        const mm = await import('music-metadata');
        const metadata = await mm.parseBuffer(audioBuffer, { mimeType: 'audio/mpeg' });
        actualDuration = metadata.format.duration || 0;
      } catch {
        const wordCount = text.trim().split(/\s+/).length;
        actualDuration = Math.ceil(wordCount / 2.5);
      }

      const fileName = `voiceover_cloned_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
      const s3Url = await this.uploadToS3(audioBuffer, fileName, 'audio/mpeg');
      const url = s3Url || `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

      console.log(`[ClonedVoice] Speech generated: ${actualDuration.toFixed(1)}s`);
      return { url, duration: actualDuration, success: true };
    } catch (err: any) {
      console.error('[ClonedVoice] Play.ht TTS failed:', err.message);
      return { url: '', duration: 0, success: false, error: `Cloned voice generation failed: ${err.message}` };
    }
  }

  async generateVoiceover(
    text: string, 
    voiceId?: string,
    options?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      provider?: string;
    },
    context?: { userId?: string },
  ): Promise<VoiceoverResult> {
    // --- Play.ht dispatch ---
    if (options?.provider === 'playht') {
      return this.generateVoiceoverPlayHT(text, voiceId, options);
    }

    // Extract inline @voice:<id> tag from narration text if present.
    const { voiceId: inlineVoiceId, narration: cleanedText } = this.parseVoiceFromNarration(text);
    const resolvedVoiceId = inlineVoiceId || voiceId;

    // Route cloned voices through Play.ht (before the ElevenLabs key check).
    // Return the result directly — success or a descriptive error — never fall through to
    // ElevenLabs with a different voice when the user explicitly selected a cloned voice.
    if (resolvedVoiceId?.startsWith('cloned:')) {
      return this.generateVoiceoverForClonedVoice(cleanedText, resolvedVoiceId, undefined, options, context?.userId);
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) {
      this.addNotification({
        type: 'error',
        service: 'ElevenLabs',
        message: 'ELEVENLABS_API_KEY not configured - voiceover generation unavailable',
      });
      return { url: '', duration: 0, success: false, error: 'API key not configured' };
    }

    // Preprocess text for natural speech (minimal cleanup only)
    const processedText = this.preprocessNarrationForTTS(cleanedText);
    console.log('[TTS] Text preprocessing complete');
    console.log('[TTS] Text changed?:', cleanedText !== processedText);

    // RECOMMENDED VOICES FOR HEALTH/WELLNESS:
    // - Rachel (21m00Tcm4TlvDq8ikWAM) - Warm, calm, American female - BEST for wellness
    // - Sarah (EXAVITQu4vr4xnSDxMaL) - Soft, friendly female
    // - Charlotte (XB0fDUnXU5powFXDhCwa) - Warm British female
    // - Matilda (XrExE9yKIg1WjnnlVkGX) - Warm, friendly female
    // - Thomas (GBv7mTt0atIp3Br8iCZE) - Calm, professional male
    const selectedVoiceId = (resolvedVoiceId?.startsWith('cloned:') ? undefined : resolvedVoiceId) || '21m00Tcm4TlvDq8ikWAM'; // Rachel - best for wellness

    // IMPROVED VOICE SETTINGS for natural sound:
    const voiceSettings = {
      stability: options?.stability ?? 0.50,        // Lower = more expressive/natural
      similarity_boost: options?.similarityBoost ?? 0.75,
      style: options?.style ?? 0.40,                // Higher = more emotional delivery
      use_speaker_boost: true,                       // Improves clarity
    };

    try {
      console.log(`[UniversalVideoService] Generating voiceover with voice: ${selectedVoiceId}`);
      console.log(`[UniversalVideoService] Voice settings:`, voiceSettings);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenLabsKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: processedText,
            // USE THE BEST MODEL - eleven_multilingual_v2 is highest quality
            model_id: "eleven_multilingual_v2",
            voice_settings: voiceSettings,
          }),
        }
      );

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(audioBuffer);
        
        const wordCount = text.split(/\s+/).length;
        const estimatedDuration = Math.ceil(wordCount / 2.5);
        
        const fileName = `voiceover_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
        const s3Url = await this.uploadToS3(buffer, fileName, 'audio/mpeg');
        
        if (s3Url) {
          console.log(`[UniversalVideoService] Voiceover uploaded to S3: ${s3Url} (${estimatedDuration}s)`);
          return {
            url: s3Url,
            duration: estimatedDuration,
            success: true,
          };
        } else {
          console.warn('[UniversalVideoService] S3 upload failed, using base64 fallback');
          const base64Audio = buffer.toString("base64");
          const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
          return {
            url: audioUrl,
            duration: estimatedDuration,
            success: true,
          };
        }
      } else {
        const errorText = await response.text();
        console.error(`[UniversalVideoService] ElevenLabs error: ${response.status}`, errorText);

        this.addNotification({
          type: 'error',
          service: 'ElevenLabs',
          message: `Voiceover generation failed: ${response.status} - ${errorText.substring(0, 100)}`,
        });

        return {
          url: '',
          duration: 0,
          success: false,
          error: `API error: ${response.status}`,
        };
      }
    } catch (e: any) {
      console.error("[UniversalVideoService] ElevenLabs error:", e);
      
      this.addNotification({
        type: 'error',
        service: 'ElevenLabs',
        message: `Voiceover generation failed: ${e.message || e}`,
      });

      return { url: '', duration: 0, success: false, error: e.message || 'Unknown error' };
    }
  }

  /**
   * Play.ht voiceover generation path.
   * Fetches audio from the Play.ht CDN URL and re-uploads to S3 so the rest
   * of the pipeline always gets an S3-backed (or base64) URL — no Play.ht CDN
   * dependencies downstream.
   */
  private async generateVoiceoverPlayHT(
    text: string,
    voiceId?: string,
    options?: { speed?: number; temperature?: number },
  ): Promise<VoiceoverResult> {
    if (!playHTClient.isAvailable()) {
      this.addNotification({
        type: 'error',
        service: 'Play.ht',
        message: 'PLAYHT_API_KEY or PLAYHT_USER_ID not configured — voiceover unavailable',
      });
      return { url: '', duration: 0, success: false, error: 'Play.ht not configured' };
    }

    const processedText = this.preprocessNarrationForTTS(text);

    let resolvedVoiceId: string | undefined;
    try {
      resolvedVoiceId = await playHTClient.resolveVoiceId(voiceId);
    } catch (err: any) {
      console.error('[Play.ht] Voice ID resolution failed:', err.message);
      this.addNotification({
        type: 'error',
        service: 'Play.ht',
        message: `Voice ID resolution failed: ${err.message}`,
      });
      return { url: '', duration: 0, success: false, error: err.message };
    }

    const ttsResult = await playHTClient.generateSpeech({
      text: processedText,
      voice: resolvedVoiceId,
      speed: (options as any)?.speed,
      temperature: (options as any)?.temperature,
    });

    if (!ttsResult.success || !ttsResult.audioUrl) {
      this.addNotification({
        type: 'error',
        service: 'Play.ht',
        message: `TTS failed: ${ttsResult.error || 'unknown error'}`,
      });
      return { url: '', duration: 0, success: false, error: ttsResult.error };
    }

    try {
      const audioResponse = await fetch(ttsResult.audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download Play.ht audio (${audioResponse.status})`);
      }
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / 2.5);

      const fileName = `voiceover_playht_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
      const s3Url = await this.uploadToS3(audioBuffer, fileName, 'audio/mpeg');

      if (s3Url) {
        console.log(`[Play.ht] Voiceover uploaded to S3: ${s3Url} (${estimatedDuration}s)`);
        return { url: s3Url, duration: estimatedDuration, success: true };
      }

      const base64Audio = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      return { url: base64Audio, duration: estimatedDuration, success: true };
    } catch (err: any) {
      console.error('[Play.ht] Audio download/upload error:', err);
      this.addNotification({
        type: 'error',
        service: 'Play.ht',
        message: `Audio download failed: ${err.message}`,
      });
      return { url: '', duration: 0, success: false, error: err.message };
    }
  }

  async generateSceneVoiceover(
    narration: string,
    voiceId?: string,
    options?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      provider?: string;
    },
    context?: { userId?: string },
  ): Promise<VoiceoverResult> {
    // Play.ht does not expose word-level timestamps; fall back to the standard
    // generateVoiceoverPlayHT path (Whisper will add timestamps if needed).
    if (options?.provider === 'playht') {
      return this.generateVoiceoverPlayHT(narration, voiceId, options);
    }

    // Extract inline @voice:<id> tag from narration text if present.
    const { voiceId: inlineVoiceId, narration: cleanNarration } = this.parseVoiceFromNarration(narration);
    const resolvedVoiceId = inlineVoiceId || voiceId;

    // Route cloned voices through Play.ht (no ElevenLabs key needed).
    // Return the result directly — success or a descriptive error — never fall through to
    // ElevenLabs with a different voice when the user explicitly selected a cloned voice.
    if (resolvedVoiceId?.startsWith('cloned:')) {
      return this.generateVoiceoverForClonedVoice(cleanNarration, resolvedVoiceId, undefined, options, context?.userId);
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) {
      return { url: '', duration: 0, success: false, error: 'ELEVENLABS_API_KEY not configured' };
    }

    const processedText = this.preprocessNarrationForTTS(cleanNarration);
    const selectedVoiceId = (resolvedVoiceId?.startsWith('cloned:') ? undefined : resolvedVoiceId) || '21m00Tcm4TlvDq8ikWAM';
    const voiceSettings = {
      stability: options?.stability ?? 0.65,
      similarity_boost: options?.similarityBoost ?? 0.75,
      style: options?.style ?? 0.35,
      use_speaker_boost: true,
    };

    try {
      console.log(`[PerSceneVoiceover] Generating with timestamps for: "${processedText.substring(0, 60)}..."`);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': elevenLabsKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: processedText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: voiceSettings,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[PerSceneVoiceover] ElevenLabs with-timestamps error: ${response.status}`, errText);
        console.log('[PerSceneVoiceover] Falling back to standard voiceover generation...');
        return this.generateVoiceover(narration, voiceId, options, context);
      }

      const result = await response.json();

      const audioBase64 = result.audio_base64;
      const alignment = result.alignment || result.normalized_alignment;

      if (!audioBase64) {
        console.error('[PerSceneVoiceover] No audio_base64 in response');
        return this.generateVoiceover(narration, voiceId, options, context);
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');

      let actualDuration = 0;
      try {
        const mm = await import('music-metadata');
        const metadata = await mm.parseBuffer(audioBuffer, { mimeType: 'audio/mpeg' });
        actualDuration = metadata.format.duration || 0;
        console.log(`[PerSceneVoiceover] Actual audio duration: ${actualDuration.toFixed(2)}s`);
      } catch {
        const wordCount = narration.trim().split(/\s+/).length;
        actualDuration = Math.ceil(wordCount / 2.5);
        console.log(`[PerSceneVoiceover] Estimated duration: ${actualDuration}s (metadata parse failed)`);
      }

      let words: Array<{ word: string; start: number; end: number }> = [];

      if (alignment?.characters && alignment?.character_start_times_seconds && alignment?.character_end_times_seconds) {
        words = this.parseCharacterAlignmentToWords(
          alignment.characters,
          alignment.character_start_times_seconds,
          alignment.character_end_times_seconds
        );
        console.log(`[PerSceneVoiceover] Parsed ${words.length} words from ElevenLabs alignment`);
      }
      
      if (words.length === 0) {
        console.log('[PerSceneVoiceover] No alignment data from ElevenLabs, attempting Whisper fallback...');
        words = await this.getWordTimestampsFromWhisper(audioBuffer);
      }

      const fileName = `voiceover_${Date.now()}_scene_${Math.random().toString(36).substring(7)}.mp3`;
      const s3Url = await this.uploadToS3(audioBuffer, fileName, 'audio/mpeg');

      if (s3Url) {
        console.log(`[PerSceneVoiceover] Uploaded to S3: ${s3Url.substring(0, 80)}... (${actualDuration.toFixed(1)}s, ${words.length} words)`);
        return { url: s3Url, duration: actualDuration, success: true, words };
      } else {
        const base64Audio = `data:audio/mpeg;base64,${audioBase64}`;
        return { url: base64Audio, duration: actualDuration, success: true, words };
      }
    } catch (e: any) {
      console.error('[PerSceneVoiceover] Error:', e);
      return this.generateVoiceover(narration, voiceId, options, context);
    }
  }

  private parseCharacterAlignmentToWords(
    characters: string[],
    startTimes: number[],
    endTimes: number[]
  ): Array<{ word: string; start: number; end: number }> {
    const words: Array<{ word: string; start: number; end: number }> = [];
    let currentWord = '';
    let wordStart = 0;
    let wordEnd = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const charStart = startTimes[i];
      const charEnd = endTimes[i];

      if (char === ' ' || char === '\n' || char === '\t') {
        if (currentWord.length > 0) {
          words.push({ word: currentWord, start: wordStart, end: wordEnd });
          currentWord = '';
        }
      } else {
        if (currentWord.length === 0) {
          wordStart = charStart;
        }
        currentWord += char;
        wordEnd = charEnd;
      }
    }

    if (currentWord.length > 0) {
      words.push({ word: currentWord, start: wordStart, end: wordEnd });
    }

    return words;
  }

  private async getWordTimestampsFromWhisper(
    audioBuffer: Buffer
  ): Promise<Array<{ word: string; start: number; end: number }>> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.log('[Whisper] OPENAI_API_KEY not configured, skipping word timestamps');
      return [];
    }

    try {
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (!response.ok) {
        console.error(`[Whisper] Transcription failed: ${response.status}`);
        return [];
      }

      const data = await response.json() as any;
      const words = (data.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }));
      console.log(`[Whisper] Got ${words.length} word timestamps`);
      return words;
    } catch (e: any) {
      console.error('[Whisper] Error:', e.message);
      return [];
    }
  }

  private buildVideoSearchQuery(scene: Scene, targetAudience?: string): string {
    // PRIORITY 1: Use AI-generated optimized search query if available
    if (scene.searchQuery && scene.searchQuery.trim()) {
      console.log(`[VideoSearch] Using AI-generated searchQuery: "${scene.searchQuery}"`);
      return scene.searchQuery.trim();
    }
    
    const narration = (scene.narration || '').toLowerCase();
    const visualDirection = (scene.visualDirection || scene.background?.source || '').toLowerCase();
    
    // Detect subject type from visual direction - supports pets, humans, products
    const petIndicators = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'animal', 'golden retriever', 'horse'];
    const hasPetSubject = petIndicators.some(ind => visualDirection.includes(ind));
    
    // For pets - use pet-specific search terms
    if (hasPetSubject) {
      console.log('[VideoSearch] Pet/animal subject detected');
      // Extract the specific pet type for better search results
      for (const pet of petIndicators) {
        if (visualDirection.includes(pet)) {
          return `${pet} happy healthy pet animal`;
        }
      }
      return 'happy pet animal wellness';
    }
    
    // Get demographic prefix based on target audience OR visual direction
    let demographicTerms = '';
    
    // First, check visual direction for explicit demographics (user's custom prompt takes priority)
    // Support multiple age formats: "50-year-old", "late 40s", "early 50s", "in her 40s", etc.
    const ageMatch = visualDirection.match(/(\d{2})[- ]?(year[- ]?old|years old|yo)/);
    const ageRangeMatch = visualDirection.match(/(late|early|mid)?\s*(\d{2})s/);
    
    let detectedAge = 0;
    if (ageMatch) {
      detectedAge = parseInt(ageMatch[1]);
    } else if (ageRangeMatch) {
      const decade = parseInt(ageRangeMatch[2]);
      const modifier = ageRangeMatch[1];
      if (modifier === 'late') detectedAge = decade + 7;
      else if (modifier === 'early') detectedAge = decade + 2;
      else detectedAge = decade + 5;
      console.log(`[VideoSearch] Detected age range "${ageRangeMatch[0]}" → age ${detectedAge}`);
    }
    
    if (detectedAge >= 40 && detectedAge < 60) {
      demographicTerms = 'mature middle-aged ';
      console.log(`[VideoSearch] Age ${detectedAge} from prompt: mature middle-aged`);
    } else if (detectedAge >= 60) {
      demographicTerms = 'senior mature elderly ';
      console.log(`[VideoSearch] Age ${detectedAge} from prompt: senior`);
    } else if (detectedAge >= 20 && detectedAge < 40) {
      demographicTerms = 'young adult ';
      console.log(`[VideoSearch] Age ${detectedAge} from prompt: young adult`);
    }
    
    // Check visual direction for gender (user's custom prompt takes priority)
    const femaleIndicators = [' she ', ' her ', 'woman', 'female', 'lady', 'mother', 'wife', 'grandmother'];
    const maleIndicators = [' he ', ' his ', ' man ', 'male', 'father', 'husband', 'grandfather', 'guy'];
    
    if (femaleIndicators.some(ind => visualDirection.includes(ind))) {
      demographicTerms += 'woman female ';
      console.log('[VideoSearch] Female subject from prompt');
    } else if (maleIndicators.some(ind => visualDirection.includes(ind))) {
      demographicTerms += 'man male ';
      console.log('[VideoSearch] Male subject from prompt');
    }
    
    // Fall back to target audience only if visual direction didn't specify
    if (!demographicTerms && targetAudience) {
      const audience = targetAudience.toLowerCase();
      
      // Age-based keywords
      if (audience.includes('40') || audience.includes('50') || audience.includes('60') || 
          audience.includes('mature') || audience.includes('middle') || audience.includes('menopause')) {
        demographicTerms = 'mature middle-aged adult ';
      } else if (audience.includes('senior') || audience.includes('elderly') || audience.includes('65+') || audience.includes('70')) {
        demographicTerms = 'senior elderly older adult ';
      } else if (audience.includes('young') || audience.includes('20') || audience.includes('millennial')) {
        demographicTerms = 'young adult ';
      }
      
      // Gender-based keywords
      if (audience.includes('women') || audience.includes('female') || audience.includes('woman')) {
        demographicTerms += 'woman female ';
      } else if (audience.includes('men') || audience.includes('male') || audience.includes('man')) {
        demographicTerms += 'man male ';
      }
    }
    
    // Extract activity keywords from visual direction
    let activityKeywords = '';
    if (visualDirection.includes('yoga')) activityKeywords = 'yoga meditation ';
    else if (visualDirection.includes('meditation')) activityKeywords = 'meditation mindfulness ';
    else if (visualDirection.includes('exercise') || visualDirection.includes('workout')) activityKeywords = 'exercise fitness workout ';
    else if (visualDirection.includes('nature') || visualDirection.includes('outdoor')) activityKeywords = 'nature outdoor peaceful ';
    else if (visualDirection.includes('kitchen') || visualDirection.includes('cooking')) activityKeywords = 'kitchen cooking healthy ';
    else if (visualDirection.includes('sleep') || visualDirection.includes('bed')) activityKeywords = 'sleep bedroom peaceful ';
    
    // Health/wellness specific keywords WITH demographics
    if (narration.includes('menopause')) return `${demographicTerms}${activityKeywords}wellness relaxation health`;
    if (narration.includes('hot flash')) return `${demographicTerms}${activityKeywords}cooling relief comfort relaxed`;
    if (narration.includes('sleep') || narration.includes('restful')) return `${demographicTerms}${activityKeywords || 'peaceful sleep relaxation bedroom'}`;
    if (narration.includes('energy') || narration.includes('vitality')) return `${demographicTerms}${activityKeywords || 'active healthy lifestyle energetic'}`;
    if (narration.includes('hormone')) return `${demographicTerms}${activityKeywords}wellness nature botanical healthy`;
    if (narration.includes('natural') || narration.includes('herbal')) return `${demographicTerms}${activityKeywords}herbs botanical plants nature`;
    if (narration.includes('relief') || narration.includes('comfort')) return `${demographicTerms}${activityKeywords}relaxed peaceful happy comfortable`;
    if (narration.includes('stress') || narration.includes('anxiety')) return `${demographicTerms}${activityKeywords || 'calm meditation relaxation peaceful'}`;
    
    // Scene type defaults WITH demographics and activity
    const defaults: Record<string, string> = {
      hook: `${demographicTerms}${activityKeywords}concerned thinking wellness health`,
      benefit: `${demographicTerms}${activityKeywords}happy smiling healthy lifestyle`,
      testimonial: `${demographicTerms}${activityKeywords}satisfied happy smiling portrait`,
      story: `${demographicTerms}${activityKeywords}transformation journey wellness`,
      intro: `${demographicTerms}${activityKeywords}wellness morning routine healthy`,
      cta: `${demographicTerms}${activityKeywords}confident smiling action positive`,
      feature: `${demographicTerms}${activityKeywords}healthy lifestyle wellness`,
      explanation: `${demographicTerms}${activityKeywords}learning understanding wellness`,
    };
    
    return defaults[scene.type] || `${demographicTerms}${activityKeywords}wellness healthy lifestyle`;
  }

  /**
   * FIX 1: Get product overlay position based on scene type
   * Places products in corners to avoid blocking faces in B-roll
   */
  private getProductOverlayPosition(sceneType: string): {
    x: 'left' | 'center' | 'right';
    y: 'top' | 'center' | 'bottom';
    scale: number;
    animation: 'fade' | 'zoom' | 'slide' | 'none';
  } {
    console.log(`[ProductPosition] Getting position for scene type: ${sceneType}`);
    switch (sceneType) {
      case 'hook':
        return { x: 'right', y: 'bottom', scale: 0.25, animation: 'fade' };
      case 'intro':
        return { x: 'center', y: 'center', scale: 0.45, animation: 'zoom' };
      case 'feature':
        return { x: 'left', y: 'bottom', scale: 0.30, animation: 'slide' };
      case 'benefit':
        return { x: 'right', y: 'bottom', scale: 0.25, animation: 'fade' };
      case 'cta':
        return { x: 'center', y: 'center', scale: 0.50, animation: 'zoom' };
      case 'testimonial':
        return { x: 'left', y: 'bottom', scale: 0.20, animation: 'fade' };
      default:
        return { x: 'right', y: 'bottom', scale: 0.25, animation: 'fade' };
    }
  }

  /**
   * FIX 2: Determine whether to use video or image for a scene
   * Returns false (use image) for scenes where AI image quality is better than random B-roll
   * Respects project-level mediaMode setting from user's Image/Video selection
   */
  private shouldUseVideoBackground(
    scene: Scene,
    videoResult: { url: string; tags?: string; description?: string } | null,
    targetAudience?: string,
    qualityTier?: 'ultra' | 'premium' | 'standard',
    mediaMode?: 'image' | 'video'
  ): boolean {
    // Only use video when user explicitly selected VIDEO mode
    if (mediaMode === 'video') {
      if (!videoResult || !videoResult.url) {
        console.log(`[Background] Scene ${scene.id}: User selected VIDEO mode but no video yet - will generate`);
        return true;
      }
      
      if (targetAudience) {
        const isWomensProduct = targetAudience.toLowerCase().includes('women') || 
                                targetAudience.toLowerCase().includes('female');
        
        if (isWomensProduct && videoResult.tags) {
          const tags = videoResult.tags.toLowerCase();
          if (tags.includes('man') || tags.includes('male') || tags.includes('boy')) {
            console.log(`[Background] Scene ${scene.id}: Rejected video - wrong gender for women's product`);
            return false;
          }
        }
      }
      
      console.log(`[Background] Scene ${scene.id}: User selected VIDEO mode - using video`);
      return true;
    }
    
    // Default to image mode for all other cases (undefined mediaMode or explicit 'image')
    console.log(`[Background] Scene ${scene.id}: IMAGE mode (${mediaMode || 'default'}) - using image`);
    return false;
  }

  /**
   * FIX 3: Validate that video content matches target audience
   */
  private validateVideoForAudience(
    video: { tags?: string; description?: string; url: string; title?: string; user?: string },
    targetAudience: string
  ): boolean {
    const audience = targetAudience.toLowerCase();
    const tags = (video.tags || '').toLowerCase();
    const desc = (video.description || '').toLowerCase();
    const title = ((video as any).title || '').toLowerCase();
    const user = ((video as any).user || '').toLowerCase();
    const combined = ` ${tags} ${desc} ${title} ${user} `;
    
    // ALWAYS reject children/teens for adult products (40s/50s/mature/senior)
    const isAdultProduct = audience.includes('40') || audience.includes('50') || audience.includes('60') ||
                           audience.includes('mature') || audience.includes('senior') || audience.includes('menopause');
    if (isAdultProduct) {
      const childPatterns = ['child', 'kid', 'teen', 'teenager', 'baby', 'infant', 'toddler', 'young girl', 'young boy', 'little'];
      for (const pattern of childPatterns) {
        if (combined.includes(pattern)) {
          console.log(`[Validation] REJECTED: Child indicator "${pattern}" found for adult product`);
          return false;
        }
      }
    }
    
    // Check if targeting women/female audience
    const isWomensProduct = audience.includes('women') || audience.includes('female') || 
                            audience.includes('woman') || audience.includes('menopause');
    
    if (isWomensProduct) {
      // STRICT: Reject any male indicators
      const malePatterns = [
        ' man ', ' men ', ' male ', ' boy ', ' boys ', ' guy ', ' guys ',
        'businessman', 'father', 'husband', 'grandfather', 'brother',
        ' his ', ' him ', ' he '
      ];
      
      for (const pattern of malePatterns) {
        if (combined.includes(pattern)) {
          console.log(`[Validation] REJECTED: Male indicator "${pattern.trim()}" found for women's product`);
          return false;
        }
      }
      
      // Check for positive female indicators
      const femaleIndicators = ['woman', 'women', 'female', 'lady', 'ladies', 'girl', 'mother', 'wife', 'grandmother', ' she ', ' her '];
      const hasFemaleIndicator = femaleIndicators.some(ind => combined.includes(ind));
      
      // Check for neutral/abstract content that's acceptable
      const neutralPatterns = ['nature', 'botanical', 'herb', 'plant', 'flower', 'sunset', 'sunrise', 
                               'ocean', 'water', 'sky', 'landscape', 'abstract', 'meditation', 'yoga',
                               'wellness', 'health', 'peaceful', 'calm', 'relax', 'sleep', 'bedroom',
                               'kitchen', 'food', 'cooking', 'tea', 'supplement', 'vitamin'];
      const isNeutralContent = neutralPatterns.some(p => combined.includes(p));
      
      // Only allow if has female indicator OR is clearly neutral/abstract content
      if (!hasFemaleIndicator && !isNeutralContent) {
        console.log(`[Validation] REJECTED: No female indicators and not neutral content for women's product`);
        return false;
      }
      
      if (hasFemaleIndicator) {
        console.log(`[Validation] APPROVED: Female indicator found`);
      } else if (isNeutralContent) {
        console.log(`[Validation] APPROVED: Neutral/abstract content acceptable`);
      }
    }
    
    // Check if targeting men/male audience
    const isMensProduct = audience.includes('men') || audience.includes('male') || audience.includes('man');
    if (isMensProduct && !isWomensProduct) {
      const femalePatterns = [' woman ', ' women ', ' female ', ' girl ', ' lady ', ' ladies '];
      for (const pattern of femalePatterns) {
        if (combined.includes(pattern)) {
          console.log(`[Validation] REJECTED: Female indicator for men's product`);
          return false;
        }
      }
    }
    
    // Age validation for mature audiences
    if (audience.includes('40') || audience.includes('50') || audience.includes('mature') ||
        audience.includes('menopause') || audience.includes('senior')) {
      if (combined.includes('child') || combined.includes('kid') || 
          combined.includes('teen') || combined.includes('baby') || combined.includes('young adult')) {
        console.log(`[Validation] REJECTED: Youth content for mature audience`);
        return false;
      }
    }
    
    return true;
  }

  private resetUsedVideos(): void {
    this.usedVideoUrls.clear();
    console.log('[UniversalVideoService] Reset used videos tracker');
  }

  async getStockVideo(
    query: string,
    targetAudience?: string,
    fallbackQuery?: string
  ): Promise<{ url: string; duration: number; source: string; tags?: string } | null> {
    console.log(`[StockVideo] Searching: "${query}" (${this.usedVideoUrls.size} already used)`);
    
    // Try Pexels - get multiple results
    const pexelsResult = await this.getPexelsVideo(query);
    if (pexelsResult) {
      // Check if already used
      if (this.usedVideoUrls.has(pexelsResult.url)) {
        console.log(`[StockVideo] Pexels result already used, trying fallback query...`);
        // Try with fallback query first, then modified query
        const altQuery = fallbackQuery || (query + ' lifestyle');
        const altResult = await this.getPexelsVideo(altQuery);
        if (altResult && !this.usedVideoUrls.has(altResult.url)) {
          if (!targetAudience || this.validateVideoForAudience(altResult, targetAudience)) {
            this.usedVideoUrls.add(altResult.url);
            return altResult;
          }
        }
      } else {
        // Validate and use
        if (!targetAudience || this.validateVideoForAudience(pexelsResult, targetAudience)) {
          this.usedVideoUrls.add(pexelsResult.url);
          return pexelsResult;
        }
      }
    }
    
    // PRIORITY 2: Try fallback query if primary failed
    if (fallbackQuery && fallbackQuery !== query) {
      console.log(`[StockVideo] Trying fallback query: "${fallbackQuery}"`);
      const fallbackResult = await this.getPexelsVideo(fallbackQuery);
      if (fallbackResult && !this.usedVideoUrls.has(fallbackResult.url)) {
        if (!targetAudience || this.validateVideoForAudience(fallbackResult, targetAudience)) {
          this.usedVideoUrls.add(fallbackResult.url);
          return fallbackResult;
        }
      }
    }

    // Try Pixabay as fallback
    const pixabayResult = await this.getPixabayVideo(query);
    if (pixabayResult && !this.usedVideoUrls.has(pixabayResult.url)) {
      if (!targetAudience || this.validateVideoForAudience(pixabayResult, targetAudience)) {
        this.usedVideoUrls.add(pixabayResult.url);
        return pixabayResult;
      }
    }

    console.log(`[StockVideo] No unused valid videos found for: "${query}"`);
    return null;
  }

  private async getPexelsVideo(query: string): Promise<{ url: string; duration: number; source: string; tags?: string; description?: string; title?: string; user?: string } | null> {
    const pexelsKey = process.env.PEXELS_API_KEY;
    if (!pexelsKey) {
      console.log('[UniversalVideoService] No PEXELS_API_KEY configured');
      return null;
    }

    // Use official Pexels client library for proper video API access
    const { createClient } = await import('pexels');
    const client = createClient(pexelsKey);

    // Try multiple search strategies - but avoid generic fallbacks that return animals
    const searchQueries = [query];
    const words = query.split(' ');
    
    // Add a shortened version of the query
    if (words.length > 2) {
      searchQueries.push(words.slice(0, 2).join(' '));
    }
    
    // Determine fallback queries based on content type (avoid animals for human-focused content)
    const queryLower = query.toLowerCase();
    const isHumanFocused = ['woman', 'man', 'person', 'people', 'adult', 'mature', 'yoga', 'exercise', 'meditation'].some(w => queryLower.includes(w));
    
    if (isHumanFocused) {
      // Human-focused fallbacks - specifically search for human activities
      searchQueries.push('woman wellness lifestyle');
      searchQueries.push('mature adult relaxation');
      searchQueries.push('meditation peaceful woman');
    } else if (queryLower.includes('botanical') || queryLower.includes('herb') || queryLower.includes('plant')) {
      // Plant-focused fallbacks
      searchQueries.push('botanical garden plants');
      searchQueries.push('herbal medicine natural');
      searchQueries.push('green leaves nature');
    } else {
      // Generic but safer fallbacks (no random animals)
      searchQueries.push('peaceful scenery');
      searchQueries.push('calm sunset landscape');
      searchQueries.push('serene nature background');
    }

    for (const searchQuery of searchQueries) {
      try {
        console.log(`[UniversalVideoService] Pexels video search (official client): "${searchQuery}"`);
        
        const result = await client.videos.search({ 
          query: searchQuery, 
          per_page: 5, 
          orientation: 'landscape' 
        });

        // Type guard for error response
        if ('error' in result) {
          console.warn(`[UniversalVideoService] Pexels API error: ${result.error}`);
          continue;
        }

        const videos = result.videos;
        console.log(`[UniversalVideoService] Pexels returned ${videos?.length || 0} videos for "${searchQuery}"`);

        if (videos && videos.length > 0) {
          for (const video of videos) {
            const hdFile = video.video_files?.find((f: any) => f.quality === 'hd') || video.video_files?.[0];
            if (hdFile?.link && video.duration >= 5 && video.duration <= 60) {
              console.log(`[UniversalVideoService] Selected Pexels video: ${hdFile.link} (${video.duration}s)`);
              return { 
                url: hdFile.link, 
                duration: video.duration, 
                source: 'pexels',
                tags: searchQuery,
                description: searchQuery,
                user: (video as any).user?.name || ''
              };
            }
          }
          const firstVideo = videos[0];
          const hdFile = firstVideo.video_files?.find((f: any) => f.quality === 'hd') || firstVideo.video_files?.[0];
          if (hdFile?.link) {
            return { 
              url: hdFile.link, 
              duration: firstVideo.duration, 
              source: 'pexels',
              tags: searchQuery,
              description: searchQuery,
              user: (firstVideo as any).user?.name || ''
            };
          }
        }
      } catch (e: any) {
        console.warn(`[UniversalVideoService] Pexels error: ${e.message}`);
      }
    }
    return null;
  }

  private async getPixabayVideo(query: string): Promise<{ url: string; duration: number; source: string; tags?: string; description?: string; title?: string; user?: string } | null> {
    const pixabayKey = process.env.PIXABAY_API_KEY;
    if (!pixabayKey) {
      console.log('[UniversalVideoService] No PIXABAY_API_KEY configured for video fallback');
      return null;
    }

    // Build fallback queries that avoid random animal videos
    const queryLower = query.toLowerCase();
    const isHumanFocused = ['woman', 'man', 'person', 'people', 'adult', 'yoga'].some(w => queryLower.includes(w));
    
    const searchQueries = [query];
    if (isHumanFocused) {
      searchQueries.push('woman wellness');
      searchQueries.push('peaceful relaxation');
    } else {
      searchQueries.push('nature landscape');
      searchQueries.push('peaceful scenery');
    }
    
    for (const searchQuery of searchQueries) {
      try {
        const url = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(searchQuery)}&per_page=5`;
        console.log(`[UniversalVideoService] Pixabay video search: "${searchQuery}"`);
        
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[UniversalVideoService] Pixabay API error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        if (data.hits && data.hits.length > 0) {
          console.log(`[UniversalVideoService] Pixabay found ${data.hits.length} videos`);
          for (const video of data.hits) {
            const videoFile = video.videos?.large || video.videos?.medium || video.videos?.small;
            if (videoFile?.url && video.duration >= 5 && video.duration <= 60) {
              console.log(`[UniversalVideoService] Selected Pixabay video: ${videoFile.url} (${video.duration}s)`);
              return { 
                url: videoFile.url, 
                duration: video.duration, 
                source: 'pixabay',
                tags: video.tags || searchQuery,
                description: video.tags || searchQuery,
                user: video.user || ''
              };
            }
          }
          const firstVideo = data.hits[0];
          const videoFile = firstVideo.videos?.large || firstVideo.videos?.medium || firstVideo.videos?.small;
          if (videoFile?.url) {
            return { 
              url: videoFile.url, 
              duration: firstVideo.duration, 
              source: 'pixabay',
              tags: firstVideo.tags || searchQuery,
              description: firstVideo.tags || searchQuery,
              user: firstVideo.user || ''
            };
          }
        }
      } catch (e: any) {
        console.warn(`[UniversalVideoService] Pixabay error: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * Generate background music using ElevenLabs Music API
   * Uses the same ELEVENLABS_API_KEY as voiceover generation
   */
  async generateBackgroundMusic(
    duration: number,
    style: string = 'professional',
    productName?: string
  ): Promise<{ url: string; duration: number; source: string } | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.warn('[UniversalVideoService] No ELEVENLABS_API_KEY for music generation');
      this.addNotification({
        type: 'warning',
        service: 'Music',
        message: 'ElevenLabs API key required for music generation',
      });
      return null;
    }

    const musicPrompt = this.buildMusicPrompt(style, productName, duration);
    
    // Ensure duration is within API limits (10s - 5min)
    const durationMs = Math.max(10000, Math.min(duration * 1000, 300000));
    
    console.log(`[UniversalVideoService] Generating ElevenLabs music: "${musicPrompt.substring(0, 80)}..." (${duration}s)`);

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/music/compose', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: musicPrompt,
          duration_ms: durationMs,
          instrumental: true,
          output_format: 'mp3_44100_128',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[UniversalVideoService] ElevenLabs Music API error:', response.status, errorText);
        
        if (response.status === 401) {
          this.addNotification({
            type: 'error',
            service: 'Music',
            message: 'ElevenLabs API key invalid or expired',
          });
        } else if (response.status === 402) {
          this.addNotification({
            type: 'error',
            service: 'Music',
            message: 'Insufficient ElevenLabs credits for music generation',
          });
        }
        return null;
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      
      // Upload to S3 for Lambda access
      const s3Url = await this.uploadToS3(
        Buffer.from(audioBuffer),
        `music-${Date.now()}.mp3`,
        'audio/mpeg'
      );

      if (s3Url) {
        console.log(`[UniversalVideoService] Music generated and uploaded to S3: ${s3Url}`);
        return {
          url: s3Url,
          duration: duration,
          source: 'elevenlabs-music',
        };
      }

      // Fallback: return as data URL (works for local preview only)
      console.warn('[UniversalVideoService] S3 upload failed, using data URL (local preview only)');
      return {
        url: `data:audio/mpeg;base64,${base64Audio}`,
        duration: duration,
        source: 'elevenlabs-music',
      };

    } catch (error: any) {
      console.error('[UniversalVideoService] Music generation error:', error.message);
      this.addNotification({
        type: 'error',
        service: 'Music',
        message: `Music generation failed: ${error.message}`,
      });
      return null;
    }
  }

  /**
   * FIX 5: Build an effective music prompt - ALWAYS UPLIFTING for health products
   */
  private buildMusicPrompt(style: string, productName?: string, duration?: number): string {
    // FIX 5: All health products MUST have uplifting, hopeful music
    const stylePrompts: Record<string, string> = {
      professional: 
        'Uplifting inspiring corporate background music, positive hopeful energy, ' +
        'gentle piano and warm strings, encouraging and optimistic tone',
      
      friendly: 
        'Warm uplifting acoustic background music, hopeful fingerpicked guitar, ' +
        'welcoming and positive, joyful gentle feeling',
      
      energetic: 
        'Upbeat motivational background music, inspiring positive sound, ' +
        'building hopeful energy, optimistic and dynamic, confident',
      
      calm: 
        'Peaceful uplifting ambient music, soft hopeful piano, ' +
        'serene and positive, calming but optimistic',
      
      documentary: 
        'Inspiring documentary background music, hopeful emotional strings, ' +
        'uplifting storytelling feel, positive journey',
      
      wellness: 
        'Uplifting wellness music, hopeful piano with warm ambient pads, ' +
        'nurturing and positive, healing optimistic atmosphere',
      
      health: 
        'Hopeful healthcare background music, uplifting and reassuring, ' +
        'positive gentle strings and piano, trustworthy optimistic tone',
    };

    console.log(`[Music] Building prompt for style: ${style}, product: ${productName}`);
    let prompt = stylePrompts[style] || stylePrompts.professional;

    // FIX 5: Product-specific prompts - ALL MUST BE UPLIFTING AND HOPEFUL
    if (productName) {
      const lowerName = productName.toLowerCase();
      
      if (lowerName.includes('menopause') || lowerName.includes('hormone') || lowerName.includes('women') || lowerName.includes('cohosh')) {
        prompt = 
          'Uplifting empowering women\'s wellness music, hopeful piano with warm positive strings, ' +
          'nurturing and inspiring, spa-like serenity with optimistic energy, ' +
          'celebrating strength and vitality, NOT sad or melancholic';
      } else if (lowerName.includes('sleep') || lowerName.includes('relax') || lowerName.includes('rest')) {
        prompt = 
          'Peaceful serene ambient music, soft gentle tempo with hopeful undertones, ' +
          'dreamy but positive, calming optimism, restful contentment';
      } else if (lowerName.includes('energy') || lowerName.includes('vitality') || lowerName.includes('boost')) {
        prompt = 
          'Uplifting energizing wellness music, bright and motivating, ' +
          'morning sunshine optimism, joyful acoustic guitar and light percussion';
      } else if (lowerName.includes('natural') || lowerName.includes('herbal') || lowerName.includes('botanical')) {
        prompt = 
          'Uplifting nature-inspired background music, hopeful acoustic instruments, ' +
          'fresh and positive, botanical garden joy, pure and optimistic';
      } else if (lowerName.includes('stress') || lowerName.includes('anxiety') || lowerName.includes('calm')) {
        prompt = 
          'Calming hopeful background music, steady positive tempo, ' +
          'gentle reassuring piano, peaceful optimism, NOT melancholic';
      }
      console.log(`[Music] Product-specific prompt applied for: ${productName}`);
    }

    // Add duration guidance for better pacing
    if (duration && duration <= 30) {
      prompt += ', short form, consistent energy throughout, no dramatic builds';
    } else if (duration && duration > 60 && duration <= 120) {
      prompt += ', subtle variations to maintain interest, gentle progression';
    } else if (duration && duration > 120) {
      prompt += ', gradual build with subtle variations, maintains interest over time, evolving texture';
    }

    // Always ensure it works as background under voiceover
    prompt += ', suitable as background music under spoken voiceover, not overpowering, subtle and supportive';

    return prompt;
  }

  /**
   * Infer appropriate music style from product name and video type
   */
  private inferMusicStyle(title: string, videoType: string): string {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('menopause') || 
        lowerTitle.includes('hormone') || 
        lowerTitle.includes('women') ||
        lowerTitle.includes('botanical') ||
        lowerTitle.includes('herbal') ||
        lowerTitle.includes('natural')) {
      return 'wellness';
    }
    
    if (lowerTitle.includes('sleep') || 
        lowerTitle.includes('relax') || 
        lowerTitle.includes('calm')) {
      return 'calm';
    }
    
    if (lowerTitle.includes('energy') || 
        lowerTitle.includes('vitality') || 
        lowerTitle.includes('boost')) {
      return 'energetic';
    }
    
    if (videoType === 'script-based' || videoType === 'documentary') {
      return 'documentary';
    }
    
    return 'wellness';
  }

  /**
   * Calculate scene duration based on voiceover text word count
   * Uses speaking rate of approximately 150 words per minute (2.5 words/second)
   * Adds buffer time for transitions and visual comprehension
   */
  calculateSceneDuration(voiceoverText: string, minDuration: number = 4, maxDuration: number = 15): number {
    if (!voiceoverText || voiceoverText.trim().length === 0) {
      return minDuration;
    }
    
    const words = voiceoverText.trim().split(/\s+/).length;
    const speakingRate = 2.5; // words per second (150 WPM)
    const bufferTime = 0.8; // extra time for transitions
    
    const baseDuration = (words / speakingRate) + bufferTime;
    
    // Clamp to min/max
    const duration = Math.max(minDuration, Math.min(maxDuration, Math.ceil(baseDuration)));
    
    console.log(`[UniversalVideoService] Scene duration: ${words} words → ${duration}s`);
    return duration;
  }

  async createProductVideoProject(input: ProductVideoInput): Promise<VideoProject> {
    const project = createEmptyVideoProject('product', input.productName, input.platform);
    project.description = input.productDescription;
    project.targetAudience = input.targetAudience;
    project.totalDuration = input.duration;
    
    // Set quality tier (defaults to premium)
    (project as any).qualityTier = input.qualityTier || 'premium';
    console.log(`[UniversalVideoService] Quality tier set to: ${(project as any).qualityTier}`);
    
    if (input.voiceId) {
      project.voiceId = input.voiceId;
      project.voiceName = input.voiceName;
      console.log(`[UniversalVideoService] Using voice: ${input.voiceName} (${input.voiceId})`);
    }
    
    if (input.productImages && input.productImages.length > 0) {
      project.assets.productImages = input.productImages;
      console.log(`[UniversalVideoService] Attached ${input.productImages.length} product images to project`);
    }

    project.progress.currentStep = 'script';
    project.progress.steps.script.status = 'in-progress';
    project.status = 'generating';

    try {
      const scenes = await this.generateProductScript(input);
      project.scenes = scenes;
      project.totalDuration = calculateTotalDuration(scenes);
      project.progress.steps.script.status = 'complete';
      project.progress.steps.script.progress = 100;
      project.progress.steps.script.message = `Generated ${scenes.length} scenes`;
      project.status = 'draft';
    } catch (error: any) {
      project.progress.steps.script.status = 'error';
      project.progress.steps.script.message = error.message;
      project.progress.errors.push(`Script generation failed: ${error.message}`);
      project.status = 'error';
    }

    project.updatedAt = new Date().toISOString();
    return project;
  }

  async generateProjectAssets(project: VideoProject, options?: { skipMusic?: boolean; onProgress?: (project: VideoProject) => Promise<void>; targetStep?: 'voiceover' | 'images' | 'videos' | 'music' | 'assembly' }): Promise<VideoProject> {
    const updatedProject = { ...project };
    const skipMusic = options?.skipMusic ?? false;
    const onProgress = options?.onProgress;
    const targetStep = options?.targetStep;
    
    if (!updatedProject.assets) {
      updatedProject.assets = { voiceover: { fullTrackUrl: '', duration: 0, perScene: [] }, music: { url: '', volume: 0.18, duration: 0 }, images: [], videos: [] } as any;
    }
    if (!updatedProject.assets.voiceover) {
      updatedProject.assets.voiceover = { fullTrackUrl: '', duration: 0, perScene: [] } as any;
    }
    if (!updatedProject.progress) {
      updatedProject.progress = {} as any;
    }
    if (!updatedProject.progress.steps || Object.keys(updatedProject.progress.steps).length === 0) {
      updatedProject.progress.steps = {
        voiceover: { status: 'pending', progress: 0, message: '' },
        images: { status: 'pending', progress: 0, message: '' },
        videos: { status: 'pending', progress: 0, message: '' },
        music: { status: 'pending', progress: 0, message: '' },
        assembly: { status: 'pending', progress: 0, message: '' },
      } as any;
    } else {
      const defaultStep = { status: 'pending', progress: 0, message: '' };
      const steps = updatedProject.progress.steps as any;
      if (!steps.voiceover) steps.voiceover = { ...defaultStep };
      if (!steps.images) steps.images = { ...defaultStep };
      if (!steps.videos) steps.videos = { ...defaultStep };
      if (!steps.music) steps.music = { ...defaultStep };
      if (!steps.assembly) steps.assembly = { ...defaultStep };
    }
    if (!updatedProject.progress.serviceFailures) {
      updatedProject.progress.serviceFailures = [];
    }
    if (!updatedProject.assets.images) {
      updatedProject.assets.images = [];
    }
    if (!updatedProject.assets.videos) {
      updatedProject.assets.videos = [];
    }
    
    const saveProgress = async () => {
      if (onProgress) {
        try {
          await onProgress(updatedProject);
        } catch (err: any) {
          console.warn('[Assets] Progress save failed:', err.message);
        }
      }
    };
    
    // Reset video tracking for new project
    this.resetUsedVideos();
    
    // LOAD BRAND BIBLE AT START
    console.log(`[Assets] Loading brand bible...`);
    let brandBible;
    try {
      brandBible = await brandBibleService.getBrandBible();
      console.log(`[Assets] Brand loaded: ${brandBible.brandName}, ${brandBible.assets.length} assets`);
    } catch (error: any) {
      console.warn(`[Assets] Brand bible load failed: ${error.message} - continuing without brand context`);
    }
    
    const shouldSkipStep = (stepName: string): boolean => {
      if (!targetStep) return false;
      const stepData = (updatedProject.progress.steps as any)[stepName];
      const isAlreadyDone = stepData?.status === 'complete' || stepData?.status === 'skipped';
      if (isAlreadyDone) {
        console.log(`[Assets] Step-by-step: Skipping already-completed step "${stepName}"`);
        return true;
      }
      return false;
    };

    updatedProject.progress.currentStep = 'voiceover';
    updatedProject.progress.overallPercent = 5;
    updatedProject.status = 'generating';

    if (shouldSkipStep('voiceover')) {
      console.log('[Assets] Voiceover already complete, skipping');
    } else {
    const existingVoiceoverUrl = updatedProject.assets?.voiceover?.fullTrackUrl;
    if (existingVoiceoverUrl && this.isValidHttpsUrl(existingVoiceoverUrl) && updatedProject.assets.voiceover.duration > 0) {
      console.log(`[Assets] Voiceover already exists: ${existingVoiceoverUrl.substring(0, 80)}... (${updatedProject.assets.voiceover.duration}s) — skipping generation`);
      updatedProject.progress.steps.voiceover.status = 'complete';
      updatedProject.progress.steps.voiceover.progress = 100;
    } else {
    updatedProject.progress.steps.voiceover.status = 'in-progress';
    await saveProgress();

    console.log('[PerSceneVoiceover] Generating voiceover per-scene with word-level timestamps...');
    const scenes = updatedProject.scenes || [];
    const perSceneResults: VoiceoverResult[] = [];
    let allSuccess = true;
    let firstError = '';

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const narration = scene.narration || '';
      if (!narration.trim()) {
        perSceneResults.push({ url: '', duration: 3, success: true, words: [] });
        console.log(`  Scene ${i} (${scene.type}): [empty narration] — skipping TTS`);
        continue;
      }

      updatedProject.progress.steps.voiceover.progress = Math.round((i / scenes.length) * 90);
      updatedProject.progress.steps.voiceover.message = `Generating scene ${i + 1}/${scenes.length}...`;
      await saveProgress();

      const voiceoverProvider = (project as any).voiceoverSettings?.provider;
      const result = await this.generateSceneVoiceover(narration, project.voiceId, { provider: voiceoverProvider }, { userId: (project as any).ownerId });
      perSceneResults.push(result);

      if (result.success) {
        console.log(`  Scene ${i} (${scene.type}): ${result.duration.toFixed(1)}s, ${(result.words || []).length} words, ${result.url.substring(0, 60)}...`);
      } else {
        console.error(`  Scene ${i} (${scene.type}): FAILED — ${result.error}`);
        allSuccess = false;
        if (!firstError) firstError = result.error || 'Unknown error';
      }
    }

    if (allSuccess || perSceneResults.some(r => r.success)) {
      updatedProject.assets.voiceover.perScene = [];
      let totalCalculatedDuration = 0;
      const SCENE_PADDING = 1.0;

      for (let i = 0; i < scenes.length; i++) {
        const result = perSceneResults[i];
        const scene = scenes[i];

        updatedProject.assets.voiceover.perScene.push({
          sceneId: scene.id,
          url: result.url,
          duration: result.duration,
          words: result.words || [],
        });

        scene.voiceoverUrl = result.url;
        scene.voiceoverDuration = result.duration;
        scene.voiceoverWords = result.words || [];

        const sceneDuration = Math.max(3, Math.ceil((result.duration + SCENE_PADDING) * 10) / 10);
        scene.duration = sceneDuration;
        scene.minDurationForVoiceover = sceneDuration;
        totalCalculatedDuration += sceneDuration;
        console.log(`  Scene ${i} (${scene.type}): duration set to ${sceneDuration}s (audio: ${result.duration.toFixed(1)}s + ${SCENE_PADDING}s padding)`);
      }

      updatedProject.totalDuration = totalCalculatedDuration;
      updatedProject.assets.voiceover.duration = totalCalculatedDuration;

      updatedProject.progress.steps.voiceover.status = 'complete';
      updatedProject.progress.steps.voiceover.progress = 100;
      console.log(`[PerSceneVoiceover] Complete: ${scenes.length} scenes, total ${totalCalculatedDuration}s`);
    } else {
      console.log('[PerSceneVoiceover] All scenes failed, falling back to legacy full-track voiceover...');
      const fullNarration = scenes.map(s => s.narration).filter(Boolean).join(' ... ');
      const voiceoverProviderFallback = (project as any).voiceoverSettings?.provider;
      const fullTrackResult = await this.generateVoiceover(fullNarration, project.voiceId, { provider: voiceoverProviderFallback }, { userId: (project as any).ownerId });
      
      if (fullTrackResult.success) {
        updatedProject.assets.voiceover.fullTrackUrl = fullTrackResult.url;
        updatedProject.assets.voiceover.duration = fullTrackResult.duration;
        updatedProject.progress.steps.voiceover.status = 'complete';
        updatedProject.progress.steps.voiceover.progress = 100;
        
        const wordCount = fullNarration.trim().split(/\s+/).length;
        const avgSecsPerWord = fullTrackResult.duration / Math.max(1, wordCount);
        let totalDur = 0;
        for (const scene of scenes) {
          const sceneWords = (scene.narration || '').trim().split(/\s+/).filter(Boolean).length;
          const dur = Math.max(3, Math.round(sceneWords * avgSecsPerWord + 1));
          scene.duration = dur;
          totalDur += dur;
        }
        updatedProject.totalDuration = totalDur;
        console.log(`[PerSceneVoiceover] Full-track fallback succeeded: ${fullTrackResult.duration.toFixed(1)}s`);
      } else {
        updatedProject.progress.steps.voiceover.status = 'error';
        updatedProject.progress.steps.voiceover.message = firstError;
        updatedProject.progress.errors.push(`Voiceover failed: ${firstError}`);
        updatedProject.progress.serviceFailures.push({
          service: 'elevenlabs',
          timestamp: new Date().toISOString(),
          error: firstError || 'Unknown error',
        });
      }
    }
    } // end else (voiceover needs generation)
    } // end else (voiceover not skipped)

    if (targetStep === 'voiceover') {
      updatedProject.progress.currentStep = 'voiceover';
      updatedProject.status = 'draft';
      updatedProject.updatedAt = new Date().toISOString();
      return updatedProject;
    }

    // ===== AUTO-GENERATE VISUAL DIRECTIONS FOR SCENES MISSING THEM =====
    const scenesNeedingDirection = updatedProject.scenes.filter(
      (s: any) => !s.visualDirection || s.visualDirection.trim().length < 10
    );
    
    if (scenesNeedingDirection.length > 0) {
      console.log(`[Assets] Auto-generating visual directions for ${scenesNeedingDirection.length} scenes...`);
      updatedProject.progress.currentStep = 'images';
      updatedProject.progress.overallPercent = 12;
      await saveProgress();
      
      const projectVisualStyle = (project as any).visualStyle || 'lifestyle';
      const projectTitle = project.title || '';
      const projectArtPresetId = (project as any).artPresetId || project.artPresetId;
      const projectArtPreset = projectArtPresetId ? getVisualArtPreset(projectArtPresetId) : null;
      if (projectArtPreset) {
        console.log(`[Assets] Project default art preset for visual directions: ${projectArtPreset.name} (per-scene overrides honored)`);
      }
      
      let brandContextStr = '';
      try {
        brandContextStr = await brandContextService.getVisualDirectionGenerationContext();
      } catch (err: any) {
        console.warn(`[Assets] Brand context load failed: ${err.message}`);
      }
      
      if (llmClient.isAvailable()) {
        
        for (let i = 0; i < updatedProject.scenes.length; i++) {
          const scene = updatedProject.scenes[i];
          const hasStage4MicroScenes = scene.microScenes?.length > 0
            && scene.microScenes.some((ms: any) => ms.pipelineStage === 4);
          if (hasStage4MicroScenes) {
            console.log(`[Assets] Scene ${i + 1} already has Stage 4 micro-scenes — skipping independent generation`);
            continue;
          }
          if (scene.visualDirection && scene.visualDirection.trim().length >= 10) {
            continue;
          }
          
          const narration = scene.narration || '';
          if (!narration.trim()) {
            console.log(`[Assets] Scene ${scene.id} has no narration, skipping visual direction generation`);
            continue;
          }
          
          try {
            // Per-scene art preset resolution: scene override beats project default,
            // so mixed-style projects generate prompts in the correct style per scene.
            const sceneArtPresetId = (scene as any).artPresetId || projectArtPresetId;
            const artPreset = sceneArtPresetId ? getVisualArtPreset(sceneArtPresetId) : projectArtPreset;
            const isStylizedArtPreset = isStylizedPreset(artPreset?.id);

            const lockedCharProfilesForPrompt = ((updatedProject as any).characters || [])
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
${artPreset.globalStyleNotes || ''}
Avoid: ${artPreset.negativePromptAdditions.join(', ')}

You are a cinematic AI video director specializing in ${artPreset.name} animated content. Your job is to write a precise, specific visual direction prompt for an AI video generation tool (Kling/fal.ai).

You will receive:
- The scene narration text
- The project art style: ${artPreset.name}
- A list of locked character profiles with their physical descriptions, wardrobe, and expression notes
${charProfileSection}

RULES YOU MUST ALWAYS FOLLOW:

1. CHARACTER SPECIFICITY
   - If any locked character's name appears in the narration, reference them by exact name
   - EVERY time a character is mentioned in a visual direction, include their FULL physical description and wardrobe inline
   - Pull ALL details from the LOCKED CHARACTER PROFILES above — do NOT abbreviate or omit wardrobe/outfit
   - Never describe a character generically (e.g., "a woman" or "a person") when a named locked character exists
   - IMPORTANT: Do NOT reference any "reference image" — character consistency comes from the detailed text descriptions only

2. NARRATION-VISUAL ALIGNMENT
   - The environment, camera movement, and subject must directly reinforce the MEANING of the narration
   - Ask yourself: what does this narration mean conceptually? Then express that concept visually
   - For product-focused scenes (CTA, closing), describe the PRODUCT — do NOT add characters unless the narration explicitly features a character performing an action

3. REQUIRED VISUAL ELEMENTS — always specify:
   a) Shot type (medium shot, close-up, wide establishing, etc.)
   b) Camera movement (${artPreset.cameraMotionHints || 'slow push-in, subtle arc, static hold'})
   c) Lighting mood (warm golden, cool clinical white, soft ambient, etc.)
   d) Background environment (specific, thematic, never generic)
   e) Art style prefix — always START the prompt with "${artPreset.styleMarkerPrefix || artPreset.name} —"

4. CRITICAL — NO TEXT IN VIDEO
   - NEVER describe text, labels, brand names, lettering, or typography appearing in the scene
   - NEVER mention "brand name appears", "text overlay", or "lettering beneath/above/on"
   - The AI video generator will try to render any mentioned text as garbled characters
   - Text overlays are added separately in post-production — they must NOT be in the visual direction

5. NEVER USE:
   - Generic room descriptions ("cozy office", "modern workspace")
   - Vague character descriptions ("a woman", "a professional")
   - Text, labels, or readable words in the scene description
   - Environments unrelated to the narration's meaning

6. EVERY prompt MUST include the art style marker ("${artPreset.styleMarkerPrefix || artPreset.name}") — AI video providers treat each prompt independently and will default to photorealistic if the style is not explicitly stated.

` : '';

            const defaultPromptRules = `
## CORE PRINCIPLE: AUTHENTICITY OVER PRODUCTION VALUE
The #1 priority is that the visual MATCHES the emotional reality of the narration. Audiences connect with visuals that mirror their own experience.
${charProfileSection}

## CHARACTER SPECIFICITY
- If any locked character's name appears in the narration, reference them by exact name
- EVERY time a character is mentioned in a micro-scene visualDirection, include their FULL physical description and wardrobe inline using this compact parenthetical format:
  CharacterName (age-description, hair details, eye color, skin tone, build, clothing items)
  Example: "Jackie Phillips (late-30s woman, shoulder-length dark brown hair, warm blue eyes, fair skin, athletic build, blue V-neck sweater, blue jeans, small hoop earrings)"
- Pull ALL details from the LOCKED CHARACTER PROFILES above — do NOT abbreviate or omit wardrobe/outfit
- Never describe a character generically (e.g., "a woman" or "a person") when a named locked character exists
- Do NOT reference any "reference image" — character consistency comes from the detailed text descriptions only

## CRITICAL: VISUAL DIVERSITY — NOT EVERY MICRO-SCENE NEEDS A PERSON
Vary the VISUAL TYPE across micro-scenes:
- **Object close-up**: scales, phones, food, products
- **Environment/setting**: kitchen counter, desk, gym entrance
- **Conceptual/metaphor**: wilting vs thriving plant
- **Nature/organic**: Fresh vegetables, flowing water
- **B-roll**: Hands preparing a meal, feet walking
- **Person/human**: Use sparingly — only when narration specifically requires human emotion

RULES:
- At MOST 1-2 micro-scenes (out of 3-4) should feature a person
- Vary the visual type — don't repeat the same approach

## RULES FOR VISUAL DIRECTIONS
1. MATCH THE NARRATION'S REALITY - The visual must reflect the situation described.
2. ONE VISUAL PER MICRO-SCENE - Describe EXACTLY ONE concrete image. NEVER join alternatives with "or".
3. KEEP IT SIMPLE - One subject, one setting per micro-scene. 10-20 words max.
4. BE CONCRETE, NOT ABSTRACT - Describe physical objects and settings. No abstract words like "progression", "journey", "transformation".
5. BE DIRECT - Describe what we SEE in plain language.
6. REAL SETTINGS, NOT SETS - Everyday places that look lived-in and real.
7. NO CINEMATIC LANGUAGE - No camera angles, color palettes, or lighting rigs.
8. VISUAL VARIETY - Each micro-scene should use a DIFFERENT visual type.
9. NO TEXT IN VIDEO - NEVER describe text, labels, brand names, lettering, or typography appearing in the scene. The AI video generator will render mentioned text as garbled characters. Text overlays are added separately in post-production.

## WRONG vs RIGHT EXAMPLES
WRONG: "A progression from calorie counting misconceptions to the deeper reality of body toxin overload"
RIGHT: "A bathroom scale next to a measuring tape and an open diet journal on a kitchen counter"

WRONG: "An open refrigerator late at night, light spilling out, with someone's hand reaching for processed snacks, or a cluttered kitchen counter"
RIGHT: "An open refrigerator at night with a hand reaching for processed snacks on the top shelf"
`;

            const systemPrompt = `You are a visual director for ${isStylizedArtPreset ? `${artPreset!.name} style AI video content` : 'social media and television content'}.

${brandContextStr}

${isStylizedArtPreset ? stylizedPromptRules : defaultPromptRules}

## MICRO-SCENES
Split the narration into micro-scenes. Each micro-scene covers 1-2 sentences that share a single visual idea. Each micro-scene gets its own distinct visual direction.

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

            const previousDirections = isStylizedArtPreset ? updatedProject.scenes
              .slice(0, i)
              .filter((s: any) => s.visualDirection && s.visualDirection.trim().length >= 10)
              .slice(-2)
              .map((s: any, idx: number) => `Previous scene ${idx + 1}: "${s.visualDirection}"`)
              .join('\n') : '';

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

SCENE ${i + 1} of ${updatedProject.scenes.length}
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
Scene ${i + 1} of ${updatedProject.scenes.length}
Scene Duration: ${scene.duration || 10} seconds
${previousDirections ? `\nPREVIOUS SCENES (maintain character consistency with these):\n${previousDirections}\n` : ''}
Narration:
"${narration}"

Split this narration into micro-scenes (2-4 segments) at natural topic shifts. Each micro-scene gets its own simple, authentic visual direction. Return JSON with visualDirection and microScenes array.`;

            const llmResult = await llmClient.createChatCompletion({
              systemPrompt: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
              maxTokens: isStylizedArtPreset ? 1200 : 600,
            });
            
            const textContent = llmResult.text || '';
            if (textContent) {
              let visualDirection = '';
              let microScenes: any[] = [];
              try {
                const cleanedText = textContent
                  .replace(/```json\s*/gi, '')
                  .replace(/```\s*/g, '')
                  .trim();
                const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  visualDirection = parsed.visualDirection || '';
                  if (parsed.microScenes && Array.isArray(parsed.microScenes) && parsed.microScenes.length > 0) {
                    microScenes = parsed.microScenes.map((ms: any, idx: number) => ({
                      id: `${scene.id}-micro-${idx + 1}`,
                      narration: ms.narration || '',
                      visualDirection: ms.visualDirection || '',
                      duration: ms.duration || Math.round((scene.duration || 10) / parsed.microScenes.length),
                    }));
                  }
                }
              } catch (parseErr: any) {
                console.warn(`[Assets] JSON parse failed for scene ${i + 1}: ${parseErr.message}`);
              }
              
              if (!visualDirection && textContent.trim().length > 10) {
                visualDirection = textContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
              }
              
              if (visualDirection) {
                updatedProject.scenes[i].visualDirection = visualDirection;
                if (!updatedProject.scenes[i].background) {
                  updatedProject.scenes[i].background = { type: 'ai' as any, source: visualDirection };
                } else {
                  updatedProject.scenes[i].background!.source = visualDirection;
                }
              }
              
              if (microScenes.length > 0) {
                if (isStylizedArtPreset && artPreset) {
                  const styleKeywords = artPreset.styleKeywords || [];
                  const prefix = artPreset.styleMarkerPrefix || artPreset.name;
                  for (const ms of microScenes) {
                    const dirLower = (ms.visualDirection || '').toLowerCase();
                    const hasStyleMarker = styleKeywords.length > 0
                      ? styleKeywords.some((kw: string) => dirLower.includes(kw))
                      : false;
                    if (!hasStyleMarker && ms.visualDirection) {
                      ms.visualDirection = `${prefix} — ${ms.visualDirection}`;
                      console.log(`[Assets] Prepended style marker "${prefix}" to micro-scene ${ms.id}`);
                    }
                  }
                }
                (updatedProject.scenes[i] as any).microScenes = microScenes;
                console.log(`[Assets] Scene ${i + 1} split into ${microScenes.length} micro-scenes: ${microScenes.map(ms => ms.visualDirection.substring(0, 40)).join(' | ')}`);
              } else {
                console.log(`[Assets] Visual direction generated for scene ${i + 1} (${scene.type}): ${visualDirection.substring(0, 100)}...`);
              }
            }
          } catch (err: any) {
            console.warn(`[Assets] Visual direction generation failed for scene ${i + 1}: ${err.message} - using narration-based fallback`);
            const fallback = `A real person in an everyday setting, ${narration.substring(0, 150).trim()}.`;
            updatedProject.scenes[i].visualDirection = fallback;
            if (!updatedProject.scenes[i].background) {
              updatedProject.scenes[i].background = { type: 'ai' as any, source: fallback };
            } else {
              updatedProject.scenes[i].background!.source = fallback;
            }
          }
        }
        
        await saveProgress();
        console.log(`[Assets] Visual direction generation complete`);
      } else {
        console.warn('[Assets] No ANTHROPIC_API_KEY - cannot auto-generate visual directions');
      }
    }
    // ===== END AUTO-GENERATE VISUAL DIRECTIONS =====

    updatedProject.progress.currentStep = 'images';
    updatedProject.progress.overallPercent = 15;

    let videoGenMode = (project as any).videoGenerationMode as 'direct-t2v' | 'image-first-i2v' | 'character-i2v' | 'auto' | undefined;
    const projectMediaMode2 = (project as any).mediaMode as 'image' | 'video' | undefined;
    
    const projectArtPresetForStrategy = project.artPresetId ? getVisualArtPreset(project.artPresetId) : null;
    const userExplicitlyChoseMode = videoGenMode === 'direct-t2v' || videoGenMode === 'image-first-i2v' || videoGenMode === 'character-i2v';
    if (projectArtPresetForStrategy && projectMediaMode2 === 'video' && !userExplicitlyChoseMode) {
      if (projectArtPresetForStrategy.generationStrategy === 'i2v') {
        videoGenMode = 'image-first-i2v';
        console.log(`[Assets] Art preset "${projectArtPresetForStrategy.name}" overrides generation mode to image-first-i2v (user mode was auto/unset)`);
      } else if (projectArtPresetForStrategy.generationStrategy === 't2v') {
        videoGenMode = 'direct-t2v';
        console.log(`[Assets] Art preset "${projectArtPresetForStrategy.name}" overrides generation mode to direct-t2v (user mode was auto/unset)`);
      }
    } else if (projectArtPresetForStrategy && userExplicitlyChoseMode) {
      console.log(`[Assets] User explicitly selected ${videoGenMode}, art preset "${projectArtPresetForStrategy.name}" preference (${projectArtPresetForStrategy.generationStrategy}) not applied`);
    }

    if (videoGenMode === 'character-i2v') {
      console.log(`[Assets] Character I2V mode enabled — locked character references will be prioritized as I2V inputs for matching scenes`);
    }
    
    const useDirectT2V = projectMediaMode2 === 'video' && (videoGenMode === 'direct-t2v' || videoGenMode === 'auto' || !videoGenMode) && videoGenMode !== 'character-i2v';
    
    if (useDirectT2V) {
      console.log(`[Assets] Direct T2V mode enabled (videoGenerationMode=${videoGenMode || 'auto'}) - skipping intermediate image generation for video scenes`);
    }

    // ===== DISTRIBUTE PROJECT-LEVEL REFERENCE IMAGES TO SCENES =====
    // When user uploads reference images at the project level (e.g., product photos),
    // assign them to relevant scenes so they're used as I2V references during video generation.
    const projectRefImages: string[] = (project as any).referenceImages || 
                                        (project.assets as any)?.referenceImages || [];
    if (projectRefImages.length > 0) {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000');
      
      const resolvedRefImages = projectRefImages.map(url => {
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      });
      
      console.log(`[Assets] Project reference images (${resolvedRefImages.length}): ${resolvedRefImages.join(', ')}`);
      
      const refTargetSceneTypes = ['solution', 'cta', 'product', 'feature', 'benefit', 'hook'];
      const primaryRefImage = resolvedRefImages[0];
      let assignedCount = 0;

      // ===== Smart distribution gating =====
      // Only attach the project's product reference image to a scene when the
      // scene's own visual direction / narration is genuinely about the
      // product (or is silent on subject). If the scene clearly describes a
      // different subject (e.g. "athletic woman drinking water"), force-attaching
      // the product image hijacks I2V mode and produces a zoomed product clip
      // that ignores the visual direction. Heuristics:
      //   - skip when visualDirection mentions a clear human/lifestyle subject
      //     and does NOT mention any product keyword
      //   - skip when scene has explicit `useReferenceImage === false`
      const productDescription: string = String(
        (project as any).productVisualDescription
        || (project as any).productDescription
        || (project as any).brandBible?.product
        || ''
      ).toLowerCase();
      const productKeywords = new Set<string>();
      for (const word of productDescription.split(/[^a-z0-9]+/i)) {
        if (word.length >= 4) productKeywords.add(word.toLowerCase());
      }
      // common explicit product terms
      ['product', 'bottle', 'jar', 'package', 'label', 'powder', 'capsule', 'pill', 'box', 'pouch', 'tin', 'can'].forEach(w => productKeywords.add(w));
      const subjectKeywords = [
        'woman', 'women', 'man', 'men', 'person', 'people', 'guy', 'girl', 'boy',
        'athlete', 'runner', 'mother', 'father', 'family', 'couple', 'child', 'kid',
        'drinking', 'eating', 'walking', 'running', 'jogging', 'cooking', 'sitting',
        'smiling', 'face', 'portrait', 'lifestyle',
      ];
      const sceneMentionsProduct = (text: string): boolean => {
        if (!text) return false;
        const lower = text.toLowerCase();
        for (const k of productKeywords) {
          if (k && lower.includes(k)) return true;
        }
        return false;
      };
      const sceneMentionsHumanSubject = (text: string): boolean => {
        if (!text) return false;
        const lower = text.toLowerCase();
        return subjectKeywords.some(k => new RegExp(`\\b${k}\\b`).test(lower));
      };

      for (let i = 0; i < updatedProject.scenes.length; i++) {
        const scene = updatedProject.scenes[i];
        const sceneType = (scene.type || '').toLowerCase();
        const alreadyHasRef = (scene as any).brandAssetUrl || 
                               ((scene as any).referenceConfig?.imageUrl) ||
                               scene.assets?.assignedProductImageId;

        if (!refTargetSceneTypes.includes(sceneType) || alreadyHasRef) continue;

        if ((scene as any).useReferenceImage === false) {
          console.log(`[Assets] Scene ${scene.id} (type=${sceneType}): explicit useReferenceImage=false — skipping product ref distribution`);
          continue;
        }

        const sceneText = `${scene.visualDirection || ''} ${scene.narration || ''}`;
        const mentionsHuman = sceneMentionsHumanSubject(sceneText);
        const mentionsProduct = productKeywords.size > 0 ? sceneMentionsProduct(sceneText) : false;

        if (mentionsHuman && !mentionsProduct) {
          console.log(`[Assets] Scene ${scene.id} (type=${sceneType}): visual direction describes a human subject without product mentions — skipping product ref distribution to preserve scene intent ("${(scene.visualDirection || '').substring(0, 80)}…")`);
          continue;
        }

        const refImageToUse = resolvedRefImages[assignedCount % resolvedRefImages.length] || primaryRefImage;
        (updatedProject.scenes[i] as any).brandAssetUrl = refImageToUse;
        if (!updatedProject.scenes[i].assets) {
          updatedProject.scenes[i].assets = {};
        }
        updatedProject.scenes[i].assets!.useAIImage = false;
        assignedCount++;
        console.log(`[Assets] Assigned reference image to scene ${scene.id} (type=${sceneType}, productMatch=${mentionsProduct}): ${refImageToUse}`);
      }
      
      if (assignedCount > 0) {
        console.log(`[Assets] Distributed ${assignedCount} reference image assignments across ${refTargetSceneTypes.join('/')} scenes`);
        await saveProgress();
      } else {
        console.log(`[Assets] No matching scenes found for reference image distribution (scene types: ${updatedProject.scenes.map(s => s.type).join(', ')})`);
      }
    }

    if (shouldSkipStep('images')) {
      console.log('[Assets] Images already complete, skipping');
    } else {
    updatedProject.progress.steps.images.status = 'in-progress';
    await saveProgress();

    const productImages = project.assets.productImages || [];
    const primaryImage = productImages.find(img => img.isPrimary);
    const imageGenArtPresetId = (project as any).artPresetId || project.artPresetId;
    
    const imagesPhaseLockedChars: CharacterProfile[] = ((updatedProject as any).characters || [])
      .filter((c: CharacterProfile) => c.locked && c.referenceImageUrl)
      .sort((a: CharacterProfile, b: CharacterProfile) => a.sortOrder - b.sortOrder);
    const imagesPhaseEscapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const imagesPhaseMatchChars = (text: string): CharacterProfile[] => {
      if (!text || imagesPhaseLockedChars.length === 0) return [];
      return imagesPhaseLockedChars.filter(c => {
        const regex = new RegExp('\\b' + imagesPhaseEscapeRegex(c.name) + '\\b', 'i');
        return regex.test(text);
      });
    };
    const hasLockedCharacterRefs = imagesPhaseLockedChars.length > 0;
    const isCharacterArtStyle = imageGenArtPresetId === '3d-illustration' || 
                                 (project as any).videoGenerationMode === 'character-i2v';
    
    if (hasLockedCharacterRefs && isCharacterArtStyle) {
      console.log(`[Assets] Character reference mode active: ${imagesPhaseLockedChars.length} locked characters with art style "${imageGenArtPresetId}" — will skip T2I for scenes with character matches`);
    }

    console.log(`[UniversalVideoService] Product images available: ${productImages.length}`);
    if (productImages.length > 0) {
      console.log(`[UniversalVideoService] Product image URLs: ${productImages.map(img => img.url).join(', ')}`);
      console.log(`[UniversalVideoService] Primary image: ${primaryImage?.url || 'none'}`);
    }
    
    const productSceneTypes = ['hook', 'feature', 'benefit', 'cta', 'intro'];
    const lifestyleSceneTypes = ['explanation', 'process', 'testimonial', 'brand', 'outro'];

    for (let i = 0; i < (project.scenes || []).length; i++) {
      const scene = project.scenes[i];
      console.log(`[UniversalVideoService] Processing scene ${i}: type=${scene.type}, isProductScene=${productSceneTypes.includes(scene.type)}, useAIImage=${scene.assets?.useAIImage}`);
      
      if (!updatedProject.scenes[i].assets) {
        updatedProject.scenes[i].assets = {};
      }

      // ===== DIRECT T2V: Skip AI image generation for video scenes =====
      // When using direct T2V mode, don't waste time/money generating intermediate images
      // that will just be used as I2V references. Go straight to T2V in the video step.
      // Only skip if scene has NO explicit user-uploaded reference image or brand asset.
      const sceneRefConfig = (scene as any).referenceConfig;
      const sceneRefImages: string[] = (scene.assets as any)?.referenceImages || [];
      const sceneRefVideo: string = (scene.assets as any)?.referenceVideoUrl || '';
      const hasUserReferenceImage = (sceneRefConfig?.mode === 'image-to-image' && sceneRefConfig?.sourceUrl) ||
                                     (sceneRefConfig?.mode !== 'none' && sceneRefConfig?.imageUrl) ||
                                     sceneRefImages.length > 0;
      const hasExplicitBrandAsset = scene.assets?.assignedProductImageId || 
                                     (scene.assets?.useAIImage === false) ||
                                     (scene as any).brandAssetUrl;
      
      if (useDirectT2V && !hasUserReferenceImage && !hasExplicitBrandAsset) {
        console.log(`[Assets] Direct T2V: Skipping image generation for scene ${scene.id} (will use T2V in video step)`);
        updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
        updatedProject.progress.overallPercent = 15 + Math.round(((i + 1) / (project.scenes || []).length) * 25);
        await saveProgress();
        continue;
      }

      // ===== CHARACTER REFERENCE SKIP: Don't generate T2I when character refs should be I2V input =====
      if (hasLockedCharacterRefs && isCharacterArtStyle && !hasUserReferenceImage && !hasExplicitBrandAsset) {
        const microScenes = (scene as any).microScenes as any[] || [];
        const microSceneText = microScenes.map((ms: any) => `${ms.narration || ''} ${ms.visualDirection || ''}`).join(' ');
        const sceneText = `${scene.narration || ''} ${scene.visualDirection || ''} ${(scene as any).description || ''} ${microSceneText}`;
        const matchedCharsInScene = imagesPhaseMatchChars(sceneText);
        if (matchedCharsInScene.length > 0 || isCharacterArtStyle && (project as any).videoGenerationMode === 'character-i2v') {
          console.log(`[Assets] Character reference skip: Scene ${scene.id} mentions [${matchedCharsInScene.map(c => c.name).join(', ')}] — skipping T2I, character reference images will be used as I2V input in video step`);
          updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
          updatedProject.progress.overallPercent = 15 + Math.round(((i + 1) / (project.scenes || []).length) * 25);
          await saveProgress();
          continue;
        }
      }

      // ===== Phase 43: CHARACTER CONTINUITY REFERENCE =====
      // If the project has a captured character reference image, assign it
      // to scenes whose visualDirection mentions a recurring person (so NB2
      // can lock the same face across the video). Detection covers:
      //   • generic re-mentions: "same woman", "the man", pronouns
      //   • named characters from the project's characters array
      //   • any scene that already references a character by id
      const projCharRef: string | undefined = (updatedProject as any).characterReferenceImageUrl
        || (project as any).characterReferenceImageUrl;
      if (projCharRef && !(scene as any).characterRefImageUrl) {
        const text = `${scene.visualDirection || ''} ${scene.narration || ''} ${(scene as any).description || ''}`.toLowerCase();

        // SUBJECT CHANGE SKIP: don't attach the locked character if the
        // scene direction explicitly switches to a different subject.
        // Examples: "switch to", "now we see a different woman", "another
        // person", "cut to a child", or no human subject at all (product
        // hero, abstract macro, environment-only shot).
        const subjectChangeSignals = /\b(switch to|cut to|now we see|new (woman|man|person|character)|different (woman|man|person|character)|another (woman|man|person|character|child|kid)|second (woman|man|person|character))\b/.test(text);
        const sceneTypeIsProductOrAbstract = ['product', 'cta', 'chapter-title', 'brand'].includes((scene.type || '').toLowerCase());
        const explicitSubjectOverride = (scene as any).subjectOverride === true;
        if (subjectChangeSignals || sceneTypeIsProductOrAbstract || explicitSubjectOverride) {
          console.log(`[Assets] Scene ${scene.id} subject-change skip — not attaching character ref (signals=${subjectChangeSignals}, productType=${sceneTypeIsProductOrAbstract})`);
        } else {
          const mentionsGenericPerson = /\b(same\s+(woman|man|person|character|guy|girl|host|narrator|protagonist)|her\b|his\b|she\b|he\b|the\s+(woman|man|person|character|protagonist|narrator|host|guy|girl))\b/.test(text);
          const projectCharNames: string[] = Array.isArray((project as any).characters)
            ? ((project as any).characters || []).map((c: any) => (c?.name || '').toString().toLowerCase()).filter((n: string) => n.length >= 2)
            : [];
          const mentionsNamedCharacter = projectCharNames.some((name: string) => text.includes(name));
          const sceneHasCharRef = !!(scene as any).characterId || !!(scene as any).characterRef;
          if (mentionsGenericPerson || mentionsNamedCharacter || sceneHasCharRef) {
            (updatedProject.scenes[i] as any).characterRefImageUrl = projCharRef;
            console.log(`[Assets] Scene ${scene.id} attaching character ref for continuity (generic=${mentionsGenericPerson}, named=${mentionsNamedCharacter}): ${projCharRef.substring(0, 80)}`);
          }
        }
      }

      // ===== SCENE-LEVEL REFERENCE IMAGES: Assign as brandAssetUrl for I2V =====
      if (sceneRefImages.length > 0 && !(scene as any).brandAssetUrl) {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000');
        const refUrl = sceneRefImages[0].startsWith('http') ? sceneRefImages[0] : `${baseUrl}${sceneRefImages[0].startsWith('/') ? '' : '/'}${sceneRefImages[0]}`;
        (updatedProject.scenes[i] as any).brandAssetUrl = refUrl;
        if (!updatedProject.scenes[i].assets) {
          updatedProject.scenes[i].assets = {};
        }
        updatedProject.scenes[i].assets!.useAIImage = false;
        console.log(`[Assets] Scene ${scene.id} has user-uploaded reference image, assigned as brandAssetUrl for I2V: ${refUrl}`);
      }

      // ===== PHASE 13D: IMAGE-TO-IMAGE REFERENCE PROCESSING =====
      // Check if scene has referenceConfig with i2i mode (user uploaded a reference image)
      const refConfig = (scene as any).referenceConfig;
      if (refConfig?.mode === 'image-to-image' && refConfig?.sourceUrl) {
        const i2iSettings = refConfig.i2iSettings || {};
        const referenceUrl = refConfig.sourceUrl;
        const prompt = scene.visualDirection || scene.background?.source || scene.narration || '';
        
        console.log(`[UniversalVideoService] Scene ${i} has I2I reference image: ${referenceUrl}`);
        console.log(`[UniversalVideoService] I2I settings: strength=${i2iSettings.strength || 0.7}`);
        
        const i2iResult = await this.generateImageWithReference(
          prompt,
          referenceUrl,
          {
            strength: i2iSettings.strength,
            preserveComposition: i2iSettings.preserveComposition,
            preserveColors: i2iSettings.preserveColors,
          },
          scene.id
        );
        
        if (i2iResult.success && i2iResult.url) {
          updatedProject.assets.images.push({
            sceneId: scene.id,
            url: i2iResult.url,
            prompt,
            source: 'ai', // I2I uses AI generation
          });
          updatedProject.scenes[i].assets!.imageUrl = i2iResult.url;
          updatedProject.scenes[i].assets!.backgroundUrl = i2iResult.url;
          updatedProject.scenes[i].assets!.imageProvider = i2iResult.provider || 'i2i';
          
          // Set up product overlay if applicable (don't skip overlay setup for I2I scenes)
          const productImages = project.assets.productImages || [];
          if (productImages.length > 0 && productSceneTypes.includes(scene.type)) {
            const imageIndex = i % productImages.length;
            const productImage = productImages[imageIndex];
            // FIXED: Default to false - product overlays should only appear when explicitly approved by user
            const useProductOverlay = scene.assets?.useProductOverlay === true;
            
            if (useProductOverlay) {
              const resolvedProductUrl = this.resolveProductImageUrl(productImage.url);
              updatedProject.scenes[i].assets!.productOverlayUrl = resolvedProductUrl;
              updatedProject.scenes[i].assets!.productOverlayPosition = this.getProductOverlayPosition(scene.type);
              updatedProject.scenes[i].assets!.useProductOverlay = true;
              console.log(`[UniversalVideoService] Product overlay added to I2I scene ${scene.id}`);
            }
          }
          
          updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
          console.log(`[UniversalVideoService] I2I image generated for scene ${scene.id}: ${i2iResult.source}`);
          continue; // Skip to next scene - we have I2I generated image with overlay setup
        } else {
          console.warn(`[UniversalVideoService] I2I failed for scene ${scene.id}: ${i2iResult.error || 'Unknown error'} - falling through to standard generation`);
        }
      }
      // ===== END PHASE 13D =====

      // ===== PHASE 14A+14B: BRAND ASSET INTELLIGENCE PIPELINE =====
      // Use the new Brand Requirement Analyzer for smarter detection
      const visualDirection = scene.visualDirection || scene.background?.source || '';
      const narration = scene.narration || '';
      
      const brandAnalysis = brandRequirementAnalyzer.analyze(visualDirection, narration);
      
      if (brandAnalysis.requiresBrandAssets) {
        console.log(`[Phase14] Brand analysis for scene ${scene.id}:`, {
          confidence: brandAnalysis.confidence,
          sceneType: brandAnalysis.requirements.sceneType,
          productMentioned: brandAnalysis.requirements.productMentioned,
          productNames: brandAnalysis.requirements.productNames,
          logoRequired: brandAnalysis.requirements.logoRequired,
        });
        
        try {
          // Use Phase 14B matcher for intelligent asset matching
          const analysisWithAssets = await brandAssetMatcher.matchAssets(brandAnalysis);
          
          // Store brand analysis on the scene for later use (now properly typed in Scene interface)
          updatedProject.scenes[i].brandAnalysis = {
            confidence: analysisWithAssets.confidence,
            sceneType: analysisWithAssets.requirements.sceneType,
            productVisibility: analysisWithAssets.requirements.productVisibility,
            logoRequired: analysisWithAssets.requirements.logoRequired,
            matchedProductCount: analysisWithAssets.matchedAssets.products.length,
            matchedLogoCount: analysisWithAssets.matchedAssets.logos.length,
          };
          
          const { products, logos, locations } = analysisWithAssets.matchedAssets;
          
          // Use matched product assets
          if (products.length > 0 && analysisWithAssets.requirements.sceneType !== 'standard') {
            const bestProduct = products[0];
            console.log(`[Phase14B] Matched product asset for scene ${scene.id}: ${bestProduct.name}`);
            
            // For product-hero scenes, use product as main background
            if (analysisWithAssets.requirements.sceneType === 'product-hero') {
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: bestProduct.url,
                prompt: visualDirection,
                source: 'uploaded',
              });
              updatedProject.scenes[i].assets!.imageUrl = bestProduct.url;
              updatedProject.scenes[i].assets!.backgroundUrl = bestProduct.url;
              console.log(`[Phase14B] Using brand product as HERO for scene ${scene.id}`);
            } 
            // For product-in-context, use as overlay
            else if (analysisWithAssets.requirements.sceneType === 'product-in-context') {
              updatedProject.scenes[i].assets!.productOverlayUrl = bestProduct.url;
              updatedProject.scenes[i].assets!.productOverlayPosition = this.getProductOverlayPosition(scene.type);
              updatedProject.scenes[i].assets!.useProductOverlay = true;
              console.log(`[Phase14B] Using brand product as OVERLAY for scene ${scene.id}`);
            }
          }
          
          // Use matched logo assets
          if (logos.length > 0 && analysisWithAssets.requirements.logoRequired) {
            const bestLogo = logos[0];
            updatedProject.scenes[i].assets!.logoUrl = bestLogo.url;
            const defaultLogoPosition = {
              position: analysisWithAssets.requirements.brandingVisibility === 'prominent' ? 'center' : 'bottom-right',
              size: analysisWithAssets.requirements.brandingVisibility === 'prominent' ? 0.25 : 0.15,
              opacity: analysisWithAssets.requirements.brandingVisibility === 'subtle' ? 0.6 : 0.9,
            };
            const placementSettings = bestLogo.placementSettings as { position?: string; size?: number; opacity?: number } | null;
            updatedProject.scenes[i].assets!.logoPosition = placementSettings && placementSettings.position 
              ? { position: placementSettings.position, size: placementSettings.size || 0.15, opacity: placementSettings.opacity || 0.9 }
              : defaultLogoPosition;
            console.log(`[Phase14B] Adding brand LOGO to scene ${scene.id}: ${bestLogo.name}`);
          }
          
          // Use location assets for branded-environment scenes
          if (locations.length > 0 && analysisWithAssets.requirements.sceneType === 'branded-environment') {
            const bestLocation = locations[0];
            updatedProject.assets.images.push({
              sceneId: scene.id,
              url: bestLocation.url,
              prompt: visualDirection,
              source: 'uploaded',
            });
            updatedProject.scenes[i].assets!.imageUrl = bestLocation.url;
            updatedProject.scenes[i].assets!.backgroundUrl = bestLocation.url;
            console.log(`[Phase14B] Using brand LOCATION for scene ${scene.id}: ${bestLocation.name}`);
          }
          
          // If we found brand assets for product-hero or branded-environment, skip AI generation
          if ((products.length > 0 && analysisWithAssets.requirements.sceneType === 'product-hero') ||
              (locations.length > 0 && analysisWithAssets.requirements.sceneType === 'branded-environment')) {
            updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
            continue;
          }
        } catch (error: any) {
          console.error(`[Phase14] Brand asset matching failed for scene ${scene.id}:`, error.message);
        }
      }
      
      // Fallback to legacy brand asset service for compatibility
      if (brandAssetService.shouldUseBrandAssets(visualDirection) && !brandAnalysis.requiresBrandAssets) {
        console.log(`[UniversalVideoService] Legacy brand asset check for scene ${scene.id}`);
        
        try {
          const brandAssets = await brandAssetService.resolveAssetsFromVisualDirection(visualDirection, scene.type);
          
          if (brandAssets.hasMatch) {
            if (brandAssets.videos.length > 0 && ['hook', 'benefit', 'story', 'intro'].includes(scene.type)) {
              const brandVideo = brandAssets.videos[0];
              updatedProject.scenes[i].background = {
                type: 'video',
                source: visualDirection,
                videoUrl: brandVideo.url,
              };
              updatedProject.scenes[i].assets!.videoUrl = brandVideo.url;
            } else if (brandAssets.photos.length > 0) {
              const brandPhoto = brandAssets.photos[0];
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: brandPhoto.url,
                prompt: visualDirection,
                source: 'uploaded',
              });
              updatedProject.scenes[i].assets!.imageUrl = brandPhoto.url;
              updatedProject.scenes[i].assets!.backgroundUrl = brandPhoto.url;
            }
            
            if (brandAssets.logo && visualDirection.toLowerCase().includes('logo')) {
              updatedProject.scenes[i].assets!.logoUrl = brandAssets.logo.url;
              const legacyPlacement = brandAssets.logo.placementSettings as { position?: string; size?: number; opacity?: number } | null;
              updatedProject.scenes[i].assets!.logoPosition = legacyPlacement && legacyPlacement.position
                ? { position: legacyPlacement.position, size: legacyPlacement.size || 0.15, opacity: legacyPlacement.opacity || 0.9 }
                : { position: 'bottom-right', size: 0.15, opacity: 0.9 };
            }
            
            if (brandAssets.photos.length > 0 || brandAssets.videos.length > 0) {
              updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
              continue;
            }
          }
        } catch (error: any) {
          console.error(`[UniversalVideoService] Legacy brand asset resolution failed:`, error.message);
        }
      }
      // ===== END PHASE 14A+14B BRAND ASSET INTELLIGENCE =====

      if (scene.assets?.assignedProductImageId) {
        const assignedImage = productImages.find(img => img.id === scene.assets?.assignedProductImageId);
        if (assignedImage) {
          updatedProject.assets.images.push({
            sceneId: scene.id,
            url: assignedImage.url,
            prompt: scene.visualDirection || scene.background?.source || '',
            source: 'uploaded',
          });
          updatedProject.scenes[i].assets!.imageUrl = assignedImage.url;
          updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
          continue;
        }
      }

      if (scene.assets?.useAIImage === false && productImages.length > 0) {
        const imageToUse = primaryImage || productImages[0];
        updatedProject.assets.images.push({
          sceneId: scene.id,
          url: imageToUse.url,
          prompt: scene.visualDirection || scene.background?.source || '',
          source: 'uploaded',
        });
        updatedProject.scenes[i].assets!.imageUrl = imageToUse.url;
        updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
        continue;
      }

      if (productImages.length > 0 && productSceneTypes.includes(scene.type) && !scene.assets?.useAIImage) {
        const imageIndex = i % productImages.length;
        const productImage = productImages[imageIndex];
        
        // FIXED: Product overlays should only appear when explicitly approved by user
        const useProductOverlay = scene.assets?.useProductOverlay === true;
        
        // For content scenes (hook, benefit, story, etc.) - generate script-relevant imagery
        // For product overlay scenes (intro, feature, cta) - generate empty backgrounds for product overlay
        const isContent = this.isContentScene(scene.type);
        
        if (isContent && !useProductOverlay) {
          const sceneMicroScenes = (updatedProject.scenes[i] as any).microScenes as any[] | undefined;
          const isI2VMode = videoGenMode === 'image-first-i2v';
          const hasMicroScenes = sceneMicroScenes && sceneMicroScenes.length > 1;

          if (isI2VMode && hasMicroScenes) {
            console.log(`[UniversalVideoService] I2V mode: Generating per-micro-scene images for scene ${scene.id} (${sceneMicroScenes!.length} micro-scenes)`);
            
            const msImagePromises = sceneMicroScenes!.map(async (ms: any, msIdx: number) => {
              if (ms.imageUrl) {
                console.log(`[Assets] Micro-scene ${ms.id} already has image, skipping`);
                return { msIdx, imageUrl: ms.imageUrl, success: true };
              }
              const msVisualDir = ms.visualDirection || scene.visualDirection || '';
              const tempScene: any = {
                ...scene,
                id: ms.id || `${scene.id}_ms${msIdx}`,
                visualDirection: msVisualDir,
                imagePrompt: ms.imagePrompt || (scene as any).imagePrompt || msVisualDir,
                narration: ms.narration || scene.narration,
                background: scene.background,
              };
              try {
                const result = await this.generateContentImage(tempScene, project.title, undefined, (tempScene as any).artPresetId || imageGenArtPresetId);
                return { msIdx, imageUrl: result.imageUrl, success: !!result.imageUrl };
              } catch (err: any) {
                console.warn(`[Assets] Micro-scene ${msIdx} image generation failed: ${err.message}`);
                return { msIdx, imageUrl: null, success: false };
              }
            });

            const msImageResults = await Promise.all(msImagePromises);
            let firstImageUrl: string | null = null;

            for (const result of msImageResults) {
              if (result.success && result.imageUrl) {
                sceneMicroScenes![result.msIdx].imageUrl = result.imageUrl;
                if (!firstImageUrl) firstImageUrl = result.imageUrl;
                console.log(`[Assets] Micro-scene ${result.msIdx + 1}/${sceneMicroScenes!.length} image ready: ${result.imageUrl.substring(0, 80)}...`);
              }
            }

            if (firstImageUrl) {
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: firstImageUrl,
                prompt: scene.visualDirection || scene.background?.source || '',
                source: 'ai',
              });
              updatedProject.scenes[i].assets!.imageUrl = firstImageUrl;
              updatedProject.scenes[i].assets!.backgroundUrl = firstImageUrl;
              updatedProject.scenes[i].assets!.useProductOverlay = false;
            }
            (updatedProject.scenes[i] as any).microScenes = sceneMicroScenes;
            console.log(`[UniversalVideoService] Per-micro-scene images: ${msImageResults.filter(r => r.success).length}/${sceneMicroScenes!.length} generated`);
          } else {
          // CONTENT SCENE: Generate imagery that matches the script content
          console.log(`[UniversalVideoService] Generating CONTENT image for ${scene.type} scene: ${scene.id}`);
          const contentResult = await this.generateContentImage(scene, project.title, undefined, (scene as any).artPresetId || imageGenArtPresetId);
          
          if (contentResult.imageUrl) {
            updatedProject.assets.images.push({
              sceneId: scene.id,
              url: contentResult.imageUrl,
              prompt: scene.visualDirection || scene.background?.source || '',
              source: (contentResult.source.includes('fal.ai') || contentResult.source.includes('gpt-image')) ? 'ai' : 'stock',
            });
            
            updatedProject.scenes[i].assets!.imageUrl = contentResult.imageUrl;
            updatedProject.scenes[i].assets!.backgroundUrl = contentResult.imageUrl;
            updatedProject.scenes[i].assets!.useProductOverlay = false;
            updatedProject.scenes[i].assets!.imageProvider = contentResult.source || 'ai';
            
            if (contentResult.extractedText && contentResult.extractedText.length > 0) {
              updatedProject.scenes[i].extractedOverlayText = contentResult.extractedText;
            }
            if (contentResult.extractedLogos && contentResult.extractedLogos.length > 0) {
              updatedProject.scenes[i].extractedLogos = contentResult.extractedLogos;
            }
            console.log(`[UniversalVideoService] Content image generated for ${scene.type}: ${contentResult.source}`);
          } else {
            const stockResult = await this.getContentStockImage(scene);
            if (stockResult.imageUrl) {
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: stockResult.imageUrl,
                prompt: scene.visualDirection || scene.background?.source || '',
                source: 'stock',
              });
              updatedProject.scenes[i].assets!.imageUrl = stockResult.imageUrl;
              updatedProject.scenes[i].assets!.backgroundUrl = stockResult.imageUrl;
              updatedProject.scenes[i].assets!.useProductOverlay = false;
              updatedProject.scenes[i].assets!.imageProvider = stockResult.source || 'stock';
              console.log(`[UniversalVideoService] Stock content image used for ${scene.type}: ${stockResult.source}`);
            }
          }
          }
        } else {
          // PRODUCT OVERLAY SCENE: Generate empty background and layer product on top
          const shouldEnhanceBackground = scene.assets?.enhanceWithAIBackground !== false;
          
          if (shouldEnhanceBackground) {
            console.log(`[UniversalVideoService] Generating AI background for ${scene.type} scene: ${scene.id}`);
            const projAR = project.outputFormat?.aspectRatio || '16:9';
            const backgroundResult = await this.generateAIBackground(
              scene.visualDirection || scene.background?.source || '',
              scene.type,
              projAR
            );
            
            // Resolve product image URL for browser access - ensure proper public path
            const resolvedProductUrl = this.resolveProductImageUrl(productImage.url);
            
            if (backgroundResult.backgroundUrl) {
              // Store both AI background and product overlay for Remotion compositing
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: backgroundResult.backgroundUrl,
                prompt: scene.visualDirection || scene.background?.source || '',
                source: 'ai',
              });
              
              // Set up scene assets for Remotion layered compositing
              updatedProject.scenes[i].assets!.imageUrl = backgroundResult.backgroundUrl;
              updatedProject.scenes[i].assets!.backgroundUrl = backgroundResult.backgroundUrl;
              updatedProject.scenes[i].assets!.useProductOverlay = useProductOverlay;
              updatedProject.scenes[i].assets!.imageProvider = backgroundResult.provider || 'ai-background';
              
              // Phase 11A: Store extracted overlay data in scene
              if (backgroundResult.extractedText && backgroundResult.extractedText.length > 0) {
                updatedProject.scenes[i].extractedOverlayText = backgroundResult.extractedText;
              }
              if (backgroundResult.extractedLogos && backgroundResult.extractedLogos.length > 0) {
                updatedProject.scenes[i].extractedLogos = backgroundResult.extractedLogos;
              }
              
              // Only set product overlay if enabled for this scene type
              if (useProductOverlay) {
                updatedProject.scenes[i].assets!.productOverlayUrl = resolvedProductUrl;
                updatedProject.scenes[i].assets!.productOverlayPosition = this.getProductOverlayPosition(scene.type);
                console.log(`[UniversalVideoService] Product overlay ENABLED for ${scene.type}: ${resolvedProductUrl}`);
              } else {
                console.log(`[UniversalVideoService] Product overlay DISABLED for ${scene.type} (background only)`);
              }
              
              console.log(`[UniversalVideoService] AI background: ${backgroundResult.backgroundUrl}`);
            } else {
              // Fallback: use product image with gradient background
              console.log(`[UniversalVideoService] AI background failed, using product image with gradient for ${scene.type} scene`);
              updatedProject.assets.images.push({
                sceneId: scene.id,
                url: resolvedProductUrl,
                prompt: scene.visualDirection || scene.background?.source || '',
                source: 'uploaded',
              });
              updatedProject.scenes[i].assets!.imageUrl = resolvedProductUrl;
            }
          } else {
            // Only use raw product image if explicitly requested
            const resolvedUrl = this.resolveProductImageUrl(productImage.url);
            updatedProject.assets.images.push({
              sceneId: scene.id,
              url: resolvedUrl,
              prompt: scene.visualDirection || scene.background?.source || '',
              source: 'uploaded',
            });
            updatedProject.scenes[i].assets!.imageUrl = resolvedUrl;
            console.log(`[UniversalVideoService] Using raw product image (no AI background) for ${scene.type} scene: ${scene.id}`);
          }
        }
      } else {
        // This is in createProductVideoProject context - always sanitize product terms
        const projAR2 = project.outputFormat?.aspectRatio || '16:9';
        const bgPrompt = scene.visualDirection || scene.background?.source || '';
        const imageResult = await this.generateImage(bgPrompt, scene.id, true, 'content', projAR2, scene);

        if (imageResult.success) {
          updatedProject.assets.images.push({
            sceneId: scene.id,
            url: imageResult.url,
            prompt: bgPrompt,
            source: (imageResult.source.includes('fal.ai') || imageResult.source.includes('gpt-image')) ? 'ai' : 'stock',
          });
          updatedProject.scenes[i].assets!.imageUrl = imageResult.url;
          updatedProject.scenes[i].assets!.imageProvider = imageResult.source || 'ai';
          // Phase 43: capture first scene's image as character reference for downstream scenes
          if (i === 0 && !(updatedProject as any).characterReferenceImageUrl) {
            (updatedProject as any).characterReferenceImageUrl = imageResult.url;
            console.log(`[Assets] Phase 43: captured scene 0 image as character reference: ${imageResult.url.substring(0, 80)}`);
          }
        } else {
          if (imageResult.source === 'fal.ai') {
            updatedProject.progress.serviceFailures.push({
              service: 'fal.ai',
              timestamp: new Date().toISOString(),
              error: imageResult.error || 'Unknown error',
              fallbackUsed: 'stock images',
            });
          }
        }
      }

      updatedProject.progress.steps.images.progress = Math.round(((i + 1) / (project.scenes || []).length) * 100);
      updatedProject.progress.overallPercent = 15 + Math.round(((i + 1) / (project.scenes || []).length) * 25);
      await saveProgress();
    }

    updatedProject.progress.steps.images.status = 'complete';
    updatedProject.progress.overallPercent = 40;
    await saveProgress();
    } // end else (images not skipped)

    if (targetStep === 'images') {
      updatedProject.progress.currentStep = 'images';
      updatedProject.status = 'draft';
      updatedProject.updatedAt = new Date().toISOString();
      return updatedProject;
    }

    // VIDEOS STEP - Generate AI video for hero scenes, fetch B-roll for others
    updatedProject.progress.currentStep = 'videos';

    if (shouldSkipStep('videos')) {
      console.log('[Assets] Videos already complete, skipping');
    } else {
    updatedProject.progress.steps.videos.status = 'in-progress';
    await saveProgress();
    
    // Define scene types that should use AI video generation (hero scenes)
    const heroSceneTypes = ['hook', 'cta', 'testimonial', 'story'];
    const videoSceneTypes = ['hook', 'benefit', 'story', 'testimonial', 'cta'];
    
    const projectQualityTier = (project as any).qualityTier || 'standard';
    const projectMediaMode = (project as any).mediaMode as 'image' | 'video' | undefined;
    const projectArtPresetIdForVideo = (project as any).artPresetId || project.artPresetId;
    // User-selected video provider from Step 2 config — when set (non-'auto'),
    // ai-video-service uses STRICT mode (no fallbacks) and skips the
    // intelligent Claude routing that would otherwise pick e.g. Runway/Kling.
    const userPreferredVideoProvider = (project as any).preferredVideoProvider as string | undefined;
    const projectPreferredProvider = userPreferredVideoProvider && userPreferredVideoProvider !== 'auto'
      ? userPreferredVideoProvider
      : undefined;
    if (projectPreferredProvider) {
      console.log(`[Assets] Project has user-selected video provider: ${projectPreferredProvider} → STRICT mode (overrides intelligent routing)`);
    }
    
    const getSceneQualityTier = (scene: any): 'ultra' | 'premium' | 'standard' => {
      return scene.qualityTier || projectQualityTier;
    };
    
    // Default to IMAGE mode when mediaMode is not set - only generate videos when user explicitly requests it
    let scenesNeedingVideo: typeof project.scenes;
    if (projectMediaMode === 'video') {
      scenesNeedingVideo = project.scenes;
      console.log(`[UniversalVideoService] User selected VIDEO mode - generating video for all ${scenesNeedingVideo.length} scenes`);
    } else {
      scenesNeedingVideo = [];
      console.log(`[UniversalVideoService] IMAGE mode (${projectMediaMode || 'default'}) - skipping all video generation`);
    }
    
    if (scenesNeedingVideo.length > 0) {
      console.log(`[UniversalVideoService] Processing ${scenesNeedingVideo.length} scenes for video (types: ${videoSceneTypes.join(', ')})...`);
      console.log(`[UniversalVideoService] Target audience for video search: ${project.targetAudience || 'not specified'}`);
      const testedProviders = await aiVideoService.getTestedAvailableProviders();
      console.log(`[UniversalVideoService] AI Video providers (tested & passed): ${testedProviders.join(', ') || 'none'}`);
      
      const sceneContents: SceneContent[] = scenesNeedingVideo.map((scene, idx) => ({
        sceneId: scene.id,
        sceneIndex: idx,
        sceneType: scene.type,
        narration: scene.narration || '',
        visualDirection: scene.visualDirection || '',
        duration: scene.duration || 5,
      }));
      const formatRecommendations = await intelligentProviderSelector.analyzeAndRecommendProviders(sceneContents, projectArtPresetIdForVideo);
      const formatMap = new Map(formatRecommendations.recommendations.map(r => [r.sceneId, r]));
      
      console.log(`[UniversalVideoService] Visual format decisions:`);
      formatRecommendations.recommendations.forEach(r => {
        console.log(`  Scene ${r.sceneId}: format=${r.visualFormat} | classification=${r.contentClassification} | provider=${r.recommendedProvider}`);
      });
      
      let videosGenerated = 0;
      let aiVideosGenerated = 0;
      let videosFailed = 0;
      
      const isCharacterI2VMode = videoGenMode === 'character-i2v';
      const shouldPreferCharRefs = isCharacterI2VMode || projectArtPresetIdForVideo === '3d-illustration';
      const characterConsistencyEnabled = isCharacterI2VMode || !!(updatedProject.progress as any)?.characterConsistency || 
                                           isStylizedPreset(projectArtPresetIdForVideo);
      let characterReferenceUrl: string | null = null;
      if (characterConsistencyEnabled) {
        console.log(`[CharRef] Character consistency ENABLED for project ${project.projectId} (characterI2V=${isCharacterI2VMode}, stylized=${isStylizedPreset(projectArtPresetIdForVideo)}, explicit=${!!(updatedProject.progress as any)?.characterConsistency})`);
      }

      const lockedCharacters: CharacterProfile[] = ((updatedProject as any).characters || [])
        .filter((c: CharacterProfile) => c.locked && c.referenceImageUrl)
        .sort((a: CharacterProfile, b: CharacterProfile) => a.sortOrder - b.sortOrder);
      
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchCharactersInText = (text: string): CharacterProfile[] => {
        if (!text || lockedCharacters.length === 0) return [];
        return lockedCharacters.filter(c => {
          const fullRx = new RegExp('\\b' + escapeRegex(c.name) + '\\b', 'i');
          if (fullRx.test(text)) return true;
          const firstName = c.name.split(/\s+/)[0];
          if (firstName && firstName.length >= 3 && firstName !== c.name) {
            const firstRx = new RegExp('\\b' + escapeRegex(firstName) + '\\b', 'i');
            return firstRx.test(text);
          }
          return false;
        });
      };
      
      if (lockedCharacters.length > 0) {
        console.log(`[CharRef] Found ${lockedCharacters.length} locked character references: ${lockedCharacters.map(c => c.name).join(', ')}`);
      }
      
      let videoSceneIndex = 0;
      const deferredVideoTasks: Array<{
        sceneId: string;
        type: 'single' | 'micro';
        promise: Promise<any>;
        microScenes?: any[];
      }> = [];
      const needsSequentialFirstScene = characterConsistencyEnabled && !characterReferenceUrl && !isStylizedPreset(projectArtPresetIdForVideo);
      let firstAIVideoSceneProcessed = false;
      for (const scene of scenesNeedingVideo) {
        // Update per-scene progress (40% to 60% range)
        updatedProject.progress.overallPercent = 40 + Math.round((videoSceneIndex / scenesNeedingVideo.length) * 20);
        updatedProject.progress.steps.videos.progress = Math.round((videoSceneIndex / scenesNeedingVideo.length) * 100);
        updatedProject.progress.steps.videos.message = `Preparing video ${videoSceneIndex + 1} of ${scenesNeedingVideo.length}${videosGenerated > 0 ? ` (${videosGenerated} ready)` : ''}`;
        await saveProgress();
        videoSceneIndex++;
        
        const existingVideoUrl = scene.assets?.videoUrl || scene.background?.videoUrl;
        if (existingVideoUrl && this.isValidHttpsUrl(existingVideoUrl)) {
          console.log(`[Assets] Scene ${scene.id} already has video: ${existingVideoUrl.substring(0, 80)}... — skipping generation`);
          videosGenerated++;
          continue;
        }
        
        const isHeroScene = heroSceneTypes.includes(scene.type);
        let videoResult: { url: string; source: string; duration?: number } | null = null;
        
        const formatRec = formatMap.get(scene.id);
        const sceneVisualFormat = formatRec?.visualFormat || 'ai-video';
        const sceneIdx = updatedProject.scenes.findIndex(s => s.id === scene.id);
        if (sceneIdx >= 0) {
          updatedProject.scenes[sceneIdx].visualFormat = sceneVisualFormat;
          if (updatedProject.scenes[sceneIdx].microScenes) {
            for (const ms of updatedProject.scenes[sceneIdx].microScenes!) {
              ms.visualFormat = sceneVisualFormat;
            }
          }
        }
        const hasMicroScenes = updatedProject.scenes[sceneIdx]?.microScenes && updatedProject.scenes[sceneIdx].microScenes!.length > 1;
        if (hasMicroScenes && (sceneVisualFormat === 'ai-image-remotion' || sceneVisualFormat === 'remotion-motion-graphics')) {
          console.log(`[Assets] Scene ${scene.id} has ${updatedProject.scenes[sceneIdx].microScenes!.length} micro-scenes — overriding format from '${sceneVisualFormat}' to 'ai-video' (micro-scenes need individual videos)`);
          const overriddenFormat = 'ai-video';
          if (sceneIdx >= 0) {
            updatedProject.scenes[sceneIdx].visualFormat = overriddenFormat;
            if (updatedProject.scenes[sceneIdx].microScenes) {
              for (const ms of updatedProject.scenes[sceneIdx].microScenes!) {
                ms.visualFormat = overriddenFormat;
              }
            }
          }
        }
        const sceneVisualFormatFinal = hasMicroScenes ? 'ai-video' : sceneVisualFormat;
        console.log(`[Assets] Scene ${scene.id} visual format: ${sceneVisualFormatFinal} (classification: ${formatRec?.contentClassification || 'unknown'}${hasMicroScenes && sceneVisualFormat !== sceneVisualFormatFinal ? `, original: ${sceneVisualFormat}` : ''})`);
        
        if (sceneVisualFormatFinal === 'remotion-motion-graphics') {
          console.log(`[Assets] Scene ${scene.id} routed to Remotion motion graphics by format decision layer`);
        }
        
        if (sceneVisualFormatFinal === 'ai-image-remotion') {
          console.log(`[Assets] Scene ${scene.id} routed to AI image + Remotion animation by format decision layer`);
        }
        
        // ===== PHASE 12A: MOTION GRAPHICS ROUTING =====
        // Check if visual direction calls for motion graphics instead of AI video
        const visualPrompt = scene.visualDirection || 
                             scene.background?.source || 
                             `Professional wellness video for: ${scene.narration?.substring(0, 100)}`;
        
        const sceneArtPresetId = scene.artPresetId || projectArtPresetIdForVideo;
        const isStylizedScene = isStylizedPreset(sceneArtPresetId);
        
        const routingDecision = motionGraphicsRouter.analyzeVisualDirection(
          visualPrompt,
          scene.narration,
          scene.type
        );
        
        // Update scene index for motion graphics storage
        const mgSceneIndex = updatedProject.scenes.findIndex(s => s.id === scene.id);
        
        const useMotionGraphicsFromFormat = sceneVisualFormatFinal === 'remotion-motion-graphics';
        const skipMotionGraphicsForImageFormat = sceneVisualFormatFinal === 'ai-image-remotion';
        const skipMotionGraphicsForStylizedPreset = isStylizedScene;
        const skipMotionGraphicsForAIVideoFormat = sceneVisualFormatFinal === 'ai-video' && !useMotionGraphicsFromFormat;
        if (skipMotionGraphicsForStylizedPreset && routingDecision.useMotionGraphics) {
          console.log(`[Assets] Skipping motion graphics routing for scene ${scene.id} — stylized art preset '${sceneArtPresetId}' requires AI video`);
        }
        if (skipMotionGraphicsForAIVideoFormat && routingDecision.useMotionGraphics) {
          console.log(`[Assets] Skipping motion graphics routing for scene ${scene.id} — visualFormat is 'ai-video', preserving AI video classification`);
        }
        if (!skipMotionGraphicsForImageFormat && !skipMotionGraphicsForStylizedPreset && !skipMotionGraphicsForAIVideoFormat && ((routingDecision.useMotionGraphics && routingDecision.suggestedType) || useMotionGraphicsFromFormat)) {
          console.log(`[Assets] Motion graphics route for scene ${scene.id}: ${routingDecision.suggestedType} (confidence: ${(routingDecision.confidence * 100).toFixed(0)}%)`);
          
          const motionResult = await motionGraphicsGenerator.generateMotionGraphic(
            visualPrompt,
            scene.narration || '',
            scene.type,
            scene.duration || 5
          );
          
          if (motionResult.success) {
            // Store motion graphics config in scene for Remotion rendering
            if (mgSceneIndex >= 0) {
              if (!updatedProject.scenes[mgSceneIndex].assets) {
                updatedProject.scenes[mgSceneIndex].assets = {};
              }
              (updatedProject.scenes[mgSceneIndex].assets as any).motionGraphics = {
                enabled: true,
                config: motionResult.config,
                renderInstructions: motionResult.renderInstructions,
              };
              updatedProject.scenes[mgSceneIndex].background = {
                type: 'motion-graphic' as any,
                source: visualPrompt,
              };
            }
            console.log(`[Assets] Motion graphics config generated for scene ${scene.id}: ${motionResult.config.type}`);
            videosGenerated++;
            continue; // Skip AI video generation for this scene
          } else {
            console.warn(`[Assets] Motion graphics generation failed for scene ${scene.id}: ${motionResult.error} - falling back to AI video`);
          }
        }
        // ===== END PHASE 12A MOTION GRAPHICS ROUTING =====
        
        if (sceneVisualFormatFinal === 'ai-image-remotion') {
          console.log(`[Assets] Scene ${scene.id} using AI image + Remotion animation format — generating image and applying ken-burns/pan/zoom`);
          const imgSceneIndex = updatedProject.scenes.findIndex(s => s.id === scene.id);
          if (imgSceneIndex >= 0) {
            const imgPrompt = scene.visualDirection || scene.narration || 'Professional illustration';
            const projAR = (updatedProject as any).outputFormat?.aspectRatio || '16:9';
            try {
              const imageResult = await this.generateImage(imgPrompt, scene.id, false, scene.type || 'content', projAR, scene);
              if (imageResult.success && imageResult.url) {
                updatedProject.scenes[imgSceneIndex].background = {
                  type: 'image' as any,
                  source: imageResult.url,
                };
                // Phase 43: capture first scene's image as character reference for downstream scenes
                if (i === 0 && !(updatedProject as any).characterReferenceImageUrl) {
                  (updatedProject as any).characterReferenceImageUrl = imageResult.url;
                  console.log(`[Assets] Phase 43: captured scene 0 image as character reference: ${imageResult.url.substring(0, 80)}`);
                }
                console.log(`[Assets] AI image generated for scene ${scene.id}: ${imageResult.url.substring(0, 80)}...`);
              } else {
                console.warn(`[Assets] AI image generation failed for scene ${scene.id}: ${imageResult.error} — falling back to AI video`);
                if (imgSceneIndex >= 0) {
                  (updatedProject.scenes[imgSceneIndex] as any).visualFormat = 'ai-video';
                }
              }
            } catch (imgErr: any) {
              console.warn(`[Assets] AI image generation error for scene ${scene.id}: ${imgErr.message} — falling back to AI video`);
              if (imgSceneIndex >= 0) {
                (updatedProject.scenes[imgSceneIndex] as any).visualFormat = 'ai-video';
              }
            }
            if (!updatedProject.scenes[imgSceneIndex].animationSettings) {
              updatedProject.scenes[imgSceneIndex].animationSettings = {
                type: 'ken-burns',
                intensity: 'medium',
              };
            }
            updatedProject.scenes[imgSceneIndex].mediaSource = 'ai';
            updatedProject.scenes[imgSceneIndex].generationMethod = 'T2I';
          }
          videosGenerated++;
          continue;
        }
        
        const sceneQualityTier = getSceneQualityTier(scene);
        const shouldGenerateVideo = true; // All scenes in scenesNeedingVideo list need video
        
        const videoSceneIdx = updatedProject.scenes.findIndex(s => s.id === scene.id);
        const microScenes = videoSceneIdx >= 0 ? (updatedProject.scenes[videoSceneIdx] as any).microScenes as any[] : null;
        
        if (shouldGenerateVideo && aiVideoService.isAvailable() && microScenes && microScenes.length > 1) {
          console.log(`[Assets] Scene ${scene.id} has ${microScenes.length} micro-scenes — generating ALL in parallel`);
          let microSuccessCount = 0;
          
          const parentSceneData = updatedProject.scenes.find(s => s.id === scene.id);
          const parentSceneImageUrl = parentSceneData?.assets?.imageUrl;
          const parentRefImageUrl = (scene as any).brandAssetUrl || 
                                     (parentSceneData as any)?.brandAssetUrl ||
                                     scene.referenceConfig?.imageUrl ||
                                     updatedProject.assets.images.find(img => img.sceneId === scene.id && img.source === 'uploaded')?.url;
          const isProductScene = ['product', 'solution', 'cta', 'benefit'].includes((scene.type || '').toLowerCase());
          const productImageForScene = isProductScene 
            ? (parentSceneData?.assets as any)?.productOverlayUrl || 
              (project.assets.productImages || []).find((img: any) => img.isPrimary)?.url
            : null;
          if (productImageForScene && !parentRefImageUrl) {
            console.log(`[Assets] Scene ${scene.id} (${scene.type}): product image available for micro-scene I2V cascade: ${String(productImageForScene).substring(0, 80)}`);
          }
          
          const microScenePromises = microScenes.map((ms: any, msIdx: number) => {
            if (ms.videoUrl) {
              console.log(`[Assets] Micro-scene ${ms.id} already has video, skipping`);
              return Promise.resolve({ msIdx, skipped: true, success: true });
            }
            
            let msPrompt = ms.visualDirection || visualPrompt;
            const resolvedProductRef = productImageForScene ? this.resolveProductImageUrl(productImageForScene) : null;
            const explicitRef = ms.imageUrl || parentRefImageUrl || resolvedProductRef;
            
            const msVisualText = `${ms.visualDirection || ''} ${visualPrompt || ''}`;
            const matchedChars = matchCharactersInText(msVisualText);
            let charRefImageUrl: string | null = null;
            let charRefImageUrls: string[] = [];
            let isCharRef = false;
            const msArtPresetIdForCharGuard = ms.artPresetId || scene.artPresetId || projectArtPresetIdForVideo;
            const isMsStylized = isStylizedPreset(msArtPresetIdForCharGuard);
            const useCharOverAutoImage = shouldPreferCharRefs && matchedChars.length > 0;
            const userOrParentRef = useCharOverAutoImage ? explicitRef : (explicitRef || parentSceneImageUrl);
            if (matchedChars.length > 0 && !explicitRef) {
              const charDescriptions = matchedChars.map(c => `${c.name}: ${c.physicalDescription}, wearing ${c.wardrobe}`).join('. ');
              const narrationContext = ms.narration ? `\nScene context from narration: ${ms.narration}` : '';
              if (isMsStylized) {
                msPrompt = `${msPrompt}${narrationContext}\nCharacter details for visual consistency: ${charDescriptions}`;
                console.log(`[CharRef] Micro-scene ${ms.id}: STYLIZED PRESET '${msArtPresetIdForCharGuard}' — skipping I2V for characters [${matchedChars.map(c => c.name).join(', ')}]; injecting text descriptions only`);
              } else {
                charRefImageUrl = matchedChars[0].referenceImageUrl;
                charRefImageUrls = matchedChars.map(c => c.referenceImageUrl!).filter(Boolean);
                isCharRef = true;
                msPrompt = `${msPrompt}${narrationContext}\nGenerate a NEW scene showing this character in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescriptions}`;
                console.log(`[CharRef] Micro-scene ${ms.id}: preset '${msArtPresetIdForCharGuard || 'none'}' — using I2V character reference for [${matchedChars.map(c => c.name).join(', ')}]`);
              }
            } else if (isCharacterI2VMode && lockedCharacters.length > 0 && !explicitRef) {
              const narrationChars = lockedCharacters.filter(c => {
                const nameRegex = new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return nameRegex.test(ms.narration || '') || nameRegex.test(ms.visualDirection || '');
              });
              const charsToUse = narrationChars.length > 0 ? narrationChars : [lockedCharacters[0]];
              const charDescriptions = charsToUse.map(c => `${c.name}: ${c.physicalDescription}, wearing ${c.wardrobe}`).join('. ');
              const narrationContext = ms.narration ? `\nScene context from narration: ${ms.narration}` : '';
              if (isMsStylized) {
                msPrompt = `${msPrompt}${narrationContext}\nCharacter details for visual consistency: ${charDescriptions}`;
                console.log(`[CharRef] Micro-scene ${ms.id}: STYLIZED PRESET '${msArtPresetIdForCharGuard}' — skipping I2V for characters [${charsToUse.map(c => c.name).join(', ')}]; injecting text descriptions only (character-i2v mode)`);
              } else {
                charRefImageUrl = charsToUse[0].referenceImageUrl;
                charRefImageUrls = charsToUse.map(c => c.referenceImageUrl!).filter(Boolean);
                isCharRef = true;
                msPrompt = `${msPrompt}${narrationContext}\nGenerate a NEW scene showing this character in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescriptions}`;
                console.log(`[CharRef] Micro-scene ${ms.id}: preset '${msArtPresetIdForCharGuard || 'none'}' — using I2V character reference for [${charsToUse.map(c => c.name).join(', ')}] (character-i2v mode)`);
              }
            }
            
            const msImageUrl = userOrParentRef || charRefImageUrl || (characterConsistencyEnabled ? characterReferenceUrl : null);
            const msMode = msImageUrl ? (userOrParentRef ? 'I2V' : (charRefImageUrl ? 'I2V-CharProfile' : 'I2V-CharRef')) : 'T2V';
            console.log(`[Assets] Launching parallel ${msMode} video generation for micro-scene ${msIdx + 1}/${microScenes.length}: ${msPrompt.substring(0, 80)}...`);
            if (msImageUrl) {
              console.log(`[Assets]   Reference image: ${msImageUrl.substring(0, 80)}...`);
            }
            
            const msContentTag = ms.contentTag || scene.contentTag;
            const msArtPresetId = ms.artPresetId || scene.artPresetId || projectArtPresetIdForVideo;
            const msNegativePrompt = (ms as any).negativePrompt || scene.negativePrompt;
            return aiVideoService.generateVideo({
              prompt: msPrompt,
              duration: Math.min(ms.duration || 5, 10),
              aspectRatio: (project.outputFormat?.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
              sceneType: scene.type,
              narration: ms.narration,
              qualityTier: sceneQualityTier,
              artPresetId: msArtPresetId,
              ...(projectPreferredProvider ? { preferredProvider: projectPreferredProvider } : {}),
              ...(msImageUrl ? { imageUrl: msImageUrl } : {}),
              ...(charRefImageUrls.length > 1 ? { imageUrls: charRefImageUrls } : {}),
              ...(msContentTag ? { contentTag: msContentTag } : {}),
              ...(isCharRef ? { isCharacterReference: true } : {}),
              ...(msNegativePrompt ? { negativePrompt: msNegativePrompt } : {}),
            }).then(msResult => ({ msIdx, skipped: false, ...msResult }))
              .catch(err => ({ msIdx, skipped: false, success: false, error: err.message, s3Url: undefined, provider: undefined }));
          });
          
          // === PARALLEL: Handle micro-scene video generation ===
          if (needsSequentialFirstScene && !firstAIVideoSceneProcessed) {
            // Process first micro-scene batch sequentially for character reference extraction
            firstAIVideoSceneProcessed = true;
            console.log(`[ParallelVideo] Processing first micro-scene batch (scene ${scene.id}) sequentially for character reference extraction`);
            const msResults = await Promise.all(microScenePromises);
            let microSuccessCount = 0;
            for (const msResult of msResults) {
              const msIdx = msResult.msIdx;
              if (msResult.skipped) { microSuccessCount++; continue; }
              if (msResult.success && msResult.s3Url) {
                microScenes[msIdx].videoUrl = msResult.s3Url;
                microSuccessCount++;
                aiVideosGenerated++;
                console.log(`[ParallelVideo] Micro-scene ${microScenes[msIdx].id} video ready (${msResult.provider}): ${msResult.s3Url}`);
              } else {
                console.warn(`[ParallelVideo] Micro-scene ${microScenes[msIdx].id} video failed: ${(msResult as any).error}`);
              }
            }
            if (videoSceneIdx >= 0) {
              (updatedProject.scenes[videoSceneIdx] as any).microScenes = microScenes;
            }
            if (microSuccessCount > 0) {
              videoResult = { url: microScenes[0].videoUrl || '', source: 'ai-micro', duration: scene.duration };
              videosGenerated++;
              console.log(`[ParallelVideo] ${microSuccessCount}/${microScenes.length} micro-scene videos generated for scene ${scene.id} (sequential first)`);
              if (characterConsistencyEnabled && !characterReferenceUrl) {
                const firstMsVideoUrl = microScenes.find((ms: any) => ms.videoUrl)?.videoUrl;
                if (firstMsVideoUrl) {
                  characterReferenceUrl = await this.extractCharacterReferenceFrame(firstMsVideoUrl, project.projectId);
                  if (characterReferenceUrl) {
                    console.log(`[CharRef] Captured character reference from micro-scene batch ${scene.id} → will inject into remaining parallel scenes`);
                  }
                }
              }
            }
            await saveProgress();
          } else {
            // Defer micro-scene results to post-loop parallel await
            deferredVideoTasks.push({
              sceneId: scene.id,
              type: 'micro',
              promise: Promise.all(microScenePromises),
              microScenes,
            });
            console.log(`[ParallelVideo] Deferred ${microScenePromises.length} micro-scene video tasks for scene ${scene.id}`);
            continue; // Results applied after parallel await
          }
        } else if (shouldGenerateVideo && aiVideoService.isAvailable()) {
          const sceneRefImageUrl = (scene as any).brandAssetUrl || 
                                   scene.referenceConfig?.imageUrl ||
                                   updatedProject.assets.images.find(img => img.sceneId === scene.id && img.source === 'uploaded')?.url;
          const autoGeneratedImageUrl = updatedProject.scenes.find(s => s.id === scene.id)?.assets?.imageUrl;
          
          const sceneVisualText = `${scene.visualDirection || ''} ${visualPrompt || ''}`;
          const sceneMatchedChars = matchCharactersInText(sceneVisualText);
          if (sceneMatchedChars.length === 0) {
            const narrationOnlyChars = matchCharactersInText(scene.narration || '');
            if (narrationOnlyChars.length > 0) {
              console.log(`[CharRef] Scene ${scene.id}: characters [${narrationOnlyChars.map(c => c.name).join(', ')}] found in narration but NOT in visual direction — skipping character injection to preserve product/scene-focused visual`);
            }
          }
          let sceneCharRefUrl: string | null = null;
          let sceneCharRefUrls: string[] = [];
          let sceneVideoPrompt = visualPrompt;
          let sceneIsCharRef = false;
          const sceneUseCharOverAutoImage = shouldPreferCharRefs && (sceneMatchedChars.length > 0 || isCharacterI2VMode);
          if (sceneMatchedChars.length > 0 && !sceneRefImageUrl) {
            const charDescriptions = sceneMatchedChars.map(c => `${c.name}: ${c.physicalDescription}, wearing ${c.wardrobe}`).join('. ');
            const narrationContext = scene.narration ? `\nScene context from narration: ${scene.narration}` : '';
            if (isStylizedScene) {
              sceneVideoPrompt = `${visualPrompt}${narrationContext}\nCharacter details for visual consistency: ${charDescriptions}`;
              console.log(`[CharRef] Scene ${scene.id}: STYLIZED PRESET '${sceneArtPresetId}' — skipping I2V for characters [${sceneMatchedChars.map(c => c.name).join(', ')}]; injecting text descriptions only`);
            } else {
              sceneCharRefUrl = sceneMatchedChars[0].referenceImageUrl;
              sceneCharRefUrls = sceneMatchedChars.map(c => c.referenceImageUrl!).filter(Boolean);
              sceneIsCharRef = true;
              sceneVideoPrompt = `${visualPrompt}${narrationContext}\nGenerate a NEW scene showing this character in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescriptions}`;
              console.log(`[CharRef] Scene ${scene.id}: preset '${sceneArtPresetId || 'none'}' — using I2V character reference for [${sceneMatchedChars.map(c => c.name).join(', ')}]`);
            }
          } else if (isCharacterI2VMode && lockedCharacters.length > 0 && !sceneRefImageUrl) {
            const narrationChars = lockedCharacters.filter(c => {
              const nameRegex = new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              return nameRegex.test(scene.narration || '') || nameRegex.test(scene.visualDirection || '') || nameRegex.test(visualPrompt || '');
            });
            const charsToUse = narrationChars.length > 0 ? narrationChars : [lockedCharacters[0]];
            const charDescriptions = charsToUse.map(c => `${c.name}: ${c.physicalDescription}, wearing ${c.wardrobe}`).join('. ');
            const narrationContext = scene.narration ? `\nScene context from narration: ${scene.narration}` : '';
            if (isStylizedScene) {
              sceneVideoPrompt = `${visualPrompt}${narrationContext}\nCharacter details for visual consistency: ${charDescriptions}`;
              console.log(`[CharRef] Scene ${scene.id}: STYLIZED PRESET '${sceneArtPresetId}' — skipping I2V for characters [${charsToUse.map(c => c.name).join(', ')}]; injecting text descriptions only (character-i2v mode)`);
            } else {
              sceneCharRefUrl = charsToUse[0].referenceImageUrl;
              sceneCharRefUrls = charsToUse.map(c => c.referenceImageUrl!).filter(Boolean);
              sceneIsCharRef = true;
              sceneVideoPrompt = `${visualPrompt}${narrationContext}\nGenerate a NEW scene showing this character in the described setting. Use the reference image ONLY for character appearance consistency (face, hair, clothing, art style). Do NOT animate or reproduce the reference image itself. Characters: ${charDescriptions}`;
              console.log(`[CharRef] Scene ${scene.id}: preset '${sceneArtPresetId || 'none'}' — using I2V character reference for [${charsToUse.map(c => c.name).join(', ')}] (character-i2v mode)`);
            }
          }
          
          const sceneImageUrlBase = sceneUseCharOverAutoImage 
            ? (sceneRefImageUrl || null) 
            : (sceneRefImageUrl || autoGeneratedImageUrl);
          const sceneImageUrl = sceneImageUrlBase || sceneCharRefUrl || (characterConsistencyEnabled ? characterReferenceUrl : null);
          
          if (sceneRefImageUrl) {
            console.log(`[Assets] Scene ${scene.id} has reference image → using I2V with: ${sceneRefImageUrl}`);
          } else if (sceneCharRefUrl) {
            console.log(`[Assets] Scene ${scene.id} using character profile reference → I2V-CharProfile with: ${sceneCharRefUrl.substring(0, 80)}...`);
          } else if (sceneImageUrl === characterReferenceUrl && characterReferenceUrl) {
            console.log(`[Assets] Scene ${scene.id} using character reference image → I2V-CharRef with: ${characterReferenceUrl.substring(0, 80)}...`);
          }
          console.log(`[Assets] Using AI video for ${scene.type} scene ${scene.id} (isHero=${isHeroScene}, sceneQualityTier=${sceneQualityTier}, mode=${sceneRefImageUrl ? 'I2V' : (sceneImageUrl ? 'I2V-CharRef' : 'T2V')})...`);
          console.log(`[Assets] Using quality tier: ${sceneQualityTier} (scene override: ${scene.qualityTier || 'none'})`);
          
          // === PARALLEL: Defer single-scene video generation to post-loop parallel await ===
          // For non-stylized presets needing character consistency, process first scene sequentially
          if (needsSequentialFirstScene && !firstAIVideoSceneProcessed) {
            firstAIVideoSceneProcessed = true;
            console.log(`[ParallelVideo] Processing first scene ${scene.id} sequentially for character reference extraction`);
            const aiResult = await aiVideoService.generateVideo({
              prompt: sceneVideoPrompt,
              duration: Math.min(scene.duration || 5, 10),
              aspectRatio: (project.outputFormat?.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
              sceneType: scene.type,
              narration: scene.narration,
              mood: (scene as any).analysis?.mood,
              contentType: (scene as any).analysis?.contentType as 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle' | undefined,
              qualityTier: sceneQualityTier,
              artPresetId: scene.artPresetId || projectArtPresetIdForVideo,
              ...(projectPreferredProvider ? { preferredProvider: projectPreferredProvider } : {}),
              ...(sceneImageUrl ? { imageUrl: sceneImageUrl } : {}),
              ...(sceneCharRefUrls.length > 1 ? { imageUrls: sceneCharRefUrls } : {}),
              ...(scene.contentTag ? { contentTag: scene.contentTag } : {}),
              ...(sceneIsCharRef ? { isCharacterReference: true } : {}),
              ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
              // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
              ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
            });
            if (aiResult.success && aiResult.s3Url) {
              videoResult = { url: aiResult.s3Url, source: aiResult.provider || 'ai', duration: aiResult.duration };
              aiVideosGenerated++;
              console.log(`[ParallelVideo] First scene AI video ready (${aiResult.provider}) for scene ${scene.id}: ${aiResult.s3Url}`);
              if (characterConsistencyEnabled && !characterReferenceUrl) {
                characterReferenceUrl = await this.extractCharacterReferenceFrame(aiResult.s3Url, project.projectId);
                if (characterReferenceUrl) {
                  console.log(`[CharRef] Captured character reference from first scene ${scene.id} → will inject into remaining parallel scenes`);
                }
              }
            } else {
              console.warn(`[Assets] AI video failed for ${scene.type} scene ${scene.id}: ${aiResult.error}`);
            }
          } else {
            const genParams = {
              prompt: sceneVideoPrompt,
              duration: Math.min(scene.duration || 5, 10),
              aspectRatio: (project.outputFormat?.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
              sceneType: scene.type,
              narration: scene.narration,
              mood: (scene as any).analysis?.mood,
              contentType: (scene as any).analysis?.contentType as 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle' | undefined,
              qualityTier: sceneQualityTier,
              artPresetId: scene.artPresetId || projectArtPresetIdForVideo,
              ...(projectPreferredProvider ? { preferredProvider: projectPreferredProvider } : {}),
              ...(sceneImageUrl ? { imageUrl: sceneImageUrl } : {}),
              ...(sceneCharRefUrls.length > 1 ? { imageUrls: sceneCharRefUrls } : {}),
              ...(scene.contentTag ? { contentTag: scene.contentTag } : {}),
              ...(sceneIsCharRef ? { isCharacterReference: true } : {}),
              ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
              // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
              ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
            };
            deferredVideoTasks.push({
              sceneId: scene.id,
              type: 'single',
              promise: aiVideoService.generateVideo(genParams),
            });
            console.log(`[ParallelVideo] Deferred single-scene video task for scene ${scene.id} (mode=${sceneRefImageUrl ? 'I2V' : (sceneImageUrl ? 'I2V-CharRef' : 'T2V')})`);
            continue; // Results applied after parallel await
          }
        }
        
        // Stock video fallback DISABLED - only use AI-generated videos
        // Pexels and Pixabay stock footage is disabled per user request
        if (!videoResult) {
          console.log(`[UniversalVideoService] No AI video available for scene ${scene.id} - stock video (Pexels/Pixabay) is disabled`);
          console.log(`[UniversalVideoService] Scene will use AI-generated image instead`);
        }
        
        // Update scene index and initialize assets
        const sceneIndex = updatedProject.scenes.findIndex(s => s.id === scene.id);
        if (sceneIndex >= 0) {
          if (!updatedProject.scenes[sceneIndex].assets) {
            updatedProject.scenes[sceneIndex].assets = {};
          }
          
          // Always set product overlay position
          const productPosition = this.getProductOverlayPosition(scene.type);
          updatedProject.scenes[sceneIndex].assets!.productOverlayPosition = productPosition;
          
          // Apply video result if we have one - respects project mediaMode setting
          const projectMediaMode = (project as any).mediaMode as 'image' | 'video' | undefined;
          const useVideo = this.shouldUseVideoBackground(scene, videoResult, project.targetAudience, sceneQualityTier, projectMediaMode);
          
          // If video mode and we need video but don't have one, check for I2V or T2V
          const currentVideoGenMode = (project as any).videoGenerationMode as 'direct-t2v' | 'image-first-i2v' | 'character-i2v' | 'auto' | undefined;
          const preferDirectT2V = currentVideoGenMode === 'direct-t2v' || currentVideoGenMode === 'auto' || !currentVideoGenMode;
          
          if (useVideo && !videoResult && projectMediaMode !== 'image') {
            // Check for user-provided reference images (brand assets, user uploads)
            // These are ALWAYS respected regardless of T2V/I2V mode
            const matchedBrandImage = updatedProject.assets.images.find(
              img => img.sceneId === scene.id && img.source === 'uploaded'
            );
            
            const userProvidedRef = scene.brandAssetUrl || 
                                  (scene.referenceConfig?.mode !== 'none' && scene.referenceConfig?.imageUrl) ||
                                  matchedBrandImage?.url;
            
            if (userProvidedRef) {
              // User explicitly provided a reference image → use I2V regardless of mode
              const sourceImageUrl = scene.brandAssetUrl || scene.referenceConfig?.imageUrl || matchedBrandImage?.url;
              console.log(`[Assets] Scene ${scene.id} has USER-PROVIDED reference image → I2V with ${sourceImageUrl}`);
              
              const i2vResult = await aiVideoService.generateVideo({
                prompt: scene.visualDirection || scene.narration || 'Dynamic professional video content',
                sceneType: scene.type,
                duration: scene.duration || 5,
                aspectRatio: updatedProject.outputFormat?.aspectRatio || '16:9',
                qualityTier: sceneQualityTier,
                artPresetId: scene.artPresetId || projectArtPresetIdForVideo,
                imageUrl: sourceImageUrl,
                ...(projectPreferredProvider ? { preferredProvider: projectPreferredProvider } : {}),
                ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
                // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
                ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
              });
              
              if (i2vResult.success && i2vResult.s3Url) {
                videoResult = { 
                  url: i2vResult.s3Url, 
                  source: i2vResult.provider || 'ai-i2v',
                  duration: i2vResult.duration,
                };
                aiVideosGenerated++;
                console.log(`[Assets] I2V generated for ${scene.id}: ${i2vResult.s3Url}`);
              } else {
                console.warn(`[Assets] I2V failed for ${scene.id}: ${i2vResult.error} - falling back to T2V`);
              }
            } else if (!preferDirectT2V) {
              // image-first-i2v mode: use the AI-generated image as I2V source
              const aiGeneratedImage = updatedProject.scenes.find(s => s.id === scene.id)?.assets?.imageUrl;
              if (aiGeneratedImage) {
                console.log(`[Assets] Image-first I2V mode: Using AI-generated image for I2V on scene ${scene.id}`);
                const i2vResult = await aiVideoService.generateVideo({
                  prompt: scene.visualDirection || scene.narration || 'Dynamic professional video content',
                  sceneType: scene.type,
                  duration: scene.duration || 5,
                  aspectRatio: updatedProject.outputFormat?.aspectRatio || '16:9',
                  qualityTier: sceneQualityTier,
                  artPresetId: scene.artPresetId || projectArtPresetIdForVideo,
                  imageUrl: aiGeneratedImage,
                  ...(projectPreferredProvider ? { preferredProvider: projectPreferredProvider } : {}),
                  ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
                  // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
                  ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
                });
                
                if (i2vResult.success && i2vResult.s3Url) {
                  videoResult = { 
                    url: i2vResult.s3Url, 
                    source: i2vResult.provider || 'ai-i2v',
                    duration: i2vResult.duration,
                  };
                  aiVideosGenerated++;
                  console.log(`[Assets] I2V (image-first) generated for ${scene.id}: ${i2vResult.s3Url}`);
                } else {
                  console.warn(`[Assets] I2V (image-first) failed for ${scene.id}: ${i2vResult.error} - falling back to T2V`);
                }
              }
            }
            
            // T2V: Direct text-to-video (default path, or fallback if I2V failed)
            if (!videoResult) {
              console.log(`[Assets] Direct T2V: Scene ${scene.id} → generating video from text prompt`);
              const t2vResult = await aiVideoService.generateVideo({
                prompt: scene.visualDirection || scene.narration || 'Dynamic professional video content',
                sceneType: scene.type,
                duration: scene.duration || 5,
                aspectRatio: updatedProject.outputFormat?.aspectRatio || '16:9',
                qualityTier: sceneQualityTier,
                artPresetId: scene.artPresetId || projectArtPresetIdForVideo,
                ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
                // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
                ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
              });
              
              if (t2vResult.success && t2vResult.s3Url) {
                videoResult = { 
                  url: t2vResult.s3Url, 
                  source: t2vResult.provider || 'ai',
                  duration: t2vResult.duration,
                };
                aiVideosGenerated++;
                console.log(`[Assets] T2V generated for ${scene.id}: ${t2vResult.s3Url}`);
              } else {
                console.warn(`[Assets] T2V failed for ${scene.id}: ${t2vResult.error}`);
              }
            }
          }
          
          if (useVideo && videoResult) {
            updatedProject.assets.videos.push({
              sceneId: scene.id,
              url: videoResult.url,
              source: videoResult.source as 'pexels' | 'pixabay' | 'generated' | 'runway' | 'kling' | 'luma' | 'hailuo' | 'hunyuan' | 'veo',
            });
            
            if (!updatedProject.scenes[sceneIndex].background) {
              updatedProject.scenes[sceneIndex].background = {
                type: 'video',
                source: scene.background?.source || '',
                videoUrl: videoResult.url,
              };
            } else {
              updatedProject.scenes[sceneIndex].background.type = 'video';
              updatedProject.scenes[sceneIndex].background.videoUrl = videoResult.url;
              updatedProject.scenes[sceneIndex].background.mediaUrl = videoResult.url; // Keep mediaUrl in sync
            }
            updatedProject.scenes[sceneIndex].assets!.videoUrl = videoResult.url;
            updatedProject.scenes[sceneIndex].assets!.videoSource = videoResult.source;
            videosGenerated++;
            console.log(`[UniversalVideoService] Video APPLIED for scene ${scene.id} (${videoResult.source}): ${videoResult.url.substring(0, 80)}...`);
          } else {
            videosFailed++;
            if (updatedProject.scenes[sceneIndex].background) {
              updatedProject.scenes[sceneIndex].background.type = 'image';
            }
            console.warn(`[UniversalVideoService] Video generation FAILED for scene ${scene.id} - falling back to AI image`);
          }
        }
      }
      
      // ===== PARALLEL VIDEO EXECUTION: Await all deferred video tasks =====
      if (deferredVideoTasks.length > 0) {
        console.log(`[ParallelVideo] Awaiting ${deferredVideoTasks.length} video generation tasks running in parallel (PiAPI supports 30 concurrent)...`);
        const parallelStartTime = Date.now();
        
        updatedProject.progress.steps.videos.message = `Generating ${deferredVideoTasks.length} videos in parallel...`;
        updatedProject.progress.overallPercent = 50;
        await saveProgress();
        
        let completedVideoCount = 0;
        const totalVideoTasks = deferredVideoTasks.length;
        const trackedPromises = deferredVideoTasks.map(t => 
          t.promise.then(result => {
            completedVideoCount++;
            updatedProject.progress.steps.videos.message = `Generated ${completedVideoCount}/${totalVideoTasks} videos...`;
            updatedProject.progress.overallPercent = 50 + Math.round((completedVideoCount / totalVideoTasks) * 20);
            saveProgress().catch(() => {});
            return result;
          }).catch(err => {
            completedVideoCount++;
            updatedProject.progress.steps.videos.message = `Generated ${completedVideoCount}/${totalVideoTasks} videos...`;
            updatedProject.progress.overallPercent = 50 + Math.round((completedVideoCount / totalVideoTasks) * 20);
            saveProgress().catch(() => {});
            throw err;
          })
        );
        const settledResults = await Promise.allSettled(trackedPromises);
        
        const parallelDurationSec = ((Date.now() - parallelStartTime) / 1000).toFixed(1);
        console.log(`[ParallelVideo] All ${deferredVideoTasks.length} tasks completed in ${parallelDurationSec}s`);
        
        for (let taskIdx = 0; taskIdx < deferredVideoTasks.length; taskIdx++) {
          const task = deferredVideoTasks[taskIdx];
          const settled = settledResults[taskIdx];
          const dSceneIndex = updatedProject.scenes.findIndex(s => s.id === task.sceneId);
          if (dSceneIndex < 0) continue;
          
          if (!updatedProject.scenes[dSceneIndex].assets) {
            updatedProject.scenes[dSceneIndex].assets = {};
          }
          
          const dProductPosition = this.getProductOverlayPosition(updatedProject.scenes[dSceneIndex].type);
          updatedProject.scenes[dSceneIndex].assets!.productOverlayPosition = dProductPosition;
          
          if (settled.status === 'rejected') {
            videosFailed++;
            console.warn(`[ParallelVideo] Scene ${task.sceneId} generation rejected: ${settled.reason}`);
            if (updatedProject.scenes[dSceneIndex].background) {
              updatedProject.scenes[dSceneIndex].background!.type = 'image';
            }
            continue;
          }
          
          if (task.type === 'micro') {
            const msResults = settled.value;
            let microSuccessCount = 0;
            const dMicroScenes = task.microScenes!;
            
            for (const msResult of msResults) {
              if (msResult.skipped) { microSuccessCount++; continue; }
              if (msResult.success && msResult.s3Url) {
                dMicroScenes[msResult.msIdx].videoUrl = msResult.s3Url;
                microSuccessCount++;
                aiVideosGenerated++;
                console.log(`[ParallelVideo] Micro-scene ${dMicroScenes[msResult.msIdx].id} video ready (${msResult.provider}): ${msResult.s3Url}`);
              } else {
                console.warn(`[ParallelVideo] Micro-scene ${dMicroScenes[msResult.msIdx].id} video failed: ${(msResult as any).error}`);
              }
            }
            
            (updatedProject.scenes[dSceneIndex] as any).microScenes = dMicroScenes;
            
            if (microSuccessCount > 0) {
              const dFirstMsUrl = dMicroScenes.find((ms: any) => ms.videoUrl)?.videoUrl;
              if (dFirstMsUrl) {
                updatedProject.assets.videos.push({
                  sceneId: task.sceneId,
                  url: dFirstMsUrl,
                  source: 'ai' as any,
                });
                if (!updatedProject.scenes[dSceneIndex].background) {
                  updatedProject.scenes[dSceneIndex].background = { type: 'video', source: '', videoUrl: dFirstMsUrl };
                } else {
                  updatedProject.scenes[dSceneIndex].background!.type = 'video';
                  updatedProject.scenes[dSceneIndex].background!.videoUrl = dFirstMsUrl;
                  updatedProject.scenes[dSceneIndex].background!.mediaUrl = dFirstMsUrl;
                }
                updatedProject.scenes[dSceneIndex].assets!.videoUrl = dFirstMsUrl;
                updatedProject.scenes[dSceneIndex].assets!.videoSource = 'ai';
              }
              videosGenerated++;
              console.log(`[ParallelVideo] ${microSuccessCount}/${dMicroScenes.length} micro-scene videos generated for scene ${task.sceneId}`);
            } else {
              videosFailed++;
              if (updatedProject.scenes[dSceneIndex].background) {
                updatedProject.scenes[dSceneIndex].background!.type = 'image';
              }
              console.warn(`[ParallelVideo] All micro-scene videos failed for scene ${task.sceneId}`);
            }
          } else {
            const aiResult = settled.value;
            if (aiResult.success && aiResult.s3Url) {
              const dVideoResult = {
                url: aiResult.s3Url,
                source: aiResult.provider || 'ai',
                duration: aiResult.duration,
              };
              updatedProject.assets.videos.push({
                sceneId: task.sceneId,
                url: dVideoResult.url,
                source: dVideoResult.source as any,
              });
              if (!updatedProject.scenes[dSceneIndex].background) {
                updatedProject.scenes[dSceneIndex].background = {
                  type: 'video',
                  source: '',
                  videoUrl: dVideoResult.url,
                };
              } else {
                updatedProject.scenes[dSceneIndex].background!.type = 'video';
                updatedProject.scenes[dSceneIndex].background!.videoUrl = dVideoResult.url;
                updatedProject.scenes[dSceneIndex].background!.mediaUrl = dVideoResult.url;
              }
              updatedProject.scenes[dSceneIndex].assets!.videoUrl = dVideoResult.url;
              updatedProject.scenes[dSceneIndex].assets!.videoSource = dVideoResult.source;
              videosGenerated++;
              aiVideosGenerated++;
              console.log(`[ParallelVideo] AI video ready (${dVideoResult.source}) for scene ${task.sceneId}: ${dVideoResult.url.substring(0, 80)}...`);
            } else {
              videosFailed++;
              console.warn(`[ParallelVideo] AI video failed for scene ${task.sceneId}: ${aiResult.error}`);
              if (updatedProject.scenes[dSceneIndex].background) {
                updatedProject.scenes[dSceneIndex].background!.type = 'image';
              }
            }
          }
        }
        
        await saveProgress();
        console.log(`[ParallelVideo] Parallel execution complete: ${videosGenerated} videos generated, ${videosFailed} failed, ${aiVideosGenerated} from AI`);
      }

      updatedProject.progress.steps.videos.progress = 100;
      updatedProject.progress.steps.videos.status = 'complete';
      updatedProject.progress.steps.videos.message = videosGenerated > 0 
        ? `Generated ${aiVideosGenerated} AI videos${videosFailed > 0 ? `, ${videosFailed} failed` : ''}`
        : 'No suitable video found - using AI images';
      if (videosFailed > 0) {
        console.warn(`[UniversalVideoService] Video generation summary: ${videosGenerated} succeeded, ${videosFailed} failed out of ${scenesNeedingVideo.length} scenes`);
        if (!updatedProject.progress.errors) updatedProject.progress.errors = [];
        updatedProject.progress.errors.push(
          `${videosFailed} of ${scenesNeedingVideo.length} video generations failed — those scenes use fallback images`
        );
      }
    } else {
      updatedProject.progress.steps.videos.status = 'skipped';
      updatedProject.progress.steps.videos.message = 'No scenes require video';
      console.log('[UniversalVideoService] Videos step skipped - no video scenes');
    }
    } // end else (videos not skipped)

    if (targetStep === 'videos') {
      updatedProject.progress.currentStep = 'videos';
      updatedProject.status = 'draft';
      updatedProject.updatedAt = new Date().toISOString();
      return updatedProject;
    }

    // MUSIC STEP - Generate background music with Udio (with ElevenLabs/Jamendo fallback)
    updatedProject.progress.currentStep = 'music';
    updatedProject.progress.overallPercent = Math.max(updatedProject.progress.overallPercent || 0, 70);

    if (shouldSkipStep('music')) {
      console.log('[Assets] Music already complete, skipping');
    } else {
    await saveProgress();
    
    const existingMusicUrl = updatedProject.assets?.music?.url;
    if (existingMusicUrl && this.isValidHttpsUrl(existingMusicUrl)) {
      console.log(`[Assets] Music already exists: ${existingMusicUrl.substring(0, 80)}... — skipping generation`);
      updatedProject.progress.steps.music.status = 'complete';
      updatedProject.progress.steps.music.progress = 100;
    } else if (skipMusic) {
      updatedProject.progress.steps.music.status = 'skipped';
      updatedProject.progress.steps.music.message = 'Music generation disabled by user';
      console.log('[UniversalVideoService] Music step skipped - disabled by user');
    } else {
      updatedProject.progress.steps.music.status = 'in-progress';
      updatedProject.progress.steps.music.message = 'Creating custom AI music with Udio...';
      
      // Calculate total video duration
      const totalDuration = project.scenes.reduce((acc, s) => acc + (s.duration || 5), 0);
      
      // Prepare scene data for AI music generation
      const scenesForMusic = updatedProject.scenes.map(s => ({
        type: s.type,
        mood: (s as any).analysis?.mood,
        duration: s.duration,
      }));
      
      console.log(`[UniversalVideoService] Generating ${totalDuration}s music for ${scenesForMusic.length} scenes`);
      
      let musicResult: { url: string; duration: number; source: string } | null = null;
      
      // Try visual-style-based music generation first (Phase 5B-R2)
      const projectVisualStyle = (project as any).visualStyle || 'lifestyle';
      const projectMoodModifier = (project as any).musicMoodModifier || 'default';
      const projectMusicProvider = (project as any).musicProvider || 'auto';
      
      if (aiMusicService.isAvailable()) {
        console.log(`[UniversalVideoService] Trying visual-style-based music generation (style: ${projectVisualStyle})...`);
        const aiMusic = await aiMusicService.generateMusicForVisualStyle({
          visualStyle: projectVisualStyle,
          moodModifier: projectMoodModifier,
          durationSeconds: totalDuration + 3,
          provider: projectMusicProvider,
        });
        
        if (aiMusic) {
          musicResult = {
            url: aiMusic.s3Url,
            duration: aiMusic.duration,
            source: `${projectVisualStyle}-${projectMoodModifier}`,
          };
          console.log(`[UniversalVideoService] Visual-style music generated: ${projectVisualStyle} style, ${aiMusic.duration}s`);
        } else {
          console.log('[UniversalVideoService] Visual-style music generation failed, trying legacy approach...');
          // Fallback to legacy generateMusicForVideo
          const legacyMusic = await aiMusicService.generateMusicForVideo(totalDuration, scenesForMusic);
          if (legacyMusic) {
            musicResult = {
              url: legacyMusic.s3Url,
              duration: legacyMusic.duration,
              source: `udio-${legacyMusic.mood}-${legacyMusic.style}`,
            };
            console.log(`[UniversalVideoService] Legacy music generated: ${legacyMusic.mood} ${legacyMusic.style}, ${legacyMusic.duration}s`);
          }
        }
      }
      
      // Fallback to ElevenLabs if Udio fails
      if (!musicResult) {
        console.log('[UniversalVideoService] Trying ElevenLabs music fallback...');
        const musicStyle = this.inferMusicStyle(project.title, project.type);
        musicResult = await this.generateBackgroundMusic(totalDuration, musicStyle, project.title);
      }
      
      // Fallback to Jamendo if ElevenLabs fails
      if (!musicResult) {
        console.log('[UniversalVideoService] Trying Jamendo music fallback...');
        const style = (project as any).style || 'lifestyle';
        musicResult = await this.getBackgroundMusic(project.totalDuration, style);
      }
      
      if (musicResult) {
        updatedProject.assets.music = {
          url: musicResult.url,
          duration: musicResult.duration,
          volume: 0.18, // Background music - balanced for voiceover mix
        };
        updatedProject.progress.steps.music.status = 'complete';
        updatedProject.progress.steps.music.progress = 100;
        updatedProject.progress.steps.music.message = `Generated ${musicResult.duration}s background music (${musicResult.source})`;
        console.log(`[UniversalVideoService] Music URL: ${musicResult.url}`);
      } else {
        updatedProject.progress.steps.music.status = 'skipped';
        updatedProject.progress.steps.music.message = 'Music generation unavailable - video will have voiceover only';
        console.log('[UniversalVideoService] Music step skipped - no suitable music found');
      }
    }
    } // end else (music not skipped)

    if (targetStep === 'music') {
      updatedProject.progress.currentStep = 'music';
      updatedProject.status = 'draft';
      updatedProject.updatedAt = new Date().toISOString();
      return updatedProject;
    }

    // ========== S3 ASSET CACHING ==========
    // Cache all external assets to S3 for fast Lambda access
    updatedProject.progress.currentStep = 'assembly';
    updatedProject.progress.steps.assembly.status = 'in-progress';
    updatedProject.progress.steps.assembly.message = 'Caching assets to cloud storage...';
    updatedProject.progress.overallPercent = Math.max(updatedProject.progress.overallPercent || 0, 80);
    await saveProgress();
    
    console.log('[UniversalVideoService] Caching all external assets to S3...');
    const cacheResult = await this.cacheAllAssetsToS3(updatedProject);
    
    if (cacheResult.cachedCount > 0) {
      console.log(`[UniversalVideoService] Cached ${cacheResult.cachedCount} assets to S3`);
    }
    
    if (cacheResult.failedCount > 0) {
      console.warn(`[UniversalVideoService] ${cacheResult.failedCount} assets failed to cache`);
      updatedProject.progress.errors.push(
        `${cacheResult.failedCount} assets couldn't be cached - render may be slower`
      );
    }
    
    updatedProject.progress.steps.assembly.progress = 30;
    updatedProject.progress.steps.assembly.message = `Cached ${cacheResult.cachedCount} assets to S3`;
    updatedProject.progress.overallPercent = 73;
    await saveProgress();
    // ========== END S3 CACHING ==========

    // ========== TEXT LABEL EXTRACTION ==========
    try {
      const { extractSceneTextLabels } = await import('./text-label-extractor');
      const projectArtPresetForLabels = (updatedProject as any).artPresetId || updatedProject.artPresetId;
      console.log(`[Assets] Extracting text labels${projectArtPresetForLabels ? ` (art preset: ${projectArtPresetForLabels})` : ''}...`);
      updatedProject.scenes = await extractSceneTextLabels(updatedProject.scenes, projectArtPresetForLabels);
      await saveProgress();
    } catch (labelErr: any) {
      console.warn('[Assets] Text label extraction failed (non-critical):', labelErr.message);
    }
    // ========== END TEXT LABEL EXTRACTION ==========

    // ========== SOUND DESIGN ==========
    // Generate professional sound effects (whooshes, ambient, emphasis)
    if (soundDesignService.isAvailable()) {
      console.log(`[UniversalVideoService] Generating sound design...`);
      
      try {
        const scenesForSound = updatedProject.scenes.map((scene, index) => ({
          id: scene.id,
          type: scene.type,
          duration: scene.duration,
          mood: (scene as any).analysis?.mood,
          isFirst: index === 0,
          isLast: index === updatedProject.scenes.length - 1,
        }));

        const soundDesigns = await soundDesignService.generateProjectSoundDesign(scenesForSound);

        for (const [sceneId, design] of Array.from(soundDesigns.entries())) {
          const sceneIndex = updatedProject.scenes.findIndex(s => s.id === sceneId);
          if (sceneIndex >= 0) {
            (updatedProject.scenes[sceneIndex] as any).soundDesign = design;
          }
        }

        console.log(`[UniversalVideoService] Sound design complete for ${soundDesigns.size} scenes`);

      } catch (error: any) {
        console.error(`[UniversalVideoService] Sound design failed:`, error.message);
      }
    } else {
      console.log(`[UniversalVideoService] Sound design skipped (ElevenLabs API key not configured)`);
    }
    updatedProject.progress.steps.assembly.progress = 50;
    updatedProject.progress.steps.assembly.message = 'Sound design complete, analyzing scenes...';
    updatedProject.progress.overallPercent = 76;
    await saveProgress();
    // ========== END SOUND DESIGN ==========

    // ========== PRODUCT IMAGES ==========
    // Generate AI product images for products that need them
    const productsNeedingImages = this.identifyProductsNeedingImages(updatedProject);
    
    if (productsNeedingImages.length > 0 && productImageService.isAvailable()) {
      console.log(`[UniversalVideoService] Generating product images for ${productsNeedingImages.length} products...`);
      
      try {
        const productImages = await productImageService.generateProjectImages(
          productsNeedingImages,
          'natural'  // Pine Hill Farm brand style
        );

        (updatedProject as any).generatedProductImages = {};
        
        for (const [productName, images] of productImages) {
          (updatedProject as any).generatedProductImages[productName] = images;
          
          // Update scenes that reference this product
          for (let i = 0; i < updatedProject.scenes.length; i++) {
            const scene = updatedProject.scenes[i];
            
            if (this.sceneUsesProduct(scene, productName)) {
              const overlayImage = images.find(img => img.type === 'overlay');
              const heroImage = images.find(img => img.type === 'hero');
              
              (updatedProject.scenes[i] as any).assets = (updatedProject.scenes[i] as any).assets || {};
              
              if (overlayImage) {
                (updatedProject.scenes[i] as any).assets.productOverlayImage = overlayImage.s3Url;
              }
              if (heroImage && scene.type === 'product') {
                (updatedProject.scenes[i] as any).assets.productHeroImage = heroImage.s3Url;
              }
            }
          }
        }

        console.log(`[UniversalVideoService] Product images complete for ${productImages.size} products`);

      } catch (error: any) {
        console.error(`[UniversalVideoService] Product image generation failed:`, error.message);
        // Continue without product images - they're an enhancement
      }
    } else if (productsNeedingImages.length > 0) {
      console.log(`[UniversalVideoService] Product images skipped (PiAPI not configured)`);
    }
    // ========== END PRODUCT IMAGES ==========

    // ========== SCENE ANALYSIS ==========
    // Analyze scenes for optimal text and overlay placement
    if (sceneAnalysisService.isAvailable()) {
      console.log(`[UniversalVideoService] Analyzing scenes for optimal composition...`);
      
      if (updatedProject.progress?.steps?.assembly) {
        (updatedProject.progress.steps as any).assembly.status = 'in-progress';
        (updatedProject.progress.steps as any).assembly.message = 'Analyzing scenes with AI vision...';
      }

      for (let i = 0; i < updatedProject.scenes.length; i++) {
        const scene = updatedProject.scenes[i];
        
        const assetUrl = (scene as any).assets?.imageUrl || 
                         (scene as any).assets?.videoUrl || 
                         (scene as any).assets?.backgroundUrl ||
                         (scene as any).background?.imageUrl ||
                         (scene as any).background?.videoUrl;
        
        if (!assetUrl) {
          console.log(`[UniversalVideoService] Scene ${scene.id} has no visual asset to analyze`);
          continue;
        }
        
        try {
          const analysis = await sceneAnalysisService.analyzeScene(assetUrl, {
            sceneType: scene.type,
            narration: scene.narration || '',
            hasTextOverlays: ((scene as any).textOverlays?.length || 0) > 0,
            hasProductOverlay: (scene as any).assets?.useProductOverlay || false,
          });
          
          (updatedProject.scenes[i] as any).analysis = analysis;
          
          console.log(`[UniversalVideoService] Scene ${i + 1} analyzed:`, {
            faces: analysis.faces.count,
            textPosition: analysis.recommendations.textPosition,
            productSafe: analysis.recommendations.productOverlaySafe,
          });
          
        } catch (error: any) {
          console.warn(`[UniversalVideoService] Analysis failed for scene ${scene.id}:`, error.message);
        }
        
        if (updatedProject.progress?.steps?.assembly) {
          (updatedProject.progress.steps as any).assembly.progress = Math.round(((i + 1) / updatedProject.scenes.length) * 100);
        }
      }

      console.log(`[UniversalVideoService] Scene analysis complete`);
    } else {
      console.log(`[UniversalVideoService] Scene analysis skipped (no LLM API configured)`);
    }
    updatedProject.progress.steps.assembly.progress = 75;
    updatedProject.progress.steps.assembly.message = 'Scene analysis complete, generating composition...';
    updatedProject.progress.overallPercent = Math.max(updatedProject.progress.overallPercent || 0, 85);
    await saveProgress();
    // ========== END SCENE ANALYSIS ==========

    // ========== COMPOSITION INSTRUCTIONS ==========
    console.log(`[UniversalVideoService] Generating composition instructions...`);

    let previousSceneMood: string | undefined;

    for (let i = 0; i < updatedProject.scenes.length; i++) {
      const scene = updatedProject.scenes[i];
      
      const instructions = compositionInstructionsService.generateInstructions(
        scene.id,
        (scene as any).textOverlays || [],
        (scene as any).analysis,
        {
          useProductOverlay: (scene as any).assets?.useProductOverlay || false,
          brandColor: (updatedProject as any).branding?.primaryColor || '#2D5A27',
          sceneType: scene.type,
          sceneDuration: scene.duration,
          isFirstScene: i === 0,
          isLastScene: i === updatedProject.scenes.length - 1,
          previousSceneMood,
        }
      );
      
      previousSceneMood = (scene as any).analysis?.mood;
      (updatedProject.scenes[i] as any).compositionInstructions = instructions;
      
      console.log(`[UniversalVideoService] Scene ${i + 1} instructions:`, {
        textCount: instructions.textOverlays.length,
        textPosition: instructions.textOverlays[0]?.position,
        productEnabled: instructions.productOverlay?.enabled,
        kenBurns: `${instructions.kenBurns.startScale.toFixed(2)} → ${instructions.kenBurns.endScale.toFixed(2)}`,
        transitionIn: instructions.transitionIn.type,
        transitionOut: instructions.transitionOut.type,
      });
    }

    console.log(`[UniversalVideoService] Composition instructions complete`);
    // ========== END COMPOSITION INSTRUCTIONS ==========

    console.log(`[Assets] Brand overlays handled by scene overlay system (sceneOverlayConfigs + overlayItems)`);

    updatedProject.progress.steps.assembly.status = 'complete';
    updatedProject.progress.steps.assembly.progress = 100;
    updatedProject.progress.steps.assembly.message = 'Assembly complete';
    updatedProject.status = 'ready';
    updatedProject.progress.overallPercent = 85;
    updatedProject.updatedAt = new Date().toISOString();

    return updatedProject;
  }

  /**
   * Identify products that need AI-generated images
   */
  private identifyProductsNeedingImages(project: any): Array<{
    name: string;
    description?: string;
    needsOverlay: boolean;
    needsHero: boolean;
    needsLifestyle: boolean;
  }> {
    const products: Array<any> = [];
    const seenProducts = new Set<string>();

    // Check project-level products
    if (project.products) {
      for (const product of project.products) {
        if (!seenProducts.has(product.name)) {
          seenProducts.add(product.name);
          products.push({
            name: product.name,
            description: product.description,
            needsOverlay: !product.hasUploadedImage,
            needsHero: product.featured,
            needsLifestyle: product.showInContext,
          });
        }
      }
    }

    // Check scenes for product references
    for (const scene of project.scenes || []) {
      const productName = scene.productName || scene.assets?.productName;
      
      if (productName && !seenProducts.has(productName)) {
        seenProducts.add(productName);
        products.push({
          name: productName,
          description: scene.productDescription,
          needsOverlay: true,
          needsHero: scene.type === 'product',
          needsLifestyle: scene.type === 'lifestyle',
        });
      }
    }

    return products;
  }

  /**
   * Check if a scene uses a specific product
   */
  private sceneUsesProduct(scene: any, productName: string): boolean {
    const narrationMatch = scene.narration && 
      typeof scene.narration === 'string' && 
      scene.narration.toLowerCase().includes(productName.toLowerCase());
    
    return (
      scene.productName === productName ||
      scene.assets?.productName === productName ||
      narrationMatch === true
    );
  }

  async getBackgroundMusic(duration: number, style?: string): Promise<{ url: string; duration: number; source: string } | null> {
    // Use Jamendo API for free Creative Commons music
    const jamendoClientId = process.env.JAMENDO_CLIENT_ID;
    
    // If no Jamendo key, inform user and skip
    if (!jamendoClientId) {
      console.log('[UniversalVideoService] No JAMENDO_CLIENT_ID - skipping music fallback');
      console.log('[UniversalVideoService] To enable background music, get a free Jamendo API key at: https://developer.jamendo.com/v3.0');
      this.addNotification({
        type: 'info',
        service: 'Music',
        message: 'Video will render with voiceover only. For background music, add a Jamendo API key.',
      });
      return null;
    }

    // Search terms based on video style for Jamendo's tag system
    const searchTerms: Record<string, string[]> = {
      professional: ['ambient', 'corporate', 'background'],
      friendly: ['happy', 'acoustic', 'positive'],
      energetic: ['upbeat', 'energetic', 'motivational'],
      calm: ['relaxing', 'meditation', 'calm'],
      documentary: ['cinematic', 'emotional', 'documentary'],
      wellness: ['spa', 'relaxing', 'meditation', 'peaceful'],
      health: ['calm', 'peaceful', 'soft'],
    };
    
    const tags = searchTerms[style || 'professional'] || ['ambient'];
    const query = tags[0]; // Use primary tag for search

    try {
      console.log(`[UniversalVideoService] Searching Jamendo API for music: ${query} (style: ${style})`);
      
      // Jamendo API - search for instrumental tracks
      // audiodownload_allowed=true ensures we can download the MP3
      const jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=10&fuzzytags=${encodeURIComponent(query)}&include=musicinfo&audioformat=mp32&audiodownload_allowed=true&vocalinstrumental=instrumental`;
      
      console.log(`[UniversalVideoService] Jamendo API URL: ${jamendoUrl.replace(jamendoClientId, 'CLIENT_ID')}`);
      
      const response = await fetch(jamendoUrl);
      
      if (!response.ok) {
        console.warn('[UniversalVideoService] Jamendo API error:', response.status);
        return null;
      }
      
      const data = await response.json();
      console.log(`[UniversalVideoService] Jamendo returned ${data.results?.length || 0} tracks`);
      
      // Check if we got any results with audio download
      if (data.results && data.results.length > 0) {
        // Filter for tracks that allow audio download
        const downloadableTracks = data.results.filter((track: any) => track.audiodownload_allowed && track.audio);
        console.log(`[UniversalVideoService] Found ${downloadableTracks.length} downloadable tracks`);
        
        if (downloadableTracks.length > 0) {
          // Select best track based on duration
          const selectedTrack = this.selectBestJamendoTrack(downloadableTracks, duration);
          if (selectedTrack) {
            return selectedTrack;
          }
        }
      }
      
      // If no results with current query, try fallback tags
      console.log('[UniversalVideoService] No suitable tracks, trying broader search...');
      const fallbackTags = ['ambient', 'background', 'soft', 'calm'];
      
      for (const fallbackTag of fallbackTags) {
        if (fallbackTag === query) continue; // Skip if same as original
        
        console.log(`[UniversalVideoService] Trying Jamendo fallback tag: ${fallbackTag}`);
        const fallbackUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=10&fuzzytags=${encodeURIComponent(fallbackTag)}&include=musicinfo&audioformat=mp32&audiodownload_allowed=true&vocalinstrumental=instrumental`;
        
        const fallbackResponse = await fetch(fallbackUrl);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log(`[UniversalVideoService] Fallback '${fallbackTag}' returned ${fallbackData.results?.length || 0} tracks`);
          
          if (fallbackData.results?.length > 0) {
            const downloadable = fallbackData.results.filter((t: any) => t.audiodownload_allowed && t.audio);
            if (downloadable.length > 0) {
              const track = this.selectBestJamendoTrack(downloadable, duration);
              if (track) return track;
            }
          }
        }
      }
      
      console.log('[UniversalVideoService] No music found after all Jamendo attempts');
      return null;
    } catch (e: any) {
      console.error('[UniversalVideoService] Jamendo music search error:', e.message);
      return null;
    }
  }

  private selectBestJamendoTrack(tracks: any[], targetDuration: number): { url: string; duration: number; source: string } | null {
    // Find a track with suitable duration (at least 80% of video length)
    const minDuration = targetDuration * 0.8;
    let selectedTrack = tracks.find((track: any) => track.duration >= minDuration);
    
    // If no long enough track, just use the longest one
    if (!selectedTrack) {
      selectedTrack = tracks.sort((a: any, b: any) => b.duration - a.duration)[0];
    }
    
    // Jamendo API returns 'audio' field for streaming URL and 'audiodownload' for download
    if (selectedTrack?.audio) {
      const audioUrl = selectedTrack.audiodownload || selectedTrack.audio;
      console.log(`[UniversalVideoService] Selected Jamendo track: "${selectedTrack.name}" by ${selectedTrack.artist_name} (${selectedTrack.duration}s)`);
      console.log(`[UniversalVideoService] Audio URL: ${audioUrl}`);
      return {
        url: audioUrl,
        duration: selectedTrack.duration,
        source: 'jamendo',
      };
    }
    
    return null;
  }

  getServiceFailures(project: VideoProject): ServiceFailure[] {
    return project.progress.serviceFailures;
  }

  hasPaidServiceFailures(project: VideoProject): boolean {
    return project.progress.serviceFailures.some(
      f => f.service === 'fal.ai' || f.service === 'elevenlabs'
    );
  }

  private isValidHttpsUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    return url.startsWith('https://');
  }

  private resolveToAbsoluteUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('https://')) return url;
    
    // Convert HTTP to HTTPS (Lambda requires HTTPS)
    if (url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    
    // Convert relative URLs (like /api/brand-assets/file/X) to absolute HTTPS URLs
    if (url.startsWith('/')) {
      // Use environment-aware base URL resolution
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL 
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || process.env.BASE_URL
        || 'https://localhost:5000';
      return `${baseUrl}${url}`;
    }
    
    return url;
  }

  async prepareAssetsForLambda(project: VideoProject): Promise<{
    valid: boolean;
    issues: string[];
    preparedProject: VideoProject;
  }> {
    const issues: string[] = [];
    const preparedProject = JSON.parse(JSON.stringify(project)) as VideoProject;

    console.log('[UniversalVideoService] Preparing assets for Lambda render...');

    // Map Quick Create assets into standard structure for render pipeline
    if (!preparedProject.assets) preparedProject.assets = {} as any;
    const qcAssets = (preparedProject as any).assets?.quickCreate;
    if (qcAssets) {
      console.log('[PrepareAssets] Quick Create project detected, mapping assets...');
      
      // Map voiceover
      if (qcAssets.voiceover?.url && qcAssets.voiceover?.status === 'completed') {
        if (!preparedProject.assets.voiceover) preparedProject.assets.voiceover = {} as any;
        preparedProject.assets.voiceover.fullTrackUrl = qcAssets.voiceover.url;
        if (qcAssets.voiceover.duration) preparedProject.assets.voiceover.duration = qcAssets.voiceover.duration;
        console.log('[PrepareAssets] Voiceover mapped:', qcAssets.voiceover.url.substring(0, 60));
      }
      
      // Map music
      if (qcAssets.music?.url && qcAssets.music?.status === 'completed') {
        if (!preparedProject.assets.music) preparedProject.assets.music = {} as any;
        preparedProject.assets.music.url = qcAssets.music.url;
        if (qcAssets.music.duration) preparedProject.assets.music.duration = qcAssets.music.duration;
        preparedProject.assets.music.volume = qcAssets.music.volume || 0.18;
        console.log('[PrepareAssets] Music mapped:', qcAssets.music.url.substring(0, 60));
      }
      
      // Create a scene from Quick Create visual asset if scenes are empty
      if (!preparedProject.scenes || preparedProject.scenes.length === 0) {
        const visualUrl = qcAssets.visual?.url || qcAssets.visual?.imageUrl || qcAssets.visual?.videoUrl;
        const visualVideoUrl = qcAssets.visual?.videoUrl || (qcAssets.visual?.type === 'video' ? qcAssets.visual?.url : undefined);
        const isVideoByExtension = /\.(mp4|webm|mov|avi|mkv)$/i.test(visualUrl || '');
        const isVideo = !!(visualVideoUrl || qcAssets.visual?.type === 'video' || isVideoByExtension);
        const finalVideoUrl = isVideo ? (visualVideoUrl || visualUrl) : undefined;
        const duration = qcAssets.voiceover?.duration ?? qcAssets.visual?.duration ?? qcAssets.music?.duration ?? preparedProject.totalDuration ?? 6;
        console.log('[PrepareAssets] Scene duration resolved:', { voiceoverDur: qcAssets.voiceover?.duration, visualDur: qcAssets.visual?.duration, musicDur: qcAssets.music?.duration, projectDur: preparedProject.totalDuration, final: duration });
        
        console.log('[PrepareAssets] Visual asset detection:', { 
          visualUrl: visualUrl?.substring(0, 60), 
          visualVideoUrl: visualVideoUrl?.substring(0, 60),
          type: qcAssets.visual?.type,
          isVideoByExtension,
          isVideo 
        });
        
        const nativeAudioSettings = (preparedProject as any).nativeVideoAudioSettings;
        const nativeAudioEnabled = nativeAudioSettings?.enabled && isVideo;
        const nativeAudioVolume = nativeAudioSettings?.volume ?? 0.8;

        const sceneId = 'qc-scene-1';
        const scene: any = {
          id: sceneId,
          title: preparedProject.title || 'Quick Create Video',
          duration: duration,
          script: preparedProject.description || '',
          voiceover: { text: '' },
          background: {
            type: isVideo ? 'video' : (visualUrl ? 'image' : 'color'),
            imageUrl: !isVideo ? visualUrl || '' : '',
            videoUrl: finalVideoUrl,
            color: (!visualUrl && !finalVideoUrl) ? '#1a1a2e' : undefined,
          },
          assets: {
            imageUrl: !isVideo ? visualUrl || '' : '',
            backgroundUrl: visualUrl || '',
            videoUrl: finalVideoUrl,
          },
          textOverlays: [],
          transitions: { type: 'fade', duration: 0.5 },
          overlayItems: qcAssets.overlayItems || [],
        };

        if (nativeAudioEnabled && finalVideoUrl) {
          scene.microScenes = [{
            id: 'qc-ms-1',
            videoUrl: finalVideoUrl,
            duration: duration,
            originalAudioVolume: nativeAudioVolume,
            originalAudioFadeIn: 0.2,
            originalAudioFadeOut: 0.5,
            overlayItems: qcAssets.overlayItems || [],
          }];
          console.log('[PrepareAssets] Native video audio enabled, created micro-scene with originalAudioVolume:', nativeAudioVolume);
        }
        
        preparedProject.scenes = [scene];
        console.log('[PrepareAssets] Created scene from Quick Create visual:', { 
          hasImage: !!visualUrl && !isVideo, 
          hasVideo: isVideo, 
          videoUrl: finalVideoUrl?.substring(0, 60),
          duration,
          overlayItemCount: scene.overlayItems?.length || 0,
          overlayItems: scene.overlayItems?.map((o: any) => ({ id: o.id, url: o.url?.substring(0, 50) })),
        });
        
        if (!visualUrl && !finalVideoUrl) {
          scene.background = { type: 'color', color: '#1a1a2e' };
          scene.assets.imageUrl = undefined;
          scene.assets.backgroundUrl = undefined;
          console.log('[PrepareAssets] No visual asset - using color background');
        }
      }
      
      if (preparedProject.scenes && preparedProject.scenes.length > 0 && qcAssets.overlayItems) {
        const qcOverlays = Array.isArray(qcAssets.overlayItems) ? qcAssets.overlayItems : [];
        for (const scene of preparedProject.scenes as any[]) {
          if (scene.id?.startsWith('qc-scene') || scene.id?.startsWith('intro-scene')) {
            if (scene.id?.startsWith('intro-scene')) continue;
            scene.overlayItems = qcOverlays;
            console.log(`[PrepareAssets] Synced ${qcOverlays.length} Quick Create overlays into scene ${scene.id}`);
          }
        }
      }

      if (preparedProject.scenes && preparedProject.scenes.length > 0) {
        const bestDuration = qcAssets.voiceover?.duration ?? qcAssets.visual?.duration ?? qcAssets.music?.duration ?? preparedProject.totalDuration ?? null;
        if (bestDuration && bestDuration > 0) {
          for (const scene of preparedProject.scenes as any[]) {
            if (scene.id?.startsWith('qc-scene')) {
              const oldDur = scene.duration;
              if (!oldDur || oldDur < bestDuration) {
                scene.duration = bestDuration;
                console.log(`[PrepareAssets] Updated QC scene ${scene.id} duration: ${oldDur}s → ${bestDuration}s (source: ${qcAssets.voiceover?.duration ? 'voiceover' : qcAssets.visual?.duration ? 'visual' : qcAssets.music?.duration ? 'music' : 'projectTotal'})`);
              }
            }
          }
        }
      }

      console.log('[PrepareAssets] Quick Create mapping complete');
    }

    // ========== S3 ASSET CACHING (CRITICAL FOR FAST RENDERS) ==========
    // Cache all external assets to S3 BEFORE sending to Lambda
    // This ensures every render (including retries) uses fast S3 URLs
    console.log('[UniversalVideoService] Caching external assets to S3 for fast Lambda access...');
    const cacheResult = await this.cacheAllAssetsToS3(preparedProject);
    console.log(`[UniversalVideoService] S3 caching complete: ${cacheResult.cachedCount} cached, ${cacheResult.failedCount} failed`);
    
    if (cacheResult.failedCount > 0) {
      issues.push(`${cacheResult.failedCount} assets couldn't be cached to S3 - render may be slower`);
    }
    // ========== END S3 CACHING ==========

    // ========== STUDIO POLISH: MAP microScenes video/image to scene background ==========
    const isStudioPolish = (preparedProject as any).progress?.projectMode === 'studio-polish';
    if (isStudioPolish) {
      for (let i = 0; i < (preparedProject.scenes || []).length; i++) {
        const scene = preparedProject.scenes[i] as any;
        if (scene.type === 'intro') continue;
        const ms = scene.microScenes?.[0];
        if (ms) {
          if (ms.videoUrl && !scene.background?.videoUrl && !scene.assets?.videoUrl) {
            if (!scene.background) scene.background = {};
            scene.background.type = 'video';
            scene.background.videoUrl = ms.videoUrl;
            if (!scene.assets) scene.assets = {};
            scene.assets.videoUrl = ms.videoUrl;
            console.log(`[PrepareAssets] Studio Polish scene ${i}: mapped microScene videoUrl to background/assets`, ms.videoUrl.substring(0, 80));
          } else if (ms.imageUrl && !scene.background?.imageUrl && !scene.assets?.imageUrl) {
            if (!scene.background) scene.background = {};
            scene.background.type = 'image';
            scene.background.imageUrl = ms.imageUrl;
            if (!scene.assets) scene.assets = {};
            scene.assets.imageUrl = ms.imageUrl;
            console.log(`[PrepareAssets] Studio Polish scene ${i}: mapped microScene imageUrl to background/assets`, ms.imageUrl.substring(0, 80));
          }
        }
      }
    }
    // ========== END STUDIO POLISH MAPPING ==========

    // Resolve and validate brand logo - convert relative URLs to absolute HTTPS
    if (preparedProject.brand?.logoUrl) {
      const resolvedLogoUrl = this.resolveToAbsoluteUrl(preparedProject.brand.logoUrl);
      if (this.isValidHttpsUrl(resolvedLogoUrl)) {
        preparedProject.brand.logoUrl = resolvedLogoUrl;
        console.log(`[UniversalVideoService] Brand logo URL resolved: ${resolvedLogoUrl}`);
      } else {
        console.log(`[UniversalVideoService] Invalid logo URL (not HTTPS): ${preparedProject.brand.logoUrl} - disabling watermark`);
        preparedProject.brand.logoUrl = ''; // Empty string will cause Watermark to skip rendering
      }
    }

    if (preparedProject.assets?.voiceover?.fullTrackUrl) {
      const voiceoverUrl = preparedProject.assets.voiceover.fullTrackUrl;
      if (!this.isValidHttpsUrl(voiceoverUrl)) {
        if (voiceoverUrl.startsWith('data:')) {
          const match = voiceoverUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, contentType, base64Data] = match;
            const buffer = Buffer.from(base64Data, 'base64');
            const fileName = `voiceover_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
            const s3Url = await this.uploadToS3(buffer, fileName, contentType);
            
            if (s3Url) {
              preparedProject.assets.voiceover.fullTrackUrl = s3Url;
              console.log(`[UniversalVideoService] Uploaded voiceover to S3: ${s3Url}`);
            } else {
              issues.push('Failed to upload voiceover to S3');
              preparedProject.assets.voiceover.fullTrackUrl = '';
            }
          }
        } else {
          issues.push(`Invalid voiceover URL format: ${voiceoverUrl.substring(0, 50)}...`);
          preparedProject.assets.voiceover.fullTrackUrl = '';
        }
      }
    }

    if (preparedProject.assets?.music?.url) {
      if (!this.isValidHttpsUrl(preparedProject.assets.music.url)) {
        issues.push(`Invalid music URL: ${preparedProject.assets.music.url.substring(0, 50)}...`);
        preparedProject.assets.music = { url: '', duration: 0, volume: 0 };
      }
    }

    for (let i = 0; i < (preparedProject.scenes || []).length; i++) {
      const scene = preparedProject.scenes[i];
      
      if (scene.assets?.imageUrl && !this.isValidHttpsUrl(scene.assets.imageUrl)) {
        if (scene.assets.imageUrl.startsWith('data:')) {
          const match = scene.assets.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, contentType, base64Data] = match;
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = contentType.includes('png') ? 'png' : 'jpg';
            const fileName = `scene_${i}_image_${Date.now()}.${ext}`;
            const s3Url = await this.uploadToS3(buffer, fileName, contentType);
            
            if (s3Url) {
              preparedProject.scenes[i].assets!.imageUrl = s3Url;
              console.log(`[UniversalVideoService] Uploaded scene ${i} image to S3: ${s3Url}`);
            } else {
              issues.push(`Failed to upload scene ${i} image to S3`);
              preparedProject.scenes[i].assets!.imageUrl = undefined;
            }
          }
        } else {
          issues.push(`Scene ${i} has invalid image URL`);
          preparedProject.scenes[i].assets!.imageUrl = undefined;
        }
      }
      
      if (scene.assets?.backgroundUrl && !this.isValidHttpsUrl(scene.assets.backgroundUrl)) {
        preparedProject.scenes[i].assets!.backgroundUrl = undefined;
      }
      
      // ===== PRODUCT OVERLAY S3 UPLOAD =====
      // Upload local product overlay images to S3 for Lambda access
      if (scene.assets?.productOverlayUrl && !this.isValidHttpsUrl(scene.assets.productOverlayUrl)) {
        const originalProductUrl = scene.assets.productOverlayUrl;
        console.log(`[UniversalVideoService] Scene ${i} product overlay needs S3 upload: ${originalProductUrl}`);
        
        try {
          let buffer: Buffer | null = null;
          let contentType = 'image/png';
          
          // Handle different URL formats
          if (originalProductUrl.startsWith('/objects/')) {
            // Replit Object Storage path - fetch via local server
            const localUrl = `http://localhost:5000${originalProductUrl}`;
            console.log(`[UniversalVideoService] Fetching product image from: ${localUrl}`);
            const response = await fetch(localUrl);
            if (response.ok) {
              buffer = Buffer.from(await response.arrayBuffer());
              contentType = response.headers.get('content-type') || 'image/png';
            }
          } else if (originalProductUrl.startsWith('/uploads/') || originalProductUrl.startsWith('/')) {
            // Local uploads path
            const localUrl = `http://localhost:5000${originalProductUrl}`;
            console.log(`[UniversalVideoService] Fetching product image from: ${localUrl}`);
            const response = await fetch(localUrl);
            if (response.ok) {
              buffer = Buffer.from(await response.arrayBuffer());
              contentType = response.headers.get('content-type') || 'image/png';
            }
          } else if (originalProductUrl.startsWith('data:')) {
            // Base64 data URL
            const match = originalProductUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              contentType = match[1];
              buffer = Buffer.from(match[2], 'base64');
            }
          }
          
          if (buffer) {
            const ext = contentType.includes('png') ? 'png' : 'jpg';
            const fileName = `product_scene_${i}_${Date.now()}.${ext}`;
            const s3Url = await this.uploadToS3(buffer, fileName, contentType);
            
            if (s3Url) {
              preparedProject.scenes[i].assets!.productOverlayUrl = s3Url;
              console.log(`[UniversalVideoService] Scene ${i} product uploaded to S3: ${s3Url}`);
            } else {
              console.warn(`[UniversalVideoService] Scene ${i} product S3 upload failed - disabling overlay`);
              preparedProject.scenes[i].assets!.productOverlayUrl = undefined;
              preparedProject.scenes[i].assets!.useProductOverlay = false;
              issues.push(`Failed to upload product image for scene ${i}`);
            }
          } else {
            console.warn(`[UniversalVideoService] Scene ${i} product image fetch failed - disabling overlay`);
            preparedProject.scenes[i].assets!.productOverlayUrl = undefined;
            preparedProject.scenes[i].assets!.useProductOverlay = false;
          }
        } catch (e: any) {
          console.error(`[UniversalVideoService] Scene ${i} product upload error:`, e.message);
          preparedProject.scenes[i].assets!.productOverlayUrl = undefined;
          preparedProject.scenes[i].assets!.useProductOverlay = false;
          issues.push(`Product image upload error for scene ${i}: ${e.message}`);
        }
      }
      // ===== END PRODUCT OVERLAY S3 UPLOAD =====
      
      // Log and validate videoUrl for B-roll scenes
      if (scene.assets?.videoUrl) {
        if (this.isValidHttpsUrl(scene.assets.videoUrl)) {
          console.log(`[UniversalVideoService] Scene ${i} has video B-roll: ${scene.assets.videoUrl}`);
          console.log(`[UniversalVideoService] Scene ${i} background.type: ${scene.background?.type}`);
        } else {
          console.warn(`[UniversalVideoService] Scene ${i} has invalid videoUrl: ${scene.assets.videoUrl} - clearing`);
          preparedProject.scenes[i].assets!.videoUrl = undefined;
          if (preparedProject.scenes[i].background?.type === 'video') {
            preparedProject.scenes[i].background!.type = 'image';
          }
        }
      }
      
      // ===== PHASE 10E: SMART TEXT OVERLAY DETECTION =====
      // Detect scenes requiring text overlays (CTA, bullet points, actionable steps)
      const textRequirement = detectTextOverlayRequirements({
        sceneIndex: i,
        visualDirection: scene.visualDirection,
        narration: scene.narration,
        type: scene.type,
      });
      
      if (textRequirement.required && textRequirement.textContent.length > 0) {
        console.log(`[UniversalVideoService] Scene ${i} needs text overlay:`, {
          type: textRequirement.overlayType,
          source: textRequirement.source,
          items: textRequirement.textContent.length,
        });
        
        // Generate Remotion-compatible text overlays
        const fps = preparedProject.outputFormat?.fps || 30;
        const sceneDuration = scene.duration || 5;
        const textOverlays = generateTextOverlays(textRequirement, sceneDuration, fps);
        
        // Convert to the format expected by Remotion composition
        if (!preparedProject.scenes[i].textOverlays) {
          preparedProject.scenes[i].textOverlays = [];
        }
        
        // Add generated text overlays to scene
        textOverlays.forEach((overlay) => {
          // Map to the TextOverlay interface from shared/video-types.ts
          const remotionOverlay: TextOverlay = {
            id: overlay.id,
            text: overlay.text,
            style: overlay.type as TextOverlay['style'], // 'title' | 'subtitle' | 'headline' | 'body' | 'bullet' | 'caption' | 'cta' | 'quote'
            position: {
              vertical: overlay.position.y > 70 ? 'bottom' : overlay.position.y > 40 ? 'center' : 'top',
              horizontal: overlay.position.x < 30 ? 'left' : overlay.position.x > 70 ? 'right' : 'center',
              padding: 24,
            },
            animation: {
              enter: overlay.animation === 'pop' ? 'scale' : overlay.animation as any,
              exit: 'fade',
              duration: (overlay.timing.fadeInFrames / fps),
            },
            timing: {
              startAt: overlay.timing.startFrame / fps,
              duration: (overlay.timing.endFrame - overlay.timing.startFrame) / fps,
            },
          };
          preparedProject.scenes[i].textOverlays!.push(remotionOverlay);
        });
        
        console.log(`[UniversalVideoService] Added ${textOverlays.length} text overlays to scene ${i}`);
      }
      // ===== END PHASE 10E =====
    }

    // Count scenes with valid video B-roll
    const videoScenes = (preparedProject.scenes || []).filter(
      s => s.assets?.videoUrl && s.background?.type === 'video'
    );
    
    const validScenes = (preparedProject.scenes || []).filter(
      s => s.assets?.imageUrl || s.assets?.backgroundUrl || s.assets?.videoUrl
    ).length;
    
    console.log(`[UniversalVideoService] Asset preparation complete:`);
    console.log(`  - Valid scenes: ${validScenes}/${(preparedProject.scenes || []).length}`);
    console.log(`  - Scenes with video B-roll: ${videoScenes.length}`);
    if (videoScenes.length > 0) {
      videoScenes.forEach((s, idx) => {
        console.log(`    - ${s.id}: videoUrl=${s.assets?.videoUrl?.substring(0, 60)}... background.type=${s.background?.type}`);
      });
    }
    console.log(`  - Voiceover: ${this.isValidHttpsUrl(preparedProject.assets?.voiceover?.fullTrackUrl || '') ? 'OK' : 'Missing/Invalid'}`);
    console.log(`  - Music: ${this.isValidHttpsUrl(preparedProject.assets?.music?.url || '') ? 'OK' : 'None'}`);
    console.log(`  - Issues: ${issues.length}`);
    
    if (issues.length > 0) {
      console.log(`  - Issue details: ${issues.join('; ')}`);
    }

    return {
      valid: (preparedProject.scenes || []).length > 0,
      issues,
      preparedProject,
    };
  }

  /**
   * Regenerate the background image for a specific scene
   */
  async regenerateSceneImage(
    project: VideoProject,
    sceneId: string,
    customPrompt?: string,
    provider?: string,
    generationMode?: string,
    sourceImageUrl?: string,
    aspectRatio?: string
  ): Promise<{ success: boolean; newImageUrl?: string; source?: string; error?: string }> {
    const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex < 0) {
      return { success: false, error: 'Scene not found' };
    }
    
    const scene = project.scenes[sceneIndex];
    const prompt = customPrompt || scene.visualDirection || scene.background?.source || 'wellness lifestyle';
    
    const isProductVideo = (project.assets?.productImages?.length ?? 0) > 0;
    const mode = generationMode || 'auto';
    const imgAspectRatio = aspectRatio || '16:9';
    
    console.log(`[Regenerate] Image for scene ${sceneId} with prompt: ${prompt.substring(0, 60)}... (mode: ${mode}, isProductVideo: ${isProductVideo}, provider: ${provider || 'default'}, aspectRatio: ${imgAspectRatio})`);
    console.log(`[Regenerate] Scene type: ${scene.type}, Visual direction: ${(scene.visualDirection || 'none').substring(0, 50)}`);
    
    if (provider) {
      if (!scene.assets) scene.assets = {};
      (scene.assets as any).requestedProvider = provider;
    }
    
    // Handle explicit I2I mode from UI
    if (mode === 'i2i' && sourceImageUrl) {
      console.log(`[Regenerate] Explicit I2I mode with source: ${sourceImageUrl.substring(0, 80)}, provider: ${provider || 'auto'}`);
      try {
        const { imageGenerationService: igs } = await import('./image-generation-service');
        const i2iResult = await igs.generateImageToImage({
          referenceImageUrl: sourceImageUrl,
          prompt,
          strength: 0.7,
          provider: provider || undefined,
          aspectRatio: imgAspectRatio,
          useCase: 'scene-integration',
        });
        if (i2iResult.url) {
          console.log(`[Regenerate] I2I image generated successfully via ${i2iResult.provider}`);
          return { success: true, newImageUrl: i2iResult.url, source: i2iResult.provider };
        }
        console.log(`[Regenerate] Explicit I2I returned no URL - falling through`);
      } catch (err: any) {
        console.error(`[Regenerate] Explicit I2I error:`, err.message);
      }
    }
    
    // Handle explicit T2I mode - skip reference image logic
    if (mode === 't2i') {
      console.log(`[Regenerate] Explicit T2I mode - generating from text only`);
      try {
        const imageResult = await this.generateImage(prompt, sceneId, isProductVideo, 'content', imgAspectRatio);
        if (imageResult.success && imageResult.url) {
          return { success: true, newImageUrl: imageResult.url, source: imageResult.source };
        }
      } catch (err: any) {
        console.error(`[Regenerate] T2I error:`, err.message);
      }
      return { success: false, error: 'T2I image generation failed' };
    }
    
    // ===== PHASE 13D: IMAGE-TO-IMAGE REFERENCE SUPPORT FOR REGENERATION =====
    const refConfig = (scene as any).referenceConfig;
    const storedRefUrl = refConfig?.sourceUrl || refConfig?.imageUrl;
    if (refConfig?.mode === 'image-to-image' && storedRefUrl) {
      const i2iSettings = refConfig.i2iSettings || {};
      
      console.log(`[Regenerate] Scene has I2I reference image: ${storedRefUrl}, provider: ${provider || 'auto'}`);
      console.log(`[Regenerate] I2I settings: strength=${i2iSettings.strength || 0.7}`);
      
      try {
        const { imageGenerationService: igs } = await import('./image-generation-service');
        const i2iResult = await igs.generateImageToImage({
          referenceImageUrl: storedRefUrl,
          prompt,
          strength: i2iSettings.strength ?? 0.7,
          provider: provider || undefined,
          aspectRatio: imgAspectRatio,
          useCase: 'scene-integration',
        });
        
        if (i2iResult.url) {
          console.log(`[Regenerate] I2I image generated successfully via ${i2iResult.provider}`);
          return { success: true, newImageUrl: i2iResult.url, source: i2iResult.provider };
        }
        console.log(`[Regenerate] I2I generation returned no URL - falling through to standard generation`);
      } catch (err: any) {
        console.error(`[Regenerate] I2I generation error:`, err.message);
      }
    }
    // ===== END PHASE 13D =====
    
    // Check if prompt requests people/persons - if so, use generateImage which allows people
    const promptLower = prompt.toLowerCase();
    const personIndicators = [' she ', ' her ', ' he ', ' his ', 'woman', 'man', 'person', 'people', 
                              'lady', 'gentleman', 'mother', 'father', 'wife', 'husband', 
                              'grandmother', 'grandfather', 'sitting', 'standing', 'walking'];
    const wantsPerson = personIndicators.some(ind => promptLower.includes(ind));
    
    if (wantsPerson) {
      console.log(`[Regenerate] Prompt requests person - using generateImage (not background-only)`);
      try {
        const imageResult = await this.generateImage(prompt, sceneId, isProductVideo, 'content', imgAspectRatio);
        if (imageResult.success && imageResult.url) {
          return { success: true, newImageUrl: imageResult.url, source: imageResult.source };
        }
        console.log(`[Regenerate] generateImage failed: ${imageResult.error || 'no URL returned'}`);
      } catch (err: any) {
        console.error(`[Regenerate] generateImage error:`, err.message);
      }
    }
    
    // Try content image generation first (for non-person prompts)
    if (this.isContentScene(scene.type)) {
      try {
        const result = await this.generateContentImage(scene, project.title, imgAspectRatio, (scene as any).artPresetId || (project as any).artPresetId || project.artPresetId);
        if (result.imageUrl) {
          return { success: true, newImageUrl: result.imageUrl, source: result.source };
        }
        console.log(`[Regenerate] generateContentImage returned no imageUrl`);
      } catch (err: any) {
        console.error(`[Regenerate] generateContentImage error:`, err.message);
      }
    }
    
    // Try AI background generation (NO PEOPLE - for product overlays)
    try {
      const bgResult = await this.generateAIBackground(prompt, scene.type, imgAspectRatio);
      if (bgResult.backgroundUrl) {
        return { success: true, newImageUrl: bgResult.backgroundUrl, source: bgResult.source };
      }
      console.log(`[Regenerate] generateAIBackground returned no backgroundUrl`);
    } catch (err: any) {
      console.error(`[Regenerate] generateAIBackground error:`, err.message);
    }
    
    // Fallback to stock image
    try {
      const stockResult = await this.getStockImage(prompt);
      if (stockResult.success) {
        return { success: true, newImageUrl: stockResult.url, source: stockResult.source };
      }
      console.log(`[Regenerate] getStockImage failed: ${stockResult.error || 'unknown'}`);
    } catch (err: any) {
      console.error(`[Regenerate] getStockImage error:`, err.message);
    }
    
    console.error(`[Regenerate] All methods failed for scene ${sceneId}`);
    return { success: false, error: 'All image generation methods failed' };
  }

  /**
   * Regenerate the B-roll video for a specific scene
   */
  async regenerateSceneVideo(
    project: VideoProject,
    sceneId: string,
    customQuery?: string,
    provider?: string
  ): Promise<{ success: boolean; newVideoUrl?: string; duration?: number; source?: string; error?: string }> {
    const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex < 0) {
      return { success: false, error: 'Scene not found' };
    }
    
    const scene = project.scenes[sceneIndex];
    // Priority: customQuery > scene.visualDirection > scene.searchQuery (AI-optimized) > buildVideoSearchQuery (fallback)
    const prompt = customQuery || scene.visualDirection || scene.searchQuery || this.buildVideoSearchQuery(scene, project.targetAudience);
    const fallbackQuery = scene.fallbackQuery;
    
    console.log(`[Regenerate] Video for scene ${sceneId} with prompt: "${prompt}"${fallbackQuery ? ` (fallback: "${fallbackQuery}")` : ''} (provider: ${provider || 'stock'})`);
    
    // Phase 9B: Store the requested provider in scene assets for tracking
    if (provider) {
      if (!scene.assets) scene.assets = {};
      (scene.assets as any).requestedProvider = provider;
    }
    
    // AI Video providers (not stock)
    const aiProviders = ['runway', 'kling', 'luma', 'hailuo', 'hunyuan', 'veo', 'fal.ai'];
    
    // If an AI provider is specified, use the AI video service
    if (provider && aiProviders.includes(provider.toLowerCase())) {
      console.log(`[Regenerate] Using AI video provider: ${provider}`);
      
      // Get quality tier: use scene-level override if set, otherwise project tier
      const projectQualityTier = (project as any).qualityTier || 'standard';
      const sceneQualityTier = (scene as any).qualityTier || projectQualityTier;
      console.log(`[Regenerate] Using quality tier: ${sceneQualityTier} (scene override: ${(scene as any).qualityTier || 'none'})`);
      
      try {
        const aiResult = await aiVideoService.generateVideo({
          prompt: prompt,
          duration: Math.min(scene.duration || 5, 10),
          aspectRatio: (project.outputFormat?.aspectRatio as '16:9' | '9:16' | '1:1') || '16:9',
          sceneType: scene.type,
          preferredProvider: provider.toLowerCase(),
          narration: scene.narration,
          mood: (scene as any).analysis?.mood,
          contentType: (scene as any).analysis?.contentType as 'person' | 'product' | 'nature' | 'abstract' | 'lifestyle' | undefined,
          qualityTier: sceneQualityTier as 'ultra' | 'premium' | 'standard',
          artPresetId: scene.artPresetId || (project as any).artPresetId,
          ...(scene.negativePrompt ? { negativePrompt: scene.negativePrompt } : {}),
          // Phase 20D (Task #126): per-scene Seedance 2 native-audio opt-in.
          ...(scene.generateNativeAudio === true ? { generateNativeAudio: true } : {}),
        });
        
        if (aiResult.success && aiResult.s3Url) {
          console.log(`[Regenerate] AI video generated (${aiResult.provider}): ${aiResult.s3Url.substring(0, 80)}...`);
          return {
            success: true,
            newVideoUrl: aiResult.s3Url,
            duration: aiResult.duration,
            source: aiResult.provider || provider,
          };
        } else {
          console.warn(`[Regenerate] AI video generation failed: ${aiResult.error}`);
          return { 
            success: false, 
            error: aiResult.error || `${provider} video generation failed` 
          };
        }
      } catch (err: any) {
        console.error(`[Regenerate] AI video provider ${provider} error:`, err.message);
        return { 
          success: false, 
          error: `${provider} error: ${err.message}` 
        };
      }
    }
    
    // Stock video fallback DISABLED - only use AI-generated videos
    // Pexels and Pixabay are disabled per user request
    console.log(`[Regenerate] No AI provider specified and stock video (Pexels/Pixabay) is disabled`);
    console.log(`[Regenerate] Please select an AI provider: runway, kling, luma, or hailuo`);
    
    return { success: false, error: 'No AI video provider specified. Select Runway, Kling, Luma, or Hailuo to generate video.' };
  }

  /**
   * Switch a scene between using video background and image background
   */
  async switchSceneBackgroundType(
    project: VideoProject,
    sceneId: string,
    preferVideo: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex < 0) {
      return { success: false, error: 'Scene not found' };
    }
    
    const scene = project.scenes[sceneIndex];
    
    if (preferVideo) {
      // Switch to video - need a video URL
      if (!scene.assets?.videoUrl) {
        // Generate one
        const videoResult = await this.regenerateSceneVideo(project, sceneId);
        if (!videoResult.success) {
          return { success: false, error: 'Could not find suitable video' };
        }
        scene.assets = scene.assets || {};
        scene.assets.videoUrl = videoResult.newVideoUrl;
      }
      scene.background = scene.background || { type: 'video', source: '' };
      scene.background.type = 'video';
      scene.background.videoUrl = scene.assets!.videoUrl;
      scene.background.mediaUrl = scene.assets!.videoUrl; // Keep mediaUrl in sync
      scene.assets!.preferVideo = true;
      scene.assets!.preferImage = false;
    } else {
      // Switch to image
      if (!scene.assets?.imageUrl && !scene.assets?.backgroundUrl) {
        // Generate one
        const imageResult = await this.regenerateSceneImage(project, sceneId);
        if (!imageResult.success) {
          return { success: false, error: 'Could not generate image' };
        }
        scene.assets = scene.assets || {};
        scene.assets.imageUrl = imageResult.newImageUrl;
        scene.assets.backgroundUrl = imageResult.newImageUrl;
      }
      scene.background = scene.background || { type: 'image', source: '' };
      scene.background.type = 'image';
      scene.assets!.preferVideo = false;
      scene.assets!.preferImage = true;
    }
    
    return { success: true };
  }

  /**
   * Update product overlay settings for a scene
   * Phase 2: Enhanced User Controls
   */
  updateProductOverlay(
    project: VideoProject,
    sceneId: string,
    settings: {
      enabled?: boolean;
      position?: { x: 'left' | 'center' | 'right'; y: 'top' | 'center' | 'bottom' };
      scale?: number;
      animation?: 'fade' | 'zoom' | 'slide' | 'none';
    }
  ): { success: boolean; error?: string } {
    const sceneIndex = project.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex < 0) {
      return { success: false, error: 'Scene not found' };
    }

    const scene = project.scenes[sceneIndex];
    scene.assets = scene.assets || {};

    // Update enabled state
    if (settings.enabled !== undefined) {
      scene.assets.useProductOverlay = settings.enabled;
    }

    // Update position and scale
    if (settings.position || settings.scale !== undefined || settings.animation) {
      const currentPos = scene.assets.productOverlayPosition || {
        x: 'right' as const,
        y: 'bottom' as const,
        scale: 0.25,
        animation: 'fade' as const,
      };

      scene.assets.productOverlayPosition = {
        x: settings.position?.x || currentPos.x,
        y: settings.position?.y || currentPos.y,
        scale: settings.scale !== undefined ? Math.max(0.1, Math.min(0.8, settings.scale)) : currentPos.scale,
        animation: settings.animation || currentPos.animation,
      };
    }

    console.log(`[UniversalVideoService] Updated product overlay for scene ${sceneId}:`, {
      enabled: scene.assets.useProductOverlay,
      position: scene.assets.productOverlayPosition,
    });

    return { success: true };
  }

  /**
   * Regenerate voiceover for the entire project or specific scenes
   * Phase 2: Enhanced User Controls
   */
  async regenerateVoiceover(
    project: VideoProject,
    options?: {
      voiceId?: string;
      sceneIds?: string[];
      provider?: string;
    }
  ): Promise<{ success: boolean; voiceoverUrl?: string; duration?: number; error?: string }> {
    const voiceId = options?.voiceId || project.voiceId;
    const sceneIds = options?.sceneIds;

    // Collect narration from selected scenes or all scenes
    let scenesToProcess = project.scenes;
    if (sceneIds && sceneIds.length > 0) {
      scenesToProcess = (project.scenes || []).filter(s => sceneIds.includes(s.id));
    }

    if (scenesToProcess.length === 0) {
      return { success: false, error: 'No scenes to process' };
    }

    // Combine all narration text
    const fullNarration = scenesToProcess
      .map(s => s.narration)
      .filter(n => n && n.trim())
      .join('\n\n');

    if (!fullNarration.trim()) {
      return { success: false, error: 'No narration text found' };
    }

    console.log(`[UniversalVideoService] Regenerating voiceover for ${scenesToProcess.length} scenes with voice: ${voiceId || 'default'}${options?.provider ? ` via ${options.provider}` : ''}`);

    try {
      const result = await this.generateVoiceover(fullNarration, voiceId, { provider: options?.provider }, { userId: (project as any).ownerId });

      if (result.success && result.url) {
        // Update project assets
        project.assets.voiceover.fullTrackUrl = result.url;
        project.assets.voiceover.duration = result.duration;

        // Update project voice info if changed
        if (options?.voiceId) {
          project.voiceId = options.voiceId;
        }

        return {
          success: true,
          voiceoverUrl: result.url,
          duration: result.duration,
        };
      }

      return { success: false, error: result.error || 'Voiceover generation failed' };
    } catch (error: any) {
      console.error('[UniversalVideoService] Voiceover regeneration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Regenerate background music with a different style
   * Phase 2: Enhanced User Controls
   */
  async regenerateMusic(
    project: VideoProject,
    style?: string,
    options?: {
      mood?: 'uplifting' | 'calm' | 'dramatic' | 'inspirational' | 'energetic' | 'emotional';
      musicStyle?: 'wellness' | 'corporate' | 'cinematic' | 'ambient' | 'acoustic';
      customPrompt?: string;
      moodModifier?: string;
      musicProvider?: string;
    }
  ): Promise<{ success: boolean; musicUrl?: string; duration?: number; source?: string; error?: string }> {
    const duration = project.totalDuration || 60;
    const mood = options?.mood || 'inspirational';
    const musicStyle = options?.musicStyle || 'wellness';

    console.log(`[UniversalVideoService] Regenerating music: mood=${mood}, style=${musicStyle}, duration=${duration}s`);

    try {
      let musicUrl: string | null = null;
      let musicDuration: number = duration;
      let source: string = 'unknown';

      // Try visual-style-based music generation (Phase 5B-R2)
      const projectVisualStyle = (project as any).visualStyle || style || 'lifestyle';
      const projectMoodModifier = options?.moodModifier || 'default';
      const projectMusicProvider = options?.musicProvider || 'auto';
      
      if (aiMusicService.isAvailable()) {
        console.log(`[UniversalVideoService] Regenerating music with visual style: ${projectVisualStyle}...`);
        const aiMusic = await aiMusicService.generateMusicForVisualStyle({
          visualStyle: projectVisualStyle,
          moodModifier: projectMoodModifier,
          durationSeconds: duration + 3,
          provider: projectMusicProvider,
        });

        if (aiMusic) {
          musicUrl = aiMusic.s3Url;
          musicDuration = aiMusic.duration;
          source = `${projectVisualStyle}-${projectMoodModifier}`;
          console.log(`[UniversalVideoService] Music regenerated: ${source}`);
        } else if (!options?.customPrompt) {
          // Fallback to legacy generateMusic if visual style fails
          console.log('[UniversalVideoService] Visual-style failed, trying legacy approach...');
          const legacyMusic = await aiMusicService.generateMusic({
            duration: duration + 3,
            mood,
            style: musicStyle,
          });
          if (legacyMusic) {
            musicUrl = legacyMusic.s3Url;
            musicDuration = legacyMusic.duration;
            source = `udio-${legacyMusic.mood}-${legacyMusic.style}`;
            console.log(`[UniversalVideoService] Legacy music regenerated: ${source}`);
          }
        }
      }

      // Fallback to ElevenLabs
      if (!musicUrl) {
        console.log('[UniversalVideoService] Falling back to ElevenLabs...');
        const result = await this.generateBackgroundMusic(duration, style || 'lifestyle', project.title);
        if (result && result.url) {
          musicUrl = result.url;
          musicDuration = result.duration;
          source = result.source;
        }
      }

      if (musicUrl) {
        project.assets.music = {
          url: musicUrl,
          duration: musicDuration,
          volume: project.assets.music?.volume || 0.18,
        };

        return {
          success: true,
          musicUrl,
          duration: musicDuration,
          source,
        };
      }

      return { success: false, error: 'Music generation failed' };
    } catch (error: any) {
      console.error('[UniversalVideoService] Music regeneration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update music volume
   * Phase 2: Enhanced User Controls
   */
  updateMusicVolume(
    project: VideoProject,
    volume: number
  ): { success: boolean; error?: string } {
    if (volume < 0 || volume > 1) {
      return { success: false, error: 'Volume must be between 0 and 1' };
    }

    if (!project.assets.music) {
      return { success: false, error: 'No music configured for this project' };
    }

    project.assets.music.volume = volume;
    console.log(`[UniversalVideoService] Updated music volume to ${volume}`);

    return { success: true };
  }

  /**
   * Disable/remove music from project
   * Phase 2: Enhanced User Controls
   */
  disableMusic(project: VideoProject): { success: boolean } {
    project.assets.music = {
      url: '',
      duration: 0,
      volume: 0,
    };
    console.log('[UniversalVideoService] Music disabled for project');
    return { success: true };
  }

  // =============================================
  // PHASE 4: UNDO/REDO SYSTEM
  // =============================================

  private readonly MAX_HISTORY_ENTRIES = 50;

  /**
   * Initialize history for a project if not already present
   */
  initializeHistory(project: VideoProject): void {
    if (!project.history) {
      project.history = {
        entries: [],
        currentIndex: -1,
        maxEntries: this.MAX_HISTORY_ENTRIES,
      };
    }
  }

  /**
   * Push a new state to history before making changes
   * Call this BEFORE modifying the project
   */
  pushToHistory(
    project: VideoProject,
    action: string,
    fieldsToSave: (keyof VideoProject)[] = ['scenes', 'assets']
  ): void {
    this.initializeHistory(project);
    const history = project.history!;

    // Create a snapshot of specified fields
    const previousState: Partial<VideoProject> = {};
    for (const field of fieldsToSave) {
      if (project[field] !== undefined) {
        previousState[field] = JSON.parse(JSON.stringify(project[field]));
      }
    }

    // Remove any entries after current index (discard redo stack)
    if (history.currentIndex < history.entries.length - 1) {
      history.entries = history.entries.slice(0, history.currentIndex + 1);
    }

    // Add new entry
    const entry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      previousState,
    };
    history.entries.push(entry);

    // Trim if exceeds max
    if (history.entries.length > history.maxEntries) {
      history.entries.shift();
    } else {
      history.currentIndex++;
    }

    console.log(`[History] Pushed: ${action} (index: ${history.currentIndex}, total: ${history.entries.length})`);
  }

  /**
   * Undo the last action
   */
  undo(project: VideoProject): { success: boolean; action?: string; error?: string } {
    this.initializeHistory(project);
    const history = project.history!;

    if (history.currentIndex < 0 || history.entries.length === 0) {
      return { success: false, error: 'Nothing to undo' };
    }

    const entry = history.entries[history.currentIndex];
    
    // Save current state for redo before applying previous state
    const currentState: Partial<VideoProject> = {};
    for (const field of Object.keys(entry.previousState) as (keyof VideoProject)[]) {
      if (project[field] !== undefined) {
        currentState[field] = JSON.parse(JSON.stringify(project[field]));
      }
    }

    // Apply previous state
    for (const [key, value] of Object.entries(entry.previousState)) {
      (project as any)[key] = JSON.parse(JSON.stringify(value));
    }

    // Update the entry to store what was undone (for redo)
    entry.previousState = currentState;

    history.currentIndex--;
    console.log(`[History] Undo: ${entry.action} (new index: ${history.currentIndex})`);

    return { success: true, action: entry.action };
  }

  /**
   * Redo the last undone action
   */
  redo(project: VideoProject): { success: boolean; action?: string; error?: string } {
    this.initializeHistory(project);
    const history = project.history!;

    if (history.currentIndex >= history.entries.length - 1) {
      return { success: false, error: 'Nothing to redo' };
    }

    history.currentIndex++;
    const entry = history.entries[history.currentIndex];

    // Save current state before applying redo
    const currentState: Partial<VideoProject> = {};
    for (const field of Object.keys(entry.previousState) as (keyof VideoProject)[]) {
      if (project[field] !== undefined) {
        currentState[field] = JSON.parse(JSON.stringify(project[field]));
      }
    }

    // Apply the stored state (which is what was undone)
    for (const [key, value] of Object.entries(entry.previousState)) {
      (project as any)[key] = JSON.parse(JSON.stringify(value));
    }

    // Update entry for potential future undo
    entry.previousState = currentState;

    console.log(`[History] Redo: ${entry.action} (new index: ${history.currentIndex})`);

    return { success: true, action: entry.action };
  }

  /**
   * Get history status for UI
   */
  getHistoryStatus(project: VideoProject): {
    canUndo: boolean;
    canRedo: boolean;
    undoAction?: string;
    redoAction?: string;
    historyLength: number;
    currentIndex: number;
  } {
    this.initializeHistory(project);
    const history = project.history!;

    return {
      canUndo: history.currentIndex >= 0 && history.entries.length > 0,
      canRedo: history.currentIndex < history.entries.length - 1,
      undoAction: history.currentIndex >= 0 ? history.entries[history.currentIndex]?.action : undefined,
      redoAction: history.currentIndex < history.entries.length - 1 
        ? history.entries[history.currentIndex + 1]?.action 
        : undefined,
      historyLength: history.entries.length,
      currentIndex: history.currentIndex,
    };
  }

  /**
   * Reorder scenes in the project
   * Phase 4: Scene Reordering
   */
  reorderScenes(
    project: VideoProject,
    sceneOrder: string[]
  ): { success: boolean; error?: string } {
    // Validate that all scene IDs are present
    const existingIds = new Set((project.scenes || []).map(s => s.id));
    const newOrderIds = new Set(sceneOrder);

    if (existingIds.size !== newOrderIds.size) {
      return { success: false, error: 'Scene order must contain all scene IDs' };
    }

    for (const id of sceneOrder) {
      if (!existingIds.has(id)) {
        return { success: false, error: `Scene ID ${id} not found` };
      }
    }

    // Reorder scenes based on provided order
    const sceneMap = new Map((project.scenes || []).map(s => [s.id, s]));
    project.scenes = sceneOrder.map((id, index) => {
      const scene = sceneMap.get(id)!;
      scene.order = index;
      return scene;
    });

    console.log(`[UniversalVideoService] Reordered scenes: ${sceneOrder.join(', ')}`);
    return { success: true };
  }

  /**
   * Generate a quick preview at lower quality
   * Phase 4: Preview Generation
   */
  getPreviewRenderProps(project: VideoProject): {
    inputProps: any;
    compositionId: string;
    previewConfig: { fps: number; quality: string; scale: number };
  } {
    const aspectRatio = project.outputFormat.aspectRatio;
    let compositionId = 'UniversalVideo';
    if (aspectRatio === '9:16') compositionId = 'UniversalVideoVertical';
    else if (aspectRatio === '1:1') compositionId = 'UniversalVideoSquare';

    // Lower quality settings for preview
    const previewConfig = {
      fps: 15, // Lower FPS for faster rendering
      quality: 'fast',
      scale: 0.5, // 50% resolution (480p for 1080p source)
    };

    const inputProps = {
      scenes: (project.scenes || []).map(scene => ({
        ...scene,
        previewMode: true,
      })),
      voiceoverUrl: project.assets.voiceover?.fullTrackUrl || '',
      musicUrl: project.assets.music?.url || '',
      musicVolume: project.assets.music?.volume || 0.2,
      brand: project.brand,
      aspectRatio,
      totalDuration: project.totalDuration,
      previewMode: true,
    };

    console.log(`[UniversalVideoService] Preview props for ${project.id}: ${previewConfig.fps}fps, scale ${previewConfig.scale}`);

    return { inputProps, compositionId, previewConfig };
  }
}

export const universalVideoService = new UniversalVideoService();
