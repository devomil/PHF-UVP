import { useVideoConfig } from 'remotion';

interface LetterboxProps {
  aspectRatio: '2.35:1' | '2.39:1' | '1.85:1' | 'none';
  color?: string;
}

export const Letterbox: React.FC<LetterboxProps> = ({
  aspectRatio,
  color = '#000000',
}) => {
  const { width, height } = useVideoConfig();

  if (aspectRatio === 'none') {
    return null;
  }

  const ratioMap: Record<string, number> = {
    '2.35:1': 2.35,
    '2.39:1': 2.39,
    '1.85:1': 1.85,
  };

  const targetRatio = ratioMap[aspectRatio];
  const currentRatio = width / height;

  if (currentRatio <= targetRatio) {
    return null;
  }

  const targetHeight = width / targetRatio;
  const barHeight = (height - targetHeight) / 2;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: barHeight,
          backgroundColor: color,
          zIndex: 98,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: barHeight,
          backgroundColor: color,
          zIndex: 98,
        }}
      />
    </>
  );
};
