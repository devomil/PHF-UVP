import { AI_VIDEO_PROVIDERS } from './ai-video-providers';

export interface VideoProviderConfig {
  id: string;
  name: string;
  version: string;
  apiProvider: string;
  modelId: string;
  costPer10Seconds: number;
  isExecutable: boolean;
  legacyId: string;
  capabilities: {
    imageToVideo: boolean;
    textToVideo: boolean;
    imageToImage: boolean;
    videoToVideo?: boolean;
    maxResolution: string;
    maxFps: number;
    maxDuration: number;
    strengths: string[];
    weaknesses: string[];
    motionQuality: string;
    temporalConsistency: string;
    nativeAudio: boolean;
    lipSync: boolean;
    effectsPresets: string[];
  };
}

function buildVideoProviders(): Record<string, VideoProviderConfig> {
  const providers: Record<string, VideoProviderConfig> = {};
  
  for (const [id, config] of Object.entries(AI_VIDEO_PROVIDERS)) {
    providers[id] = {
      id,
      name: formatName(id),
      version: extractVersion(id),
      apiProvider: config.apiProvider,
      modelId: config.modelId,
      costPer10Seconds: config.costPerSecond * 10,
      isExecutable: true,
      legacyId: id,
      capabilities: {
        imageToVideo: config.capabilities.i2v,
        textToVideo: config.capabilities.t2v,
        imageToImage: false,
        videoToVideo: config.capabilities.v2v,
        maxResolution: '1080p',
        maxFps: 30,
        maxDuration: config.maxDuration,
        strengths: [],
        weaknesses: [],
        motionQuality: 'high',
        temporalConsistency: 'high',
        nativeAudio: id.includes('veo'),
        lipSync: id.includes('avatar'),
        effectsPresets: [],
      },
    };
  }
  
  return providers;
}

function formatName(id: string): string {
  return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function extractVersion(id: string): string {
  const match = id.match(/(\d+\.?\d*)/);
  return match ? match[1] : '1.0';
}

export const VIDEO_PROVIDERS = buildVideoProviders();

export function getAllVideoProviders(): VideoProviderConfig[] {
  return Object.values(VIDEO_PROVIDERS);
}

export function getProvidersByStrength(strength: string): VideoProviderConfig[] {
  return Object.values(VIDEO_PROVIDERS).filter(p => 
    p.capabilities.strengths.includes(strength)
  );
}
