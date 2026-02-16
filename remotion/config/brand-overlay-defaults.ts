export const PHF_OVERLAY_DEFAULTS = {
  text: {
    fontFamily: 'Inter, system-ui, sans-serif',
    primaryColor: '#2D5A27',
    secondaryColor: '#D4A574',
    backgroundColor: '#2D5A27',
    textColor: '#FFFFFF',
  },
  logo: {
    url: '/assets/brand/phf-logo.png',
    tagline: 'Cultivating Wellness',
    size: 15,
    opacity: 1,
    animation: {
      type: 'zoom' as const,
      duration: 15,
      delay: 0,
    },
  },
  watermark: {
    url: '/assets/brand/phf-icon.png',
    position: 'bottom-right' as const,
    size: 8,
    opacity: 0.7,
    margin: 20,
    showDuring: 'middle' as const,
  },
  lowerThird: {
    primaryColor: '#2D5A27',
    secondaryColor: '#D4A574',
    textColor: '#FFFFFF',
    fontSize: 24,
  },
  bulletList: {
    fontSize: 20,
    color: '#FFFFFF',
    backgroundColor: '#2D5A27',
    backgroundOpacity: 0.85,
    bulletColor: '#D4A574',
  },
  ctaButton: {
    backgroundColor: '#D4A574',
    textColor: '#FFFFFF',
    fontSize: 28,
    borderRadius: 8,
    paddingX: 40,
    paddingY: 16,
    shadow: true,
  },
  animations: {
    text: {
      type: 'fade' as const,
      duration: 15,
      delay: 0,
    },
    logo: {
      type: 'zoom' as const,
      duration: 15,
      delay: 0,
    },
    bulletList: {
      staggerDelay: 10,
      itemDuration: 12,
    },
    cta: {
      type: 'pop' as const,
      duration: 12,
      delay: 5,
    },
  },
};

export type PHFOverlayDefaults = typeof PHF_OVERLAY_DEFAULTS;

export function getDefaultTextOverlayStyle() {
  return {
    fontSize: 32,
    fontFamily: PHF_OVERLAY_DEFAULTS.text.fontFamily,
    fontWeight: 'bold',
    color: PHF_OVERLAY_DEFAULTS.text.textColor,
    backgroundColor: PHF_OVERLAY_DEFAULTS.text.backgroundColor,
    backgroundOpacity: 0.85,
    padding: 16,
    borderRadius: 8,
    textShadow: true,
  };
}

export function getDefaultLogoOverlayProps(startFrame: number, endFrame: number) {
  return {
    logoUrl: PHF_OVERLAY_DEFAULTS.logo.url,
    position: 'center' as const,
    size: PHF_OVERLAY_DEFAULTS.logo.size,
    opacity: PHF_OVERLAY_DEFAULTS.logo.opacity,
    animation: PHF_OVERLAY_DEFAULTS.logo.animation,
    timing: { startFrame, endFrame },
    tagline: PHF_OVERLAY_DEFAULTS.logo.tagline,
    taglineStyle: {
      fontSize: 20,
      color: PHF_OVERLAY_DEFAULTS.text.textColor,
    },
  };
}

export function getDefaultWatermarkProps() {
  return {
    logoUrl: PHF_OVERLAY_DEFAULTS.watermark.url,
    position: PHF_OVERLAY_DEFAULTS.watermark.position,
    size: PHF_OVERLAY_DEFAULTS.watermark.size,
    opacity: PHF_OVERLAY_DEFAULTS.watermark.opacity,
    margin: PHF_OVERLAY_DEFAULTS.watermark.margin,
    showDuring: PHF_OVERLAY_DEFAULTS.watermark.showDuring,
  };
}

export function getDefaultLowerThirdStyle() {
  return {
    primaryColor: PHF_OVERLAY_DEFAULTS.lowerThird.primaryColor,
    secondaryColor: PHF_OVERLAY_DEFAULTS.lowerThird.secondaryColor,
    textColor: PHF_OVERLAY_DEFAULTS.lowerThird.textColor,
    fontSize: PHF_OVERLAY_DEFAULTS.lowerThird.fontSize,
  };
}

export function getDefaultBulletListStyle() {
  return {
    fontSize: PHF_OVERLAY_DEFAULTS.bulletList.fontSize,
    color: PHF_OVERLAY_DEFAULTS.bulletList.color,
    backgroundColor: PHF_OVERLAY_DEFAULTS.bulletList.backgroundColor,
    backgroundOpacity: PHF_OVERLAY_DEFAULTS.bulletList.backgroundOpacity,
    bulletColor: PHF_OVERLAY_DEFAULTS.bulletList.bulletColor,
  };
}

export function getDefaultCTAButtonStyle() {
  return {
    backgroundColor: PHF_OVERLAY_DEFAULTS.ctaButton.backgroundColor,
    textColor: PHF_OVERLAY_DEFAULTS.ctaButton.textColor,
    fontSize: PHF_OVERLAY_DEFAULTS.ctaButton.fontSize,
    borderRadius: PHF_OVERLAY_DEFAULTS.ctaButton.borderRadius,
    paddingX: PHF_OVERLAY_DEFAULTS.ctaButton.paddingX,
    paddingY: PHF_OVERLAY_DEFAULTS.ctaButton.paddingY,
    shadow: PHF_OVERLAY_DEFAULTS.ctaButton.shadow,
  };
}
