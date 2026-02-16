// Placeholder: image provider configuration stubs

export type ImageStyle = 'default' | 'lifestyle' | 'hero-shot' | 'product-photo' | 'artistic' | 'nature' | 'person';

export interface ImageProvider {
  id: string;
  name: string;
  modelId: string;
  costPerImage: number;
  apiProvider: 'piapi' | 'fal' | 'stability' | 'legnext' | 'openai';
  maxWidth?: number;
  maxHeight?: number;
  defaultParams?: Record<string, any>;
}

export const IMAGE_PROVIDERS: Record<string, ImageProvider> = {
  'flux': {
    id: 'flux',
    name: 'Flux Schnell',
    modelId: 'Qubico/flux1-schnell',
    costPerImage: 0.003,
    apiProvider: 'piapi',
  },
  'flux-1-dev': {
    id: 'flux-1-dev',
    name: 'Flux 1 Dev',
    modelId: 'Qubico/flux1-dev',
    costPerImage: 0.006,
    apiProvider: 'piapi',
  },
  'flux-kontext': {
    id: 'flux-kontext',
    name: 'Flux Kontext',
    modelId: 'Qubico/flux1-dev-advanced',
    costPerImage: 0.01,
    apiProvider: 'piapi',
  },
  'flux-1.1-pro': {
    id: 'flux-1.1-pro',
    name: 'Flux 1.1 Pro',
    modelId: 'flux-pro',
    costPerImage: 0.04,
    apiProvider: 'piapi',
  },
  'falai': {
    id: 'falai',
    name: 'Fal.ai Flux',
    modelId: 'fal-ai/flux/schnell',
    costPerImage: 0.003,
    apiProvider: 'fal',
  },
  'stable-diffusion-3': {
    id: 'stable-diffusion-3',
    name: 'Stable Diffusion 3',
    modelId: 'sd3',
    costPerImage: 0.04,
    apiProvider: process.env.STABILITY_API_KEY ? 'stability' : 'piapi',
  },
  'ideogram': {
    id: 'ideogram',
    name: 'Ideogram V2',
    modelId: 'ideogram-v2',
    costPerImage: 0.05,
    apiProvider: 'piapi',
  },
  'midjourney': {
    id: 'midjourney',
    name: 'Midjourney',
    modelId: 'midjourney',
    costPerImage: 0.08,
    apiProvider: 'legnext',
    defaultParams: { stylize: 100 },
  },
  'dalle3': {
    id: 'dalle3',
    name: 'DALL-E 3',
    modelId: 'dall-e-3',
    costPerImage: 0.04,
    apiProvider: 'openai',
  },
};

export function getImageProviderForStyle(style: ImageStyle, qualityTier: string): ImageProvider {
  const tierMap: Record<string, Record<string, string>> = {
    ultra: { default: 'midjourney', 'hero-shot': 'midjourney', 'product-photo': 'midjourney', lifestyle: 'midjourney', artistic: 'midjourney', nature: 'midjourney', person: 'midjourney' },
    premium: { default: 'flux-1.1-pro', 'hero-shot': 'flux-1.1-pro', 'product-photo': 'flux-1.1-pro', lifestyle: 'flux-1.1-pro', artistic: 'ideogram', nature: 'flux-1.1-pro', person: 'flux-1.1-pro' },
    standard: { default: 'flux', 'hero-shot': 'flux', 'product-photo': 'flux', lifestyle: 'flux', artistic: 'flux', nature: 'flux', person: 'flux' },
  };

  const providerId = tierMap[qualityTier]?.[style] || tierMap['premium']?.['default'] || 'flux';
  return IMAGE_PROVIDERS[providerId] || IMAGE_PROVIDERS['flux'];
}

export function isLegNextProvider(providerId: string): boolean {
  const provider = IMAGE_PROVIDERS[providerId];
  return provider?.apiProvider === 'legnext';
}
