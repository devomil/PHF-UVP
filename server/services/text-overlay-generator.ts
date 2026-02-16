import { TextOverlayRequirement } from './text-overlay-detector';

export interface RemotionTextOverlay {
  id: string;
  text: string;
  type: 'title' | 'bullet' | 'cta' | 'caption';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    color: string;
    backgroundColor?: string;
    fontWeight: string;
  };
  timing: {
    startFrame: number;
    endFrame: number;
    fadeInFrames: number;
    fadeOutFrames: number;
  };
  animation: 'fade' | 'slide-up' | 'pop';
}

export function generateTextOverlays(
  requirement: TextOverlayRequirement,
  sceneDuration: number,
  fps: number = 30,
  frameAnalysis?: any
): RemotionTextOverlay[] {
  const overlays: RemotionTextOverlay[] = [];
  const totalFrames = Math.round(sceneDuration * fps);
  
  if (!requirement.required || requirement.textContent.length === 0) {
    console.log(`[TextOverlay] No overlays needed for scene ${requirement.sceneIndex}`);
    return overlays;
  }
  
  console.log(`[TextOverlay] Generating overlays for scene ${requirement.sceneIndex}:`, {
    type: requirement.overlayType,
    itemCount: requirement.textContent.length,
    totalFrames,
  });
  
  const startDelay = Math.round(fps * 0.5);
  
  if (requirement.overlayType === 'bullet_list') {
    const staggerDelay = Math.round(fps * 0.5);
    
    requirement.textContent.forEach((text, index) => {
      const startFrame = startDelay + (index * staggerDelay);
      const endFrame = totalFrames - Math.round(fps * 0.3);
      
      const yPosition = 55 + (index * 12);
      
      overlays.push({
        id: `bullet-${requirement.sceneIndex}-${index}`,
        text: `• ${text}`,
        type: 'bullet',
        position: { 
          x: 8,
          y: Math.min(yPosition, 90),
        },
        style: {
          fontSize: 24,
          color: '#FFFFFF',
          backgroundColor: 'rgba(45, 90, 39, 0.85)',
          fontWeight: '600',
        },
        timing: {
          startFrame,
          endFrame,
          fadeInFrames: Math.round(fps * 0.3),
          fadeOutFrames: Math.round(fps * 0.2),
        },
        animation: 'slide-up',
      });
    });
  } else if (requirement.overlayType === 'cta') {
    overlays.push({
      id: `cta-${requirement.sceneIndex}`,
      text: requirement.textContent[0] || 'Learn More',
      type: 'cta',
      position: { x: 50, y: 75 },
      style: {
        fontSize: 32,
        color: '#FFFFFF',
        backgroundColor: 'rgba(212, 165, 116, 0.95)',
        fontWeight: 'bold',
      },
      timing: {
        startFrame: Math.round(totalFrames * 0.3),
        endFrame: totalFrames,
        fadeInFrames: Math.round(fps * 0.4),
        fadeOutFrames: Math.round(fps * 0.2),
      },
      animation: 'pop',
    });
    
    if (requirement.textContent.length > 1) {
      requirement.textContent.slice(1).forEach((text, index) => {
        overlays.push({
          id: `cta-sub-${requirement.sceneIndex}-${index}`,
          text,
          type: 'caption',
          position: { x: 50, y: 85 + (index * 8) },
          style: {
            fontSize: 20,
            color: '#FFFFFF',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            fontWeight: '500',
          },
          timing: {
            startFrame: Math.round(totalFrames * 0.4) + (index * Math.round(fps * 0.3)),
            endFrame: totalFrames,
            fadeInFrames: Math.round(fps * 0.3),
            fadeOutFrames: Math.round(fps * 0.2),
          },
          animation: 'fade',
        });
      });
    }
  } else if (requirement.overlayType === 'title') {
    overlays.push({
      id: `title-${requirement.sceneIndex}`,
      text: requirement.textContent[0] || '',
      type: 'title',
      position: { x: 50, y: 50 },
      style: {
        fontSize: 40,
        color: '#FFFFFF',
        backgroundColor: 'rgba(45, 90, 39, 0.8)',
        fontWeight: 'bold',
      },
      timing: {
        startFrame: startDelay,
        endFrame: totalFrames - Math.round(fps * 0.5),
        fadeInFrames: Math.round(fps * 0.4),
        fadeOutFrames: Math.round(fps * 0.3),
      },
      animation: 'fade',
    });
  } else {
    overlays.push({
      id: `text-${requirement.sceneIndex}`,
      text: requirement.textContent[0] || '',
      type: 'caption',
      position: { x: 50, y: 85 },
      style: {
        fontSize: 28,
        color: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        fontWeight: '500',
      },
      timing: {
        startFrame: startDelay,
        endFrame: totalFrames - Math.round(fps * 0.3),
        fadeInFrames: Math.round(fps * 0.3),
        fadeOutFrames: Math.round(fps * 0.2),
      },
      animation: 'fade',
    });
  }
  
  console.log(`[TextOverlay] Generated ${overlays.length} overlays:`, overlays.map(o => o.text.substring(0, 40)));
  
  return overlays;
}

export const textOverlayGenerator = {
  generateTextOverlays,
};
