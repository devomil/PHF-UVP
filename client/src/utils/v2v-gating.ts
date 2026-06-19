/**
 * V2V provider-gating utilities shared by AssetCreatorDialog and
 * the QuickCreateForm in new-project.tsx.
 *
 * Exporting these functions (instead of keeping them as inline JSX expressions)
 * allows unit tests to import from a single source of truth and ensures any
 * change to the gating logic here is immediately reflected in both the UI and
 * the test suite.
 */

// ── AssetCreatorDialog ────────────────────────────────────────────────────────

export type AssetCreatorMode =
  | 't2i' | 't2v' | 'i2v' | 'i2i' | 'v2v'
  | 'upscale-image' | 'upscale-video'
  | 'bg-remove-image' | 'bg-remove-video'
  | 'character-performance' | 'character';

export type ModeCategory = 'generate' | 'transform' | 'toolkit';

export interface AssetCreatorModeGating {
  needsPrompt: boolean;
  needsRefImage: boolean;
  needsRefVideo: boolean;
  category: ModeCategory;
}

export const ASSET_CREATOR_MODE_GATING: Record<AssetCreatorMode, AssetCreatorModeGating> = {
  't2i':                 { needsPrompt: true,  needsRefImage: false, needsRefVideo: false, category: 'generate' },
  't2v':                 { needsPrompt: true,  needsRefImage: false, needsRefVideo: false, category: 'generate' },
  'i2v':                 { needsPrompt: true,  needsRefImage: true,  needsRefVideo: false, category: 'generate' },
  'i2i':                 { needsPrompt: true,  needsRefImage: true,  needsRefVideo: false, category: 'transform' },
  'v2v':                 { needsPrompt: true,  needsRefImage: false, needsRefVideo: true,  category: 'transform' },
  'character':           { needsPrompt: false, needsRefImage: false, needsRefVideo: false, category: 'generate' },
  'character-performance': { needsPrompt: false, needsRefImage: true, needsRefVideo: true, category: 'transform' },
  'upscale-image':       { needsPrompt: false, needsRefImage: true,  needsRefVideo: false, category: 'toolkit' },
  'upscale-video':       { needsPrompt: false, needsRefImage: false, needsRefVideo: true,  category: 'toolkit' },
  'bg-remove-image':     { needsPrompt: false, needsRefImage: true,  needsRefVideo: false, category: 'toolkit' },
  'bg-remove-video':     { needsPrompt: false, needsRefImage: false, needsRefVideo: true,  category: 'toolkit' },
};

/** Returns true when the provider is a Runway variant (no replacement image needed for V2V). */
export function isRunwayV2V(provider: string): boolean {
  return provider.startsWith('runway');
}

/**
 * Whether the provider selector should be rendered.
 * Mirrors: cfg.category !== 'toolkit' && mode !== 'character-performance' &&
 *          mode !== 'character' && (mode !== 'v2v' || referenceVideoUrl)
 */
export function isAssetCreatorProviderSelectorVisible(
  mode: AssetCreatorMode,
  referenceVideoUrl: string,
): boolean {
  const { category } = ASSET_CREATOR_MODE_GATING[mode];
  if (category === 'toolkit') return false;
  if (mode === 'character-performance' || mode === 'character') return false;
  return mode !== 'v2v' || Boolean(referenceVideoUrl);
}

/**
 * Whether the amber "upload a reference video" warning should be shown.
 * Mirrors: mode === 'v2v' && !referenceVideoUrl
 */
export function isAssetCreatorAmberWarningVisible(
  mode: AssetCreatorMode,
  referenceVideoUrl: string,
): boolean {
  return mode === 'v2v' && !referenceVideoUrl;
}

/**
 * Whether the generate button should be enabled (canSubmit).
 * Mirrors the canSubmit expression in AssetCreatorDialog.
 */
export function computeAssetCreatorCanSubmit({
  mode,
  prompt,
  referenceImageUrl,
  referenceVideoUrl,
  replacementImageUrl,
  provider,
  isUploadingVideo = false,
  isUploadingImage = false,
}: {
  mode: AssetCreatorMode;
  prompt: string;
  referenceImageUrl: string;
  referenceVideoUrl: string;
  replacementImageUrl: string;
  provider: string;
  isUploadingVideo?: boolean;
  isUploadingImage?: boolean;
}): boolean {
  const cfg = ASSET_CREATOR_MODE_GATING[mode];
  const needsReplacementForV2V = mode === 'v2v' && !isRunwayV2V(provider);
  return (
    !isUploadingVideo &&
    !isUploadingImage &&
    (!cfg.needsPrompt || Boolean(prompt.trim())) &&
    (!cfg.needsRefImage || Boolean(referenceImageUrl)) &&
    (!cfg.needsRefVideo || Boolean(referenceVideoUrl)) &&
    (!needsReplacementForV2V || Boolean(replacementImageUrl))
  );
}

// ── QuickCreateForm (new-project.tsx) ─────────────────────────────────────────

export type QuickCreateMode = 't2i' | 't2v' | 'i2i' | 'i2v' | 'v2v';

export interface QCModeGating {
  outputType: 'image' | 'video';
  needsRefImage: boolean;
  needsRefVideo: boolean;
}

export const QC_MODE_GATING: Record<QuickCreateMode, QCModeGating> = {
  't2i': { outputType: 'image', needsRefImage: false, needsRefVideo: false },
  't2v': { outputType: 'video', needsRefImage: false, needsRefVideo: false },
  'i2i': { outputType: 'image', needsRefImage: true,  needsRefVideo: false },
  'i2v': { outputType: 'video', needsRefImage: true,  needsRefVideo: false },
  'v2v': { outputType: 'video', needsRefImage: false, needsRefVideo: true  },
};

/**
 * Whether the provider section should be rendered.
 * Mirrors: (genMode !== 'v2v' || referenceVideoUrl)
 */
export function isQCProviderSectionVisible(
  genMode: QuickCreateMode,
  referenceVideoUrl: string,
): boolean {
  return genMode !== 'v2v' || Boolean(referenceVideoUrl);
}

/**
 * Whether the amber "upload a reference video" warning banner should be shown.
 * Mirrors: cfg.needsRefVideo && !referenceVideoUrl
 */
export function isQCAmberBannerVisible(
  genMode: QuickCreateMode,
  referenceVideoUrl: string,
): boolean {
  return QC_MODE_GATING[genMode].needsRefVideo && !referenceVideoUrl;
}

/**
 * Whether the generate button should be disabled (ignoring isLoading).
 * Mirrors: !prompt || (cfg.needsRefVideo && !referenceVideoUrl) || isUploadingVideo
 */
export function isQCGenerateButtonDisabled(
  genMode: QuickCreateMode,
  prompt: string,
  referenceVideoUrl: string,
  isUploadingVideo = false,
  isUploadingImage = false,
): boolean {
  return isUploadingVideo || isUploadingImage || !prompt || (QC_MODE_GATING[genMode].needsRefVideo && !referenceVideoUrl);
}

/**
 * Whether handleSubmit should block early and show a toast.
 * Mirrors: cfg.needsRefVideo && !referenceVideoUrl
 */
export function wouldQCHandleSubmitBlock(
  genMode: QuickCreateMode,
  referenceVideoUrl: string,
): boolean {
  return QC_MODE_GATING[genMode].needsRefVideo && !referenceVideoUrl;
}
