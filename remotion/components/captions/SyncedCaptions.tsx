import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { CaptionWord, CaptionStyle, CaptionPresetConfig } from '../../../shared/config/caption-styles';
import { getPresetConfig } from '../../../shared/config/caption-styles';

export interface SyncedCaptionsProps {
  words: CaptionWord[];
  style: CaptionStyle;
  sceneStartFrame: number;
  sceneOffsetSec?: number;
}

interface WordGroup {
  words: CaptionWord[];
  startTime: number;
  endTime: number;
}

function groupWords(words: CaptionWord[], wordsPerLine: number): WordGroup[] {
  const groups: WordGroup[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const chunk = words.slice(i, i + wordsPerLine);
    if (chunk.length > 0) {
      groups.push({
        words: chunk,
        startTime: chunk[0].start,
        endTime: chunk[chunk.length - 1].end,
      });
    }
  }
  return groups;
}

function getPositionStyle(
  position: 'bottom' | 'center' | 'top',
  bottomMargin: number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  };

  switch (position) {
    case 'top':
      return { ...base, top: 60 };
    case 'center':
      return { ...base, top: '50%', transform: 'translateY(-50%)' };
    case 'bottom':
    default:
      return { ...base, bottom: bottomMargin };
  }
}

const KaraokeStyle: React.FC<{
  group: WordGroup;
  config: CaptionPresetConfig;
  currentTime: number;
  fps: number;
  frame: number;
}> = ({ group, config, currentTime, fps, frame }) => {
  const groupVisible =
    currentTime >= group.startTime - 0.05 && currentTime <= group.endTime + 0.1;
  if (!groupVisible) return null;

  const fadeIn = interpolate(
    currentTime,
    [group.startTime - 0.05, group.startTime + 0.1],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    currentTime,
    [group.endTime - 0.05, group.endTime + 0.1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        ...getPositionStyle(config.position, config.bottomMargin),
        opacity,
      }}
    >
      <div
        style={{
          background: config.backgroundColor,
          padding: '12px 24px',
          borderRadius: 8,
          display: 'flex',
          gap: '0.3em',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {group.words.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          const isPast = currentTime > w.end;
          return (
            <span
              key={i}
              style={{
                fontFamily: config.fontFamily,
                fontSize: config.fontSize,
                fontWeight: config.fontWeight,
                color: isActive ? config.activeColor : config.primaryColor,
                opacity: isPast ? 0.5 : 1,
                textShadow: config.textShadow,
                textTransform: config.textTransform as any,
                letterSpacing: config.letterSpacing,
                transition: 'color 0.1s, opacity 0.1s',
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const CapcutStyle: React.FC<{
  group: WordGroup;
  config: CaptionPresetConfig;
  currentTime: number;
  fps: number;
  frame: number;
}> = ({ group, config, currentTime, fps, frame }) => {
  const groupVisible =
    currentTime >= group.startTime - 0.05 && currentTime <= group.endTime + 0.15;
  if (!groupVisible) return null;

  const fadeIn = interpolate(
    currentTime,
    [group.startTime - 0.05, group.startTime + 0.08],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    currentTime,
    [group.endTime, group.endTime + 0.15],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        ...getPositionStyle(config.position, config.bottomMargin),
        opacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0.3em',
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: '8px 16px',
        }}
      >
        {group.words.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          const wordStartFrame = Math.round(w.start * fps);
          const localFrame = frame - wordStartFrame;

          let scale = 1;
          if (isActive && localFrame >= 0) {
            const s = spring({
              frame: localFrame,
              fps,
              config: { damping: 8, stiffness: 300 },
            });
            scale = 1 + (s > 1 ? 2 - s : s) * 0.15;
          }

          return (
            <span
              key={i}
              style={{
                fontFamily: config.fontFamily,
                fontSize: config.fontSize,
                fontWeight: config.fontWeight,
                color: isActive ? config.activeColor : config.primaryColor,
                textShadow: config.textShadow,
                textTransform: config.textTransform as any,
                letterSpacing: config.letterSpacing,
                display: 'inline-block',
                transform: `scale(${scale})`,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const HormoziStyle: React.FC<{
  words: CaptionWord[];
  config: CaptionPresetConfig;
  currentTime: number;
  fps: number;
  frame: number;
}> = ({ words, config, currentTime, fps, frame }) => {
  const activeWord = words.find(
    (w) => currentTime >= w.start - 0.02 && currentTime <= w.end + 0.05,
  );
  if (!activeWord) return null;

  const wordStartFrame = Math.round(activeWord.start * fps);
  const localFrame = frame - wordStartFrame;

  const s = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 10, stiffness: 250 },
  });
  const scale = Math.min(s, 1.05);

  const wordIndex = words.indexOf(activeWord);
  const useAlt = wordIndex % 2 === 1;
  const color = useAlt ? config.activeColor : config.primaryColor;

  return (
    <div
      style={{
        ...getPositionStyle(config.position, config.bottomMargin),
      }}
    >
      <span
        style={{
          fontFamily: config.fontFamily,
          fontSize: config.fontSize,
          fontWeight: config.fontWeight,
          color,
          textShadow: config.textShadow,
          textTransform: config.textTransform as any,
          letterSpacing: config.letterSpacing,
          display: 'inline-block',
          transform: `scale(${scale})`,
          opacity: Math.min(s, 1),
        }}
      >
        {activeWord.word}
      </span>
    </div>
  );
};

const BroadcastStyle: React.FC<{
  group: WordGroup;
  config: CaptionPresetConfig;
  currentTime: number;
  fps: number;
  frame: number;
}> = ({ group, config, currentTime, fps, frame }) => {
  const groupVisible =
    currentTime >= group.startTime - 0.1 && currentTime <= group.endTime + 0.2;
  if (!groupVisible) return null;

  const fadeIn = interpolate(
    currentTime,
    [group.startTime - 0.1, group.startTime + 0.15],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    currentTime,
    [group.endTime, group.endTime + 0.2],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        ...getPositionStyle(config.position, config.bottomMargin),
        opacity,
      }}
    >
      <div
        style={{
          background: config.backgroundColor,
          padding: '14px 32px',
          borderRadius: 2,
          minWidth: '40%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: config.fontFamily,
            fontSize: config.fontSize,
            fontWeight: config.fontWeight,
            color: config.primaryColor,
            textShadow: config.textShadow,
            textTransform: config.textTransform as any,
            letterSpacing: config.letterSpacing,
          }}
        >
          {group.words.map((w) => w.word).join(' ')}
        </span>
      </div>
    </div>
  );
};

const MinimalStyle: React.FC<{
  group: WordGroup;
  config: CaptionPresetConfig;
  currentTime: number;
  fps: number;
  frame: number;
}> = ({ group, config, currentTime, fps, frame }) => {
  const groupVisible =
    currentTime >= group.startTime - 0.05 && currentTime <= group.endTime + 0.15;
  if (!groupVisible) return null;

  const fadeIn = interpolate(
    currentTime,
    [group.startTime - 0.05, group.startTime + 0.1],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    currentTime,
    [group.endTime, group.endTime + 0.15],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        ...getPositionStyle(config.position, config.bottomMargin),
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: config.fontFamily,
          fontSize: config.fontSize,
          fontWeight: config.fontWeight,
          color: config.primaryColor,
          textShadow: config.textShadow,
          textTransform: config.textTransform as any,
          letterSpacing: config.letterSpacing,
          padding: '8px 16px',
        }}
      >
        {group.words.map((w) => w.word).join(' ')}
      </span>
    </div>
  );
};

export const SyncedCaptions: React.FC<SyncedCaptionsProps> = ({
  words,
  style,
  sceneStartFrame,
  sceneOffsetSec = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!words || words.length === 0) return null;

  const config = getPresetConfig(style);
  const currentTime = frame / fps + sceneOffsetSec;

  if (style.preset === 'hormozi') {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <HormoziStyle
          words={words}
          config={config}
          currentTime={currentTime}
          fps={fps}
          frame={frame}
        />
      </AbsoluteFill>
    );
  }

  const groups = groupWords(words, config.wordsPerLine);

  const activeGroup = groups.find(
    (g) => currentTime >= g.startTime - 0.1 && currentTime <= g.endTime + 0.2,
  );

  if (!activeGroup) return null;

  const StyleComponent = {
    karaoke: KaraokeStyle,
    capcut: CapcutStyle,
    broadcast: BroadcastStyle,
    minimal: MinimalStyle,
  }[style.preset] || MinimalStyle;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <StyleComponent
        group={activeGroup}
        config={config}
        currentTime={currentTime}
        fps={fps}
        frame={frame}
      />
    </AbsoluteFill>
  );
};

export default SyncedCaptions;
