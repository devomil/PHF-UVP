import { MotionStyle, MotionDetectionResult } from '../../shared/types/brand-video-types';
import type { BrandRequirementAnalysis } from '../../shared/types/brand-asset-types';

class MotionStyleDetector {
  
  detect(
    visualDirection: string,
    analysis?: BrandRequirementAnalysis
  ): MotionDetectionResult {
    const lower = visualDirection.toLowerCase();
    
    let style: MotionStyle = 'subtle';
    let intensity: 'minimal' | 'low' | 'medium' = 'low';
    let cameraMovement: MotionDetectionResult['cameraMovement'] = undefined;
    let environmentalEffects: MotionDetectionResult['environmentalEffects'] = undefined;
    let revealDirection: MotionDetectionResult['revealDirection'] = undefined;
    
    if (lower.includes('zoom in') || lower.includes('zooming into') || lower.includes('push in')) {
      style = 'zoom-in';
      intensity = 'low';
      cameraMovement = { direction: 'push', distance: 'subtle' };
    } else if (lower.includes('zoom out') || lower.includes('pull back') || lower.includes('reveal full')) {
      style = 'zoom-out';
      intensity = 'low';
      cameraMovement = { direction: 'pull', distance: 'subtle' };
    } else if (lower.includes('pan') || lower.includes('tracking') || lower.includes('dolly')) {
      style = 'pan';
      const direction = this.detectPanDirection(lower);
      cameraMovement = { direction, distance: 'subtle' };
    } else if (lower.includes('reveal') || lower.includes('emerges') || lower.includes('appears') || lower.includes('enters')) {
      style = 'reveal';
      revealDirection = this.detectRevealDirection(lower);
    } else if (lower.includes('static') || lower.includes('still') || lower.includes('frozen') || lower.includes('no movement')) {
      style = 'static';
    } else if (this.hasEnvironmentalCues(lower)) {
      style = 'environmental';
      environmentalEffects = this.detectEnvironmentalEffects(lower);
    }
    
    if (analysis?.requirements?.productMentioned && style === 'subtle') {
      if (this.hasEnvironmentalCues(lower)) {
        style = 'environmental';
        environmentalEffects = this.detectEnvironmentalEffects(lower);
      } else {
        cameraMovement = {
          direction: 'push',
          distance: 'subtle',
        };
      }
    }
    
    if (analysis?.requirements?.productVisibility === 'featured') {
      intensity = 'minimal';
      if (style === 'environmental') {
        style = 'subtle';
        cameraMovement = { direction: 'push', distance: 'subtle' };
      }
    }
    
    if (lower.includes('gentle') || lower.includes('soft') || lower.includes('barely') || lower.includes('subtle')) {
      intensity = 'minimal';
    } else if (lower.includes('moderate') || lower.includes('noticeable')) {
      intensity = 'medium';
    }
    
    return {
      style,
      intensity,
      cameraMovement,
      environmentalEffects,
      revealDirection,
    };
  }
  
  private hasEnvironmentalCues(text: string): boolean {
    const cues = [
      'plant', 'leaves', 'nature', 'organic', 'breeze', 'wind',
      'light shift', 'sunlight', 'golden hour', 'dust', 'particles',
      'ambient', 'atmosphere', 'life', 'living', 'swaying',
      'flicker', 'shimmer', 'glow',
    ];
    return cues.some(cue => text.includes(cue));
  }
  
  private detectEnvironmentalEffects(text: string): MotionDetectionResult['environmentalEffects'] {
    return {
      plantMovement: text.includes('plant') || text.includes('leaves') || text.includes('sway') || text.includes('breeze'),
      lightFlicker: text.includes('light') || text.includes('sun') || text.includes('golden') || text.includes('shimmer') || text.includes('flicker'),
      particleDust: text.includes('dust') || text.includes('particles') || text.includes('floating'),
    };
  }
  
  private detectPanDirection(text: string): 'left' | 'right' | 'up' | 'down' | 'push' | 'pull' {
    if (text.includes('left') || text.includes('leftward')) return 'left';
    if (text.includes('right') || text.includes('rightward')) return 'right';
    if (text.includes('up') || text.includes('upward') || text.includes('tilt up')) return 'up';
    if (text.includes('down') || text.includes('downward') || text.includes('tilt down')) return 'down';
    return 'right';
  }
  
  private detectRevealDirection(text: string): 'left' | 'right' | 'bottom' | 'top' | 'center' {
    if (text.includes('from left') || text.includes('from the left') || text.includes('slide in left')) return 'left';
    if (text.includes('from right') || text.includes('from the right') || text.includes('slide in right')) return 'right';
    if (text.includes('from bottom') || text.includes('from below') || text.includes('rise')) return 'bottom';
    if (text.includes('from top') || text.includes('from above') || text.includes('descend')) return 'top';
    return 'center';
  }
  
  detectFromSceneType(sceneType: string): MotionDetectionResult {
    const sceneMotionMap: Record<string, MotionDetectionResult> = {
      'hook': {
        style: 'zoom-in',
        intensity: 'low',
        cameraMovement: { direction: 'push', distance: 'subtle' },
      },
      'problem': {
        style: 'subtle',
        intensity: 'low',
        cameraMovement: { direction: 'left', distance: 'subtle' },
      },
      'agitation': {
        style: 'subtle',
        intensity: 'low',
        cameraMovement: { direction: 'push', distance: 'subtle' },
      },
      'solution': {
        style: 'reveal',
        intensity: 'low',
        revealDirection: 'center',
      },
      'benefit': {
        style: 'environmental',
        intensity: 'low',
        environmentalEffects: { lightFlicker: true, plantMovement: false, particleDust: false },
      },
      'product': {
        style: 'subtle',
        intensity: 'minimal',
        cameraMovement: { direction: 'push', distance: 'subtle' },
      },
      'testimonial': {
        style: 'subtle',
        intensity: 'minimal',
        cameraMovement: { direction: 'right', distance: 'subtle' },
      },
      'cta': {
        style: 'zoom-in',
        intensity: 'low',
        cameraMovement: { direction: 'push', distance: 'subtle' },
      },
    };
    
    return sceneMotionMap[sceneType] || {
      style: 'subtle',
      intensity: 'low',
      cameraMovement: { direction: 'push', distance: 'subtle' },
    };
  }
}

export const motionStyleDetector = new MotionStyleDetector();
