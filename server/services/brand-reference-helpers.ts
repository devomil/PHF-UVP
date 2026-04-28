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
import type { Scene, ProductImage, BrandReferenceInput } from '../../shared/video-types';

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
  userId: string | undefined,
): Promise<ReferenceSource | undefined> {
  const primary = pickPrimaryProductImage(productImages);
  if (primary) {
    return { url: primary.url, name: primary.name, origin: 'project-product' };
  }
  // Fallback: this user's own default brand-library image.
  //
  // SECURITY: brand-media is per-user (brandMediaLibrary.uploadedBy is the
  // owning user). We MUST filter by uploadedBy here — otherwise project A
  // owned by user X could auto-attach user Y's "default" brand image,
  // leaking private brand media across tenants. Without a userId we refuse
  // to fall back at all.
  if (!userId) {
    console.warn(
      `[OmniRef] resolveProductReferenceSource: no userId supplied — refusing default-brand-asset fallback to avoid cross-tenant leakage.`,
    );
    return undefined;
  }
  try {
    const rows = await db
      .select()
      .from(brandMediaLibrary)
      .where(
        and(
          eq(brandMediaLibrary.uploadedBy, userId),
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
  userId: string | undefined,
): Promise<ApplyProductReferencesResult> {
  const source = await resolveProductReferenceSource(productImages, userId);
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

/**
 * Task 91: shared validator for reference-set payloads. Used by both the
 * brand-media CRUD routes (validating user input) and the bulk-apply
 * endpoint (validating data read back from the DB). Returning `null`
 * indicates a structural failure — caller should surface a 400 / abort.
 *
 * The cap matches the Seedance 2 omni_reference limit (9 numbered images).
 * Tags are re-normalized to image1..imageN regardless of input order so the
 * stored array's index defines the canonical tag.
 */
export const MAX_BRAND_REFERENCE_SET_ENTRIES = 9;

export function sanitizeBrandReferenceList(input: unknown): BrandReferenceInput[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0 || input.length > MAX_BRAND_REFERENCE_SET_ENTRIES) return null;
  const out: BrandReferenceInput[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i] as Record<string, unknown> | null | undefined;
    if (!r || typeof r !== 'object') return null;
    const assetUrl = typeof r.assetUrl === 'string' ? r.assetUrl.trim() : '';
    if (!assetUrl) return null;
    out.push({
      assetId: typeof r.assetId === 'number' ? r.assetId : undefined,
      assetUrl,
      tag: `image${i + 1}`,
      label: typeof r.label === 'string' ? r.label : undefined,
      width: typeof r.width === 'number' ? r.width : undefined,
      height: typeof r.height === 'number' ? r.height : undefined,
    });
  }
  return out;
}

/**
 * Task 91: apply a saved reference set (ordered list of brand references) to
 * scenes. Two modes are supported via `options`:
 *
 *   - `target: 'all-product'` → only product/solution scenes are touched.
 *     Used by the project-level bulk action that mirrors the existing
 *     single-image bulk-apply.
 *   - `target: 'all'` → every scene is touched (currently unused by the UI but
 *     left in for future flexibility).
 *
 * `replaceExisting` controls whether scenes that already have brandReferences
 * are overwritten. The bulk-apply path defaults to `false` so users don't
 * accidentally clobber per-scene customizations; the per-scene apply path
 * (which is just `onChange()` in the panel) doesn't go through this helper.
 *
 * Tags in the resulting scene are normalized to image1..imageN regardless of
 * the input order so the saved set's order is the canonical tag order.
 */
export interface ApplyReferenceSetResult {
  scenes: Scene[];
  attachedCount: number;
  skippedAlreadyHasRefs: number;
  skippedNonProductType: number;
}

export function applyReferenceSetToScenes(
  scenes: Scene[],
  setReferences: BrandReferenceInput[],
  options: { target: 'all-product' | 'all'; replaceExisting?: boolean },
): ApplyReferenceSetResult {
  const replaceExisting = options.replaceExisting ?? false;
  let attached = 0;
  let skippedHasRefs = 0;
  let skippedNonProduct = 0;

  // Normalize set ordering → image1..imageN, strip stale tags.
  const normalized: BrandReferenceInput[] = setReferences.map((r, i) => ({
    assetId: r.assetId,
    assetUrl: r.assetUrl,
    label: r.label,
    width: r.width,
    height: r.height,
    tag: `image${i + 1}`,
  }));

  if (normalized.length === 0) {
    return {
      scenes,
      attachedCount: 0,
      skippedAlreadyHasRefs: 0,
      skippedNonProductType: 0,
    };
  }

  const next = scenes.map((scene) => {
    if (options.target === 'all-product' && !isProductLikeScene(scene)) {
      skippedNonProduct++;
      return scene;
    }
    const existing = (scene as Scene & { brandReferences?: unknown[] }).brandReferences;
    if (!replaceExisting && existing && existing.length > 0) {
      skippedHasRefs++;
      return scene;
    }
    const updated: Scene = {
      ...scene,
      brandReferences: normalized.map((r) => ({ ...r })),
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
  };
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
