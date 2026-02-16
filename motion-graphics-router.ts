// server/services/motion-graphics-router.ts

import { RoutingDecision, MotionGraphicType } from '../../shared/types/motion-graphics-types';
import { createLogger } from '../utils/logger';

const log = createLogger('MotionRouter');

/**
 * Keywords that indicate motion graphics should be used
 */
const MOTION_GRAPHIC_KEYWORDS: Record<string, { weight: number; suggestedType: MotionGraphicType }> = {
  // Strong indicators (weight 1.0)
  'animated': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'animation': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'motion graphic': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'motion graphics': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'kinetic typography': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'kinetic text': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'text animation': { weight: 1.0, suggestedType: 'kinetic-typography' },
  'animated text': { weight: 1.0, suggestedType: 'kinetic-typography' },
  
  // Split screen indicators
  'split screen': { weight: 1.0, suggestedType: 'split-screen' },
  'split-screen': { weight: 1.0, suggestedType: 'split-screen' },
  'side by side': { weight: 0.9, suggestedType: 'split-screen' },
  'side-by-side': { weight: 0.9, suggestedType: 'split-screen' },
  'montage': { weight: 0.8, suggestedType: 'split-screen' },
  'multi-panel': { weight: 0.9, suggestedType: 'split-screen' },
  'picture in picture': { weight: 0.9, suggestedType: 'picture-in-picture' },
  'picture-in-picture': { weight: 0.9, suggestedType: 'picture-in-picture' },
  'pip': { weight: 0.8, suggestedType: 'picture-in-picture' },
  
  // Comparison indicators
  'before and after': { weight: 1.0, suggestedType: 'before-after' },
  'before after': { weight: 1.0, suggestedType: 'before-after' },
  'before/after': { weight: 1.0, suggestedType: 'before-after' },
  'comparison': { weight: 0.8, suggestedType: 'comparison' },
  'compare': { weight: 0.7, suggestedType: 'comparison' },
  'versus': { weight: 0.7, suggestedType: 'comparison' },
  'vs': { weight: 0.6, suggestedType: 'comparison' },
  
  // Data visualization indicators
  'infographic': { weight: 1.0, suggestedType: 'stat-counter' },
  'data visualization': { weight: 1.0, suggestedType: 'animated-chart' },
  'chart': { weight: 0.8, suggestedType: 'animated-chart' },
  'graph': { weight: 0.8, suggestedType: 'animated-chart' },
  'statistics': { weight: 0.8, suggestedType: 'stat-counter' },
  'stats': { weight: 0.7, suggestedType: 'stat-counter' },
  'numbers': { weight: 0.6, suggestedType: 'stat-counter' },
  'percentage': { weight: 0.7, suggestedType: 'stat-counter' },
  'counter': { weight: 0.8, suggestedType: 'stat-counter' },
  'progress bar': { weight: 0.9, suggestedType: 'progress-bar' },
  'progress': { weight: 0.5, suggestedType: 'progress-bar' },
  
  // Process/flow indicators
  'process flow': { weight: 1.0, suggestedType: 'process-flow' },
  'flowchart': { weight: 0.9, suggestedType: 'process-flow' },
  'steps': { weight: 0.6, suggestedType: 'process-flow' },
  'step by step': { weight: 0.8, suggestedType: 'process-flow' },
  'step-by-step': { weight: 0.8, suggestedType: 'process-flow' },
  'timeline': { weight: 0.9, suggestedType: 'timeline' },
  'sequence': { weight: 0.5, suggestedType: 'process-flow' },
  
  // Metaphor/abstract indicators
  'visual metaphor': { weight: 1.0, suggestedType: 'tree-growth' },
  'metaphor': { weight: 0.8, suggestedType: 'tree-growth' },
  'transformation': { weight: 0.8, suggestedType: 'transformation' },
  'transform': { weight: 0.7, suggestedType: 'transformation' },
  'morph': { weight: 0.9, suggestedType: 'transformation' },
  'morphing': { weight: 0.9, suggestedType: 'transformation' },
  'tree': { weight: 0.5, suggestedType: 'tree-growth' },
  'roots': { weight: 0.6, suggestedType: 'tree-growth' },
  'growing': { weight: 0.5, suggestedType: 'tree-growth' },
  'growth': { weight: 0.5, suggestedType: 'tree-growth' },
  'network': { weight: 0.7, suggestedType: 'network-visualization' },
  'connected': { weight: 0.5, suggestedType: 'network-visualization' },
  'interconnected': { weight: 0.7, suggestedType: 'network-visualization' },
  'connections': { weight: 0.6, suggestedType: 'network-visualization' },
  'nodes': { weight: 0.7, suggestedType: 'network-visualization' },
  'web': { weight: 0.4, suggestedType: 'network-visualization' },
  'journey': { weight: 0.5, suggestedType: 'journey-path' },
  'path': { weight: 0.4, suggestedType: 'journey-path' },
  'abstract': { weight: 0.6, suggestedType: 'abstract-organic' },
  'organic': { weight: 0.4, suggestedType: 'abstract-organic' },
  
  // List indicators
  'bullet points': { weight: 0.8, suggestedType: 'bullet-list-animated' },
  'bullet list': { weight: 0.8, suggestedType: 'bullet-list-animated' },
  'list': { weight: 0.4, suggestedType: 'bullet-list-animated' },
  'actionable steps': { weight: 0.7, suggestedType: 'bullet-list-animated' },
  
  // 2D/3D indicators
  '2d animation': { weight: 1.0, suggestedType: 'kinetic-typography' },
  '2d': { weight: 0.5, suggestedType: 'kinetic-typography' },
  '3d animation': { weight: 0.8, suggestedType: 'transformation' },
  'cartoon': { weight: 0.6, suggestedType: 'kinetic-typography' },
  'illustrated': { weight: 0.5, suggestedType: 'kinetic-typography' },
  'illustration': { weight: 0.5, suggestedType: 'kinetic-typography' },
};

