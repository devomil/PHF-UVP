// shared/types/brand-injection.ts
// Phase 18C: Brand Injection Plan types for Remotion composition
// This matches the existing brand-injection-service.ts interface

export interface BrandAsset {
  id?: number;
  name: string;
  url: string;
  type?: string;
  placementSettings?: Record<string, unknown>;
}

export interface LogoIntroConfig {
  enabled: boolean;
  asset: BrandAsset | null;
  duration: number;
  animation: 'fade' | 'zoom' | 'slide-up' | 'none';
  backgroundColor?: string;
  position: 'center' | 'lower-third';
  includeTagline: boolean;
  tagline?: string;
}

export interface WatermarkConfig {
  enabled: boolean;
  asset: BrandAsset | null;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  scale: number;
  margin: number;
  showDuring: 'all' | 'middle' | 'custom';
  customStart?: number;
  customEnd?: number;
}

export interface CTAOutroConfig {
  enabled: boolean;
  duration: number;
  backgroundColor: string;
  logo: BrandAsset | null;
  contactInfo: {
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
  };
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  };
  headline?: string;
  subheadline?: string;
  buttonText?: string;
  buttonUrl?: string;
  animation: 'fade' | 'slide-up' | 'build';
}

export interface BrandInjectionPlan {
  logoIntro: LogoIntroConfig;
  watermark: WatermarkConfig;
  ctaOutro: CTAOutroConfig;
  totalAddedDuration: number;
}
