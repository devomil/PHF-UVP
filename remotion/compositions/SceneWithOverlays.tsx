import React from 'react';
import { AbsoluteFill, Img, Video } from 'remotion';
import { EnhancedTextOverlay, EnhancedTextOverlayProps } from '../components/TextOverlay';
import { LogoOverlay, LogoOverlayProps } from '../components/LogoOverlay';
import { WatermarkOverlay, WatermarkOverlayProps } from '../components/WatermarkOverlay';
import { LowerThird, LowerThirdProps } from '../components/LowerThird';
import { BulletList, BulletListProps } from '../components/BulletList';
import { CTAButton, CTAButtonProps } from '../components/CTAButton';

export interface SceneOverlays {
  texts?: EnhancedTextOverlayProps[];
  logo?: LogoOverlayProps;
  watermark?: WatermarkOverlayProps;
  lowerThirds?: LowerThirdProps[];
  bulletLists?: BulletListProps[];
  ctaButtons?: CTAButtonProps[];
}

export interface SceneWithOverlaysProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  durationInFrames: number;
  overlays: SceneOverlays;
  productOverlay?: {
    url: string;
    position: 'center' | 'bottom-right' | 'bottom-left' | 'right' | 'left';
    scale?: number;
  };
}

export const SceneWithOverlays: React.FC<SceneWithOverlaysProps> = ({
  mediaUrl,
  mediaType,
  durationInFrames,
  overlays,
  productOverlay,
}) => {
  const getProductOverlayStyle = (position: string): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      objectFit: 'contain',
      maxWidth: productOverlay?.scale ? `${productOverlay.scale * 100}%` : '30%',
      maxHeight: '40%',
    };

    switch (position) {
      case 'center':
        return { ...baseStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
      case 'bottom-right':
        return { ...baseStyle, bottom: '10%', right: '5%' };
      case 'bottom-left':
        return { ...baseStyle, bottom: '10%', left: '5%' };
      case 'right':
        return { ...baseStyle, top: '50%', right: '5%', transform: 'translateY(-50%)' };
      case 'left':
        return { ...baseStyle, top: '50%', left: '5%', transform: 'translateY(-50%)' };
      default:
        return { ...baseStyle, bottom: '10%', right: '5%' };
    }
  };

  return (
    <AbsoluteFill>
      {mediaType === 'video' ? (
        <Video 
          src={mediaUrl} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        <Img 
          src={mediaUrl} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      )}
      
      {productOverlay && (
        <Img
          src={productOverlay.url}
          style={getProductOverlayStyle(productOverlay.position)}
        />
      )}
      
      {overlays.texts?.map((textProps, i) => (
        <EnhancedTextOverlay key={`text-${i}`} {...textProps} />
      ))}
      
      {overlays.bulletLists?.map((listProps, i) => (
        <BulletList key={`bullets-${i}`} {...listProps} />
      ))}
      
      {overlays.lowerThirds?.map((ltProps, i) => (
        <LowerThird key={`lt-${i}`} {...ltProps} />
      ))}
      
      {overlays.ctaButtons?.map((ctaProps, i) => (
        <CTAButton key={`cta-${i}`} {...ctaProps} />
      ))}
      
      {overlays.logo && <LogoOverlay {...overlays.logo} />}
      
      {overlays.watermark && <WatermarkOverlay {...overlays.watermark} />}
    </AbsoluteFill>
  );
};

export default SceneWithOverlays;
