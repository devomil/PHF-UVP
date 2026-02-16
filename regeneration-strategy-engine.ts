import { VIDEO_PROVIDERS, getAllVideoProviders } from '../config/video-providers';
import { promptComplexityAnalyzer } from './prompt-complexity-analyzer';
import { smartProviderRouter } from './smart-provider-router';
import { ComplexityAnalysis } from '@shared/types/video-providers';

export interface RegenerationAttempt {
  attemptNumber: number;
  timestamp: Date;
  provider: string;
  prompt: string;
  result: 'success' | 'failure' | 'partial';
  qualityScore?: number;
  issues?: string[];
}

export interface RegenerationStrategy {
  approach: 'retry' | 'simplify' | 'reference' | 'alternative-provider' | 'stock-footage';
  changes: {
    prompt?: string;
    provider?: string;
    useReference?: boolean;
    referenceUrl?: string;
    motionSettings?: {
      style?: string;
      intensity?: string;
    };
  };
  reasoning: string;
  confidenceScore: number;
  warning?: string;
}

export interface StrategyContext {
  sceneId?: string;
  attempts: RegenerationAttempt[];
  complexity: ComplexityAnalysis;
  currentPrompt: string;
  originalPrompt?: string;
  currentMediaUrl?: string;
}

interface FailurePattern {
  sameIssuesRepeating: boolean;
  hasPartialSuccess: boolean;
  commonIssues: string[];
  failedProviders: string[];
}

class RegenerationStrategyEngine {
  
  determineStrategy(context: StrategyContext): RegenerationStrategy {
    const { attempts, complexity } = context;
    const attemptCount = attempts.length;
    
    console.log(`[StrategyEngine] Determining strategy for attempt #${attemptCount + 1}`);
    console.log(`[StrategyEngine] Complexity: ${complexity.category}, Score: ${complexity.score.toFixed(2)}`);
    
    if (attemptCount === 0) {
      return this.firstAttemptStrategy(context);
    }
    
    const pattern = this.analyzeFailures(attempts);
    console.log(`[StrategyEngine] Failure pattern: same issues repeating=${pattern.sameIssuesRepeating}, partial success=${pattern.hasPartialSuccess}`);
    
    if (attemptCount === 1) return this.secondAttemptStrategy(context, pattern);
    if (attemptCount === 2) return this.thirdAttemptStrategy(context, pattern);
    if (attemptCount >= 3) return this.fallbackStrategy(context, pattern);
    
    return this.defaultStrategy();
  }
  
  private firstAttemptStrategy(context: StrategyContext): RegenerationStrategy {
    const { complexity, currentPrompt } = context;
    const routing = smartProviderRouter.route(currentPrompt, 'b-roll');
    
    if (complexity.category === 'impossible') {
      return {
        approach: 'simplify',
        changes: {
          prompt: complexity.recommendations?.simplifiedPrompt || this.simplifyPrompt(currentPrompt),
          provider: routing.recommendedProvider,
        },
        reasoning: 'Prompt is extremely specific. Simplifying for better results.',
        confidenceScore: 0.4,
        warning: 'This prompt may be impossible for current AI models. Consider using stock footage.',
      };
    }
    
    return {
      approach: 'retry',
      changes: { provider: routing.recommendedProvider },
      reasoning: `Using ${VIDEO_PROVIDERS[routing.recommendedProvider]?.name || routing.recommendedProvider} - best match for this content.`,
      confidenceScore: complexity.category === 'complex' ? 0.6 : 0.8,
      warning: complexity.userWarning,
    };
  }
  
  private secondAttemptStrategy(context: StrategyContext, pattern: FailurePattern): RegenerationStrategy {
    const { attempts, currentMediaUrl, complexity, currentPrompt } = context;
    const lastAttempt = attempts[0];
    
    if (currentMediaUrl && lastAttempt.result === 'partial') {
      return {
        approach: 'reference',
        changes: {
          useReference: true,
          referenceUrl: currentMediaUrl,
          provider: this.getI2VProvider(complexity),
        },
        reasoning: 'Previous result was close. Using it as a reference to refine.',
        confidenceScore: 0.7,
      };
    }
    
    const altProvider = this.getAlternativeProvider(lastAttempt.provider, complexity, pattern.failedProviders);
    return {
      approach: 'alternative-provider',
      changes: { provider: altProvider },
      reasoning: `Trying ${VIDEO_PROVIDERS[altProvider]?.name || altProvider} for a different interpretation.`,
      confidenceScore: 0.6,
    };
  }
  
  private thirdAttemptStrategy(context: StrategyContext, pattern: FailurePattern): RegenerationStrategy {
    const { currentMediaUrl, currentPrompt } = context;
    
    if (currentMediaUrl) {
      return {
        approach: 'reference',
        changes: {
          useReference: true,
          referenceUrl: currentMediaUrl,
          provider: 'kling-2.5-turbo',
          motionSettings: { style: 'environmental', intensity: 'minimal' },
        },
        reasoning: 'Using current image with minimal motion for better consistency.',
        confidenceScore: 0.5,
      };
    }
    
    return {
      approach: 'simplify',
      changes: {
        prompt: this.drasticallySimplify(currentPrompt),
        provider: 'kling-2.5-turbo',
      },
      reasoning: 'Drastically simplified prompt for maximum compatibility.',
      confidenceScore: 0.4,
      warning: 'Prompt has been heavily simplified. Result may not match original intent.',
    };
  }
  
