// Task #195: Deck slide coverage overview — a project-level, bird's-eye view of
// every deck slide and where it's placed across scenes. Renders only for
// Deck-to-Video projects (where progress.deckImages is present).
//
// State is DERIVED, not persisted: for each deck image we scan every scene's
// brandReferences[] (canonical field `assetUrl`, with legacy `url`/`imageUrl`
// fallbacks) and match against the deck image URL. A slide is then "Unused",
// "On scene N", or "On N scenes" (reused).
//
// Clicking a slide jumps to a scene: the scene that uses it (first one, for
// reused slides) or — for an unused slide — the first scene, so the user can
// open the per-scene Deck slide picker and place it.
//
// Task #185 extension: when `onRegenerateWithSlides` is provided, unused slides
// show a checkbox (top-right). Selecting one or more and clicking "Rebuild script"
// passes their ids to the parent for a full one-shot script regeneration.

import { useState, useCallback, useEffect } from 'react';
import { Presentation, AlertCircle, CheckCircle2, Copy, Sparkles, RefreshCw } from 'lucide-react';
import type { DeckImage } from './deck-slide-picker';
import { sceneUsesUrl } from './deck-usage';

interface DeckSlideOverviewProps {
  deckImages: DeckImage[];
  scenes: any[];
  /** Open/expand and scroll to a scene by its id. */
  onOpenScene: (sceneId: string) => void;
  /** Called with selected unused slide ids to trigger a full script rebuild. */
  onRegenerateWithSlides?: (ids: string[]) => void;
  /** True while the parent is running the regenerate mutation. */
  isRegenerating?: boolean;
}

