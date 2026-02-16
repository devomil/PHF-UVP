// shared/types/motion-graphics-types.ts

/**
 * Types of motion graphic content the system can generate
 */
export type MotionGraphicType = 
  | 'kinetic-typography'
  | 'stat-counter'
  | 'progress-bar'
  | 'animated-chart'
  | 'process-flow'
  | 'comparison'
  | 'tree-growth'
  | 'network-visualization'
  | 'transformation'
  | 'journey-path'
  | 'split-screen'
  | 'before-after'
  | 'picture-in-picture'
  | 'bullet-list-animated'
  | 'timeline'
  | 'abstract-organic';

/**
 * Routing decision result
 */
export interface RoutingDecision {
  useMotionGraphics: boolean;
  confidence: number; // 0-1
  detectedKeywords: string[];
  suggestedType: MotionGraphicType | null;
  reasoning: string;
  fallbackToAI: boolean;
}

/**
 * Base configuration for all motion graphics
 */
export interface MotionGraphicBaseConfig {
  type: MotionGraphicType;
  duration: number; // in seconds
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
  brandColors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
  };
}

/**
 * Kinetic typography configuration
 */
export interface KineticTypographyConfig extends MotionGraphicBaseConfig {
  type: 'kinetic-typography';
  text: string;
  animationStyle: 'word-by-word' | 'character' | 'line-by-line' | 'bounce' | 'wave' | 'reveal' | 'split' | 'typewriter' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in' | 'fade';
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textColor: string;
  position: 'center' | 'top' | 'bottom' | 'custom';
  customPosition?: { x: number; y: number };
  staggerDelay: number; // frames between each word/character
  entranceDuration: number; // frames for entrance animation
  holdDuration: number; // frames to hold at full visibility
  exitDuration: number; // frames for exit animation
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce';
  textShadow?: boolean;
  backgroundBox?: {
    enabled: boolean;
    color: string;
    opacity: number;
    padding: number;
    borderRadius: number;
  };
}

/**
 * Stat counter configuration
 */
export interface StatCounterConfig extends MotionGraphicBaseConfig {
  type: 'stat-counter';
  stats: Array<{
    value: number;
    label: string;
    prefix?: string;
    suffix?: string;
    decimals?: number;
  }>;
  layout: 'horizontal' | 'vertical' | 'grid';
  animationDuration: number; // frames for count animation
  staggerDelay: number;
  numberStyle: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
  labelStyle: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
}

/**
 * Progress bar configuration
 */
export interface ProgressBarConfig extends MotionGraphicBaseConfig {
  type: 'progress-bar';
  bars: Array<{
    label: string;
    value: number; // 0-100
    color?: string;
  }>;
  layout: 'horizontal' | 'vertical';
  barHeight: number;
  barSpacing: number;
  animationDuration: number;
  staggerDelay: number;
  showPercentage: boolean;
  labelStyle: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
}

/**
 * Process flow configuration
 */
export interface ProcessFlowConfig extends MotionGraphicBaseConfig {
  type: 'process-flow';
  steps: Array<{
    title: string;
    description?: string;
    icon?: string;
  }>;
  layout: 'horizontal' | 'vertical' | 'circular';
  connectorStyle: 'line' | 'arrow' | 'dotted' | 'animated';
  stepStyle: {
    shape: 'circle' | 'square' | 'rounded' | 'hexagon';
    size: number;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
  };
  animationType: 'sequential' | 'simultaneous' | 'build';
  stepDuration: number; // frames per step
}

/**
 * Tree growth / organic metaphor configuration
 */
export interface TreeGrowthConfig extends MotionGraphicBaseConfig {
  type: 'tree-growth';
  trunkColor: string;
  branchColor: string;
  leafColor: string;
  labels: Array<{
    text: string;
    position: 'root' | 'branch' | 'leaf';
    branchIndex?: number;
  }>;
  growthDuration: number; // frames for full growth
  style: 'natural' | 'geometric' | 'minimal' | 'organic';
  rootsVisible: boolean;
  rootLabels?: string[];
}

/**
 * Network visualization configuration
 */
