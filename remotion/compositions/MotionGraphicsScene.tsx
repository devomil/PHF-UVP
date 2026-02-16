import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';

import { KineticText } from '../components/motion-graphics/KineticText';
import { WordByWord } from '../components/motion-graphics/WordByWord';
import { CharacterAnimation } from '../components/motion-graphics/CharacterAnimation';
import { StatCounter, StatItem } from '../components/motion-graphics/StatCounter';
import { ProgressBar } from '../components/motion-graphics/ProgressBar';
import { ProcessFlow } from '../components/motion-graphics/ProcessFlow';
import { TreeGrowth } from '../components/motion-graphics/TreeGrowth';
import { NetworkVisualization } from '../components/motion-graphics/NetworkVisualization';
import { TransformationSequence, TransformationStep } from '../components/motion-graphics/TransformationSequence';
import { AnimatedChart, ChartDataPoint } from '../components/motion-graphics/AnimatedChart';
import { SplitScreen } from '../components/motion-graphics/SplitScreen';
import { BeforeAfter } from '../components/motion-graphics/BeforeAfter';
import { PictureInPicture } from '../components/motion-graphics/PictureInPicture';

export type MotionGraphicsType =
  | 'kinetic-text'
  | 'word-by-word'
  | 'character-animation'
  | 'stat-counter'
  | 'progress-bar'
  | 'animated-chart'
  | 'process-flow'
  | 'tree-growth'
  | 'network-visualization'
  | 'transformation-sequence'
  | 'split-screen'
  | 'before-after'
  | 'picture-in-picture';

export interface MotionGraphicsConfig {
  type: MotionGraphicsType;
  startFrame: number;
  durationInFrames: number;
  props: Record<string, any>;
}

export interface MotionGraphicsSceneProps {
  configs: MotionGraphicsConfig[];
  backgroundColor?: string;
}

const renderMotionGraphic = (config: MotionGraphicsConfig): React.ReactNode => {
  const { type, props } = config;
  
  switch (type) {
    case 'kinetic-text':
      return <KineticText {...(props as any)} />;
    case 'word-by-word':
      return <WordByWord {...(props as any)} />;
    case 'character-animation':
      return <CharacterAnimation {...(props as any)} />;
    case 'stat-counter':
      return <StatCounter {...(props as any)} />;
    case 'progress-bar':
      return <ProgressBar {...(props as any)} />;
    case 'animated-chart':
      return <AnimatedChart {...(props as any)} />;
    case 'process-flow':
      return <ProcessFlow {...(props as any)} />;
    case 'tree-growth':
      return <TreeGrowth {...(props as any)} />;
    case 'network-visualization':
      return <NetworkVisualization {...(props as any)} />;
    case 'transformation-sequence':
      return <TransformationSequence {...(props as any)} />;
    case 'split-screen':
      return <SplitScreen {...(props as any)} />;
    case 'before-after':
      return <BeforeAfter {...(props as any)} />;
    case 'picture-in-picture':
      return <PictureInPicture {...(props as any)} />;
    default:
      console.warn(`Unknown motion graphics type: ${type}`);
      return null;
  }
};

export const MotionGraphicsScene: React.FC<MotionGraphicsSceneProps> = ({
  configs,
  backgroundColor = 'transparent',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {configs.map((config, index) => (
        <Sequence
          key={`motion-graphic-${index}-${config.type}`}
          from={config.startFrame}
          durationInFrames={config.durationInFrames}
        >
          {renderMotionGraphic(config)}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const createKineticTextConfig = (
  text: string,
  startFrame: number,
  durationInFrames: number,
  options: Partial<{
    animation: 'typewriter' | 'fade-in' | 'slide-up' | 'wave' | 'bounce' | 'scale';
    color: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
  }> = {}
): MotionGraphicsConfig => ({
  type: 'kinetic-text',
  startFrame,
  durationInFrames,
  props: {
    text,
    animation: options.animation || 'typewriter',
    style: {
      color: options.color || '#2d5a27',
      fontSize: options.fontSize || 48,
      fontFamily: options.fontFamily || 'Inter, sans-serif',
      fontWeight: options.fontWeight || 700,
    },
    backgroundColor: options.backgroundColor || 'transparent',
    textAlign: options.textAlign || 'center',
  },
});

export const createStatCounterConfig = (
  stats: StatItem[],
  startFrame: number,
  durationInFrames: number,
  options: Partial<{
    layout: 'horizontal' | 'vertical' | 'grid';
    numberColor: string;
    labelColor: string;
    backgroundColor: string;
  }> = {}
): MotionGraphicsConfig => ({
  type: 'stat-counter',
  startFrame,
  durationInFrames,
  props: {
    stats,
    layout: options.layout || 'horizontal',
    animationDuration: 45,
    staggerDelay: 15,
    holdDuration: 60,
    numberStyle: {
      fontSize: 64,
      fontWeight: 700,
      fontFamily: 'Inter, sans-serif',
      color: options.numberColor || '#2d5a27',
    },
    labelStyle: {
      fontSize: 18,
      fontWeight: 500,
      fontFamily: 'Inter, sans-serif',
      color: options.labelColor || '#5e637a',
    },
    backgroundColor: options.backgroundColor || 'transparent',
    countEasing: 'ease-out',
    entranceAnimation: 'scale',
  },
});

export const createChartConfig = (
  data: ChartDataPoint[],
  chartType: 'bar' | 'pie' | 'line' | 'donut',
  startFrame: number,
  durationInFrames: number,
  options: Partial<{
    title: string;
    primaryColor: string;
    backgroundColor: string;
    showValues: boolean;
    showLabels: boolean;
    showLegend: boolean;
  }> = {}
): MotionGraphicsConfig => ({
  type: 'animated-chart',
  startFrame,
  durationInFrames,
  props: {
    data,
    chartType,
    animationDuration: 45,
    staggerDelay: 10,
    holdDuration: 60,
    primaryColor: options.primaryColor || '#2d5a27',
    secondaryColor: '#607e66',
    backgroundColor: options.backgroundColor || 'transparent',
    labelColor: '#5e637a',
    titleText: options.title,
    labelStyle: {
      fontSize: 14,
      fontWeight: 500,
      fontFamily: 'Inter, sans-serif',
    },
    showValues: options.showValues ?? true,
    showLabels: options.showLabels ?? true,
    showLegend: options.showLegend ?? true,
  },
});

export const createTransformationConfig = (
  steps: TransformationStep[],
  startFrame: number,
  durationInFrames: number,
  options: Partial<{
    transitionType: 'morph' | 'fade' | 'slide' | 'flip' | 'zoom';
    primaryColor: string;
    backgroundColor: string;
    showProgressIndicator: boolean;
    showStepNumbers: boolean;
  }> = {}
): MotionGraphicsConfig => ({
  type: 'transformation-sequence',
  startFrame,
  durationInFrames,
  props: {
    steps,
    transitionType: options.transitionType || 'morph',
    stepDuration: 60,
    transitionDuration: 30,
    holdDuration: 45,
    primaryColor: options.primaryColor || '#2d5a27',
    secondaryColor: '#607e66',
    backgroundColor: options.backgroundColor || 'transparent',
    labelColor: '#5e637a',
    labelStyle: {
      fontSize: 24,
      fontWeight: 600,
      fontFamily: 'Inter, sans-serif',
    },
    showProgressIndicator: options.showProgressIndicator ?? true,
    showStepNumbers: options.showStepNumbers ?? true,
    showArrows: true,
  },
});

export default MotionGraphicsScene;
