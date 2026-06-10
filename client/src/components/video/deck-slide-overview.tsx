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

import { Presentation, AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import type { DeckImage } from './deck-slide-picker';
import { sceneUsesUrl } from './deck-usage';

interface DeckSlideOverviewProps {
  deckImages: DeckImage[];
  scenes: any[];
  /** Open/expand and scroll to a scene by its id. */
  onOpenScene: (sceneId: string) => void;
}

export function DeckSlideOverview({ deckImages, scenes, onOpenScene }: DeckSlideOverviewProps) {
  if (!Array.isArray(deckImages) || deckImages.length === 0) return null;

  const sceneList = Array.isArray(scenes) ? scenes : [];
  const sceneId = (s: any, idx: number) => s?.id || `scene-${idx}`;

  // For each deck image, the list of scene indices that anchor it.
  const usage = deckImages.map((img) => {
    const usedBy = sceneList
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => sceneUsesUrl(s, img.url));
    return { img, usedBy };
  });

  const placedCount = usage.filter((u) => u.usedBy.length > 0).length;
  const unusedCount = usage.filter((u) => u.usedBy.length === 0).length;
  const reusedCount = usage.filter((u) => u.usedBy.length > 1).length;

  const handleClick = (usedBy: { idx: number }[]) => {
    if (usedBy.length > 0) {
      const target = sceneList[usedBy[0].idx];
      if (target) onOpenScene(sceneId(target, usedBy[0].idx));
      return;
    }
    // Unused slide: open the first scene so the user can place it.
    if (sceneList.length > 0) onOpenScene(sceneId(sceneList[0], 0));
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
            {placedCount}/{deckImages.length} placed
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
        Every slide from your deck and where it's placed. Click a slide to jump to its scene — or
        an unused one to find a spot for it.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {usage.map(({ img, usedBy }) => {
          const count = usedBy.length;
          const unused = count === 0;
          const reused = count > 1;
          const sceneNumbers = usedBy.map((u) => u.idx + 1);

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
            ? 'Not placed on any scene — click to open a scene and place it'
            : reused
              ? `Reused on scenes ${sceneNumbers.join(', ')} — click to jump to scene ${sceneNumbers[0]}`
              : `Placed on scene ${sceneNumbers[0]} — click to jump there`;

          return (
            <button
              key={img.id}
              type="button"
              onClick={() => handleClick(usedBy)}
              className="group text-left rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-pink-500/40"
              style={{
                border: unused ? '1px dashed rgba(245,158,11,0.5)' : '1px solid var(--border-subtle)',
                backgroundColor: 'var(--input-bg)',
              }}
              title={titleText}
              data-testid={`deck-overview-slide-${img.id}`}
            >
              <div className="relative aspect-video">
                <img
                  src={img.url}
                  alt={img.label || `Slide ${img.pageNumber || ''}`}
                  className={`w-full h-full object-cover ${unused ? 'opacity-60 group-hover:opacity-90' : ''} transition-opacity`}
                  loading="lazy"
                />
                <span
                  className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-black/55 text-white/90"
                >
                  {img.label || `Page ${img.pageNumber ?? '?'}`}
                </span>
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
    </div>
  );
}
