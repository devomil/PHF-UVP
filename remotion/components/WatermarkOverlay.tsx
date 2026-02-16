import React from 'react';
import { Img, useCurrentFrame, useVideoConfig } from 'remotion';

export interface WatermarkOverlayProps {
  logoUrl: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
  opacity: number;
  margin: number;
  showDuring: 'all' | 'middle' | 'custom';
  customTiming?: {
    startFrame: number;
    endFrame: number;
  };
}

export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({
  logoUrl,
  position,
  size,
  opacity,
  margin,
  showDuring,
  customTiming,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width } = useVideoConfig();
  
  let visible = true;
  
  if (showDuring === 'middle') {
    const introFrames = Math.round(fps * 3);
    const outroFrames = Math.round(fps * 5);
    visible = frame > introFrames && frame < (durationInFrames - outroFrames);
  } else if (showDuring === 'custom' && customTiming) {
    visible = frame >= customTiming.startFrame && frame <= customTiming.endFrame;
  }
  
  if (!visible) return null;
  
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: margin, left: margin },
    'top-right': { top: margin, right: margin },
    'bottom-left': { bottom: margin, left: margin },
    'bottom-right': { bottom: margin, right: margin },
  };
  
  const logoWidth = (size / 100) * width;
  
  return (
    <div
      data-testid="watermark-overlay"
      style={{
        position: 'absolute',
        ...positionStyles[position],
        opacity,
        pointerEvents: 'none',
      }}
    >
      <Img
        src={logoUrl}
        style={{
          width: logoWidth,
          height: 'auto',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

export default WatermarkOverlay;