  private fallbackStrategy(context: StrategyContext, pattern: FailurePattern): RegenerationStrategy {
    const attemptCount = context.attempts.length;
    
    if (attemptCount === 3 && context.currentMediaUrl) {
      return {
        approach: 'reference',
        changes: {
          useReference: true,
          referenceUrl: context.currentMediaUrl,
          provider: 'veo-3.1',
          motionSettings: { style: 'subtle', intensity: 'low' },
        },
        reasoning: 'Final AI attempt with premium provider using reference.',
        confidenceScore: 0.35,
        warning: 'This is the last AI attempt. If it fails, stock footage is recommended.',
      };
    }
    
    return {
      approach: 'stock-footage',
      changes: {},
      reasoning: 'Multiple AI generation attempts have failed. Stock footage is recommended.',
      confidenceScore: 0.8,
      warning: 'AI generation is unsuitable for this shot. Please search for stock footage.',
    };
  }
  
  private defaultStrategy(): RegenerationStrategy {
    return {
      approach: 'retry',
      changes: {},
      reasoning: 'Standard regeneration.',
      confidenceScore: 0.5,
    };
  }
  
  private analyzeFailures(attempts: RegenerationAttempt[]): FailurePattern {
    const issues = attempts.flatMap(a => a.issues || []);
    const issueCounts = new Map<string, number>();
    
    for (const issue of issues) {
      const key = issue.toLowerCase().replace(/\[major\]|\[minor\]/g, '').trim();
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
    }
    
    const commonIssues: string[] = [];
    issueCounts.forEach((count, issue) => {
      if (count >= 2) commonIssues.push(issue);
    });
    
    return {
      sameIssuesRepeating: commonIssues.length > 0,
      hasPartialSuccess: attempts.some(a => a.result === 'partial'),
      commonIssues,
      failedProviders: attempts.map(a => a.provider),
    };
  }
  
  private getAlternativeProvider(current: string, complexity: ComplexityAnalysis, excludeProviders: string[] = []): string {
    const providerPriority = complexity.recommendations?.bestProviders || [
      'kling-2.5-turbo', 'runway-gen3', 'veo-3.1', 'luma-dream-machine', 'kling-2.1'
    ];
    
    const available = providerPriority.filter(p => p !== current && !excludeProviders.includes(p));
    
    if (available.length > 0) {
      return available[0];
    }
    
    const fallbackOrder = ['kling-2.5-turbo', 'veo-2', 'wan-2.6', 'hailuo-minimax'];
    return fallbackOrder.find(p => p !== current && !excludeProviders.includes(p)) || 'kling-2.5-turbo';
  }
  
  private getI2VProvider(complexity: ComplexityAnalysis): string {
    if (complexity.factors?.specificAction?.difficulty === 'very-hard') {
      return 'kling-2.5-turbo';
    }
    if (complexity.recommendations?.bestProviders?.length) {
      const i2vCapable = complexity.recommendations.bestProviders.filter(p => 
        VIDEO_PROVIDERS[p]?.capabilities?.imageToVideo
      );
      if (i2vCapable.length > 0) return i2vCapable[0];
    }
    return 'kling-2.5-turbo';
  }
  
  private simplifyPrompt(prompt: string): string {
    let simplified = prompt;
    const removePatterns = [
      /\b(slowly|quickly|carefully|precisely|exactly)\b/gi,
      /\b(from left to right|from top to bottom|clockwise|counter-clockwise)\b/gi,
      /\b(translucent|transparent|glossy|matte|viscous)\b/gi,
    ];
    
    for (const pattern of removePatterns) {
      simplified = simplified.replace(pattern, '').trim();
    }
    
    simplified = simplified.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    return simplified || prompt;
  }
  
  private drasticallySimplify(prompt: string): string {
    const lower = prompt.toLowerCase();
    let subject = 'scene';
    
    if (lower.includes('hand') || lower.includes('finger')) {
      subject = 'hands working';
    } else if (lower.includes('food') || lower.includes('dough') || lower.includes('cooking')) {
      subject = 'food preparation';
    } else if (lower.includes('person') || lower.includes('people')) {
      subject = 'person';
    } else if (lower.includes('nature') || lower.includes('forest') || lower.includes('outdoor')) {
      subject = 'nature scene';
    } else if (lower.includes('product') || lower.includes('bottle') || lower.includes('package')) {
      subject = 'product shot';
    }
    
    return `${subject}, natural lighting, cinematic quality`;
  }
  
  getNextSuggestion(strategy: RegenerationStrategy): string {
    switch (strategy.approach) {
      case 'reference':
        return 'Try using the current result as a reference to refine further.';
      case 'simplify':
        return 'Consider simplifying the visual direction for better results.';
      case 'alternative-provider':
        return `Try ${strategy.changes.provider} for a different interpretation.`;
      case 'stock-footage':
        return 'AI generation may not be suitable for this shot. Consider searching for stock footage.';
      default:
        return 'Try regenerating with adjusted settings.';
    }
  }
}

export const regenerationStrategyEngine = new RegenerationStrategyEngine();
