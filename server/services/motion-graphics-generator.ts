// server/services/motion-graphics-generator.ts

import { 
  MotionGraphicType, 
  MotionGraphicConfig,
  MotionGraphicResult,
  MotionGraphicBaseConfig,
  KineticTypographyConfig,
  StatCounterConfig,
  ProcessFlowConfig,
  TreeGrowthConfig,
  BulletListAnimatedConfig,
  SplitScreenConfig,
  NetworkVisualizationConfig,
  TimelineConfig,
  AnimatedChartConfig,
  ProgressBarConfig,
} from '../../shared/types/motion-graphics-types';
import { motionGraphicsRouter } from './motion-graphics-router';
import { createLogger } from '../utils/logger';

const log = createLogger('MotionGenerator');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<MotionGraphicBaseConfig> = {
  fps: 30,
  width: 1920,
  height: 1080,
  backgroundColor: '#FFFFFF',
};

/**
 * Brand-specific defaults for Pine Hill Farm
 */
const PHF_BRAND_COLORS = {
  primary: '#2D5A27',    // Forest Green
  secondary: '#D4A574',  // Warm Gold
  accent: '#8B4513',     // Saddle Brown
  text: '#FFFFFF',       // White
  background: '#F5F5DC', // Beige
};

class MotionGraphicsGenerator {
  
  /**
   * Generate motion graphics configuration for a scene
   */
  async generateMotionGraphic(
    visualDirection: string,
    narration: string,
    sceneType: string,
    duration: number
  ): Promise<MotionGraphicResult> {
    log.debug(`Generating motion graphic for scene type: ${sceneType}`);
    
    try {
      // Get routing decision
      const routing = motionGraphicsRouter.analyzeVisualDirection(
        visualDirection, 
        narration, 
        sceneType
      );
      
      if (!routing.useMotionGraphics || !routing.suggestedType) {
        return {
          success: false,
          config: null as any,
          renderInstructions: null as any,
          error: 'Content not suitable for motion graphics',
        };
      }
      
      // Determine final type
      const graphicType = motionGraphicsRouter.determineMotionGraphicType(
        visualDirection,
        narration,
        routing.detectedKeywords
      );
      
      log.debug(`Type determined: ${graphicType}`);
      
      // Extract content from direction
      const extractedContent = motionGraphicsRouter.extractContentFromDirection(
        visualDirection,
        narration,
        graphicType
      );
      
      // Get brand colors
      const brandColors = await this.getBrandColors();
      
      // Generate configuration based on type
      const config = await this.generateConfigForType(
        graphicType,
        extractedContent,
        brandColors,
        duration
      );
      
      // Generate render instructions
      const renderInstructions = this.generateRenderInstructions(config);
      
      log.debug(`Config generated successfully`);
      
      return {
        success: true,
        config,
        renderInstructions,
      };
      
    } catch (error: any) {
      log.error(`Error:`, error.message);
      return {
        success: false,
        config: null as any,
        renderInstructions: null as any,
        error: error.message,
      };
    }
  }
  
  /**
   * Generate motion graphic from explicit type and content
   */
  async generateFromExplicitConfig(
    type: MotionGraphicType,
    content: Record<string, any>,
    duration: number
  ): Promise<MotionGraphicResult> {
    try {
      const brandColors = await this.getBrandColors();
      const config = await this.generateConfigForType(type, content, brandColors, duration);
      const renderInstructions = this.generateRenderInstructions(config);
      
      return {
        success: true,
        config,
        renderInstructions,
      };
    } catch (error: any) {
      log.error(`Error generating explicit config:`, error.message);
      return {
        success: false,
        config: null as any,
        renderInstructions: null as any,
        error: error.message,
      };
    }
  }
  
  /**
   * Get brand colors - can be extended to fetch from brand bible service
   */
  private async getBrandColors(): Promise<typeof PHF_BRAND_COLORS> {
    // Try to import brand bible service dynamically
    try {
      const { brandBibleService } = await import('./brand-bible-service');
      if (brandBibleService?.getBrandBible) {
        const bible = await brandBibleService.getBrandBible();
        return {
          primary: bible.colors?.primary || PHF_BRAND_COLORS.primary,
          secondary: bible.colors?.secondary || PHF_BRAND_COLORS.secondary,
          accent: bible.colors?.accent || PHF_BRAND_COLORS.accent,
          text: bible.colors?.text || PHF_BRAND_COLORS.text,
          background: bible.colors?.background || PHF_BRAND_COLORS.background,
        };
      }
    } catch {
      // Brand bible service not available, use defaults
    }
    return PHF_BRAND_COLORS;
  }
  
