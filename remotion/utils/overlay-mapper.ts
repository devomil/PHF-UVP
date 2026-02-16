import type { Scene } from '../../shared/video-types';
import type { EnhancedTextOverlayProps } from '../components/TextOverlay';
import type { LogoOverlayProps } from '../components/LogoOverlay';
import type { WatermarkOverlayProps } from '../components/WatermarkOverlay';
import type { BulletListProps } from '../components/BulletList';
import type { CTAButtonProps } from '../components/CTAButton';
import type { LowerThirdProps } from '../components/LowerThird';
import { PHF_OVERLAY_DEFAULTS, getDefaultTextOverlayStyle, getDefaultBulletListStyle, getDefaultCTAButtonStyle, getDefaultLowerThirdStyle } from '../config/brand-overlay-defaults';

export interface MappedOverlays {
  textOverlays: EnhancedTextOverlayProps[];
  bulletLists: BulletListProps[];
  ctaButtons: CTAButtonProps[];
  lowerThirds: LowerThirdProps[];
  logo?: LogoOverlayProps;
  watermark?: WatermarkOverlayProps;
}

export function mapSceneToOverlays(
  scene: Scene,
  fps: number,
  brandLogoUrl?: string,
  brandWatermarkUrl?: string
): MappedOverlays {
  const sceneDuration = scene.duration || 5;
  const totalFrames = sceneDuration * fps;
  const result: MappedOverlays = {
    textOverlays: [],
    bulletLists: [],
    ctaButtons: [],
    lowerThirds: [],
  };

  const extractedText = scene.extractedOverlayText || [];
  const extractedLogos = scene.extractedLogos || [];
  const overlayConfig = scene.overlayConfig;

  const hasTextContent = extractedText.length > 0 || (scene.textOverlays && scene.textOverlays.length > 0);
  const hasLogoContent = extractedLogos.length > 0 || brandLogoUrl || brandWatermarkUrl;

  if (!hasTextContent && !hasLogoContent) {
    return result;
  }

  const isCTAScene = scene.type === 'cta' || scene.type === 'outro';
  const isIntroScene = scene.type === 'intro';
  const isBenefitScene = scene.type === 'benefit' || scene.type === 'feature';
  const isHookScene = scene.type === 'hook';

  if (isCTAScene && extractedText.length > 0) {
    result.ctaButtons.push({
      text: extractedText[0],
      subtext: extractedText[1],
      position: 'bottom-center',
      style: getDefaultCTAButtonStyle(),
      animation: {
        type: 'pop',
        duration: 12,
        delay: Math.round(fps * 0.5),
      },
      timing: {
        startFrame: Math.round(fps * 0.3),
        endFrame: totalFrames,
      },
    });
  } else if (extractedText.length > 3) {
    result.bulletLists.push({
      items: extractedText,
      position: 'left',
      verticalPosition: 40,
      style: getDefaultBulletListStyle(),
      animation: {
        staggerDelay: 10,
        itemDuration: 12,
      },
      timing: {
        startFrame: Math.round(fps * 0.5),
        endFrame: totalFrames - Math.round(fps * 0.5),
      },
    });
  } else if (extractedText.length > 0) {
    extractedText.forEach((text, index) => {
      const defaultStyle = getDefaultTextOverlayStyle();
      const isMainText = index === 0;
      
      result.textOverlays.push({
        text,
        position: isMainText ? 'bottom' : 'center',
        alignment: 'center',
        style: {
          ...defaultStyle,
          fontSize: isMainText ? 36 : 28,
          fontWeight: isMainText ? 'bold' : 'normal',
        },
        animation: {
          type: 'fade',
          duration: 15,
          delay: index * 10,
        },
        timing: {
          startFrame: Math.round(fps * 0.3) + (index * 10),
          endFrame: totalFrames - Math.round(fps * 0.3),
        },
      });
    });
  }

  if (scene.textOverlays && scene.textOverlays.length > 0 && result.textOverlays.length === 0) {
    if (isHookScene || isBenefitScene) {
      const mainOverlay = scene.textOverlays[0];
      if (mainOverlay?.text) {
        result.lowerThirds.push({
          name: mainOverlay.text.length > 50 
            ? mainOverlay.text.substring(0, 47) + '...' 
            : mainOverlay.text,
          title: scene.textOverlays[1]?.text,
          style: getDefaultLowerThirdStyle(),
          position: 'left',
          timing: {
            startFrame: Math.round(fps * 0.3),
            endFrame: totalFrames - Math.round(fps * 0.3),
          },
        });
      }
    } else {
      scene.textOverlays.forEach((overlay, index) => {
        if (!overlay.text) return;
        
        const defaultStyle = getDefaultTextOverlayStyle();
        const styleType = overlay.style || 'body';
        const fontSize = styleType === 'title' ? 48 : 
                        styleType === 'headline' ? 40 : 
                        styleType === 'subtitle' ? 32 : 
                        styleType === 'cta' ? 36 : 28;
        const fontWeight = ['title', 'headline', 'cta'].includes(styleType) ? 'bold' : 'normal';
        
        result.textOverlays.push({
          text: overlay.text,
          position: 'bottom',
          alignment: 'center',
          style: {
            ...defaultStyle,
            fontSize,
            fontWeight,
          },
          animation: {
            type: 'slide-up',
            duration: 15,
            delay: index * 8,
          },
          timing: {
            startFrame: Math.round(fps * 0.3),
            endFrame: totalFrames - Math.round(fps * 0.3),
          },
        });
      });
    }
  }

  const extractedLogoUrl = extractedLogos.length > 0 ? extractedLogos[0] : null;
  const effectiveLogoUrl = extractedLogoUrl || brandLogoUrl;
  const extractedWatermarkUrl = extractedLogos.length > 1 ? extractedLogos[1] : null;
  const effectiveWatermarkUrl = extractedWatermarkUrl || brandWatermarkUrl;

  if ((isIntroScene || isCTAScene) && effectiveLogoUrl) {
    const logoConfig = overlayConfig?.logoPosition || 'center';
    const logoSize = overlayConfig?.logoSize || 15;

    result.logo = {
      logoUrl: effectiveLogoUrl,
      position: logoConfig,
      size: logoSize,
      opacity: 1,
      animation: {
        type: isIntroScene ? 'scale-up' : 'fade-in',  // Fixed: 'zoom'/'fade' are not valid LogoAnimation types
        duration: 15,
        delay: 5,
      },
      timing: {
        startFrame: 0,
        endFrame: totalFrames,
      },
      tagline: isIntroScene ? PHF_OVERLAY_DEFAULTS.logo.tagline : undefined,
      taglineStyle: {
        fontSize: 20,
        color: '#FFFFFF',
      },
    };
  }

  if (effectiveWatermarkUrl && overlayConfig?.includeWatermark !== false) {
    const position = PHF_OVERLAY_DEFAULTS.watermark.position;
    result.watermark = {
      logoUrl: effectiveWatermarkUrl,
      position,
      size: PHF_OVERLAY_DEFAULTS.watermark.size,
      opacity: PHF_OVERLAY_DEFAULTS.watermark.opacity,
      margin: PHF_OVERLAY_DEFAULTS.watermark.margin,
      showDuring: 'middle',
    };
  }

  return result;
}

export function detectOverlayType(text: string): 'cta' | 'bullet' | 'title' | 'subtitle' | 'normal' {
  const lowerText = text.toLowerCase();
  
  const ctaKeywords = ['book now', 'call now', 'visit', 'shop now', 'learn more', 'get started', 
    'sign up', 'try now', 'order now', 'contact us', 'free trial', 'get yours'];
  if (ctaKeywords.some(kw => lowerText.includes(kw))) {
    return 'cta';
  }
  
  if (/^\d+[\.\)]\s/.test(text) || text.startsWith('•') || text.startsWith('-')) {
    return 'bullet';
  }
  
  if (text.length < 30 && !text.includes('.')) {
    return 'title';
  }
  
  if (text.length < 60) {
    return 'subtitle';
  }
  
  return 'normal';
}

export function shouldShowLogo(sceneType: string): boolean {
  return ['intro', 'cta', 'outro', 'brand'].includes(sceneType);
}

export function shouldShowWatermark(sceneType: string): boolean {
  return !['intro', 'outro'].includes(sceneType);
}
