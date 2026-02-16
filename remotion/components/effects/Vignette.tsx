import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export type VignetteStyle = 'subtle' | 'medium' | 'strong' | 'cinematic' | 'dramatic' | 'soft';

interface VignetteProps {
  style?: VignetteStyle;
  intensity?: number;
  color?: string;
  fadeIn?: boolean;
  fadeInDuration?: number;
  aspectRatio?: number;
  offsetX?: number;
  offsetY?: number;
}

const VIGNETTE_SETTINGS: Record<VignetteStyle, {
  innerRadius: number;
  outerRadius: number;
  opacity: number;
  feather: number;
}> = {
  'subtle': {
    innerRadius: 60,
    outerRadius: 100,
    opacity: 0.25,
    feather: 40,
  },
  'medium': {
    innerRadius: 50,
    outerRadius: 95,
    opacity: 0.4,
    feather: 35,
  },
  'strong': {
    innerRadius: 35,
    outerRadius: 90,
    opacity: 0.6,
    feather: 30,
  },
  'cinematic': {
    innerRadius: 45,
    outerRadius: 100,
    opacity: 0.35,
    feather: 45,
  },
  'dramatic': {
    innerRadius: 30,
    outerRadius: 85,
    opacity: 0.7,
    feather: 25,
  },
  'soft': {
    innerRadius: 70,
    outerRadius: 110,
    opacity: 0.2,
    feather: 50,
  },
};

export const Vignette: React.FC<VignetteProps> = ({
  style = 'cinematic',
  intensity = 1.0,
  color = '#000000',
  fadeIn = false,
  fadeInDuration = 30,
  aspectRatio = 1.0,
  offsetX = 0,
  offsetY = 0,
}) => {
  const frame = useCurrentFrame();
  
  const settings = VIGNETTE_SETTINGS[style];
  
  const fadeMultiplier = fadeIn
    ? interpolate(frame, [0, fadeInDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  
  const effectiveOpacity = settings.opacity * intensity * fadeMultiplier;
  
  const centerX = 50 + offsetX;
  const centerY = 50 + offsetY;
  
  const scaleX = aspectRatio > 1 ? aspectRatio : 1;
  const scaleY = aspectRatio < 1 ? 1 / aspectRatio : 1;
  
  const innerStop = settings.innerRadius;
  const outerStop = settings.outerRadius;
  
  const gradient = `radial-gradient(
    ellipse ${settings.feather * scaleX}% ${settings.feather * scaleY}% at ${centerX}% ${centerY}%,
    transparent ${innerStop}%,
    ${color} ${outerStop}%
  )`;
  
  return (
    <AbsoluteFill
      style={{
        background: gradient,
        opacity: effectiveOpacity,
        pointerEvents: 'none',
        mixBlendMode: 'multiply',
      }}
    />
  );
};

export const LetterboxVignette: React.FC<{
  intensity?: number;
  barHeight?: number;
  color?: string;
  feather?: number;
}> = ({
  intensity = 1.0,
  barHeight = 12,
  color = '#000000',
  feather = 30,
}) => {
  const effectiveHeight = barHeight * intensity;
  
  const topGradient = `linear-gradient(
    to bottom,
    ${color} 0%,
    ${color} ${effectiveHeight}%,
    transparent ${effectiveHeight + feather}%
  )`;
  
  const bottomGradient = `linear-gradient(
    to top,
    ${color} 0%,
    ${color} ${effectiveHeight}%,
    transparent ${effectiveHeight + feather}%
  )`;
  
  return (
    <>
      <AbsoluteFill
        style={{
          background: topGradient,
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background: bottomGradient,
          pointerEvents: 'none',
        }}
      />
    </>
  );
};

export const CenterSpotlight: React.FC<{
  radius?: number;
  intensity?: number;
  color?: string;
  centerX?: number;
  centerY?: number;
}> = ({
  radius = 40,
  intensity = 0.5,
  color = '#000000',
  centerX = 50,
  centerY = 50,
}) => {
  const gradient = `radial-gradient(
    circle at ${centerX}% ${centerY}%,
    transparent 0%,
    transparent ${radius}%,
    ${color} ${radius * 2}%
  )`;
  
  return (
    <AbsoluteFill
      style={{
        background: gradient,
        opacity: intensity,
        pointerEvents: 'none',
        mixBlendMode: 'multiply',
      }}
    />
  );
};
