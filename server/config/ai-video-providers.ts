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
};

export function selectProvidersForScene(scene: any, options?: any): string[] {
  return getConfiguredProviders();
}

export function selectProvidersForSceneSmart(scene: any, options?: any): string[] {
  return ['kling-2.6', 'veo-3.1', 'luma'];
}

export function getConfiguredProviders(): string[] {
  const configured: string[] = [];
  if (process.env.PIAPI_API_KEY) {
    configured.push('kling-2.6', 'kling-2.6-pro', 'veo-3.1', 'luma', 'runway', 'hailuo', 'wan-2.6', 'pika', 'seedance-1.0');
  }
  if (process.env.RUNWAY_API_KEY) {
    configured.push('runway-direct');
  }
  if (process.env.STABILITY_API_KEY) {
    configured.push('stability-direct');
  }
  return [...new Set(configured)];
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
