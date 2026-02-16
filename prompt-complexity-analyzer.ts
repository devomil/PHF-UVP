import { ComplexityAnalysis } from '@shared/types/video-providers';

class PromptComplexityAnalyzer {
  
  private readonly SPECIFIC_ACTION_KEYWORDS = [
    'stretching', 'pulling', 'kneading', 'folding', 'twisting',
    'pouring', 'dripping', 'splashing', 'melting', 'freezing',
    'cracking', 'breaking', 'tearing', 'cutting', 'slicing',
    'threading', 'weaving', 'sewing', 'typing', 'writing',
    'peeling', 'rolling', 'flipping', 'tossing', 'catching',
    'stirring', 'mixing', 'whisking', 'grinding', 'chopping',
  ];
  
  private readonly MATERIAL_PROPERTY_KEYWORDS = [
    'translucent', 'transparent', 'opaque', 'glossy', 'matte',
    'liquid', 'viscous', 'stretchy', 'elastic', 'rigid',
    'soft', 'fluffy', 'crispy', 'crunchy', 'smooth',
    'wet', 'dry', 'steaming', 'bubbling', 'fizzing',
    'shiny', 'reflective', 'glowing', 'sparkling', 'shimmering',
  ];
  
  private readonly PRECISE_MOTION_KEYWORDS = [
    'outward', 'inward', 'clockwise', 'counter-clockwise',
    'slowly', 'quickly', 'precisely', 'carefully',
    'from left to right', 'from top to bottom',
    'in circular motion', 'back and forth',
    'upward', 'downward', 'sideways', 'diagonal',
  ];
  
  private readonly SPECIFIC_ELEMENTS = [
    'pizza dough', 'bread dough', 'pasta', 'rolling pin',
    'wooden spoon', 'chef knife', 'cutting board',
    'mortar and pestle', 'whisk', 'spatula', 'ladle',
    'herbs', 'spices', 'flour', 'sugar', 'salt',
  ];
  
  analyze(visualDirection: string): ComplexityAnalysis {
    const lower = visualDirection.toLowerCase();
    
    const specificAction = this.analyzeSpecificActions(lower);
    const materialProperties = this.analyzeMaterialProperties(lower);
    const motionRequirements = this.analyzeMotionRequirements(lower);
    const elementCount = this.countSpecificElements(lower);
    const temporalSequence = this.hasTemporalSequence(lower);
    
    const score = this.calculateScore({
      specificAction,
      materialProperties,
      motionRequirements,
      elementCount,
      temporalSequence,
    });
    
    const category = this.categorize(score);
    
    const recommendations = this.generateRecommendations(
      visualDirection,
      { specificAction, materialProperties, motionRequirements },
      category
    );
    
    const userWarning = this.generateWarning(category, { specificAction, materialProperties, motionRequirements });
    
    console.log(`[ComplexityAnalyzer] Score: ${score.toFixed(2)}, Category: ${category}, Direction: "${visualDirection.substring(0, 60)}..."`);
    
    return {
      score,
      category,
      factors: {
        specificAction,
        materialProperties,
        motionRequirements,
        elementCount,
        temporalSequence,
      },
      recommendations,
      userWarning,
    };
  }
  
  private analyzeSpecificActions(text: string): ComplexityAnalysis['factors']['specificAction'] {
    const found = this.SPECIFIC_ACTION_KEYWORDS.filter(k => text.includes(k));
    
    if (found.length === 0) {
      return { detected: false, description: '', difficulty: 'easy' };
    }
    
    const isHandAction = (text.includes('hand') || text.includes('finger')) && found.length > 0;
    const difficulty = isHandAction ? 'very-hard' : (found.length > 1 ? 'hard' : 'easy');
    
    return {
      detected: true,
      description: found.join(', '),
      difficulty,
    };
  }
  
  private analyzeMaterialProperties(text: string): ComplexityAnalysis['factors']['materialProperties'] {
    const found = this.MATERIAL_PROPERTY_KEYWORDS.filter(k => text.includes(k));
    
    if (found.length === 0) {
      return { detected: false, properties: [], difficulty: 'easy' };
    }
    
    const hasHardProperty = found.some(p => 
      ['translucent', 'transparent', 'liquid', 'viscous', 'reflective', 'glowing'].includes(p)
    );
    const difficulty = hasHardProperty ? 'very-hard' : (found.length > 1 ? 'hard' : 'easy');
    
    return {
      detected: true,
      properties: found,
      difficulty,
    };
  }
  
  private analyzeMotionRequirements(text: string): ComplexityAnalysis['factors']['motionRequirements'] {
    const found = this.PRECISE_MOTION_KEYWORDS.filter(k => text.includes(k));
    
    if (found.length === 0) {
      return { detected: false, type: '', difficulty: 'easy' };
    }
    
    return {
      detected: true,
      type: found.join(', '),
      difficulty: found.length > 1 ? 'very-hard' : 'hard',
    };
  }
  
  private countSpecificElements(text: string): number {
    return this.SPECIFIC_ELEMENTS.filter(e => text.includes(e)).length;
  }
  
