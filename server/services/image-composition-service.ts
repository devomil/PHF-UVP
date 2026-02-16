// Placeholder: stub for image composition service
import type { CompositionRequest, CompositionResult } from '../../shared/types/image-composition-types';

class ImageCompositionService {
  async compose(request: CompositionRequest): Promise<CompositionResult> {
    return {
      success: false,
      imageUrl: '',
      width: request.output.width,
      height: request.output.height,
      compositionData: {
        productRegions: [],
        environmentPrompt: request.environment.prompt,
      },
      error: 'Image composition service not yet implemented',
    };
  }
}

export const imageCompositionService = new ImageCompositionService();
