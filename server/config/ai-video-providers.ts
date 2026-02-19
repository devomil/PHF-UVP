import { db } from '../db';
import { sql } from 'drizzle-orm';

let cachedPassedProviders: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const PROVIDER_TEST_ID_MAP: Record<string, string[]> = {
  'kling-2.6': ['kling-2.6'],
  'kling-2.6-pro': ['kling-2.6'],
  'kling-2.5': ['kling-2.5'],
  'veo-3.1': ['veo-3.1'],
  'veo-3': ['veo-3'],
  'luma': ['luma'],
  'runway': ['runway'],
  'hailuo': ['hailuo'],
  'wan-2.6': ['wan-2.6'],
  'pika': ['pika'],
  'seedance-1.0': ['seedance-1.0', 'seedance-pro'],
  'sora-2': ['sora-2'],
  'sora-2-pro': ['sora-2-pro'],
  'hunyuan': ['hunyuan'],
};

async function loadPassedProviders(): Promise<Set<string>> {
  try {
    const results = await db.execute(sql`
      SELECT DISTINCT ON (test_id) test_id, status 
      FROM piapi_test_results 
      WHERE category IN ('video', 'i2v')
      ORDER BY test_id, tested_at DESC
    `);
    
    const passedTestIds = new Set<string>();
    for (const row of results.rows as any[]) {
      if (row.status === 'pass') {
        passedTestIds.add(row.test_id);
      }
    }
    
    const passedProviders = new Set<string>();
    for (const [providerKey, testIds] of Object.entries(PROVIDER_TEST_ID_MAP)) {
      if (testIds.some(tid => passedTestIds.has(tid))) {
        passedProviders.add(providerKey);
      }
    }
    
    console.log(`[ProviderFilter] Loaded ${passedProviders.size} passed providers from API test results: ${[...passedProviders].join(', ')}`);
    
    const failedProviders = Object.keys(PROVIDER_TEST_ID_MAP).filter(p => !passedProviders.has(p));
    if (failedProviders.length > 0) {
      console.log(`[ProviderFilter] Excluded ${failedProviders.length} failed/untested providers: ${failedProviders.join(', ')}`);
    }
    
    return passedProviders;
  } catch (error) {
    console.error('[ProviderFilter] Failed to load test results, using safe defaults:', error);
    return new Set(['kling-2.6', 'kling-2.6-pro', 'hailuo', 'wan-2.6', 'veo-3.1']);
  }
}

export async function getPassedProviders(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedPassedProviders && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedPassedProviders;
  }
  cachedPassedProviders = await loadPassedProviders();
  cacheTimestamp = now;
  return cachedPassedProviders;
}

export function clearProviderCache(): void {
  cachedPassedProviders = null;
  cacheTimestamp = 0;
}

export interface AIVideoProviderConfig {
  modelId: string;
  apiProvider: string;
  costPerSecond: number;
  maxDuration: number;
  name?: string;
  type?: 'piapi' | 'direct';
  capabilities: {
    t2v: boolean;
    i2v: boolean;
    v2v: boolean;
  };
  supportedAspectRatios: string[];
}

