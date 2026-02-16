// Placeholder: stub for I2V provider capabilities

interface I2VProviderCapability {
  name: string;
  maxDuration: number;
  supportedMotionStyles: string[];
  qualityTier: string;
  costPerSecond: number;
}

export const I2V_PROVIDER_CAPABILITIES: Record<string, I2VProviderCapability> = {
  default: {
    name: 'Default I2V Provider',
    maxDuration: 10,
    supportedMotionStyles: ['subtle', 'dynamic', 'environmental'],
    qualityTier: 'standard',
    costPerSecond: 0.1,
  },
};

export function selectI2VProvider(
  motionStyle: string,
  duration: number,
  preferQuality: boolean
): string {
  return 'default';
}

export function getAllI2VProviders(): string[] {
  return Object.keys(I2V_PROVIDER_CAPABILITIES);
}
