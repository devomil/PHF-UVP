// Phase 20C: Multi-image brand reference panel for Seedance 2 omni_reference.
//
// Lets the user attach 1-N brand assets to a scene, each numbered @image1,
// @image2, ..., reorder them by drag, and remove individual entries. Tag
// numbering is index-based and re-flows on remove/reorder. The parent owns
// persistence (PATCH `brandReferences`) — this component is purely a
// controlled value editor.

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Plus,
  X,
  GripVertical,
  AlertTriangle,
  CheckCircle2,
  Bookmark,
  BookmarkPlus,
  Layers,
  Trash2,
  Loader2,
  Pencil,
  Save,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface BrandReferenceSet {
  id: number;
  name: string;
  description?: string | null;
  references: BrandReferenceInput[];
  createdAt?: string | null;
  updatedAt?: string | null;
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
  /** Task 91: when supplied, the saved-set picker shows an "Apply to all
   * product scenes" action that delegates the bulk write to the parent
   * (which knows the projectId). The callback should invoke
   * POST /api/universal-video/projects/:projectId/apply-brand-reference-set.
   * May return a Promise — the panel awaits it to keep the per-row spinner
   * visible until the bulk write resolves. */
  onApplySetToAllProductScenes?: (set: BrandReferenceSet) => Promise<void> | void;
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
  onApplySetToAllProductScenes,
}: BrandReferencePanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<BrandMediaAsset[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const tagInfoRef = useRef<Map<string, BrandMediaAsset>>(new Map());
  const [remapPrompt, setRemapPrompt] = useState<{
    verb: 'Remove' | 'Reorder';
    rename: Array<[string, string]>;
    remove: string[];
    fixedPrompt: string;
  } | null>(null);

  // Task 91: saved reference sets — per-user named bundles of references the
  // user can pick-and-apply across many product/solution scenes without
  // re-selecting the same hero/pack/box images per scene.
  const [savedSets, setSavedSets] = useState<BrandReferenceSet[]>([]);
  const [setsLoaded, setSetsLoaded] = useState(false);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkBusyId, setBulkBusyId] = useState<number | null>(null);

  // Task 97: edit-set dialog state. `editingSet` is the original snapshot of
  // the set being edited; `editName` and `editRefs` are the working copy that
  // the user mutates inside the dialog. We don't write back to `savedSets`
  // until the user clicks Save changes (and the PUT succeeds).
  const [editingSet, setEditingSet] = useState<BrandReferenceSet | null>(null);
  const [editName, setEditName] = useState('');
  const [editRefs, setEditRefs] = useState<BrandReferenceInput[]>([]);
  const [editDragIndex, setEditDragIndex] = useState<number | null>(null);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Task 97: per-row spinner for the inline "save scene refs back to set"
  // shortcut so the user gets feedback while the PUT is in flight.
  const [pushBusyId, setPushBusyId] = useState<number | null>(null);

  const omniResult = useMemo(
    () => buildOmniReferencePrompt({ basePrompt, references }),
    [basePrompt, references],
  );
  const health = useMemo(
    () => analyzeReferenceHealth({ prompt: basePrompt, references }),
    [basePrompt, references],
  );

  // Task 91: load saved sets exactly once on mount, with manual retry on
  // failure. Earlier versions wrapped this in a useCallback whose identity
  // depended on the loading flags — a fetch failure flipped the flags,
  // changed the callback identity, and the effect re-fired forever, hammering
  // the endpoint. The fix is a one-shot effect with a cancellation guard
  // plus an explicit user-driven Retry button on error.
  const loadAttemptedRef = useRef(false);
  const reloadSets = useCallback(async () => {
    setSetsLoading(true);
    setSetsError(null);
    try {
      const res = await fetch('/api/brand-media-library/reference-sets', {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        sets?: BrandReferenceSet[];
        error?: string;
      };
      if (!res.ok) throw new Error(data?.error || 'Failed to load saved sets');
      setSavedSets(Array.isArray(data?.sets) ? data.sets : []);
      setSetsLoaded(true);
    } catch (e: any) {
      console.error('[BrandReferencePanel] Failed to load saved sets', e);
      setSetsError(e?.message || 'Failed to load saved sets');
    } finally {
      setSetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;
    void reloadSets();
  }, [reloadSets]);

  // Task 91: applying a saved set fully replaces the current scene's
  // references — that's the whole point ("don't re-pick the same images").
  // We re-normalize tags to image1..imageN so order matches the set's order.
  const applySetToScene = (set: BrandReferenceSet) => {
    const refs = Array.isArray(set.references) ? set.references : [];
    if (refs.length === 0) return;
    const prev = references;
    const next: BrandReferenceInput[] = normalizeRefs(
      refs.slice(0, MAX_BRAND_REFS).map((r) => ({
        assetId: r.assetId,
        assetUrl: r.assetUrl,
        tag: r.tag || 'image1',
        label: r.label,
        width: r.width,
        height: r.height,
      })),
    );
    onChange(next);
    offerPromptRemap(prev, next, 'Reorder');
  };

  const saveCurrentAsSet = async () => {
    if (saving) return;
    const trimmed = saveName.trim();
    if (!trimmed) return;
    if (references.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/brand-media-library/reference-sets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          references: references.map((r) => ({
            assetId: r.assetId,
            assetUrl: r.assetUrl,
            label: r.label,
            width: r.width,
            height: r.height,
          })),
        }),
      });
      const data: BrandReferenceSet | { error?: string } =
        await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        const errMsg =
          'error' in data && typeof data.error === 'string' ? data.error : 'Failed to save set';
        throw new Error(errMsg);
      }
      const created = data as BrandReferenceSet;
      setSavedSets((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      setSaveName('');
      setSaveDialogOpen(false);
    } catch (e: any) {
      console.error('[BrandReferencePanel] Failed to save set', e);
      setSetsError(e?.message || 'Failed to save set');
    } finally {
      setSaving(false);
    }
  };

  const deleteSet = async (id: number) => {
    if (!window.confirm('Delete this saved set? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/brand-media-library/reference-sets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || 'Failed to delete set');
      }
      setSavedSets((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      console.error('[BrandReferencePanel] Failed to delete set', e);
      setSetsError(e?.message || 'Failed to delete set');
    }
  };

  // Task 97: open the edit dialog for a saved set. Snapshot its name and
  // references into the working copy so changes can be discarded by closing
  // the dialog without saving.
  const openEditSet = (set: BrandReferenceSet) => {
    const refs = Array.isArray(set.references) ? set.references : [];
    setEditingSet(set);
    setEditName(set.name || '');
    setEditRefs(
      normalizeRefs(
        refs.map((r) => ({
          assetId: r.assetId,
          assetUrl: r.assetUrl,
          tag: r.tag || 'image1',
          label: r.label,
          width: r.width,
          height: r.height,
        })),
      ),
    );
    setEditDragIndex(null);
    setEditError(null);
  };

  const closeEditSet = () => {
    if (editSaving) return;
    setEditingSet(null);
    setEditPickerOpen(false);
    setEditError(null);
  };

  const editRemoveRef = (index: number) => {
    setEditRefs((prev) => normalizeRefs(prev.filter((_, i) => i !== index)));
  };

  const editAddRef = (asset: BrandMediaAsset) => {
    setEditRefs((prev) => {
      if (prev.some((r) => r.assetUrl === asset.url)) return prev;
      const next = normalizeRefs([
        ...prev,
        {
          assetId: asset.id,
          assetUrl: asset.url,
          tag: `image${prev.length + 1}`,
          label: asset.name,
        },
      ]);
      return next;
    });
    tagInfoRef.current.set(asset.url, asset);
    setEditPickerOpen(false);
  };

  const editOnDragStart = (i: number) => setEditDragIndex(i);
  const editOnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const editOnDrop = (i: number) => {
    if (editDragIndex === null || editDragIndex === i) return;
    setEditRefs((prev) => {
      const reordered = [...prev];
      const [moved] = reordered.splice(editDragIndex, 1);
      reordered.splice(i, 0, moved);
      return normalizeRefs(reordered);
    });
    setEditDragIndex(null);
  };

  // Task 97: shortcut inside the edit dialog — pull the current scene's
  // references[] into the working copy. The user still has to click Save
  // changes to persist; this just saves them from re-picking the same images.
  const editPullFromScene = () => {
    setEditRefs(
      normalizeRefs(
        references.slice(0, MAX_BRAND_REFS).map((r) => ({
          assetId: r.assetId,
          assetUrl: r.assetUrl,
          tag: r.tag,
          label: r.label,
          width: r.width,
          height: r.height,
        })),
      ),
    );
  };

  const persistEditedSet = async () => {
    if (!editingSet || editSaving) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Name cannot be empty');
      return;
    }
    if (editRefs.length === 0) {
      setEditError('Add at least one reference');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(
        `/api/brand-media-library/reference-sets/${editingSet.id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            references: editRefs.map((r) => ({
              assetId: r.assetId,
              assetUrl: r.assetUrl,
              label: r.label,
              width: r.width,
              height: r.height,
            })),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        | BrandReferenceSet
        | { error?: string };
      if (!res.ok) {
        const errMsg =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to update set';
        throw new Error(errMsg);
      }
      const updated = data as BrandReferenceSet;
      setSavedSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSet(null);
      setEditPickerOpen(false);
    } catch (e: unknown) {
      console.error('[BrandReferencePanel] Failed to update set', e);
      setEditError(e instanceof Error ? e.message : 'Failed to update set');
    } finally {
      setEditSaving(false);
    }
  };

  // Task 97: one-click "save scene refs back to this set" — writes the
  // current scene's references[] to the chosen set without opening the edit
  // dialog. Useful after the user has tweaked refs on a scene and wants the
  // saved set to reflect those changes.
  const pushSceneRefsToSet = async (set: BrandReferenceSet) => {
    if (pushBusyId === set.id) return;
    if (references.length === 0) return;
    setPushBusyId(set.id);
    setSetsError(null);
    try {
      const res = await fetch(
        `/api/brand-media-library/reference-sets/${set.id}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            references: references.map((r) => ({
              assetId: r.assetId,
              assetUrl: r.assetUrl,
              label: r.label,
              width: r.width,
              height: r.height,
            })),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        | BrandReferenceSet
        | { error?: string };
      if (!res.ok) {
        const errMsg =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to update set';
        throw new Error(errMsg);
      }
      const updated = data as BrandReferenceSet;
      setSavedSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: unknown) {
      console.error('[BrandReferencePanel] Failed to push scene refs to set', e);
      setSetsError(e instanceof Error ? e.message : 'Failed to update set');
    } finally {
      setPushBusyId(null);
    }
  };

  const applySetToAllProductScenes = async (set: BrandReferenceSet) => {
    if (!onApplySetToAllProductScenes) return;
    setBulkBusyId(set.id);
    try {
      await onApplySetToAllProductScenes(set);
    } finally {
      setBulkBusyId(null);
    }
  };

  // Lazy-load the brand media library on first picker open.
  const loadLibrary = async () => {
    if (library.length > 0 || loadingLibrary) return;
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/brand-media-library', { credentials: 'include' });
      const data = (await res.json()) as { assets?: BrandMediaAsset[] };
      const assets: BrandMediaAsset[] = (data?.assets ?? []).filter(
        (a): a is BrandMediaAsset => a?.mediaType === 'image' && typeof a?.url === 'string' && a.url.length > 0,
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
    if (pickerOpen || editPickerOpen) loadLibrary();
  }, [pickerOpen, editPickerOpen]);

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
    setRemapPrompt({
      verb,
      rename: [...rename.entries()],
      remove: [...remove],
      fixedPrompt: fixed,
    });
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

      {/* Task 91: saved reference sets — pick a previously-saved bundle and
          apply to this scene (or to all product/solution scenes) without
          re-picking the same hero/pack/box images per scene. */}
      <div className="rounded-md border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'rgba(0,0,0,0.12)' }} data-testid="brand-reference-sets">
        <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: savedSets.length > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
          <div className="flex items-center gap-1.5">
            <Bookmark className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              Saved sets
            </span>
            {setsLoading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--text-muted)' }} />}
            {setsLoaded && savedSets.length > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                ({savedSets.length})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSaveName('');
              setSetsError(null);
              setSaveDialogOpen(true);
            }}
            disabled={references.length === 0}
            className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors hover:bg-indigo-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'rgb(165,180,252)' }}
            data-testid="brand-reference-save-set-button"
            title={
              references.length === 0
                ? 'Add at least one reference before saving as a set'
                : 'Save the current references as a reusable set'
            }
          >
            <BookmarkPlus className="w-3 h-3" /> Save current as set
          </button>
        </div>

        {setsError && (
          <div className="text-[10px] px-2 py-1 flex items-center justify-between gap-2" style={{ color: 'rgb(252,165,165)' }}>
            <span className="truncate">{setsError}</span>
            <button
              type="button"
              onClick={() => void reloadSets()}
              disabled={setsLoading}
              className="px-1.5 py-0.5 rounded hover:bg-red-500/15 transition-colors underline-offset-2 hover:underline disabled:opacity-50"
              data-testid="brand-reference-sets-retry"
            >
              Retry
            </button>
          </div>
        )}

        {setsLoaded && savedSets.length === 0 && !setsError ? (
          <div className="text-[10px] px-2 py-2" style={{ color: 'var(--text-muted)' }}>
            No saved sets yet. Build a set on this scene, then click "Save current as set" to reuse it on other scenes.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {savedSets.map((set) => {
              const refCount = Array.isArray(set.references) ? set.references.length : 0;
              const previews = Array.isArray(set.references) ? set.references.slice(0, 4) : [];
              const isBulkBusy = bulkBusyId === set.id;
              return (
                <li
                  key={set.id}
                  className="flex items-center gap-2 px-2 py-1.5"
                  data-testid={`brand-reference-set-${set.id}`}
                >
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {previews.map((r, i) => (
                      <img
                        key={`${set.id}-prev-${i}`}
                        src={r.assetUrl}
                        alt={r.label || `ref ${i + 1}`}
                        className="w-6 h-6 object-cover rounded border"
                        style={{ borderColor: 'var(--border-subtle)' }}
                        loading="lazy"
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
                      {set.name}
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {refCount} reference{refCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySetToScene(set)}
                    className="text-[10px] px-2 py-0.5 rounded hover:bg-indigo-500/15 transition-colors flex items-center gap-1"
                    style={{ color: 'rgb(165,180,252)' }}
                    data-testid={`brand-reference-set-apply-scene-${set.id}`}
                    title={`Replace this scene's references with "${set.name}"`}
                  >
                    Apply to scene
                  </button>
                  {onApplySetToAllProductScenes && (
                    <button
                      type="button"
                      onClick={() => applySetToAllProductScenes(set)}
                      disabled={isBulkBusy}
                      className="text-[10px] px-2 py-0.5 rounded hover:bg-indigo-500/15 transition-colors flex items-center gap-1 disabled:opacity-50"
                      style={{ color: 'rgb(165,180,252)' }}
                      data-testid={`brand-reference-set-apply-all-${set.id}`}
                      title={`Apply "${set.name}" to all product/solution scenes that don't already have brand references`}
                    >
                      {isBulkBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Layers className="w-3 h-3" />
                      )}
                      Apply to all product scenes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void pushSceneRefsToSet(set)}
                    disabled={pushBusyId === set.id || references.length === 0}
                    className="p-1 rounded hover:bg-indigo-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      references.length === 0
                        ? 'Add references on this scene first'
                        : `Save the current scene's references back to "${set.name}"`
                    }
                    data-testid={`brand-reference-set-push-scene-${set.id}`}
                  >
                    {pushBusyId === set.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'rgb(165,180,252)' }} />
                    ) : (
                      <Save className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditSet(set)}
                    className="p-1 rounded hover:bg-indigo-500/15 transition-colors"
                    title="Edit name and references in this saved set"
                    data-testid={`brand-reference-set-edit-${set.id}`}
                  >
                    <Pencil className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSet(set.id)}
                    className="p-1 rounded hover:bg-red-500/15 transition-colors"
                    title="Delete this saved set"
                    data-testid={`brand-reference-set-delete-${set.id}`}
                  >
                    <Trash2 className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={(o) => !o && !saving && setSaveDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save brand reference set</DialogTitle>
            <DialogDescription>
              Save the {references.length} reference{references.length === 1 ? '' : 's'} currently attached to this scene as a reusable set. Apply it to other scenes — or to every product/solution scene at once — without re-picking each image.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Set name
            </label>
            <Input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder='e.g. "Q4 Launch Pack: hero + box + label"'
              maxLength={255}
              data-testid="brand-reference-save-set-name-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveName.trim().length > 0 && !saving) {
                  void saveCurrentAsSet();
                }
              }}
            />
            <div className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              {references.slice(0, 6).map((r, i) => (
                <img
                  key={`save-prev-${i}`}
                  src={r.assetUrl}
                  alt={r.label || r.tag}
                  className="w-7 h-7 object-cover rounded border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                />
              ))}
              {references.length > 6 && <span>+{references.length - 6} more</span>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void saveCurrentAsSet()}
              disabled={saving || saveName.trim().length === 0 || references.length === 0}
              data-testid="brand-reference-save-set-confirm"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <BookmarkPlus className="w-3 h-3 mr-1" />}
              Save set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task 97: edit-set dialog — rename and reorder/add/remove references
          inside an existing saved set. Uses the same drag/remove affordances
          as the per-scene reference list. Closing without saving discards
          changes; Save changes calls PUT /reference-sets/:id. */}
      <Dialog
        open={editingSet !== null}
        onOpenChange={(o) => {
          if (!o) closeEditSet();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit brand reference set</DialogTitle>
            <DialogDescription>
              Rename the set, or add, remove, and reorder its references. Changes are saved when you click Save changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2 space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Set name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder='e.g. "Q1 Launch Pack: hero + box + label"'
                maxLength={255}
                data-testid="brand-reference-edit-set-name-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  References ({editRefs.length}/{MAX_BRAND_REFS})
                </label>
                <button
                  type="button"
                  onClick={() => void editPullFromScene()}
                  disabled={references.length === 0}
                  className="text-[10px] px-2 py-0.5 rounded hover:bg-indigo-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  style={{ color: 'rgb(165,180,252)' }}
                  data-testid="brand-reference-edit-set-pull-scene"
                  title={
                    references.length === 0
                      ? 'No references on this scene to pull in'
                      : "Replace these references with the current scene's references"
                  }
                >
                  Use current scene references ({references.length})
                </button>
              </div>

              {editRefs.length === 0 ? (
                <div
                  className="text-[11px] py-3 px-2 rounded border border-dashed text-center"
                  style={{
                    color: 'var(--text-muted)',
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'rgba(0,0,0,0.15)',
                  }}
                  data-testid="brand-reference-edit-set-empty"
                >
                  No references in this set. Add at least one before saving.
                </div>
              ) : (
                <ul className="space-y-1.5" data-testid="brand-reference-edit-set-list">
                  {editRefs.map((ref, i) => {
                    const meta = tagInfoRef.current.get(ref.assetUrl);
                    return (
                      <li
                        key={`edit-${ref.assetUrl}-${i}`}
                        draggable
                        onDragStart={() => editOnDragStart(i)}
                        onDragOver={editOnDragOver}
                        onDrop={() => editOnDrop(i)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md border"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          backgroundColor: 'rgba(0,0,0,0.15)',
                          cursor: editDragIndex === i ? 'grabbing' : 'grab',
                          opacity: editDragIndex !== null && editDragIndex !== i ? 0.7 : 1,
                        }}
                        data-testid={`brand-reference-edit-set-item-${i}`}
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
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => editRemoveRef(i)}
                          className="p-1 rounded hover:bg-red-500/15 transition-colors"
                          title="Remove from this set"
                          data-testid={`brand-reference-edit-set-remove-${i}`}
                        >
                          <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {editRefs.length < MAX_BRAND_REFS && (
                <button
                  type="button"
                  onClick={() => setEditPickerOpen(true)}
                  className="mt-2 w-full text-[11px] px-3 py-1.5 rounded-md border border-dashed flex items-center justify-center gap-1.5 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/5"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                  data-testid="brand-reference-edit-set-add-button"
                >
                  <Plus className="w-3 h-3" /> Add reference ({editRefs.length}/{MAX_BRAND_REFS})
                </button>
              )}
            </div>

            {editError && (
              <div
                className="text-[11px] px-2 py-1 rounded"
                style={{
                  color: 'rgb(252,165,165)',
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
                data-testid="brand-reference-edit-set-error"
              >
                {editError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeEditSet} disabled={editSaving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void persistEditedSet()}
              disabled={
                editSaving || editName.trim().length === 0 || editRefs.length === 0
              }
              data-testid="brand-reference-edit-set-confirm"
            >
              {editSaving ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BrandLibraryPicker
        open={editPickerOpen}
        onClose={() => setEditPickerOpen(false)}
        loading={loadingLibrary}
        assets={library}
        onPick={editAddRef}
        usedUrls={new Set(editRefs.map((r) => r.assetUrl))}
      />

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
            className="text-[11px] font-mono rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-words leading-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            data-testid="brand-reference-tag-preview"
          >
            {highlightTags(omniResult.prompt, references)}
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

      {/* Themed confirmation for remapping `@imageN` tags after a remove or
          reorder (replaces the legacy window.confirm). Style mirrors the
          Regenerate provider-mismatch dialog for consistency. */}
      <AlertDialog
        open={remapPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setRemapPrompt(null);
        }}
      >
        <AlertDialogContent data-testid="brand-reference-remap-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Update prompt to match new reference order?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {remapPrompt?.verb === 'Remove'
                    ? 'Removing this reference changed the @imageN numbering.'
                    : 'Reordering changed the @imageN numbering.'}{' '}
                  Apply matching changes to the prompt so your tags still point at the right images?
                </p>
                {remapPrompt && (remapPrompt.remove.length > 0 || remapPrompt.rename.length > 0) && (
                  <div className="rounded-md border border-gray-800 bg-gray-900/60 p-3 text-xs space-y-1.5">
                    {remapPrompt.remove.length > 0 && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-400 shrink-0">Remove from prompt</span>
                        <span className="font-mono text-red-300 text-right break-all">
                          {remapPrompt.remove.map((t) => `@${t}`).join(', ')}
                        </span>
                      </div>
                    )}
                    {remapPrompt.rename.length > 0 && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-400 shrink-0">Rename in prompt</span>
                        <span className="font-mono text-emerald-300 text-right break-all">
                          {remapPrompt.rename.map(([o, n]) => `@${o} → @${n}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Skip to leave the prompt as it is — you can edit the @imageN tags by hand later.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setRemapPrompt(null)}
              data-testid="brand-reference-remap-skip"
            >
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (remapPrompt && onPromptChange) onPromptChange(remapPrompt.fixedPrompt);
                setRemapPrompt(null);
              }}
              data-testid="brand-reference-remap-apply"
            >
              Apply changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Phase 20C — bind each `@imageN` token in the final prompt to its matching
 * reference thumbnail, inline. This makes it visually obvious which slot the
 * model will see when it reads the tag, and surfaces dangling/unused refs
 * before the user hits Generate.
 *
 * Tokens that point past the end of `references` (e.g. `@image3` when only 2
 * are attached) render in amber with no thumbnail so the user can spot the
 * mismatch instantly.
 */
function highlightTags(prompt: string, references: BrandReferenceInput[]): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@image(\d+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(prompt)) !== null) {
    if (m.index > last) parts.push(prompt.slice(last, m.index));
    const token = m[0];
    const idx = parseInt(m[1], 10) - 1;
    const ref = idx >= 0 && idx < references.length ? references[idx] : undefined;
    const isDangling = !ref;
    parts.push(
      <span
        key={`tag-${key++}`}
        className="inline-flex items-center gap-1 align-middle px-1 py-0.5 rounded"
        style={{
          backgroundColor: isDangling ? 'rgba(245,158,11,0.18)' : 'rgba(99,102,241,0.25)',
          color: isDangling ? 'rgb(252,211,77)' : 'rgb(199,210,254)',
          border: isDangling ? '1px dashed rgba(245,158,11,0.55)' : '1px solid transparent',
        }}
        title={isDangling
          ? `${token} has no matching reference (only ${references.length} attached) — remove the tag or add another reference.`
          : `${token} → ${ref!.label || `reference ${idx + 1}`}`}
        data-testid={`tag-preview-token-${idx + 1}`}
      >
        {ref && (
          <img
            src={ref.assetUrl}
            alt={ref.label || `reference ${idx + 1}`}
            className="w-4 h-4 rounded object-cover"
            style={{ border: '1px solid rgba(255,255,255,0.15)' }}
            loading="lazy"
          />
        )}
        <span>{token}</span>
      </span>,
    );
    last = m.index + token.length;
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