  /**
   * Generate configuration for specific motion graphic type
   */
  private async generateConfigForType(
    type: MotionGraphicType,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS,
    duration: number
  ): Promise<MotionGraphicConfig> {
    const baseConfig: MotionGraphicBaseConfig = {
      ...DEFAULT_CONFIG,
      type,
      duration,
      fps: 30,
      width: 1920,
      height: 1080,
      backgroundColor: brandColors.background,
      brandColors,
    };
    
    switch (type) {
      case 'kinetic-typography':
        return this.generateKineticTypographyConfig(baseConfig, content, brandColors);
        
      case 'stat-counter':
        return this.generateStatCounterConfig(baseConfig, content, brandColors);
        
      case 'progress-bar':
        return this.generateProgressBarConfig(baseConfig, content, brandColors);
        
      case 'process-flow':
        return this.generateProcessFlowConfig(baseConfig, content, brandColors);
        
      case 'tree-growth':
        return this.generateTreeGrowthConfig(baseConfig, content, brandColors);
        
      case 'bullet-list-animated':
        return this.generateBulletListConfig(baseConfig, content, brandColors);
        
      case 'split-screen':
        return this.generateSplitScreenConfig(baseConfig, content, brandColors);
        
      case 'network-visualization':
        return this.generateNetworkVisualizationConfig(baseConfig, content, brandColors);
        
      case 'timeline':
        return this.generateTimelineConfig(baseConfig, content, brandColors);
        
      case 'animated-chart':
        return this.generateAnimatedChartConfig(baseConfig, content, brandColors);
        
      default:
        // Default to kinetic typography
        return this.generateKineticTypographyConfig(baseConfig, content, brandColors);
    }
  }
  
