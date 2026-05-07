// Thin extraction of the project-header SceneDefaultsBulkAction mount
// from project-detail.tsx. Lives as its own component so we can render-
// test the "shown only when !isStudioPolish && scenes.length > 0" gate
// without booting the entire 7k-line project page.
//
// The runtime contract is unchanged: project-detail.tsx renders
// <ProjectSceneDefaultsSection .../> in the same place where the inline
// JSX used to live.

import { SceneDefaultsBulkAction } from "./scene-defaults-bulk-action";
import type { Scene } from "@shared/video-types";

interface Props {
  isStudioPolish: boolean;
  projectId: string;
  scenes: Scene[];
  projectPreferredProvider?: string;
  onUpdated?: () => void;
}

export function ProjectSceneDefaultsSection({
  isStudioPolish,
  projectId,
  scenes,
  projectPreferredProvider,
  onUpdated,
}: Props) {
  if (isStudioPolish) return null;
  if (!scenes || scenes.length === 0) return null;

  return (
    <div className="mt-2" data-testid="project-scene-defaults-section">
      <SceneDefaultsBulkAction
        projectId={projectId}
        scenes={scenes}
        projectPreferredProvider={projectPreferredProvider}
        onUpdated={onUpdated}
      />
    </div>
  );
}

export default ProjectSceneDefaultsSection;
