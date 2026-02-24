import React, { useMemo } from 'react';
import { Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VoiceoverRange } from '../../../shared/types/sound-design';

export interface VolumeKeyframe {
  time: number;
  volume: number;
}

export interface NativeAudioRange {
  startFrame: number;
  endFrame: number;
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
  nativeAudioRanges?: NativeAudioRange[];
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
      const { baseVolume, duckLevel, voiceoverRanges, nativeAudioRanges, fadeFrames } = props;
      
      let targetVolume = baseVolume;
      let isInVoiceover = false;
      let isInNativeAudio = false;

      for (const range of voiceoverRanges) {
        if (frame >= range.startFrame - fadeFrames && frame < range.startFrame) {
          targetVolume = interpolate(
            frame,
            [range.startFrame - fadeFrames, range.startFrame],
            [baseVolume, duckLevel],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          isInVoiceover = true;
          break;
        }
        
        if (frame >= range.startFrame && frame < range.endFrame) {
          targetVolume = duckLevel;
          isInVoiceover = true;
          break;
        }
        
        if (frame >= range.endFrame && frame < range.endFrame + fadeFrames) {
          targetVolume = interpolate(
            frame,
            [range.endFrame, range.endFrame + fadeFrames],
            [duckLevel, baseVolume],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          isInVoiceover = true;
          break;
        }
      }

      if (nativeAudioRanges && nativeAudioRanges.length > 0) {
        for (const range of nativeAudioRanges) {
          if (frame >= range.startFrame && frame < range.endFrame) {
            isInNativeAudio = true;
            const nativeDuckFactor = 0.3;
            targetVolume = targetVolume * nativeDuckFactor;
            break;
          }
          if (frame >= range.startFrame - fadeFrames && frame < range.startFrame) {
            isInNativeAudio = true;
            const nativeDuckFactor = interpolate(
              frame,
              [range.startFrame - fadeFrames, range.startFrame],
              [1, 0.3],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            );
            targetVolume = targetVolume * nativeDuckFactor;
            break;
          }
          if (frame >= range.endFrame && frame < range.endFrame + fadeFrames) {
            isInNativeAudio = true;
            const nativeDuckFactor = interpolate(
              frame,
              [range.endFrame, range.endFrame + fadeFrames],
              [0.3, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            );
            targetVolume = targetVolume * nativeDuckFactor;
            break;
          }
        }
      }

      const endFadeStart = durationInFrames - 60;
      if (frame >= endFadeStart) {
        const endFadeFactor = interpolate(
          frame,
          [endFadeStart, durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        targetVolume = targetVolume * endFadeFactor;
      }
      
      return targetVolume;
    } else {
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