  /**
   * Generate kinetic typography configuration
   */
  private generateKineticTypographyConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): KineticTypographyConfig {
    const fps = baseConfig.fps;
    const totalFrames = baseConfig.duration * fps;
    
    return {
      ...baseConfig,
      type: 'kinetic-typography',
      text: content.text || 'Your wellness journey starts here',
      animationStyle: content.animationStyle || 'word-by-word',
      fontSize: content.fontSize || 72,
      fontFamily: content.fontFamily || 'Inter, system-ui, sans-serif',
      fontWeight: content.fontWeight || '700',
      textColor: content.textColor || brandColors.primary,
      position: content.position || 'center',
      staggerDelay: content.staggerDelay || 6,
      entranceDuration: content.entranceDuration || Math.round(fps * 0.3),
      holdDuration: content.holdDuration || Math.round(totalFrames * 0.6),
      exitDuration: content.exitDuration || Math.round(fps * 0.5),
      easing: content.easing || 'spring',
      textShadow: content.textShadow !== undefined ? content.textShadow : true,
      backgroundBox: content.backgroundBox || {
        enabled: true,
        color: '#FFFFFF',
        opacity: 0.9,
        padding: 24,
        borderRadius: 12,
      },
    };
  }
  
  /**
   * Generate stat counter configuration
   */
  private generateStatCounterConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): StatCounterConfig {
    const fps = baseConfig.fps;
    
    // Default stats if none extracted
    const stats = content.stats?.length > 0 ? content.stats : [
      { value: 93, suffix: '%', label: 'Customer Satisfaction' },
      { value: 1853, suffix: '', label: 'Year Founded' },
      { value: 300, suffix: '+', label: 'Products' },
    ];
    
    return {
      ...baseConfig,
      type: 'stat-counter',
      stats,
      layout: stats.length <= 3 ? 'horizontal' : 'grid',
      animationDuration: Math.round(fps * 2),
      staggerDelay: Math.round(fps * 0.3),
      numberStyle: {
        fontSize: content.numberFontSize || 96,
        fontWeight: content.numberFontWeight || '800',
        color: content.numberColor || brandColors.primary,
      },
      labelStyle: {
        fontSize: content.labelFontSize || 24,
        fontWeight: content.labelFontWeight || '500',
        color: content.labelColor || brandColors.accent,
      },
    };
  }
  
  /**
   * Generate progress bar configuration
   */
  private generateProgressBarConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): ProgressBarConfig {
    const fps = baseConfig.fps;
    
    const bars = content.bars?.length > 0 ? content.bars : [
      { label: 'Progress', value: 75, color: brandColors.primary },
    ];
    
    return {
      ...baseConfig,
      type: 'progress-bar',
      bars,
      layout: content.layout || 'horizontal',
      barHeight: content.barHeight || 40,
      barSpacing: content.barSpacing || 30,
      animationDuration: Math.round(fps * 1.5),
      staggerDelay: Math.round(fps * 0.2),
      showPercentage: content.showPercentage !== false,
      labelStyle: {
        fontSize: content.labelFontSize || 24,
        fontWeight: content.labelFontWeight || '600',
        color: content.labelColor || brandColors.text,
      },
    };
  }
  
  /**
   * Generate process flow configuration
   */
  private generateProcessFlowConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): ProcessFlowConfig {
    const fps = baseConfig.fps;
    
    // Default steps if none extracted
    const steps = content.steps?.length > 0 ? content.steps : [
      { title: 'Step 1', description: 'Begin your journey' },
      { title: 'Step 2', description: 'Make progress' },
      { title: 'Step 3', description: 'Achieve results' },
    ];
    
    return {
      ...baseConfig,
      type: 'process-flow',
      steps,
      layout: steps.length <= 4 ? 'horizontal' : 'vertical',
      connectorStyle: content.connectorStyle || 'animated',
      stepStyle: {
        shape: content.stepShape || 'circle',
        size: content.stepSize || 80,
        backgroundColor: content.stepBackgroundColor || brandColors.primary,
        borderColor: content.stepBorderColor || brandColors.secondary,
        textColor: content.stepTextColor || brandColors.text,
      },
      animationType: content.animationType || 'sequential',
      stepDuration: Math.round(fps * 1.5),
    };
  }
  
  /**
   * Generate tree growth configuration
   */
  private generateTreeGrowthConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): TreeGrowthConfig {
    const fps = baseConfig.fps;
    
    // Default labels if none extracted
    const labels = content.labels?.length > 0 ? content.labels : [
      { text: 'Nutrition', position: 'branch' as const },
      { text: 'Exercise', position: 'branch' as const },
      { text: 'Sleep', position: 'branch' as const },
      { text: 'Mindfulness', position: 'branch' as const },
    ];
    
    return {
      ...baseConfig,
      type: 'tree-growth',
      trunkColor: content.trunkColor || brandColors.accent,
      branchColor: content.branchColor || brandColors.primary,
      leafColor: content.leafColor || brandColors.secondary,
      labels,
      growthDuration: Math.round(fps * (baseConfig.duration * 0.7)),
      style: content.style || 'organic',
      rootsVisible: content.rootsVisible !== false,
      rootLabels: content.rootLabels || ['Root Cause', 'Foundation', 'Core Health'],
    };
  }
  
  /**
   * Generate bullet list configuration
   */
  private generateBulletListConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): BulletListAnimatedConfig {
    const fps = baseConfig.fps;
    
    // Default items if none extracted
    const items = content.items?.length > 0 ? content.items : [
      'First actionable step',
      'Second actionable step',
      'Third actionable step',
    ];
    
    return {
      ...baseConfig,
      type: 'bullet-list-animated',
      items,
      bulletStyle: content.bulletStyle || 'check',
      animationType: content.animationType || 'slide-left',
      staggerDelay: Math.round(fps * 0.5),
      itemDuration: Math.round(fps * 0.4),
      textStyle: {
        fontSize: content.fontSize || 36,
        fontWeight: content.fontWeight || '600',
        color: content.textColor || brandColors.text,
      },
      bulletColor: content.bulletColor || brandColors.secondary,
      position: content.position || 'left',
      verticalPosition: content.verticalPosition || 30,
      backgroundBox: content.backgroundBox || {
        enabled: true,
        color: brandColors.primary,
        opacity: 0.85,
      },
    };
  }
  
  /**
   * Generate split screen configuration
   */
  private generateSplitScreenConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): SplitScreenConfig {
    const fps = baseConfig.fps;
    
    // Default panels if none provided
    const panels = content.panels?.length > 0 ? content.panels : [
      { mediaUrl: '', mediaType: 'image' as const, label: 'Panel 1' },
      { mediaUrl: '', mediaType: 'image' as const, label: 'Panel 2' },
    ];
    
    return {
      ...baseConfig,
      type: 'split-screen',
      layout: content.layout || '2-horizontal',
      panels,
      dividerStyle: {
        width: content.dividerWidth || 4,
        color: content.dividerColor || brandColors.secondary,
        animated: content.dividerAnimated !== false,
      },
      transitionType: content.transitionType || 'simultaneous',
      transitionDuration: Math.round(fps * 0.5),
    };
  }
  
  /**
   * Generate network visualization configuration
   */
  private generateNetworkVisualizationConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): NetworkVisualizationConfig {
    const nodes = content.nodes?.length > 0 ? content.nodes : [
      { id: '1', label: 'Central' },
      { id: '2', label: 'Node A' },
      { id: '3', label: 'Node B' },
      { id: '4', label: 'Node C' },
    ];
    
    const connections = content.connections?.length > 0 ? content.connections : [
      { from: '1', to: '2', animated: true },
      { from: '1', to: '3', animated: true },
      { from: '1', to: '4', animated: true },
    ];
    
    return {
      ...baseConfig,
      type: 'network-visualization',
      nodes,
      connections,
      layout: content.layout || 'circular',
      nodeStyle: {
        shape: content.nodeShape || 'circle',
        defaultSize: content.nodeSize || 60,
        defaultColor: content.nodeColor || brandColors.primary,
      },
      connectionStyle: {
        color: content.connectionColor || brandColors.secondary,
        width: content.connectionWidth || 3,
        animated: content.connectionAnimated !== false,
      },
      animationType: content.animationType || 'nodes-first',
    };
  }
  
  /**
   * Generate timeline configuration
   */
  private generateTimelineConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): TimelineConfig {
    const fps = baseConfig.fps;
    
    const events = content.events?.length > 0 ? content.events : [
      { date: '2020', title: 'Started' },
      { date: '2022', title: 'Growth' },
      { date: '2024', title: 'Success' },
    ];
    
    return {
      ...baseConfig,
      type: 'timeline',
      events,
      orientation: content.orientation || 'horizontal',
      lineStyle: {
        color: content.lineColor || brandColors.accent,
        width: content.lineWidth || 4,
      },
      markerStyle: {
        shape: content.markerShape || 'circle',
        size: content.markerSize || 20,
        color: content.markerColor || brandColors.primary,
      },
      animationType: content.animationType || 'sequential',
      eventDuration: Math.round(fps * 1),
    };
  }
  
  /**
   * Generate animated chart configuration
   */
  private generateAnimatedChartConfig(
    baseConfig: MotionGraphicBaseConfig,
    content: Record<string, any>,
    brandColors: typeof PHF_BRAND_COLORS
  ): AnimatedChartConfig {
    const fps = baseConfig.fps;
    
    const data = content.data?.length > 0 ? content.data : [
      { label: 'Category A', value: 75, color: brandColors.primary },
      { label: 'Category B', value: 50, color: brandColors.secondary },
      { label: 'Category C', value: 25, color: brandColors.accent },
    ];
    
    return {
      ...baseConfig,
      type: 'animated-chart',
      chartType: content.chartType || 'bar',
      data,
      animationDuration: Math.round(fps * 1.5),
      showLabels: content.showLabels !== false,
      showValues: content.showValues !== false,
      axisStyle: {
        color: content.axisColor || brandColors.accent,
        labelFontSize: content.axisLabelFontSize || 14,
      },
    };
  }
  
  /**
   * Generate render instructions for Remotion
   */
  private generateRenderInstructions(config: MotionGraphicConfig): {
    compositionId: string;
    props: Record<string, any>;
    durationInFrames: number;
  } {
    const durationInFrames = Math.round(config.duration * config.fps);
    
    // Map type to composition ID
    const compositionIdMap: Record<MotionGraphicType, string> = {
      'kinetic-typography': 'KineticTypography',
      'stat-counter': 'StatCounter',
      'progress-bar': 'ProgressBar',
      'animated-chart': 'AnimatedChart',
      'process-flow': 'ProcessFlow',
      'comparison': 'Comparison',
      'tree-growth': 'TreeGrowth',
      'network-visualization': 'NetworkVisualization',
      'transformation': 'Transformation',
      'journey-path': 'JourneyPath',
      'split-screen': 'SplitScreen',
      'before-after': 'BeforeAfter',
      'picture-in-picture': 'PictureInPicture',
      'bullet-list-animated': 'BulletListAnimated',
      'timeline': 'Timeline',
      'abstract-organic': 'AbstractOrganic',
    };
    
    return {
      compositionId: compositionIdMap[config.type] || 'MotionGraphic',
      props: { ...config },
      durationInFrames,
    };
  }
}

export const motionGraphicsGenerator = new MotionGraphicsGenerator();
