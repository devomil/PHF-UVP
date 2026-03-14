import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { MicroSceneOverlayItem } from '../../shared/video-types';

function resolveOverlayUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

const MicroSceneOverlayLayer: React.FC<{
  item: MicroSceneOverlayItem;
  durationInFrames: number;
}> = ({ item, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const resolvedUrl = resolveOverlayUrl(item.url);
  if (!resolvedUrl) return null;

  const entranceDurationFrames = Math.min(Math.round(fps * 0.4), Math.round(durationInFrames * 0.25));
  const baseOpacity = item.opacity / 100;

  let animOpacity = baseOpacity;
  let translateY = 0;
  let translateX = 0;
  let scale = 1;

  if (frame < entranceDurationFrames) {
    const progress = frame / entranceDurationFrames;

    switch (item.entranceAnimation) {
      case 'fade':
        animOpacity = interpolate(frame, [0, entranceDurationFrames], [0, baseOpacity], { extrapolateRight: 'clamp' });
        break;
      case 'rise':
        animOpacity = interpolate(frame, [0, entranceDurationFrames], [0, baseOpacity], { extrapolateRight: 'clamp' });
        translateY = interpolate(progress, [0, 1], [30, 0]);
        break;
      case 'pop':
        animOpacity = interpolate(frame, [0, Math.round(entranceDurationFrames * 0.3)], [0, baseOpacity], { extrapolateRight: 'clamp' });
        scale = spring({
          frame,
          fps,
          config: { damping: 12, stiffness: 200, mass: 0.8 },
        });
        break;
      case 'drift':
        animOpacity = interpolate(frame, [0, entranceDurationFrames], [0, baseOpacity], { extrapolateRight: 'clamp' });
        translateX = interpolate(progress, [0, 1], [-20, 0]);
        break;
      default:
        animOpacity = interpolate(frame, [0, entranceDurationFrames], [0, baseOpacity], { extrapolateRight: 'clamp' });
        break;
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${item.x}%`,
        top: `${item.y}%`,
        width: `${item.width}%`,
        height: `${item.height}%`,
        opacity: animOpacity,
        zIndex: item.zIndex,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        pointerEvents: 'none',
      }}
    >
      <Img
        src={resolvedUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

export const MicroSceneOverlayCompositor: React.FC<{
  overlayItems: MicroSceneOverlayItem[];
  durationInFrames: number;
}> = ({ overlayItems, durationInFrames }) => {
  if (!overlayItems || overlayItems.length === 0) return null;

  const sorted = [...overlayItems].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      {sorted.map((item) => (
        <MicroSceneOverlayLayer
          key={item.id}
          item={item}
          durationInFrames={durationInFrames}
        />
      ))}
    </>
  );
};

export default MicroSceneOverlayCompositor;