export const AI_VIDEO_PROVIDERS: Record<string, AIVideoProviderConfig> = {
  'kling': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.03,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-1.6': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.025,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.0': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.03,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.1': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.035,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.1-master': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.19,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.5': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.039,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.5-turbo': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.04,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.6': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.039,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.6-pro': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.066,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.6-motion-control': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.066,
    maxDuration: 30,
    capabilities: { t2v: true, i2v: true, v2v: true },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-2.6-motion-control-pro': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.08,
    maxDuration: 30,
    capabilities: { t2v: true, i2v: true, v2v: true },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-avatar': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.045,
    maxDuration: 60,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'kling-effects': {
    modelId: 'kling',
    apiProvider: 'piapi',
    costPerSecond: 0.02,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'luma': {
    modelId: 'luma',
    apiProvider: 'piapi',
    costPerSecond: 0.04,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'luma-dream-machine': {
    modelId: 'luma',
    apiProvider: 'piapi',
    costPerSecond: 0.04,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'runway': {
    modelId: 'runway',
    apiProvider: 'piapi',
    costPerSecond: 0.05,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'hailuo': {
    modelId: 'hailuo',
    apiProvider: 'piapi',
    costPerSecond: 0.02,
    maxDuration: 6,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'hailuo-minimax': {
    modelId: 'hailuo',
    apiProvider: 'piapi',
    costPerSecond: 0.015,
    maxDuration: 6,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'seedance-1.0': {
    modelId: 'hailuo',
    apiProvider: 'piapi',
    costPerSecond: 0.035,
    maxDuration: 6,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'pika': {
    modelId: 'pika',
    apiProvider: 'piapi',
    costPerSecond: 0.04,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'genmo': {
    modelId: 'genmo',
    apiProvider: 'piapi',
    costPerSecond: 0.03,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'hunyuan': {
    modelId: 'hunyuan',
    apiProvider: 'piapi',
    costPerSecond: 0.025,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'skyreels': {
    modelId: 'skyreels',
    apiProvider: 'piapi',
    costPerSecond: 0.03,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'wan-2.1': {
    modelId: 'wan-2.1',
    apiProvider: 'piapi',
    costPerSecond: 0.025,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'wan-2.6': {
    modelId: 'wan-2.6',
    apiProvider: 'piapi',
    costPerSecond: 0.03,
    maxDuration: 5,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo': {
    modelId: 'veo3',
    apiProvider: 'piapi',
    costPerSecond: 0.06,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo-2': {
    modelId: 'veo2',
    apiProvider: 'piapi',
    costPerSecond: 0.055,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo-3': {
    modelId: 'veo3',
    apiProvider: 'piapi',
    costPerSecond: 0.06,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo-3.1': {
    modelId: 'veo3.1',
    apiProvider: 'piapi',
    costPerSecond: 0.065,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo2': {
    modelId: 'veo2',
    apiProvider: 'piapi',
    costPerSecond: 0.055,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo3': {
    modelId: 'veo3',
    apiProvider: 'piapi',
    costPerSecond: 0.06,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'veo3.1': {
    modelId: 'veo3.1',
    apiProvider: 'piapi',
    costPerSecond: 0.065,
    maxDuration: 8,
    capabilities: { t2v: true, i2v: true, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'sora-2': {
    modelId: 'sora2',
    apiProvider: 'piapi',
    costPerSecond: 0.08,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: false, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  'sora-2-pro': {
    modelId: 'sora2',
    apiProvider: 'piapi',
    costPerSecond: 0.12,
    maxDuration: 10,
    capabilities: { t2v: true, i2v: false, v2v: false },
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
};

export function selectProvidersForScene(scene: any, options?: any): string[] {
  return getConfiguredProviders();
}

export function selectProvidersForSceneSmart(scene: any, options?: any): string[] {
  return ['kling-2.6', 'veo-3.1', 'hailuo'];
}

export function getAllConfiguredProviders(): string[] {
  const configured: string[] = [];
  if (process.env.PIAPI_API_KEY) {
    configured.push('kling-2.6', 'kling-2.6-pro', 'veo-3.1', 'luma', 'hailuo', 'wan-2.6', 'pika', 'seedance-1.0', 'sora-2', 'sora-2-pro');
  }
  return [...new Set(configured)];
}

export function getConfiguredProviders(): string[] {
  return getAllConfiguredProviders();
}

export async function getTestedProviders(): Promise<string[]> {
  const allConfigured = getAllConfiguredProviders();
  const passed = await getPassedProviders();
  
  if (passed.size === 0) {
    const safeDefaults = ['kling-2.6', 'hailuo', 'wan-2.6'];
    const safeFallback = allConfigured.filter(p => safeDefaults.includes(p));
    console.log(`[ProviderFilter] No test results found, using safe defaults: ${safeFallback.join(', ')}`);
    return safeFallback.length > 0 ? safeFallback : allConfigured;
  }
  
  const filtered = allConfigured.filter(provider => {
    return passed.has(provider);
  });
  
  if (filtered.length === 0) {
    const safeDefaults = ['kling-2.6', 'hailuo', 'wan-2.6'];
    const safeFallback = allConfigured.filter(p => safeDefaults.includes(p));
    console.warn(`[ProviderFilter] All providers filtered out, using safe defaults: ${safeFallback.join(', ')}`);
    return safeFallback.length > 0 ? safeFallback : ['kling-2.6', 'hailuo'];
  }
  
  return filtered;
}

export function analyzePromptComplexity(prompt: string): { complexity: string; score: number } {
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 50) return { complexity: 'high', score: 0.8 };
  if (wordCount > 20) return { complexity: 'medium', score: 0.5 };
  return { complexity: 'low', score: 0.2 };
}

export function mapToLegacyProviderId(providerId: string): string {
  return providerId;
}

export function isProviderExecutable(providerId: string): boolean {
  return providerId in AI_VIDEO_PROVIDERS;
}

export const IMAGE_PROVIDERS: Record<string, { modelId: string; apiProvider: string; costPerImage: number }> = {
  'flux': { modelId: 'flux', apiProvider: 'piapi', costPerImage: 0.03 },
  'flux-1-dev': { modelId: 'flux-1-dev', apiProvider: 'piapi', costPerImage: 0.025 },
  'falai': { modelId: 'fal-ai', apiProvider: 'fal', costPerImage: 0.02 },
  'stability': { modelId: 'stable-diffusion-3', apiProvider: 'piapi', costPerImage: 0.02 },
  'ideogram': { modelId: 'ideogram', apiProvider: 'piapi', costPerImage: 0.04 },
  'midjourney': { modelId: 'midjourney', apiProvider: 'piapi', costPerImage: 0.05 },
  'dalle3': { modelId: 'dall-e-3', apiProvider: 'openai', costPerImage: 0.04 },
};
