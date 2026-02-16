import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';

interface WatermarkProps {
  enabled: boolean;
  logoUrl: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  scale: number;
  margin: number;
  startFrame: number;
  endFrame: number;
}

export const Watermark: React.FC<WatermarkProps> = ({
  enabled,
  logoUrl,
  position,
  opacity,
  scale,
  margin,
  startFrame,
  endFrame,
}) => {
  const frame = useCurrentFrame();
  
  if (!enabled) return null;
  if (frame < startFrame || frame > endFrame) return null;
  
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: margin, left: margin },
    'top-right': { top: margin, right: margin },
    'bottom-left': { bottom: margin, left: margin },
    'bottom-right': { bottom: margin, right: margin },
  };
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img
        src={logoUrl}
        style={{
          position: 'absolute',
          ...positionStyles[position],
          width: `${scale * 100}%`,
          opacity,
          objectFit: 'contain',
        }}
      />
    </AbsoluteFill>
  );
};
