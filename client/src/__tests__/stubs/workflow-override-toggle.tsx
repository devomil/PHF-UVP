// Test-only stub for `client/src/components/video/workflow-override-toggle`,
// which scene-card.tsx imports but isn't checked in. Wired up via
// `resolve.alias` in vitest.config.ts.

import * as React from "react";

export function WorkflowOverrideCompact(_: {
  sceneId: string;
  useBrandAssets: boolean;
  onToggle: (sceneId: string, useBrandAssets: boolean) => void | Promise<void>;
  disabled?: boolean;
}) {
  return React.createElement("div", {
    "data-testid": "workflow-override-compact-stub",
  });
}
