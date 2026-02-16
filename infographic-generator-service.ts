import { createLogger } from '../utils/logger';

const log = createLogger('InfographicGenerator');

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

interface StatCounterConfig {
  type: 'stat-counter';
  duration: number;
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
  brandColors: BrandColors;
  stats: Array<{ value: number; label: string; suffix?: string; prefix?: string; color?: string }>;
  layout: 'horizontal' | 'vertical' | 'grid';
  animationDuration: number;
  staggerDelay: number;
  holdDuration: number;
  numberStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  countEasing: 'linear' | 'ease-out' | 'ease-in-out' | 'spring';
  entranceAnimation: 'fade' | 'slide-up' | 'scale' | 'none';
}

interface ProgressBarConfig {
  type: 'progress-bar';
  duration: number;
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
  brandColors: BrandColors;
  items: Array<{ label: string; value: number; color?: string }>;
  layout: 'horizontal' | 'vertical';
  barHeight: number;
  barRadius: number;
  fillColor: string;
  animationDuration: number;
  staggerDelay: number;
  holdDuration: number;
  animationStyle: 'linear' | 'spring' | 'ease-out';
}

interface ProcessFlowConfig {
  type: 'process-flow';
  duration: number;
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
  brandColors: BrandColors;
  steps: Array<{ title: string; description?: string }>;
  layout: 'horizontal' | 'vertical';
  connectorStyle: { type: 'line' | 'arrow' | 'dotted'; color: string; width: number };
  stepStyle: {
    shape: 'circle' | 'square' | 'rounded';
    size: number;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    textColor: string;
  };
  titleStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  descriptionStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
  };
  animationType: 'sequential' | 'simultaneous';
  stepDuration: number;
  stepSpacing: number;
  showNumbers: boolean;
  holdDuration: number;
}

type InfographicConfig = StatCounterConfig | ProgressBarConfig | ProcessFlowConfig;

class InfographicGeneratorService {
  private defaultBrandColors: BrandColors = {
    primary: '#2D5A27',
    secondary: '#D4A574',
    accent: '#8B4513',
    text: '#FFFFFF',
  };

  async generateStatCounterConfig(
    stats: Array<{ value: number; label: string; suffix?: string; prefix?: string; displayValue?: string }>,
    duration: number,
    options?: {
      layout?: 'horizontal' | 'vertical' | 'grid';
      width?: number;
      height?: number;
    }
  ): Promise<StatCounterConfig> {
    const brandColors = await this.getBrandColors();
    const fps = 30;
    const totalFrames = Math.round(fps * duration);
    
    const entranceTime = Math.round(fps * 2);
    const staggerTime = Math.round(fps * 0.3);
    const exitTime = Math.round(fps * 0.5);
    const minHold = Math.round(fps * 0.5);
    
    const totalEntranceFrames = entranceTime + (stats.length - 1) * staggerTime;
    const holdDuration = Math.max(minHold, totalFrames - totalEntranceFrames - exitTime);
    
    log.info('Generating stat counter config', { statsCount: stats.length, duration, holdDuration });
    
    return {
      type: 'stat-counter',
      duration,
      fps,
      width: options?.width || 1920,
      height: options?.height || 1080,
      backgroundColor: '#FFFFFF',
      brandColors,
      stats: stats.map(s => ({ ...s, color: brandColors.primary })),
      layout: options?.layout || (stats.length <= 3 ? 'horizontal' : 'grid'),
      animationDuration: entranceTime,
      staggerDelay: staggerTime,
      holdDuration,
      numberStyle: {
        fontSize: stats.length <= 2 ? 120 : stats.length <= 3 ? 96 : 72,
        fontWeight: '800',
        fontFamily: 'Inter, sans-serif',
        color: brandColors.primary,
      },
      labelStyle: {
        fontSize: stats.length <= 2 ? 28 : 24,
        fontWeight: '500',
        fontFamily: 'Inter, sans-serif',
        color: brandColors.accent,
      },
      countEasing: 'ease-out',
      entranceAnimation: 'scale',
    };
  }

