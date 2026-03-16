// Placeholder: stub for overlay configuration service

interface SceneInput {
  sceneId: string;
  visualDirection: string;
  narration: string;
  script?: string;
}

class OverlayConfigurationService {
  async generateOverlaysForProject(
    projectId: string,
    sceneInputs: SceneInput[]
  ): Promise<Map<string, any>> {
    return new Map();
  }
}

export const overlayConfigurationService = new OverlayConfigurationService();
