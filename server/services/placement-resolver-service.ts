// Placeholder: placement resolver service stubs

export interface I2IConfig {
  strength: number;
  guidanceScale: number;
  description: string;
}

interface PlacementRulesResult {
  i2i: I2IConfig;
}

interface PlacementContext {
  frameWidth: number;
  frameHeight: number;
  useCase: string;
}

export function resolvePlacementRules(assetType: string, context: PlacementContext): PlacementRulesResult {
  return {
    i2i: {
      strength: 0.35,
      guidanceScale: 3.5,
      description: `Default I2I config for ${assetType} (${context.useCase})`,
    },
  };
}
