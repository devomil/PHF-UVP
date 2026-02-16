interface VignetteProps {
  intensity: number;
  softness?: number;
  color?: string;
}

export const Vignette: React.FC<VignetteProps> = ({
  intensity = 0.2,
  softness = 0.5,
  color = 'rgba(0, 0, 0, 1)',
}) => {
  if (intensity <= 0) {
    return null;
  }

  const innerStop = 40 + softness * 30;
  const outerStop = 70 + softness * 20;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        background: `radial-gradient(
          ellipse at center,
          transparent ${innerStop}%,
          ${color.replace('1)', `${intensity})`)} ${outerStop}%,
          ${color.replace('1)', `${intensity * 1.5})`)} 100%
        )`,
        zIndex: 99,
      }}
    />
  );
};
