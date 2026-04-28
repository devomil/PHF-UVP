// Phase 20C: Multi-image brand reference panel for Seedance 2 omni_reference.
//
// Lets the user attach 1-N brand assets to a scene, each numbered @image1,
// @image2, ..., reorder them by drag, and remove individual entries. Tag
// numbering is index-based and re-flows on remove/reorder. The parent owns
// persistence (PATCH `brandReferences`) — this component is purely a
// controlled value editor.

import { useState, useMemo, useRef, useEffect } from 'react';
import { Image as ImageIcon, Plus, X, GripVertical, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { BrandReferenceInput } from '@shared/video-types';
import { buildOmniReferencePrompt, analyzeReferenceHealth } from '@shared/omni-reference-prompt';

interface BrandMediaAsset {
  id: number;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  mediaType: string;
  width?: number | null;
  height?: number | null;
  assetCategory?: string | null;
}

interface BrandReferencePanelProps {
  references: BrandReferenceInput[];
  onChange: (next: BrandReferenceInput[]) => void;
  basePrompt: string;
  onPromptChange?: (next: string) => void;
  /** Project aspect ratio, e.g. "16:9" — used to flag refs whose dimensions
   * clash with the project AR. */
  projectAspectRatio?: string;
  /** When true, the panel renders a green "Anchored — Seedance 2" chip; when
   * false (e.g. provider != Seedance 2), an amber switcher chip is shown. */
  providerSupportsOmniRef: boolean;
  /** Optional: parent-supplied switcher when provider is incompatible. */
  onSwitchProvider?: () => void;
  providerLabel?: string;
  /** Last successfully generated video URL on this scene — when set and refs
   * are attached, the panel renders a post-gen verification chip. */
  lastVideoUrl?: string | null;
  /** Triggered by the "Re-generate with stronger anchoring" link in the
   * verification chip. Parent typically appends a stronger anchoring phrase
   * to the prompt and kicks off generation. */
  onRegenerateWithStrongerAnchoring?: () => void;
}

// Phase 20C: Seedance 2 omni_reference supports up to 9 numbered images.
const MAX_BRAND_REFS = 9;

function normalizeRefs(refs: BrandReferenceInput[]): BrandReferenceInput[] {
  return refs.map((r, i) => ({ ...r, tag: `image${i + 1}` }));
}

/**
 * Compute a tag rename / removal mapping by matching prev → next references
 * by `assetUrl`. Items present in `prev` but missing from `next` are flagged
 * for removal; items whose index changed are flagged for rename.
 */
function computeTagRemap(
  prev: BrandReferenceInput[],
  next: BrandReferenceInput[],
): { rename: Map<string, string>; remove: Set<string> } {
  const rename = new Map<string, string>();
  const remove = new Set<string>();
  const newTagByUrl = new Map<string, string>();
  next.forEach((r, i) => newTagByUrl.set(r.assetUrl, `image${i + 1}`));
  prev.forEach((r, i) => {
    const oldTag = `image${i + 1}`;
    const newTag = newTagByUrl.get(r.assetUrl);
    if (!newTag) remove.add(oldTag);
    else if (newTag !== oldTag) rename.set(oldTag, newTag);
  });
  return { rename, remove };
}

/**
 * Atomically rewrite `@imageN` tokens in `prompt` according to the rename
 * map and removal set. Single-pass replacement avoids cascade collisions
 * (e.g. image2→image1 then image3→image2 would otherwise smash together).
 */
function applyTagRemap(
  prompt: string,
  rename: Map<string, string>,
  remove: Set<string>,
): string {
  const out = prompt.replace(/@image(\d+)\b\.?/gi, (full, num) => {
    const old = `image${num}`;
    if (remove.has(old)) return '';
    if (rename.has(old)) {
      const trailingDot = full.endsWith('.') ? '.' : '';
      return `@${rename.get(old)}${trailingDot}`;
    }
    return full;
  });
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function describeRemap(rename: Map<string, string>, remove: Set<string>): string {
  const parts: string[] = [];
  if (remove.size > 0) {
    parts.push(`remove ${[...remove].map((t) => `@${t}`).join(', ')}`);
  }
  if (rename.size > 0) {
    parts.push(
      [...rename.entries()].map(([o, n]) => `@${o} → @${n}`).join(', '),
    );
  }
  return parts.join('\n');
}

function promptHasAnyAffectedTag(
  prompt: string,
  rename: Map<string, string>,
  remove: Set<string>,
): boolean {
  for (const tag of [...rename.keys(), ...remove]) {
    if (new RegExp(`@${tag}\\b`, 'i').test(prompt)) return true;
  }
  return false;
}

function parseAR(ar: string | undefined): number | undefined {
  if (!ar) return undefined;
  const [w, h] = ar.split(':').map((n) => parseInt(n, 10));
  if (!w || !h) return undefined;
  return w / h;
}

function aspectRatioConflict(asset: { width?: number | null; height?: number | null }, projectAR?: string): boolean {
  const target = parseAR(projectAR);
  if (!target || !asset.width || !asset.height) return false;
  const refAR = asset.width / asset.height;
  // Conflict only if orientation flips (landscape vs portrait).
  return (target > 1 && refAR < 1) || (target < 1 && refAR > 1);
}

export function BrandReferencePanel({
  references,
  onChange,
  basePrompt,
  onPromptChange,
  projectAspectRatio,
  providerSupportsOmniRef,
  onSwitchProvider,
  providerLabel,
  lastVideoUrl,
  onRegenerateWithStrongerAnchoring,
}: BrandReferencePanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<BrandMediaAsset[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const tagInfoRef = useRef<Map<string, BrandMediaAsset>>(new Map());

  const omniResult = useMemo(
    () => buildOmniReferencePrompt({ basePrompt, references }),
    [basePrompt, references],
  );
  const health = useMemo(
    () => analyzeReferenceHealth({ prompt: basePrompt, references }),
    [basePrompt, references],
  );

  // Lazy-load the brand media library on first picker open.
  const loadLibrary = async () => {
    if (library.length > 0 || loadingLibrary) return;
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/brand-media-library', { credentials: 'include' });
      const data = await res.json();
      const assets: BrandMediaAsset[] = (data?.assets || []).filter(
        (a: any) => a.mediaType === 'image' && a.url,
      );
      setLibrary(assets);
      const m = tagInfoRef.current;
      assets.forEach((a) => m.set(a.url, a));
    } catch (e) {
      console.error('[BrandReferencePanel] Failed to load brand media library', e);
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    if (pickerOpen) loadLibrary();
  }, [pickerOpen]);

  const addReference = (asset: BrandMediaAsset) => {
    const exists = references.some((r) => r.assetUrl === asset.url);
    if (exists) {
      setPickerOpen(false);
      return;
    }
    const next: BrandReferenceInput[] = normalizeRefs([
      ...references,
      {
        assetId: asset.id,
        assetUrl: asset.url,
        tag: `image${references.length + 1}`,
        label: asset.name,
      },
    ]);
    onChange(next);
    tagInfoRef.current.set(asset.url, asset);
    setPickerOpen(false);
  };

  const offerPromptRemap = (
    prev: BrandReferenceInput[],
    next: BrandReferenceInput[],
    verb: 'Remove' | 'Reorder',
  ) => {
    if (!onPromptChange) return;
    const { rename, remove } = computeTagRemap(prev, next);
    if (rename.size === 0 && remove.size === 0) return;
    if (!promptHasAnyAffectedTag(basePrompt, rename, remove)) return;
    const fixed = applyTagRemap(basePrompt, rename, remove);
    if (fixed === basePrompt) return;
    const desc = describeRemap(rename, remove);
    const proceed = window.confirm(
      `${verb} updated the reference order. Apply matching changes to the prompt?\n\n${desc}`,
    );
    if (proceed) onPromptChange(fixed);
  };

  const removeReference = (index: number) => {
    const prev = references;
    const next = normalizeRefs(references.filter((_, i) => i !== index));
    onChange(next);
    offerPromptRemap(prev, next, 'Remove');
  };

  const onDragStart = (i: number) => setDragIndex(i);
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
  };
  const onDrop = (i: number) => {
    if (dragIndex === null || dragIndex === i) return;
    const prev = references;
    const reordered = [...references];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(i, 0, moved);
    const next = normalizeRefs(reordered);
    onChange(next);
    setDragIndex(null);
    offerPromptRemap(prev, next, 'Reorder');
  };

  const insertTagAtCursor = (tag: string) => {
    if (!onPromptChange) return;
    const trimmed = basePrompt.trimEnd();
    const sep = trimmed.length > 0 && !/[.!?]$/.test(trimmed) ? '. ' : ' ';
    onPromptChange(`${trimmed}${sep}@${tag}`);
  };
  const removeTagFromPrompt = (tag: string) => {
    if (!onPromptChange) return;
    const fixed = basePrompt.replace(new RegExp(`\\s*@${tag}\\b\\.?`, 'gi'), '').trim();
    onPromptChange(fixed);
  };

  return (
    <div
      className="rounded-lg border p-3 space-y-3"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      data-testid="brand-reference-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
            Brand References
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'rgb(165,180,252)', border: '1px solid rgba(99,102,241,0.25)' }}>
            Seedance 2 · omni_reference
          </span>
        </div>
        {providerSupportsOmniRef ? (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'rgb(74,222,128)', border: '1px solid rgba(34,197,94,0.25)' }}
            data-testid="omni-ref-anchored-chip"
          >
            <CheckCircle2 className="w-3 h-3" /> Anchored — Seedance 2
          </span>
        ) : references.length > 0 ? (
          <button
            type="button"
            onClick={onSwitchProvider}
            className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-amber-500/20 transition-colors"
            style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'rgb(252,211,77)', border: '1px solid rgba(245,158,11,0.3)' }}
            data-testid="omni-ref-switch-provider-chip"
            title="omni_reference brand anchoring requires Seedance 2"
          >
            <AlertTriangle className="w-3 h-3" /> Switch to Seedance 2 to anchor
          </button>
        ) : null}
      </div>

      {/* Reference list */}
      {references.length === 0 ? (
        <div className="text-[11px] py-2" style={{ color: 'var(--text-muted)' }}>
          No brand references attached. Add up to {MAX_BRAND_REFS} product / pack-shot images — each is referenced in the prompt as
          <code className="mx-1 px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'rgb(165,180,252)' }}>@image1</code>,
          <code className="mx-1 px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'rgb(165,180,252)' }}>@image2</code>, ... up to <code className="mx-1 px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'rgb(165,180,252)' }}>@image{MAX_BRAND_REFS}</code>.
        </div>
      ) : (
        <ul className="space-y-1.5" data-testid="brand-reference-list">
          {references.map((ref, i) => {
            const meta = tagInfoRef.current.get(ref.assetUrl);
            const arConflict = meta && aspectRatioConflict(meta, projectAspectRatio);
            return (
              <li
                key={`${ref.assetUrl}-${i}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={() => onDrop(i)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md border"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'rgba(0,0,0,0.15)',
                  cursor: dragIndex === i ? 'grabbing' : 'grab',
                  opacity: dragIndex !== null && dragIndex !== i ? 0.7 : 1,
                }}
                data-testid={`brand-reference-item-${i}`}
              >
                <GripVertical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <img
                  src={ref.assetUrl}
                  alt={ref.label || ref.tag}
                  className="w-9 h-9 object-cover rounded border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <code
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{ backgroundColor: 'rgba(99,102,241,0.18)', color: 'rgb(165,180,252)' }}
                    >
                      @{ref.tag}
                    </code>
                    <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {ref.label || meta?.name || 'Reference'}
                    </span>
                    {arConflict && (
                      <span
                        title={`Reference orientation differs from project ${projectAspectRatio}`}
                        className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'rgb(252,211,77)' }}
                        data-testid={`brand-reference-ar-warning-${i}`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> AR
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeReference(i)}
                  className="p-1 rounded hover:bg-red-500/15 transition-colors"
                  title="Remove reference"
                  data-testid={`brand-reference-remove-${i}`}
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {references.length < MAX_BRAND_REFS ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full text-[11px] px-3 py-1.5 rounded-md border border-dashed flex items-center justify-center gap-1.5 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/5"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          data-testid="brand-reference-add-button"
          title={`Add another reference (${references.length}/${MAX_BRAND_REFS})`}
        >
          <Plus className="w-3 h-3" /> Add brand reference ({references.length}/{MAX_BRAND_REFS})
        </button>
      ) : (
        <div
          className="text-[10px] text-center py-1"
          style={{ color: 'var(--text-muted)' }}
          data-testid="brand-reference-cap-reached"
        >
          Reached maximum of {MAX_BRAND_REFS} brand references for Seedance 2.
        </div>
      )}

      {/* Health linter */}
      {health.length > 0 && (
        <div className="space-y-1" data-testid="brand-reference-health-issues">
          {health.map((issue) => (
            <div
              key={`${issue.kind}-${issue.tag}`}
              className="flex items-center justify-between text-[10px] px-2 py-1 rounded"
              style={{ backgroundColor: 'rgba(245,158,11,0.08)', color: 'rgb(252,211,77)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {issue.kind === 'dangling-tag'
                  ? `Prompt mentions @${issue.tag} but no matching reference is attached.`
                  : `Reference @${issue.tag} is attached but not used in the prompt.`}
              </span>
              {onPromptChange && (
                <button
                  type="button"
                  onClick={() =>
                    issue.kind === 'dangling-tag'
                      ? removeTagFromPrompt(issue.tag)
                      : insertTagAtCursor(issue.tag)
                  }
                  className="ml-2 px-1.5 py-0.5 rounded hover:bg-amber-500/20 transition-colors text-[10px] underline-offset-2 hover:underline"
                  data-testid={`brand-reference-quickfix-${issue.kind}-${issue.tag}`}
                >
                  {issue.kind === 'dangling-tag' ? 'Remove tag' : 'Insert tag'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Post-gen verification chip — shows after a video has been rendered
          for this scene with refs attached. Displays the reference thumbnails
          and the rendered video poster so the user can spot-check that the
          product label survived. */}
      {references.length > 0 && lastVideoUrl && (
        <div
          className="rounded-md border p-2 flex items-center gap-2"
          style={{ borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.06)' }}
          data-testid="brand-reference-postgen-chip"
        >
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(74,222,128)' }} />
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-0.5">
              {references.slice(0, 3).map((r, i) => (
                <img
                  key={`vc-${i}`}
                  src={r.assetUrl}
                  alt={r.tag}
                  className="w-7 h-7 object-cover rounded border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  title={`@${r.tag}`}
                />
              ))}
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>→</span>
            <video
              src={lastVideoUrl}
              className="w-12 h-7 object-cover rounded border"
              style={{ borderColor: 'var(--border-subtle)' }}
              muted
              playsInline
              preload="metadata"
              title="First frame of last render"
            />
            <span className="text-[10px] truncate ml-1" style={{ color: 'var(--text-secondary)' }}>
              Rendered with {references.length} reference{references.length === 1 ? '' : 's'}
            </span>
          </div>
          {onRegenerateWithStrongerAnchoring && (
            <button
              type="button"
              onClick={onRegenerateWithStrongerAnchoring}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-green-500/15 transition-colors underline-offset-2 hover:underline whitespace-nowrap"
              style={{ color: 'rgb(74,222,128)' }}
              data-testid="brand-reference-stronger-anchor-button"
              title="Re-generate with a stronger anchoring phrase appended to the prompt"
            >
              Re-anchor
            </button>
          )}
        </div>
      )}

      {/* Tag preview — Final prompt to Seedance 2 */}
      {references.length > 0 && (
        <div>
          <div className="text-[10px] mb-1 flex items-center justify-between" style={{ color: 'var(--text-muted)' }}>
            <span>Final prompt to Seedance 2</span>
            {omniResult.injectedTag !== 'preserved' && omniResult.injectedTag !== 'none' && (
              <span className="text-[9px] px-1 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: 'rgb(165,180,252)' }}>
                tag {omniResult.injectedTag === 'noun-replaced' ? 'replaced product noun' : 'appended'}
              </span>
            )}
          </div>
          <div
            className="text-[11px] font-mono rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap break-words"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            data-testid="brand-reference-tag-preview"
          >
            {highlightTags(omniResult.prompt)}
          </div>
        </div>
      )}

      <BrandLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        loading={loadingLibrary}
        assets={library}
        onPick={addReference}
        usedUrls={new Set(references.map((r) => r.assetUrl))}
      />
    </div>
  );
}

function highlightTags(prompt: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@image\d+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(prompt)) !== null) {
    if (m.index > last) parts.push(prompt.slice(last, m.index));
    parts.push(
      <span
        key={`tag-${key++}`}
        className="px-1 rounded"
        style={{ backgroundColor: 'rgba(99,102,241,0.25)', color: 'rgb(199,210,254)' }}
      >
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < prompt.length) parts.push(prompt.slice(last));
  return parts;
}

interface PickerProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  assets: BrandMediaAsset[];
  onPick: (a: BrandMediaAsset) => void;
  usedUrls: Set<string>;
}

function BrandLibraryPicker({ open, onClose, loading, assets, onPick, usedUrls }: PickerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Brand Reference</DialogTitle>
          <DialogDescription>
            Pick an image from your brand media library. Each image becomes a numbered reference (@image1, @image2, ...).
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto py-2">
          {loading ? (
            <div className="text-sm text-center py-8 text-muted-foreground">Loading library...</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-center py-8 text-muted-foreground">
              No brand images found. Upload product images via the Brand Media Library first.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((a) => {
                const used = usedUrls.has(a.url);
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={used}
                    onClick={() => onPick(a)}
                    className="group relative rounded-lg border overflow-hidden transition-all hover:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--border-subtle)', aspectRatio: '1/1' }}
                    data-testid={`brand-library-asset-${a.id}`}
                  >
                    <img
                      src={a.thumbnailUrl || a.url}
                      alt={a.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-white truncate">{a.name}</p>
                    </div>
                    {used && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-[10px] text-white px-2 py-0.5 rounded bg-indigo-600">Already added</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
