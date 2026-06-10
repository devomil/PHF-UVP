// Task #185: Deck-to-Video — per-scene manual control over which deck slide
// image anchors this scene. Only rendered for Deck-to-Video projects (where
// progress.deckImages is present). Lets the user pick exactly which slide goes
// on this scene, swap it, or remove it so the scene falls back to AI visuals.
//
// Choices are persisted via PATCH .../scenes/:sceneId/deck-image which writes
// both the live scene.brandReferences AND a durable per-scene-index override so
// the manual choice overrides the automatic mapping and survives script
// regeneration. The parent re-fetches the project on success.

import { useState } from 'react';
import { Presentation, Check, Sparkles, Loader2, AlertCircle, Copy, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sceneIndicesUsingUrl } from './deck-usage';

export interface DeckImage {
  id: string;
  url: string;
  pageNumber?: number;
  label?: string;
}

interface DeckSlidePickerProps {
  projectId: string;
  sceneId: string;
  deckImages: DeckImage[];
  /** Current anchor URL on the scene (scene.brandReferences[0]?.assetUrl). */
  currentAnchorUrl?: string | null;
  /**
   * Task #198: all scenes in the project, used to derive per-slide usage hints
   * (placed elsewhere / unused) inside the picker. Same derivation as the
   * project-level overview — no new persistence.
   */
  allScenes?: any[];
  /** 0-based index of the scene this picker belongs to (to exclude self). */
  currentSceneIndex?: number;
  /** Invoked after a successful save so the parent can refetch the project. */
  onChanged?: () => void;
}

export function DeckSlidePicker({
  projectId,
  sceneId,
  deckImages,
  currentAnchorUrl,
  allScenes,
  currentSceneIndex,
  onChanged,
}: DeckSlidePickerProps) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | 'none' | null>(null);

  if (!Array.isArray(deckImages) || deckImages.length === 0) return null;

  const setDeckImage = async (imageId: string | null) => {
    const busyKey = imageId ?? 'none';
    if (busyId) return;
    setBusyId(busyKey);
    try {
      const res = await fetch(
        `/api/universal-video/projects/${projectId}/scenes/${sceneId}/deck-image`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to update deck slide');
      onChanged?.();
    } catch (e: any) {
      toast({
        title: 'Could not update deck slide',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const norm = (u?: string | null) => (u || '').trim();
  const anchored = norm(currentAnchorUrl);
  const isAiSelected = anchored.length === 0;

  return (
    <div
      className="mb-3 rounded-lg p-3"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)' }}
      data-testid="deck-slide-picker"
    >
      <div className="flex items-center gap-2 mb-1">
        <Presentation className="w-3.5 h-3.5 text-pink-400" />
        <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Deck slide for this scene
        </p>
      </div>
      <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
        Pick which slide anchors this scene, or use AI visuals. Your choice overrides the
        automatic match and survives script regeneration.
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {/* AI visuals (no slide) tile */}
        <button
          type="button"
          onClick={() => setDeckImage(null)}
          disabled={busyId !== null}
          className="relative rounded-md overflow-hidden aspect-video flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-60"
          style={{
            border: isAiSelected ? '2px solid rgb(168 85 247)' : '1px solid var(--border-subtle)',
            backgroundColor: isAiSelected ? 'rgba(168,85,247,0.10)' : 'var(--input-bg)',
          }}
          title="Use AI-generated visuals for this scene"
          data-testid="deck-slide-ai"
        >
          {busyId === 'none' ? (
            <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
          ) : (
            <Sparkles className="w-4 h-4 text-purple-300" />
          )}
          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
            AI visuals
          </span>
          {isAiSelected && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </span>
          )}
        </button>

        {deckImages.map((img) => {
          const selected = !isAiSelected && norm(img.url) === anchored;
          const isBusy = busyId === img.id;

          // Task #198: derive where else this slide is placed. Exclude the
          // current scene so the badge reflects usage *elsewhere*.
          const otherScenes = sceneIndicesUsingUrl(allScenes || [], img.url)
            .filter((idx) => idx !== currentSceneIndex)
            .map((idx) => idx + 1);
          const usedElsewhere = otherScenes.length > 0;

          // Only show the unplaced/used-elsewhere hint when this slide isn't the
          // current scene's anchor (the selected one already reads as "on this
          // scene" via its check mark).
          const showHint = !selected;
          const hintUnused = showHint && !usedElsewhere;
          const hintLabel = usedElsewhere
            ? otherScenes.length > 1
              ? `On ${otherScenes.length} scenes`
              : `On scene ${otherScenes[0]}`
            : 'Unused';
          const HintIcon = usedElsewhere ? (otherScenes.length > 1 ? Copy : MapPin) : AlertCircle;
          const hintStyle = usedElsewhere
            ? { backgroundColor: 'rgba(99,102,241,0.85)', color: 'rgb(224,231,255)' }
            : { backgroundColor: 'rgba(245,158,11,0.85)', color: 'rgb(255,251,235)' };

          const titleText = selected
            ? 'Click to remove this slide'
            : usedElsewhere
              ? `Already placed on scene${otherScenes.length > 1 ? 's' : ''} ${otherScenes.join(', ')} — click to also use it here`
              : `Unused slide — click to place it on this scene`;

          return (
            <button
              key={img.id}
              type="button"
              onClick={() => setDeckImage(selected ? null : img.id)}
              disabled={busyId !== null}
              className="relative group rounded-md overflow-hidden aspect-video transition-all disabled:opacity-60"
              style={{
                border: selected
                  ? '2px solid rgb(244 114 182)'
                  : hintUnused
                    ? '1px dashed rgba(245,158,11,0.55)'
                    : '1px solid var(--border-subtle)',
              }}
              title={titleText}
              data-testid={`deck-slide-${img.id}`}
            >
              <img
                src={img.url}
                alt={img.label || `Slide ${img.pageNumber || ''}`}
                className={`w-full h-full object-cover ${hintUnused ? 'opacity-70 group-hover:opacity-95 transition-opacity' : ''}`}
                loading="lazy"
              />
              {showHint && !isBusy && (
                <span
                  className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 text-[8px] leading-none px-1 py-0.5 rounded-full font-medium"
                  style={hintStyle}
                  data-testid={`deck-slide-usage-${img.id}`}
                >
                  <HintIcon className="w-2 h-2" />
                  {hintLabel}
                </span>
              )}
              {isBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                </span>
              )}
              {selected && !isBusy && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
