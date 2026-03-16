import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export interface CustomImageOverlayProps {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  durationInFrames: number;
}

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

export const CustomImageOverlay: React.FC<CustomImageOverlayProps> = ({
  url,
  x,
  y,
  width,
  height,
  opacity,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeInDuration = Math.min(Math.round(fps * 0.3), 10);
  const fadeOutStart = durationInFrames - Math.min(Math.round(fps * 0.3), 10);

  const animatedOpacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, durationInFrames],
    [0, opacity / 100, opacity / 100, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const resolvedUrl = resolveOverlayUrl(url);
  if (!resolvedUrl) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        opacity: animatedOpacity,
        zIndex: 50,
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

export default CustomImageOverlay;