  async generateProgressBarConfig(
    items: Array<{ label: string; value: number }>,
    duration: number,
    options?: {
      layout?: 'horizontal' | 'vertical';
      width?: number;
      height?: number;
      barHeight?: number;
    }
  ): Promise<ProgressBarConfig> {
    const brandColors = await this.getBrandColors();
    const fps = 30;
    const totalFrames = Math.round(fps * duration);
    
    const entranceTime = Math.round(fps * 1.5);
    const staggerTime = Math.round(fps * 0.4);
    const exitTime = Math.round(fps * 0.5);
    const minHold = Math.round(fps * 0.5);
    
    const totalEntranceFrames = entranceTime + (items.length - 1) * staggerTime;
    const holdDuration = Math.max(minHold, totalFrames - totalEntranceFrames - exitTime);
    
    log.info('Generating progress bar config', { itemsCount: items.length, duration, holdDuration });
    
    return {
      type: 'progress-bar',
      duration,
      fps,
      width: options?.width || 1920,
      height: options?.height || 1080,
      backgroundColor: '#FFFFFF',
      brandColors,
      items: items.map((item, index) => ({
        ...item,
        color: index % 2 === 0 ? brandColors.primary : brandColors.secondary,
      })),
      layout: options?.layout || 'vertical',
      barHeight: options?.barHeight || (items.length <= 3 ? 40 : 30),
      barRadius: 8,
      fillColor: brandColors.primary,
      animationDuration: entranceTime,
      staggerDelay: staggerTime,
      holdDuration,
      animationStyle: 'ease-out',
    };
  }

  async generateProcessFlowConfig(
    steps: Array<{ title: string; description?: string }>,
    duration: number,
    options?: {
      layout?: 'horizontal' | 'vertical';
      width?: number;
      height?: number;
      animationType?: 'sequential' | 'simultaneous';
    }
  ): Promise<ProcessFlowConfig> {
    const brandColors = await this.getBrandColors();
    const fps = 30;
    const totalFrames = Math.round(fps * duration);
    
    const stepTime = Math.round(fps * 1.5);
    const exitTime = Math.round(fps * 0.5);
    const minHold = Math.round(fps * 0.5);
    
    const animType = options?.animationType || 'sequential';
    const totalEntranceFrames = animType === 'simultaneous' ? stepTime : steps.length * stepTime;
    const holdDuration = Math.max(minHold, totalFrames - totalEntranceFrames - exitTime);
    
    log.info('Generating process flow config', { stepsCount: steps.length, duration, holdDuration });
    
    return {
      type: 'process-flow',
      duration,
      fps,
      width: options?.width || 1920,
      height: options?.height || 1080,
      backgroundColor: '#FFFFFF',
      brandColors,
      steps,
      layout: options?.layout || (steps.length <= 4 ? 'horizontal' : 'vertical'),
      connectorStyle: { type: 'arrow', color: brandColors.secondary, width: 3 },
      stepStyle: {
        shape: 'circle',
        size: steps.length <= 3 ? 90 : steps.length <= 5 ? 80 : 70,
        backgroundColor: brandColors.primary,
        borderColor: brandColors.secondary,
        borderWidth: 3,
        textColor: '#FFFFFF',
      },
      titleStyle: {
        fontSize: steps.length <= 3 ? 22 : 18,
        fontWeight: '600',
        fontFamily: 'Inter, sans-serif',
        color: brandColors.primary,
      },
      descriptionStyle: {
        fontSize: steps.length <= 3 ? 14 : 12,
        fontWeight: '400',
        fontFamily: 'Inter, sans-serif',
        color: brandColors.accent,
      },
      animationType: animType,
      stepDuration: stepTime,
      stepSpacing: steps.length <= 3 ? 60 : 40,
      showNumbers: true,
      holdDuration,
    };
  }

