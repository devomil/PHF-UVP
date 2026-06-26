import { db } from '../db';
import { sql } from 'drizzle-orm';

export type { AIVideoProviderConfig } from './ai-video-providers-static';
export { AI_VIDEO_PROVIDERS, PROVIDER_TEST_ID_MAP } from './ai-video-providers-static';
import { AI_VIDEO_PROVIDERS, PROVIDER_TEST_ID_MAP } from './ai-video-providers-static';

let cachedPassedProviders: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

export function selectProvidersForScene(scene: any, options?: any): string[] {
  return getConfiguredProviders();
}

export function selectProvidersForSceneSmart(scene: any, options?: any): string[] {
  return ['kling-2.6', 'veo-3.1', 'hailuo'];
}

export function getAllConfiguredProviders(): string[] {
  const configured: string[] = [];
  if (process.env.PIAPI_API_KEY) {
    configured.push('kling-2.6', 'kling-2.6-pro', 'kling-2.1-master', 'kling-2.6-motion-control-pro', 'veo-3.1', 'luma', 'hailuo', 'wan-2.6', 'pika', 'seedance-1.0', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2-lr', 'sora-2', 'sora-2-pro');
  }
  if (process.env.RUNWAY_API_KEY) {
    configured.push('runway', 'runway-4.5', 'runway-gen4', 'runway-gen4-aleph', 'runway-act-two', 'runway-aleph-2', 'runway-agent-2', 'runway-happy-horse-1');
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
