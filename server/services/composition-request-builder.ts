// Placeholder: stub for composition request builder
import type { CompositionRequest } from '../../shared/types/image-composition-types';

class CompositionRequestBuilder {
  buildFromSimpleParams(
    sceneId: string,
    environmentPrompt: string,
    productUrls: string[],
    options?: any
  ): CompositionRequest {
    return {
      sceneId,
      visualDirection: environmentPrompt,
      environment: {
        prompt: environmentPrompt,
        style: 'photorealistic',
        lighting: 'natural',
      },
      products: [],
      output: {
        width: options?.width || 1920,
        height: options?.height || 1080,
        format: 'png',
        quality: 90,
      },
    };
  }

  async build(
    sceneId: string,
    visualDirection: string,
    analysis: any,
    outputType: string
  ): Promise<CompositionRequest> {
    return {
      sceneId,
      visualDirection,
      environment: {
        prompt: visualDirection,
        style: 'photorealistic',
        lighting: 'natural',
      },
      products: [],
      output: {
        width: 1920,
        height: 1080,
        format: 'png',
        quality: 90,
      },
    };
  }
}

export const compositionRequestBuilder = new CompositionRequestBuilder();
