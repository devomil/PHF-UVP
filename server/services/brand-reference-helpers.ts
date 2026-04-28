// Phase 20C: Server-side helpers for the omni_reference brand-anchoring path.
//
// `applyProductReferencesToScenes` walks a project's scenes and attaches the
// project's primary product image as a single brand reference (`@image1`) on
// every product/solution scene that does not yet have any brandReferences.
//
// `resolveProductReferenceSource` picks the best available reference image:
// prefers `project.assets.productImages[]`, then falls back to any global
// default brand-media image (isDefault=true, mediaType='image').
//
// Idempotent: scenes that already have brandReferences are left untouched, so
// it is safe to run on first generation, on demand from the bulk-apply button,
// or both. Returns the mutated scenes array and a count of attached scenes.

import { db } from '../db';
import { brandMediaLibrary } from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Scene, ProductImage } from '../../shared/video-types';

/**
 * Phase 20C — spec contract: brand-reference auto/bulk-apply targets ONLY
 * scenes whose contentType is `product` or `solution`. We deliberately do NOT
 * attach references to `cta`, `outro`, `intro`, `branded-environment`, etc.,
 * because those scenes are pacing/tonal and don't necessarily depict the
 * product. Users can still attach references manually per-scene.
 *
 * The `assets.sceneType` legacy aliases `product-hero` and `product-in-context`
 * (see video-types.ts:426) are explicit product depictions, so they qualify.
 */
const PRODUCT_CONTENT_TYPES = new Set<string>(['product', 'solution']);
const LEGACY_PRODUCT_ASSET_SCENE_TYPES = new Set<string>([
  'product-hero',
  'product-in-context',
]);

export interface ApplyProductReferencesResult {
  scenes: Scene[];
  attachedCount: number;
  skippedAlreadyHasRefs: number;
  skippedNonProductType: number;
  primaryAsset?: { id?: string | number; url: string; name?: string };
}

export function isProductLikeScene(scene: Scene): boolean {
  // Spec primary signal: scene.contentType === 'product' | 'solution'.
  const sceneAny = scene as Scene & {
    contentType?: string;
    type?: string;
    assets?: { sceneType?: string };
  };
  const contentType = (sceneAny.contentType || '').toString().toLowerCase();
  if (PRODUCT_CONTENT_TYPES.has(contentType)) return true;

  // Back-compat: many older scenes encode the same intent via `type` instead
  // of `contentType` (e.g. type: 'product'). Accept the same narrow set.
  const t = (sceneAny.type || '').toString().toLowerCase();
  if (PRODUCT_CONTENT_TYPES.has(t)) return true;

  // Legacy hint: assets.sceneType of `product-hero` / `product-in-context`
  // unambiguously depicts the product. `branded-environment` does NOT — it
  // shows an environment branded with the product, which is a tonal frame.
  const assetType = (sceneAny.assets?.sceneType || '').toString().toLowerCase();
  if (LEGACY_PRODUCT_ASSET_SCENE_TYPES.has(assetType)) return true;

  return false;
}

export function pickPrimaryProductImage(productImages: ProductImage[] | undefined): ProductImage | undefined {
  if (!productImages || productImages.length === 0) return undefined;
  return productImages.find((img) => img.isPrimary === true) || productImages[0];
}

/**
 * Phase 20C: shared resolver for "what brand image should we anchor scenes to?"
 *
 * Resolution order (per spec):
 *   1. The project's own product image (primary first, else first in list).
 *   2. Global default brand-media image (mediaType='image' AND isDefault=true).
 *
 * Returns `undefined` when no usable source exists. Both call sites — the
 * bulk-apply HTTP endpoint and the bulk-regenerate auto-apply pass — use this
 * resolver so behavior is identical.
 */
export interface ReferenceSource {
  url: string;
  name?: string;
  /** Where the image came from. `default-brand-asset` indicates the global
   *  fallback was used. */
  origin: 'project-product' | 'default-brand-asset';
}

export async function resolveProductReferenceSource(
  productImages: ProductImage[] | undefined,
): Promise<ReferenceSource | undefined> {
  const primary = pickPrimaryProductImage(productImages);
  if (primary) {
    return { url: primary.url, name: primary.name, origin: 'project-product' };
  }
  // Fallback: any global default brand-library image.
  try {
    const rows = await db
      .select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.mediaType, 'image'),
          eq(brandMediaLibrary.isDefault, true),
          eq(brandMediaLibrary.isActive, true),
        ),
      )
      .limit(1);
    const fallback = rows[0];
    if (fallback?.url) {
      return {
        url: fallback.url,
        name: fallback.name || 'Default brand image',
        origin: 'default-brand-asset',
      };
    }
  } catch (err: any) {
    console.warn(
      `[OmniRef] resolveProductReferenceSource: default-brand-asset query failed (non-fatal): ${err?.message}`,
    );
  }
  return undefined;
}

/**
 * Synchronous variant kept for backward compatibility — uses ONLY
 * productImages (no default-brand fallback). Prefer
 * `applyProductReferencesToScenesWithFallback` for new call sites.
 */
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
  return applyReferenceSourceToScenes(scenes, {
    url: primary.url,
    name: primary.name,
    origin: 'project-product',
  });
}

/**
 * Phase 20C: async variant that resolves the source via
 * `resolveProductReferenceSource` (project product image first, then global
 * default brand-media image) and then attaches it. Idempotent.
 */
export async function applyProductReferencesToScenesWithFallback(
  scenes: Scene[],
  productImages: ProductImage[] | undefined,
): Promise<ApplyProductReferencesResult> {
  const source = await resolveProductReferenceSource(productImages);
  if (!source) {
    return {
      scenes,
      attachedCount: 0,
      skippedAlreadyHasRefs: 0,
      skippedNonProductType: 0,
    };
  }
  return applyReferenceSourceToScenes(scenes, source);
}

function applyReferenceSourceToScenes(
  scenes: Scene[],
  source: ReferenceSource,
): ApplyProductReferencesResult {
  let attached = 0;
  let skippedHasRefs = 0;
  let skippedNonProduct = 0;

  const next = scenes.map((scene) => {
    const existing = (scene as Scene & { brandReferences?: unknown[] }).brandReferences;
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
          assetUrl: source.url,
          tag: 'image1',
          label: source.name || 'Product',
        },
      ],
      useOmniReference: true,
    };
    attached++;
    return updated;
  });

  return {
    scenes: next,
    attachedCount: attached,
    skippedAlreadyHasRefs: skippedHasRefs,
    skippedNonProductType: skippedNonProduct,
    primaryAsset: { url: source.url, name: source.name },
  };
}
