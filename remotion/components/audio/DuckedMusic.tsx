import React, { useMemo } from 'react';
import { Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VoiceoverRange } from '../../../shared/types/sound-design';

export interface VolumeKeyframe {
  time: number;
  volume: number;
}

// Legacy interface (used with volumeKeyframes)
interface DuckedMusicLegacyProps {
  musicUrl: string;
  baseVolume: number;
  volumeKeyframes: VolumeKeyframe[];
  fps: number;
  startFrom?: number;
}

// Phase 18D interface (used with voiceoverRanges)
interface DuckedMusicPhase18DProps {
  musicUrl: string;
  baseVolume: number;
  duckLevel: number;
  voiceoverRanges: VoiceoverRange[];
  fadeFrames: number;
}

type DuckedMusicProps = DuckedMusicLegacyProps | DuckedMusicPhase18DProps;

function isPhase18DProps(props: DuckedMusicProps): props is DuckedMusicPhase18DProps {
  return 'voiceoverRanges' in props;
}

export const DuckedMusic: React.FC<DuckedMusicProps> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps: configFps } = useVideoConfig();
  
  const volume = useMemo(() => {
    if (isPhase18DProps(props)) {
      // Phase 18D: VoiceoverRange-based ducking
      const { baseVolume, duckLevel, voiceoverRanges, fadeFrames } = props;
      
      for (const range of voiceoverRanges) {
        // Fade down into voiceover
        if (frame >= range.startFrame - fadeFrames && frame < range.startFrame) {
          return interpolate(
            frame,
            [range.startFrame - fadeFrames, range.startFrame],
            [baseVolume, duckLevel],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }
        
        // During voiceover - stay ducked
        if (frame >= range.startFrame && frame < range.endFrame) {
          return duckLevel;
        }
        
        // Fade up after voiceover
        if (frame >= range.endFrame && frame < range.endFrame + fadeFrames) {
          return interpolate(
            frame,
            [range.endFrame, range.endFrame + fadeFrames],
            [duckLevel, baseVolume],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }
      }
      
      // Fade out at the end
      return interpolate(
        frame,
        [durationInFrames - 60, durationInFrames],
        [baseVolume, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    } else {
      // Legacy: VolumeKeyframe-based ducking
      const { baseVolume, volumeKeyframes, fps } = props;
      const currentTime = frame / fps;
      
      if (volumeKeyframes.length > 0) {
        const times = volumeKeyframes.map(k => k.time);
        const volumes = volumeKeyframes.map(k => k.volume);
        
        return interpolate(
          currentTime,
          times,
          volumes,
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }
        );
      }
      
      return baseVolume;
    }
  }, [frame, props, durationInFrames]);
  
  if (!props.musicUrl) return null;
  
  const startFrom = isPhase18DProps(props) ? 0 : (props.startFrom || 0);
  
  return (
    <Audio
      src={props.musicUrl}
      volume={volume}
      startFrom={startFrom}
    />
  );
};

export function generateDuckingKeyframes(
  voiceoverSegments: Array<{ startTime: number; endTime: number }>,
  baseVolume: number,
  duckedVolume: number,
  fadeTime: number = 0.3
): VolumeKeyframe[] {
  const keyframes: VolumeKeyframe[] = [];
  
  if (voiceoverSegments.length === 0) {
    return [{ time: 0, volume: baseVolume }];
  }
  
  keyframes.push({ time: 0, volume: baseVolume });
  
  for (const segment of voiceoverSegments) {
    keyframes.push({ time: segment.startTime - fadeTime, volume: baseVolume });
    keyframes.push({ time: segment.startTime, volume: duckedVolume });
    keyframes.push({ time: segment.endTime, volume: duckedVolume });
    keyframes.push({ time: segment.endTime + fadeTime, volume: baseVolume });
  }
  
  return keyframes;
}

export function generateSimpleDuckingKeyframes(
  totalDuration: number,
  baseVolume: number = 0.35,
  riseAtEnd: boolean = true
): VolumeKeyframe[] {
  const keyframes: VolumeKeyframe[] = [
    { time: 0, volume: baseVolume * 0.7 },
    { time: 1, volume: baseVolume },
  ];
  
  if (riseAtEnd && totalDuration > 5) {
    keyframes.push({ time: totalDuration - 4, volume: baseVolume });
    keyframes.push({ time: totalDuration - 2, volume: baseVolume * 1.2 });
    keyframes.push({ time: totalDuration, volume: baseVolume * 0.5 });
  }
  
  return keyframes;
}