/**
 * Keywords that indicate AI video should be used (negative indicators)
 */
const AI_VIDEO_KEYWORDS: string[] = [
  'person',
  'woman',
  'man',
  'people',
  'face',
  'human',
  'talking',
  'speaking',
  'walking',
  'running',
  'lifestyle',
  'testimonial',
  'interview',
  'cinematic',
  'dramatic',
  'nature footage',
  'b-roll',
  'product shot',
  'real world',
  'documentary',
  'vlog',
  'live action',
  'photorealistic',
  'realistic',
];

/**
 * Threshold for routing to motion graphics
 */
const ROUTING_THRESHOLD = 0.6;

/**
 * Check if a keyword matches as a whole word (not as substring)
 * Uses word boundary matching to avoid false positives like "graph" in "photography"
 */
function matchesWholeWord(text: string, keyword: string): boolean {
  // Escape special regex characters in the keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Create regex with word boundaries - matches the keyword as a standalone word/phrase
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

class MotionGraphicsRouter {
  
  /**
   * Analyze visual direction and determine routing
   */
  analyzeVisualDirection(
    visualDirection: string,
    narration?: string,
    sceneType?: string
  ): RoutingDecision {
    const combinedText = `${visualDirection} ${narration || ''}`.toLowerCase();
    
    log.debug(`Analyzing: "${visualDirection.substring(0, 100)}..."`);
    
    // Detect motion graphic keywords using whole-word matching
    const detectedKeywords: string[] = [];
    let totalWeight = 0;
    let suggestedType: MotionGraphicType | null = null;
    let highestWeight = 0;
    
    for (const [keyword, config] of Object.entries(MOTION_GRAPHIC_KEYWORDS)) {
      if (matchesWholeWord(combinedText, keyword)) {
        detectedKeywords.push(keyword);
        totalWeight += config.weight;
        
        if (config.weight > highestWeight) {
          highestWeight = config.weight;
          suggestedType = config.suggestedType;
        }
      }
    }
    
    // Check for AI video indicators (negative weight) - also using whole-word matching
    let aiVideoScore = 0;
    for (const keyword of AI_VIDEO_KEYWORDS) {
      if (matchesWholeWord(combinedText, keyword)) {
        aiVideoScore += 0.3;
      }
    }
    
    // Calculate confidence
    const motionGraphicsScore = Math.min(totalWeight, 2.0); // Cap at 2.0
    const netScore = motionGraphicsScore - aiVideoScore;
    const confidence = Math.max(0, Math.min(1, netScore));
    
    // Special case: if "text overlay with" is mentioned, it's likely motion graphics
    if (combinedText.includes('text overlay with') || 
        combinedText.includes('text overlay showing') ||
        combinedText.includes('overlay with')) {
      if (!suggestedType) suggestedType = 'bullet-list-animated';
      if (confidence < 0.7) {
        return {
          useMotionGraphics: true,
          confidence: 0.85,
          detectedKeywords: [...detectedKeywords, 'text overlay'],
          suggestedType,
          reasoning: 'Text overlay content detected - routing to motion graphics for clean text rendering',
          fallbackToAI: false,
        };
      }
    }
    
    // Make routing decision
    const useMotionGraphics = confidence >= ROUTING_THRESHOLD && suggestedType !== null;
    
    // Build reasoning
    let reasoning: string;
    if (useMotionGraphics) {
      reasoning = `Motion graphics keywords detected (${detectedKeywords.join(', ')}). Confidence: ${(confidence * 100).toFixed(0)}%`;
    } else if (detectedKeywords.length > 0 && aiVideoScore > motionGraphicsScore) {
      reasoning = `Mixed signals: motion keywords (${detectedKeywords.join(', ')}) but also live-action indicators. Defaulting to AI video.`;
    } else if (detectedKeywords.length === 0) {
      reasoning = 'No motion graphics keywords detected. Using AI video generation.';
    } else {
      reasoning = `Confidence (${(confidence * 100).toFixed(0)}%) below threshold. Using AI video.`;
    }
    
    log.debug(`Decision: ${useMotionGraphics ? 'MOTION_GRAPHICS' : 'AI_VIDEO'}`);
    log.debug(`Keywords: ${detectedKeywords.join(', ') || 'none'}`);
    log.debug(`Confidence: ${(confidence * 100).toFixed(0)}%`);
    
    return {
      useMotionGraphics,
      confidence,
      detectedKeywords,
      suggestedType,
      reasoning,
      fallbackToAI: !useMotionGraphics,
    };
  }
  
  /**
   * Get the appropriate motion graphic type based on content analysis
   */
  determineMotionGraphicType(
    visualDirection: string,
    narration: string,
    detectedKeywords: string[]
  ): MotionGraphicType {
    const lower = visualDirection.toLowerCase();
    
    // Priority order for type detection
    if (lower.includes('split screen') || lower.includes('side by side') || lower.includes('montage')) {
      return 'split-screen';
    }
    
    if (lower.includes('before') && lower.includes('after')) {
      return 'before-after';
    }
    
    if (lower.includes('tree') || lower.includes('root') || lower.includes('growth')) {
      return 'tree-growth';
    }
    
    if (lower.includes('network') || lower.includes('connected') || lower.includes('interconnected')) {
      return 'network-visualization';
    }
    
    if (lower.includes('stat') || lower.includes('counter') || lower.includes('percentage') || lower.includes('%')) {
      return 'stat-counter';
    }
    
    if (lower.includes('process') || lower.includes('step') || lower.includes('flow')) {
      return 'process-flow';
    }
    
    if (lower.includes('timeline') || lower.includes('chronolog')) {
      return 'timeline';
    }
    
    if (lower.includes('bullet') || lower.includes('list') || lower.includes('actionable')) {
      return 'bullet-list-animated';
    }
    
    if (lower.includes('transform') || lower.includes('morph')) {
      return 'transformation';
    }
    
    if (lower.includes('chart') || lower.includes('graph') || lower.includes('bar')) {
      return 'animated-chart';
    }
    
    if (lower.includes('progress')) {
      return 'progress-bar';
    }
    
    // Default to kinetic typography for text-heavy content
    if (lower.includes('text') || lower.includes('typography') || lower.includes('animated')) {
      return 'kinetic-typography';
    }
    
    // Fallback based on narration content
    if (narration) {
      const bulletPoints = narration.match(/[•\-\*]\s/g);
      if (bulletPoints && bulletPoints.length >= 2) {
        return 'bullet-list-animated';
      }
      
      const numbers = narration.match(/\d+%|\d+\s*(percent|million|billion|thousand)/gi);
      if (numbers && numbers.length >= 2) {
        return 'stat-counter';
      }
    }
    
    // Default fallback
    return 'kinetic-typography';
  }
  
  /**
   * Extract content from visual direction for motion graphic generation
   */
  extractContentFromDirection(
    visualDirection: string,
    narration: string,
    type: MotionGraphicType
  ): Record<string, any> {
    const content: Record<string, any> = {};
    
    switch (type) {
      case 'bullet-list-animated':
        // Try to extract list items from narration or direction
        const listMatch = narration.match(/(?:•|\-|\*|\d+\.)\s*([^•\-\*\n]+)/g);
        if (listMatch) {
          content.items = listMatch.map(item => 
            item.replace(/^(?:•|\-|\*|\d+\.)\s*/, '').trim()
          );
        } else {
          // Try to extract from visual direction
          const colonMatch = visualDirection.match(/:\s*(.+)/);
          if (colonMatch) {
            content.items = colonMatch[1].split(/,|;/).map(s => s.trim()).filter(Boolean);
          }
        }
        break;
        
      case 'stat-counter':
        // Extract numbers and labels
        const statMatches = narration.match(/(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand)?\s*(?:of\s+)?([a-zA-Z\s]+)/gi);
        if (statMatches) {
          content.stats = statMatches.map(match => {
            const parts = match.match(/(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand)?\s*(?:of\s+)?(.+)/i);
            if (parts) {
              return {
                value: parseFloat(parts[1]),
                suffix: parts[2] || '',
                label: parts[3]?.trim() || 'Value',
              };
            }
            return null;
          }).filter(Boolean);
        }
        break;
        
      case 'process-flow':
        // Extract steps
        const stepMatches = narration.match(/(?:step\s*\d+|first|second|third|then|next|finally)[:\s]+([^.!?]+)/gi);
        if (stepMatches) {
          content.steps = stepMatches.map(step => ({
            title: step.replace(/(?:step\s*\d+|first|second|third|then|next|finally)[:\s]+/i, '').trim(),
          }));
        }
        break;
        
      case 'tree-growth':
        // Extract labels for roots/branches
        const labelMatches = visualDirection.match(/(?:roots?|branch(?:es)?|leaf|leaves)\s*(?:transforming\s*into|representing|showing|labeled?)\s*([^,.\n]+)/gi);
        if (labelMatches) {
          content.labels = labelMatches.map(match => {
            const text = match.replace(/(?:roots?|branch(?:es)?|leaf|leaves)\s*(?:transforming\s*into|representing|showing|labeled?)\s*/i, '').trim();
            return { text, position: match.toLowerCase().includes('root') ? 'root' : 'branch' };
          });
        }
        break;
        
      case 'timeline':
        // Extract timeline events
        const timelineMatches = narration.match(/(\d{4}|[A-Za-z]+\s+\d+)[:\s]+([^.!?\n]+)/g);
        if (timelineMatches) {
          content.events = timelineMatches.map(match => {
            const parts = match.match(/(\d{4}|[A-Za-z]+\s+\d+)[:\s]+(.+)/);
            if (parts) {
              return { date: parts[1], title: parts[2].trim() };
            }
            return null;
          }).filter(Boolean);
        }
        break;
        
      default:
        // For kinetic typography, use the narration or a key phrase
        content.text = narration || visualDirection.substring(0, 100);
        break;
    }
    
    return content;
  }
}

export const motionGraphicsRouter = new MotionGraphicsRouter();
