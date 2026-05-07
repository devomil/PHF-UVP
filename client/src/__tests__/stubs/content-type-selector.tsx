// Test-only stub for `client/src/components/video/content-type-selector`,
// which is referenced by scene-card.tsx but not checked in. Wired up via
// `resolve.alias` in vitest.config.ts so render tests can mount scene-card
// without bringing in the real (missing) selector.

import * as React from "react";

export type ContentType =
  | "lifestyle"
  | "product"
  | "ugc"
  | "testimonial"
  | "broll"
  | "explainer"
  | (string & {});

export function getContentTypeIcon(_type: ContentType): React.ReactNode {
  return null;
}

export function ContentTypeSelector(_: {
  value: ContentType;
  onChange: (next: ContentType) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return React.createElement("div", {
    "data-testid": "content-type-selector-stub",
  });
}