  parseStatsFromNarration(narration: string): Array<{ value: number; label: string; suffix: string; prefix: string; displayValue?: string }> {
    const stats: Array<{ value: number; label: string; suffix: string; prefix: string; displayValue?: string }> = [];
    
    const monetaryPattern = /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|thousand|k|m|b)?\s+([a-zA-Z][a-zA-Z\s]{2,30})/gi;
    let match;
    while ((match = monetaryPattern.exec(narration)) !== null) {
      const rawValue = parseFloat(match[1].replace(/,/g, ''));
      const multiplierStr = match[2]?.toLowerCase() || '';
      const label = match[3].trim();
      
      let multiplier = 1;
      let displaySuffix = '';
      if (multiplierStr === 'k' || multiplierStr === 'thousand') { multiplier = 1000; displaySuffix = 'K'; }
      else if (multiplierStr === 'm' || multiplierStr === 'million') { multiplier = 1000000; displaySuffix = 'M'; }
      else if (multiplierStr === 'b' || multiplierStr === 'billion') { multiplier = 1000000000; displaySuffix = 'B'; }
      
      if (!isNaN(rawValue) && label.length > 0) {
        stats.push({ 
          value: rawValue, 
          label, 
          suffix: displaySuffix, 
          prefix: '$',
          displayValue: `$${rawValue}${displaySuffix}`
        });
      }
    }
    
