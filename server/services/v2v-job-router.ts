// Pure routing decision logic for Video-to-Video (V2V) jobs.
//
// Extracted so it can be unit-tested without dragging in DB, storage, or
// any provider SDK. The worker and route handler both delegate here.

export interface V2VNotDetected {
  isV2V: false;
}

export interface V2VRouteParams {
  isV2V: true;
  refVideoUrl: string;
  jobProvider: string;
  isRunwayV2V: boolean;
  replacementImage: string | undefined;
}

export type V2VRouteDecision = V2VNotDetected | V2VRouteParams;

/**
 * Inspect i2vSettings and provider to determine whether a job should be
 * dispatched as a V2V request, and if so which provider path to take.
 *
 * Throws if:
 *  - assetLibraryMode === 'v2v' but referenceVideoUrl is absent
 *
 * Returns { isV2V: false } for any non-V2V job.
 */
export function buildV2VRouteDecision(
  i2vSettings: unknown,
  provider: string | null | undefined,
  sourceImageUrl: string | null | undefined,
): V2VRouteDecision {
  const isV2VJob = (i2vSettings as any)?.assetLibraryMode === 'v2v';
  if (!isV2VJob) return { isV2V: false };

  const refVideoUrl = (i2vSettings as any)?.referenceVideoUrl as string | undefined;
  if (!refVideoUrl) {
    throw new Error('[V2V] Job is marked as V2V but has no referenceVideoUrl in i2vSettings');
  }

  const jobProvider = (provider === 'auto' ? undefined : provider) || 'kling-2.6';
  const isRunwayV2V = jobProvider.startsWith('runway');

  return {
    isV2V: true,
    refVideoUrl,
    jobProvider,
    isRunwayV2V,
    replacementImage: sourceImageUrl || undefined,
  };
}

/**
 * Resolve the effectiveProvider for a V2V request.
 *
 * When the caller supplied no provider or the synthetic 'auto' sentinel,
 * pick the first real entry from the V2V provider catalog list (index 1 —
 * index 0 is always the 'auto' synthetic entry), falling back to 'kling-2.6'
 * if the catalog is unexpectedly empty.
 */
export function resolveV2VProvider(
  effectiveProvider: string | null | undefined,
  v2vProviders: Array<{ id: string }>,
): string {
  if (!effectiveProvider || effectiveProvider === 'auto') {
    const firstReal = v2vProviders.find(p => p.id !== 'auto');
    return firstReal?.id || 'kling-2.6';
  }
  return effectiveProvider;
}
