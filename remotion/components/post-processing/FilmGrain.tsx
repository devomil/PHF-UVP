import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, random } from 'remotion';

interface FilmGrainProps {
  intensity: number;
  speed?: number;
}

export const FilmGrain: React.FC<FilmGrainProps> = ({
  intensity = 0.04,
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const noiseOffset = useMemo(() => ({
    x: random(`grain-x-${Math.floor(frame * speed)}`) * 100,
    y: random(`grain-y-${Math.floor(frame * speed)}`) * 100,
  }), [frame, speed]);

  if (intensity <= 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'overlay',
        opacity: intensity * 10,
        zIndex: 100,
      }}
    >
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="film-grain-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              seed={frame % 100}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          position: 'absolute',
          top: -noiseOffset.y,
          left: -noiseOffset.x,
          width: width + 200,
          height: height + 200,
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          opacity: 0.3,
          filter: 'contrast(170%) brightness(1000%)',
        }}
      />
    </div>
  );
};