    const numericPattern = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|percent|\+|million|billion|thousand|k|m|b)?\s+([a-zA-Z][a-zA-Z\s]{2,30})/gi;
    while ((match = numericPattern.exec(narration)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      const suffixRaw = match[2]?.toLowerCase() || '';
      const label = match[3].trim();
      
      if (!isNaN(value) && label.length > 0 && label.length < 50) {
        let suffix = suffixRaw;
        let displayValue: string | undefined;
        
        if (suffixRaw === 'percent') suffix = '%';
        else if (suffixRaw === 'million' || suffixRaw === 'm') { suffix = 'M'; displayValue = `${value}M`; }
        else if (suffixRaw === 'billion' || suffixRaw === 'b') { suffix = 'B'; displayValue = `${value}B`; }
        else if (suffixRaw === 'thousand' || suffixRaw === 'k') { suffix = 'K'; displayValue = `${value}K`; }
        
        const existing = stats.find(s => s.label.toLowerCase() === label.toLowerCase());
        if (!existing) {
          stats.push({ value, label, suffix, prefix: '', displayValue });
        }
      }
    }
    
    const wordNumberPatterns = [
      { regex: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(hundred\s+)?(percent|%)\s+([a-zA-Z][a-zA-Z\s]{2,30})/gi, type: 'percent' },
      { regex: /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]?(one|two|three|four|five|six|seven|eight|nine)?\s+(percent|%)\s+([a-zA-Z][a-zA-Z\s]{2,30})/gi, type: 'percent' },
    ];
    
    const wordToNumber: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    };
    
    for (const { regex, type } of wordNumberPatterns) {
      while ((match = regex.exec(narration)) !== null) {
        const firstWord = match[1].toLowerCase();
        const secondWord = match[2]?.toLowerCase() || '';
        const hasHundred = match[2]?.toLowerCase() === 'hundred ';
        const label = match[4]?.trim() || match[3]?.trim();
        
        let value = wordToNumber[firstWord] || 0;
        if (hasHundred) value *= 100;
        if (secondWord && wordToNumber[secondWord]) value += wordToNumber[secondWord];
        
        if (value > 0 && label) {
          const existing = stats.find(s => s.label.toLowerCase() === label.toLowerCase());
          if (!existing) {
            stats.push({ value, label, suffix: type === 'percent' ? '%' : '', prefix: '' });
          }
        }
      }
    }
    
    log.info('Parsed stats from narration', { found: stats.length });
    return stats.slice(0, 4);
  }

  parseProgressFromNarration(narration: string): Array<{ label: string; value: number }> {
    const items: Array<{ label: string; value: number }> = [];
    
    const patterns = [
      /([a-zA-Z][a-zA-Z\s]{2,25})[:]\s*(\d+)\s*%/gi,
      /(\d+)\s*%\s+(?:of\s+)?([a-zA-Z][a-zA-Z\s]{2,25})/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(narration)) !== null) {
        if (pattern.source.startsWith('([a-zA-Z]')) {
          const label = match[1].trim();
          const value = parseInt(match[2], 10);
          if (!isNaN(value) && value <= 100 && label.length > 0) {
            items.push({ label, value });
          }
        } else {
          const value = parseInt(match[1], 10);
          const label = match[2].trim();
          if (!isNaN(value) && value <= 100 && label.length > 0) {
            items.push({ label, value });
          }
        }
      }
      if (items.length > 0) break;
    }
    
    log.info('Parsed progress items from narration', { found: items.length });
    return items.slice(0, 5);
  }

  parseStepsFromNarration(narration: string): Array<{ title: string; description?: string }> {
    const steps: Array<{ title: string; description?: string }> = [];
    
    const patterns = [
      /(?:step\s*(\d+)[:\s]+)([^.!?\n]+)/gi,
      /(?:^|\n)\s*(\d+)[.):]\s*([^.!?\n]+)/gm,
      /(?:first|second|third|fourth|fifth|sixth|finally)[,:\s]+([^.!?\n]+)/gi,
      /(?:[•\-\*]\s*)([^•\-\*\n]+)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(narration)) !== null) {
        const title = (match[2] || match[1]).trim();
        if (title.length > 0 && title.length < 100) {
          const existingStep = steps.find(s => s.title.toLowerCase() === title.toLowerCase());
          if (!existingStep) {
            steps.push({ title });
          }
        }
      }
      if (steps.length >= 2) break;
    }
    
    log.info('Parsed steps from narration', { found: steps.length });
    return steps.slice(0, 6);
  }

  detectInfographicType(narration: string): 'stat-counter' | 'progress-bar' | 'process-flow' | null {
    const stats = this.parseStatsFromNarration(narration);
    const progress = this.parseProgressFromNarration(narration);
    const steps = this.parseStepsFromNarration(narration);
    
    const hasStepKeywords = /step|first|second|third|fourth|process|procedure|how to/i.test(narration);
    const hasPercentKeywords = /percent|%|progress|completion|rate/i.test(narration);
    const hasNumberKeywords = /million|billion|thousand|\d+\s*(users|customers|sales|revenue|growth)/i.test(narration);
    
    if (steps.length >= 3 || (steps.length >= 2 && hasStepKeywords)) {
      return 'process-flow';
    }
    
    if (progress.length >= 2 || (progress.length >= 1 && hasPercentKeywords)) {
      return 'progress-bar';
    }
    
    if (stats.length >= 2 || (stats.length >= 1 && hasNumberKeywords)) {
      return 'stat-counter';
    }
    
    return null;
  }

  async generateConfigFromNarration(narration: string, duration: number): Promise<InfographicConfig | null> {
    const type = this.detectInfographicType(narration);
    
    if (!type) {
      log.info('No infographic type detected for narration');
      return null;
    }
    
    switch (type) {
      case 'stat-counter': {
        const stats = this.parseStatsFromNarration(narration);
        if (stats.length === 0) return null;
        return this.generateStatCounterConfig(stats, duration);
      }
      case 'progress-bar': {
        const items = this.parseProgressFromNarration(narration);
        if (items.length === 0) return null;
        return this.generateProgressBarConfig(items, duration);
      }
      case 'process-flow': {
        const steps = this.parseStepsFromNarration(narration);
        if (steps.length === 0) return null;
        return this.generateProcessFlowConfig(steps, duration);
      }
      default:
        return null;
    }
  }

  private brandBibleService: any = null;

  setBrandBibleService(service: any): void {
    this.brandBibleService = service;
  }

  private async getBrandColors(): Promise<BrandColors> {
    if (!this.brandBibleService) {
      try {
        const module = await import('./brand-bible-service');
        this.brandBibleService = module.brandBibleService;
      } catch (err) {
        log.debug('Brand bible service not available, using default colors');
        return this.defaultBrandColors;
      }
    }
    
    try {
      const bible = await this.brandBibleService.getBrandBible();
      return {
        primary: bible.colors?.primary || this.defaultBrandColors.primary,
        secondary: bible.colors?.secondary || this.defaultBrandColors.secondary,
        accent: bible.colors?.accent || this.defaultBrandColors.accent,
        text: bible.colors?.text || this.defaultBrandColors.text,
      };
    } catch (err) {
      log.debug('Failed to get brand bible, using default colors');
      return this.defaultBrandColors;
    }
  }
}

export const infographicGeneratorService = new InfographicGeneratorService();
export type { StatCounterConfig, ProgressBarConfig, ProcessFlowConfig, InfographicConfig };