  private hasTemporalSequence(text: string): boolean {
    const sequenceKeywords = ['then', 'after', 'before', 'while', 'during', 'until', 'as soon as', 'next', 'finally'];
    return sequenceKeywords.some(k => text.includes(k));
  }
  
  private calculateScore(factors: any): number {
    let score = 0;
    
    if (factors.specificAction.detected) {
      score += factors.specificAction.difficulty === 'very-hard' ? 0.4 : 
               factors.specificAction.difficulty === 'hard' ? 0.3 : 0.2;
    }
    
    if (factors.materialProperties.detected) {
      score += factors.materialProperties.difficulty === 'very-hard' ? 0.4 :
               factors.materialProperties.difficulty === 'hard' ? 0.3 : 0.2;
    }
    
    if (factors.motionRequirements.detected) {
      score += factors.motionRequirements.difficulty === 'very-hard' ? 0.3 :
               factors.motionRequirements.difficulty === 'hard' ? 0.2 : 0.1;
    }
    
    score += Math.min(factors.elementCount * 0.05, 0.2);
    
    if (factors.temporalSequence) score += 0.1;
    
    return Math.min(score, 1);
  }
  
  private categorize(score: number): ComplexityAnalysis['category'] {
    if (score >= 0.8) return 'impossible';
    if (score >= 0.5) return 'complex';
    if (score >= 0.3) return 'moderate';
    return 'simple';
  }
  
  private generateRecommendations(
    originalPrompt: string,
    factors: any,
    category: string
  ): ComplexityAnalysis['recommendations'] {
    
    const recommendations: ComplexityAnalysis['recommendations'] = {
      bestProviders: [],
      avoidProviders: [],
    };
    
    if (category === 'complex' || category === 'impossible') {
      recommendations.simplifiedPrompt = this.simplifyPrompt(originalPrompt, factors);
      
      if (factors.specificAction.difficulty === 'very-hard') {
        recommendations.alternativeApproach = 'stock-footage';
      } else if (factors.materialProperties.difficulty === 'very-hard') {
        recommendations.alternativeApproach = 'reference-image';
      }
    }
    
    const lower = originalPrompt.toLowerCase();
    
    if (lower.includes('hand') || lower.includes('finger')) {
      recommendations.bestProviders = ['kling-2.5-turbo', 'runway-gen3'];
      recommendations.avoidProviders = ['hailuo-minimax', 'wan-2.1'];
    }
    
    if (lower.includes('food') || lower.includes('dough') || lower.includes('cooking')) {
      recommendations.bestProviders = ['kling-2.5-turbo', 'luma-dream-machine'];
      recommendations.avoidProviders = ['seedance-1.0'];
    }
    
    if (lower.includes('product') || lower.includes('bottle') || lower.includes('package')) {
      recommendations.bestProviders = ['luma-dream-machine', 'kling-2.1', 'veo-3.1'];
    }
    
    if (lower.includes('nature') || lower.includes('forest') || lower.includes('landscape')) {
      recommendations.bestProviders = ['veo-3.1', 'veo-2', 'hailuo-minimax'];
    }
    
    if (lower.includes('person') || lower.includes('face') || lower.includes('people')) {
      recommendations.bestProviders = ['kling-2.5-turbo', 'kling-2.1', 'runway-gen3'];
      recommendations.avoidProviders = ['hailuo-minimax'];
    }
    
    if (lower.includes('cinematic') || lower.includes('dramatic') || lower.includes('epic')) {
      recommendations.bestProviders = ['veo-3.1', 'runway-gen3', 'kling-2.0'];
    }
    
    return recommendations;
  }
  
  private simplifyPrompt(original: string, factors: any): string {
    let simplified = original;
    
    for (const prop of factors.materialProperties.properties || []) {
      simplified = simplified.replace(new RegExp(prop, 'gi'), '').trim();
    }
    
    for (const motion of this.PRECISE_MOTION_KEYWORDS) {
      simplified = simplified.replace(new RegExp(motion, 'gi'), '').trim();
    }
    
    simplified = simplified.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/\s+,/g, ',').trim();
    simplified = simplified.replace(/^,\s*/, '').replace(/,\s*$/, '');
    
    return simplified || original;
  }
  
  private generateWarning(
    category: string,
    factors: any
  ): string | undefined {
    
    if (category === 'impossible') {
      return '⚠️ This visual direction is extremely specific and may be impossible for current AI video models. Consider using stock footage or simplifying the requirements.';
    }
    
    if (category === 'complex') {
      const issues: string[] = [];
      
      if (factors.specificAction.difficulty === 'very-hard') {
        issues.push('specific hand/body actions');
      }
      if (factors.materialProperties.difficulty === 'very-hard') {
        issues.push('material properties (translucent, liquid, etc.)');
      }
      if (factors.motionRequirements.difficulty === 'very-hard') {
        issues.push('precise motion direction');
      }
      
      if (issues.length > 0) {
        return `⚠️ This prompt has complex requirements (${issues.join(', ')}) that AI video models struggle with. Results may not match expectations. Consider simplifying or using a reference image.`;
      }
    }
    
    return undefined;
  }
}

export const promptComplexityAnalyzer = new PromptComplexityAnalyzer();
