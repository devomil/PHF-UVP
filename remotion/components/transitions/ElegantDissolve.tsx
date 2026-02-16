import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from 'remotion';

export type DissolveEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'exponential';

interface ElegantDissolveProps {
  durationInFrames: number;
  fromContent: React.ReactNode;
  toContent: React.ReactNode;
  easing?: DissolveEasing;
  scaleEffect?: boolean;
}

const easingFunctions: Record<DissolveEasing, (t: number) => number> = {
  'linear': (t) => t,
  'ease-in': Easing.in(Easing.quad),
  'ease-out': Easing.out(Easing.quad),
  'ease-in-out': Easing.inOut(Easing.quad),
  'exponential': (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 
    ? Math.pow(2, 20 * t - 10) / 2 
    : (2 - Math.pow(2, -20 * t + 10)) / 2,
};

export const ElegantDissolve: React.FC<ElegantDissolveProps> = ({
  durationInFrames,
  fromContent,
  toContent,
  easing = 'exponential',
  scaleEffect = true,
}) => {
  const frame = useCurrentFrame();
  
  const rawProgress = interpolate(
    frame,
    [0, durationInFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const easedProgress = easingFunctions[easing](rawProgress);

  const fromOpacity = interpolate(easedProgress, [0, 0.5, 1], [1, 0.3, 0]);
  const toOpacity = interpolate(easedProgress, [0, 0.5, 1], [0, 0.7, 1]);

  const fromScale = scaleEffect 
    ? interpolate(easedProgress, [0, 1], [1, 1.02]) 
    : 1;
  const toScale = scaleEffect 
    ? interpolate(easedProgress, [0, 1], [0.98, 1]) 
    : 1;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: fromOpacity,
          transform: `scale(${fromScale})`,
        }}
      >
        {fromContent}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: toOpacity,
          transform: `scale(${toScale})`,
        }}
      >
        {toContent}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SimpleFade: React.FC<{
  durationInFrames: number;
  fadeIn?: boolean;
  children: React.ReactNode;
}> = ({ durationInFrames, fadeIn = true, children }) => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(
    frame,
    [0, durationInFrames],
    fadeIn ? [0, 1] : [1, 0],
    {
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};
