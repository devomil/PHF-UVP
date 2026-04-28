// Phase 20C: Server-side helpers for the omni_reference brand-anchoring path.
//
// `applyProductReferencesToScenes` walks a project's scenes and attaches the
// project's primary product image as a single brand reference (`@image1`) on
// every product/solution scene that does not yet have any brandReferences.
//
// Idempotent: scenes that already have brandReferences are left untouched, so
// it is safe to run on first generation, on demand from the bulk-apply button,
// or both. Returns the mutated scenes array and a count of attached scenes.

import type { Scene, ProductImage } from '../../shared/video-types';

const PRODUCT_SCENE_TYPES = new Set<string>([
  'product',
  'solution',
  'product-hero',
  'product-in-context',
  'branded-environment',
  'cta',
  'outro',
]);

export interface ApplyProductReferencesResult {
  scenes: Scene[];
  attachedCount: number;
  skippedAlreadyHasRefs: number;
  skippedNonProductType: number;
  primaryAsset?: { id?: string | number; url: string; name?: string };
}

export function isProductLikeScene(scene: Scene): boolean {
  const t = ((scene as any)?.type || '').toString().toLowerCase();
  if (PRODUCT_SCENE_TYPES.has(t)) return true;
  // Some legacy scenes mark intent via assets.sceneType (see video-types.ts:426)
  const assetType = ((scene as any)?.assets?.sceneType || '').toString().toLowerCase();
  if (assetType.startsWith('product-') || assetType === 'branded-environment') return true;
  return false;
}

export function pickPrimaryProductImage(productImages: ProductImage[] | undefined): ProductImage | undefined {
  if (!productImages || productImages.length === 0) return undefined;
  return productImages.find((img) => img.isPrimary === true) || productImages[0];
}

export function applyProductReferencesToScenes(
  scenes: Scene[],
  productImages: ProductImage[] | undefined,
): ApplyProductReferencesResult {
  const primary = pickPrimaryProductImage(productImages);
  if (!primary) {
    return {
      scenes,
      attachedCount: 0,
      skippedAlreadyHasRefs: 0,
      skippedNonProductType: 0,
    };
  }

  let attached = 0;
  let skippedHasRefs = 0;
  let skippedNonProduct = 0;

  const next = scenes.map((scene) => {
    const existing = (scene as any).brandReferences as Array<unknown> | undefined;
    if (existing && existing.length > 0) {
      skippedHasRefs++;
      return scene;
    }
    if (!isProductLikeScene(scene)) {
      skippedNonProduct++;
      return scene;
    }
    const updated: Scene = {
      ...scene,
      brandReferences: [
        {
          assetUrl: primary.url,
          tag: 'image1',
          label: primary.name || 'Product',
        },
      ],
      useOmniReference: true,
    } as Scene;
    attached++;
    return updated;
  });

  return {
    scenes: next,
    attachedCount: attached,
    skippedAlreadyHasRefs: skippedHasRefs,
    skippedNonProductType: skippedNonProduct,
    primaryAsset: { id: primary.id, url: primary.url, name: primary.name },
  };
}