export function DeckSlideOverview({
  deckImages,
  scenes,
  onOpenScene,
  onRegenerateWithSlides,
  isRegenerating = false,
}: DeckSlideOverviewProps) {
  // ── ALL HOOKS FIRST (Rules of Hooks — no early returns before hooks) ──────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const safeImages = Array.isArray(deckImages) ? deckImages : [];
  const sceneList = Array.isArray(scenes) ? scenes : [];
  const sceneIdOf = (s: any, idx: number) => s?.id || `scene-${idx}`;

  const usage = safeImages.map((img) => {
    const usedBy = sceneList
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => sceneUsesUrl(s, img.url));
    return { img, usedBy };
  });

  const unusedIds = new Set(
    usage.filter((u) => u.usedBy.length === 0).map((u) => u.img.id)
  );

  // Prune stale selections when scenes change (a regen may move slides to placed).
  useEffect(() => {
    setSelected((prev) => {
      const pruned = new Set(Array.from(prev).filter((id) => unusedIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── EARLY RETURN after all hooks ─────────────────────────────────────────
  if (safeImages.length === 0) return null;

  // ── DERIVED DISPLAY VALUES ────────────────────────────────────────────────
  const placedCount = usage.filter((u) => u.usedBy.length > 0).length;
  const unusedCount = usage.filter((u) => u.usedBy.length === 0).length;
  const reusedCount = usage.filter((u) => u.usedBy.length > 1).length;

  const selectionCount = Array.from(selected).filter((id) => unusedIds.has(id)).length;

  const handleClick = (usedBy: { idx: number }[]) => {
    if (usedBy.length > 0) {
      const target = sceneList[usedBy[0].idx];
      if (target) onOpenScene(sceneIdOf(target, usedBy[0].idx));
      return;
    }
    if (sceneList.length > 0) onOpenScene(sceneIdOf(sceneList[0], 0));
  };

  const handleRegenerate = () => {
    if (!onRegenerateWithSlides) return;
    const ids = Array.from(selected).filter((id) => unusedIds.has(id));
    if (ids.length === 0) return;
    onRegenerateWithSlides(ids);
    setSelected(new Set());
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: 'rgba(236,72,153,0.05)', borderColor: 'rgba(236,72,153,0.22)' }}
      data-testid="deck-slide-overview"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Presentation className="w-4 h-4 text-pink-400" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Deck slide coverage
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span data-testid="deck-overview-summary">
            {placedCount}/{safeImages.length} placed
          </span>
          {unusedCount > 0 && (
            <span className="text-amber-400" data-testid="deck-overview-unused-count">
              · {unusedCount} unused
            </span>
          )}
          {reusedCount > 0 && (
            <span className="text-indigo-300" data-testid="deck-overview-reused-count">
              · {reusedCount} reused
            </span>
          )}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {unusedCount > 0 && onRegenerateWithSlides
          ? 'Every slide from your deck. Click a slide to jump to its scene, or select unused slides to weave them into a fully rebuilt script.'
          : "Every slide from your deck and where it's placed. Click a slide to jump to its scene — or an unused one to find a spot for it."}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {usage.map(({ img, usedBy }) => {
          const count = usedBy.length;
          const unused = count === 0;
          const reused = count > 1;
          const sceneNumbers = usedBy.map((u) => u.idx + 1);
          const isSelected = selected.has(img.id);

          const badgeLabel = unused
            ? 'Unused'
            : reused
              ? `On ${count} scenes`
              : `On scene ${sceneNumbers[0]}`;

          const badgeStyle = unused
            ? { backgroundColor: 'rgba(245,158,11,0.15)', color: 'rgb(252,211,77)', border: '1px solid rgba(245,158,11,0.4)' }
            : reused
              ? { backgroundColor: 'rgba(99,102,241,0.15)', color: 'rgb(165,180,252)', border: '1px solid rgba(99,102,241,0.4)' }
              : { backgroundColor: 'rgba(34,197,94,0.12)', color: 'rgb(74,222,128)', border: '1px solid rgba(34,197,94,0.35)' };

          const BadgeIcon = unused ? AlertCircle : reused ? Copy : CheckCircle2;

          const titleText = unused
            ? (onRegenerateWithSlides
                ? 'Unused — check to select for rebuild, or click the image to jump to a scene'
                : 'Not placed on any scene — click to open a scene and place it')
            : reused
              ? `Reused on scenes ${sceneNumbers.join(', ')} — click to jump to scene ${sceneNumbers[0]}`
              : `Placed on scene ${sceneNumbers[0]} — click to jump there`;

          return (
            <button
              key={img.id}
              type="button"
              onClick={() => handleClick(usedBy)}
              className="group text-left rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-pink-500/40 relative"
              style={{
                border: isSelected
                  ? '2px solid rgba(139,92,246,0.8)'
                  : unused
                    ? '1px dashed rgba(245,158,11,0.5)'
                    : '1px solid var(--border-subtle)',
                backgroundColor: isSelected ? 'rgba(139,92,246,0.08)' : 'var(--input-bg)',
              }}
              title={titleText}
              data-testid={`deck-overview-slide-${img.id}`}
            >
              <div className="relative aspect-video">
                <img
                  src={img.url}
                  alt={img.label || `Slide ${img.pageNumber || ''}`}
                  className={`w-full h-full object-cover transition-opacity ${
                    unused && !isSelected ? 'opacity-60 group-hover:opacity-85' : ''
                  }`}
                  loading="lazy"
                />
                <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-black/55 text-white/90">
                  {img.label || `Page ${img.pageNumber ?? '?'}`}
                </span>
                {/* Checkbox for unused slides when the rebuild action is wired */}
                {unused && onRegenerateWithSlides && (
                  <span
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={(e) => toggleSelect(img.id, e)}
                    className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-all
                      opacity-0 group-hover:opacity-100"
                    style={{
                      opacity: isSelected ? 1 : undefined,
                      backgroundColor: isSelected ? 'rgba(139,92,246,0.9)' : 'rgba(0,0,0,0.6)',
                      border: isSelected ? '2px solid rgb(167,139,250)' : '2px solid rgba(255,255,255,0.45)',
                    }}
                    data-testid={`deck-overview-checkbox-${img.id}`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
              <div className="px-1.5 py-1.5">
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={badgeStyle}
                  data-testid={`deck-overview-badge-${img.id}`}
                >
                  <BadgeIcon className="w-2.5 h-2.5" />
                  {badgeLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action bar — sticky, visible when at least one unused slide is selected */}
      {selectionCount > 0 && (
        <div
          className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
          style={{
            backgroundColor: 'rgba(40,28,70,0.92)',
            border: '1px solid rgba(139,92,246,0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 -6px 18px rgba(0,0,0,0.35)',
          }}
          data-testid="deck-overview-action-bar"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: 'rgb(196,181,253)' }}>
              {selectionCount} slide{selectionCount !== 1 ? 's' : ''} selected
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Rebuilds all scenes &amp; extends the video — manual edits are replaced
            </p>
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'rgb(139,92,246)', color: 'white' }}
            data-testid="deck-overview-regenerate-btn"
          >
            {isRegenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isRegenerating ? 'Rebuilding…' : 'Rebuild script'}
          </button>
        </div>
      )}
    </div>
  );
}