export interface NetworkVisualizationConfig extends MotionGraphicBaseConfig {
  type: 'network-visualization';
  nodes: Array<{
    id: string;
    label: string;
    size?: number;
    color?: string;
  }>;
  connections: Array<{
    from: string;
    to: string;
    label?: string;
    animated?: boolean;
  }>;
  layout: 'force' | 'circular' | 'hierarchical' | 'grid';
  nodeStyle: {
    shape: 'circle' | 'square' | 'rounded';
    defaultSize: number;
    defaultColor: string;
  };
  connectionStyle: {
    color: string;
    width: number;
    animated: boolean;
  };
  animationType: 'nodes-first' | 'connections-first' | 'simultaneous';
}

/**
 * Split screen configuration
 */
export interface SplitScreenConfig extends MotionGraphicBaseConfig {
  type: 'split-screen';
  layout: '2-horizontal' | '2-vertical' | '3-horizontal' | '3-vertical' | '4-grid' | 'pip';
  panels: Array<{
    mediaUrl: string;
    mediaType: 'image' | 'video';
    label?: string;
    labelPosition?: 'top' | 'bottom';
  }>;
  dividerStyle: {
    width: number;
    color: string;
    animated: boolean;
  };
  transitionType: 'simultaneous' | 'sequential' | 'wipe';
  transitionDuration: number;
}

/**
 * Before/After comparison configuration
 */
export interface BeforeAfterConfig extends MotionGraphicBaseConfig {
  type: 'before-after';
  beforeMedia: {
    url: string;
    type: 'image' | 'video';
    label: string;
  };
  afterMedia: {
    url: string;
    type: 'image' | 'video';
    label: string;
  };
  transitionStyle: 'slider' | 'fade' | 'wipe' | 'flip';
  sliderPosition?: number; // 0-100, for slider style
  labelStyle: {
    fontSize: number;
    color: string;
    backgroundColor: string;
  };
}

/**
 * Animated bullet list configuration
 */
export interface BulletListAnimatedConfig extends MotionGraphicBaseConfig {
  type: 'bullet-list-animated';
  items: string[];
  bulletStyle: 'dot' | 'check' | 'arrow' | 'number' | 'custom';
  customBullet?: string;
  animationType: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'pop';
  staggerDelay: number;
  itemDuration: number;
  textStyle: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
  bulletColor: string;
  position: 'left' | 'center' | 'right';
  verticalPosition: number; // percentage from top
  backgroundBox?: {
    enabled: boolean;
    color: string;
    opacity: number;
  };
}

/**
 * Timeline configuration
 */
export interface TimelineConfig extends MotionGraphicBaseConfig {
  type: 'timeline';
  events: Array<{
    date: string;
    title: string;
    description?: string;
  }>;
  orientation: 'horizontal' | 'vertical';
  lineStyle: {
    color: string;
    width: number;
  };
  markerStyle: {
    shape: 'circle' | 'diamond' | 'square';
    size: number;
    color: string;
  };
  animationType: 'sequential' | 'build';
  eventDuration: number;
}

/**
 * Animated chart configuration
 */
export interface AnimatedChartConfig extends MotionGraphicBaseConfig {
  type: 'animated-chart';
  chartType: 'bar' | 'line' | 'pie' | 'donut';
  data: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
  animationDuration: number;
  showLabels: boolean;
  showValues: boolean;
  axisStyle?: {
    color: string;
    labelFontSize: number;
  };
}

/**
 * Union type for all motion graphic configs
 */
export type MotionGraphicConfig = 
  | KineticTypographyConfig
  | StatCounterConfig
  | ProgressBarConfig
  | ProcessFlowConfig
  | TreeGrowthConfig
  | NetworkVisualizationConfig
  | SplitScreenConfig
  | BeforeAfterConfig
  | BulletListAnimatedConfig
  | TimelineConfig
  | AnimatedChartConfig;

/**
 * Result from motion graphics generation
 */
export interface MotionGraphicResult {
  success: boolean;
  config: MotionGraphicConfig;
  renderInstructions: {
    compositionId: string;
    props: Record<string, any>;
    durationInFrames: number;
  };
  error?: string;
}
