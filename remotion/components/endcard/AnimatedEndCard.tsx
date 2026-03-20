import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, spring } from 'remotion';
import { EndCardConfig } from '../../../shared/config/end-card';

const GoogleFontLoader: React.FC<{ families: string[] }> = ({ families }) => {
  const href = useMemo(() => {
    const unique = [...new Set(families.filter(f => f && f !== 'Inter'))];
    if (unique.length === 0) return null;
    const params = unique.map(f => `family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700`).join('&');
    return `https://fonts.googleapis.com/css2?${params}&display=swap`;
  }, [families]);
  if (!href) return null;
  return <link rel="stylesheet" href={href} />;
};

function isValidImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.warn('[EndCard] Invalid image URL (not absolute):', url);
    return false;
  }
  
  if (url.includes('.picard.replit.dev') || url.includes('.replit.dev/')) {
    console.error('[EndCard] Invalid image URL (Replit dev URL not accessible from Lambda):', url);
    return false;
  }
  
  return true;
}

interface AnimatedEndCardProps {
  config: EndCardConfig;
}

export const AnimatedEndCard: React.FC<AnimatedEndCardProps> = ({ config }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  const fontFamilies = useMemo(() => {
    const families: string[] = [];
    const taglineFont = config.tagline?.style?.fontFamily?.replace(/['"]/g, '').split(',')[0]?.trim();
    const contactFont = config.contact?.style?.fontFamily?.replace(/['"]/g, '').split(',')[0]?.trim();
    if (taglineFont) families.push(taglineFont);
    if (contactFont) families.push(contactFont);
    return families;
  }, [config.tagline?.style?.fontFamily, config.contact?.style?.fontFamily]);

  return (
    <AbsoluteFill>
      <GoogleFontLoader families={fontFamilies} />
      <EndCardBackground 
        background={config.background} 
        frame={frame} 
        fps={fps} 
      />
      
      {config.ambientEffect && config.ambientEffect.type !== 'none' && (
        <AmbientEffect 
          effect={config.ambientEffect} 
          frame={frame}
          width={width}
          height={height}
        />
      )}
      
      {isValidImageUrl(config.logo.url) && (
        <div
          style={{
            position: 'absolute',
            top: `${config.logo.position?.y ?? 32}%`,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            transform: 'translateY(-50%)',
          }}
        >
          <LogoReveal
            logoUrl={config.logo.url}
            size={config.logo.size}
            animation={config.logo.animation}
            startFrame={Math.round(0.3 * fps)}
            fps={fps}
            width={width}
            invertLogo={isDarkBackground(config.background)}
          />
        </div>
      )}
      
      {config.tagline && (
        <div
          style={{
            position: 'absolute',
            top: `${config.tagline.positionY ?? 55}%`,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            transform: 'translateY(-50%)',
          }}
        >
          <TaglineReveal
            text={config.tagline.text}
            style={config.tagline.style}
            animation={config.tagline.animation}
            startFrame={Math.round(config.tagline.delay * fps)}
            fps={fps}
          />
        </div>
      )}
      
      <ContactReveal
        website={config.contact.website}
        phone={config.contact.phone}
        email={config.contact.email}
        style={config.contact.style}
        animation={config.contact.animation}
        startFrame={Math.round(config.contact.delay * fps)}
        fps={fps}
        positionY={config.contact.positionY}
      />
      
      {config.social && config.social.icons.length > 0 && (
        <SocialIconsReveal
          icons={config.social.icons}
          size={config.social.size}
          animation={config.social.animation}
          startFrame={Math.round(config.social.delay * fps)}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

const EndCardBackground: React.FC<{
  background: EndCardConfig['background'];
  frame: number;
  fps: number;
}> = ({ background, frame, fps }) => {
  
  if (background.type === 'solid') {
    return <AbsoluteFill style={{ backgroundColor: background.color }} />;
  }
  
  if (background.type === 'gradient' || background.type === 'animated-gradient') {
    const gradient = background.gradient!;
    
    const angle = background.type === 'animated-gradient'
      ? gradient.angle + Math.sin(frame * 0.02) * 15
      : gradient.angle;
    
    const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });
    
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${gradient.colors.join(', ')})`,
          opacity,
        }}
      />
    );
  }
  
  if (background.type === 'image' && background.imageUrl) {
    const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });
    return (
      <AbsoluteFill style={{ opacity }}>
        <Img
          src={background.imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
    );
  }
  
  return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
};

const AmbientEffect: React.FC<{
  effect: NonNullable<EndCardConfig['ambientEffect']>;
  frame: number;
  width: number;
  height: number;
}> = ({ effect, frame, width, height }) => {
  
  const particleCount = effect.type === 'particles' 
    ? effect.intensity 
    : Math.floor(effect.intensity / 3);
  
  return (
    <div style={{ 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {Array.from({ length: particleCount }).map((_, i) => (
        effect.type === 'particles' ? (
          <FloatingParticle 
            key={i} 
            index={i} 
            frame={frame} 
            color={effect.color}
            width={width}
            height={height}
          />
        ) : (
          <BokehCircle
            key={i}
            index={i}
            frame={frame}
            color={effect.color}
            width={width}
            height={height}
          />
        )
      ))}
    </div>
  );
};

const FloatingParticle: React.FC<{
  index: number;
  frame: number;
  color: string;
  width: number;
  height: number;
}> = ({ index, frame, color, width, height }) => {
  const seed = index * 12345;
  const startX = (seed % 100) / 100 * width;
  const startY = ((seed * 7) % 100) / 100 * height;
  const size = 2 + (seed % 4);
  const speed = 0.3 + (seed % 10) / 30;
  
  const floatY = Math.sin((frame * speed + seed) * 0.05) * 30;
  const floatX = Math.cos((frame * speed * 0.7 + seed) * 0.04) * 15;
  
  const opacity = 0.2 + Math.sin((frame + seed) * 0.08) * 0.3;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: startX + floatX,
        top: startY + floatY,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
    />
  );
};

const BokehCircle: React.FC<{
  index: number;
  frame: number;
  color: string;
  width: number;
  height: number;
}> = ({ index, frame, color, width, height }) => {
  const seed = index * 54321;
  const x = (seed % 100) / 100 * width;
  const y = ((seed * 3) % 100) / 100 * height;
  const size = 40 + (seed % 80);
  
  const opacity = 0.03 + Math.sin((frame + seed) * 0.015) * 0.02;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        filter: 'blur(30px)',
      }}
    />
  );
};

function isDarkBackground(bg: EndCardConfig['background']): boolean {
  if (!bg) return true;
  if (bg.type === 'solid') {
    const hex = bg.color?.replace('#', '') || '111111';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }
  if (bg.type === 'animated-gradient' && bg.gradient?.colors) {
    const avgLuminance = bg.gradient.colors.reduce((sum: number, c: string) => {
      const hex = c.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return sum + (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }, 0) / bg.gradient.colors.length;
    return avgLuminance < 0.5;
  }
  return true;
}

const LogoReveal: React.FC<{
  logoUrl: string;
  size: number;
  animation: string;
  startFrame: number;
  fps: number;
  width: number;
  invertLogo?: boolean;
}> = ({ logoUrl, size, animation, startFrame, fps, width, invertLogo = false }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  const logoWidth = Math.max((size / 100) * width, width * 0.2);
  
  let scale = 1;
  let opacity = 1;
  let translateY = 0;
  let rotate = 0;
  let blur = 0;

  if (animation === 'scale-bounce') {
    scale = spring({ frame: localFrame, fps, config: { stiffness: 200, damping: 15, mass: 1 }, from: 0, to: 1 });
    opacity = interpolate(localFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animation === 'slide-up') {
    scale = interpolate(localFrame, [0, fps * 0.5], [0.8, 1], { extrapolateRight: 'clamp' });
    opacity = interpolate(localFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
    translateY = interpolate(localFrame, [0, fps * 0.5], [50, 0], { extrapolateRight: 'clamp' });
  } else if (animation === 'fade') {
    opacity = interpolate(localFrame, [0, fps * 0.6], [0, 1], { extrapolateRight: 'clamp' });
    scale = interpolate(localFrame, [0, fps * 0.5], [0.8, 1], { extrapolateRight: 'clamp' });
  } else if (animation === 'zoom-blur') {
    scale = spring({ frame: localFrame, fps, config: { stiffness: 120, damping: 12, mass: 0.8 }, from: 2.5, to: 1 });
    opacity = interpolate(localFrame, [0, fps * 0.25], [0, 1], { extrapolateRight: 'clamp' });
    blur = interpolate(localFrame, [0, fps * 0.4], [12, 0], { extrapolateRight: 'clamp' });
  } else if (animation === 'spin-in') {
    scale = spring({ frame: localFrame, fps, config: { stiffness: 150, damping: 14, mass: 1 }, from: 0, to: 1 });
    opacity = interpolate(localFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
    rotate = interpolate(localFrame, [0, fps * 0.6], [-180, 0], { extrapolateRight: 'clamp' });
  } else if (animation === 'elastic-pop') {
    scale = spring({ frame: localFrame, fps, config: { stiffness: 300, damping: 10, mass: 0.6 }, from: 0, to: 1 });
    opacity = interpolate(localFrame, [0, fps * 0.15], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animation === 'none') {
    opacity = 1;
  } else {
    opacity = interpolate(localFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
  }
  
  const shinePosition = interpolate(
    localFrame, 
    [fps * 0.5, fps * 1.5], 
    [-50, 150], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        transform: `scale(${scale}) translateY(${translateY}px) rotate(${rotate}deg)`,
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        marginBottom: 20,
      }}
    >
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Img
          src={logoUrl}
          style={{
            maxWidth: logoWidth,
            maxHeight: logoWidth * 0.6,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            mixBlendMode: invertLogo ? 'screen' : 'multiply',
            filter: invertLogo
              ? 'brightness(0) invert(1) drop-shadow(0 0 15px rgba(255,255,255,0.2)) drop-shadow(0 4px 12px rgba(0,0,0,0.4))'
              : 'drop-shadow(0 0 15px rgba(255,255,255,0.2)) drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(
              105deg,
              transparent ${shinePosition - 30}%,
              rgba(255, 255, 255, 0.4) ${shinePosition}%,
              transparent ${shinePosition + 30}%
            )`,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

const TaglineReveal: React.FC<{
  text: string;
  style: { fontSize: number; fontFamily: string; color: string; fontWeight?: number };
  animation: string;
  startFrame: number;
  fps: number;
}> = ({ text, style, animation, startFrame, fps }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;

  if (animation === 'typewriter') {
    const charsToShow = Math.floor(interpolate(localFrame, [0, fps * 1.5], [0, text.length], { extrapolateRight: 'clamp' }));
    const displayText = text.substring(0, charsToShow);
    const showCursor = charsToShow < text.length;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, fontWeight: style.fontWeight || 400, whiteSpace: 'nowrap', textShadow: '0 2px 8px rgba(0,0,0,0.4)', marginTop: 8 }}>
        {displayText}
        {showCursor && <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0 }}>|</span>}
      </div>
    );
  }

  if (animation === 'letter-cascade') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, whiteSpace: 'nowrap' }}>
        {text.split('').map((char, i) => {
          const charDelay = i * 1.5;
          const charFrame = localFrame - charDelay;
          const charOpacity = interpolate(charFrame, [0, fps * 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const charY = interpolate(charFrame, [0, fps * 0.3], [-20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{ fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, fontWeight: style.fontWeight || 400, opacity: charOpacity, transform: `translateY(${charY}px)`, display: 'inline-block', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {char === ' ' ? '\u00A0' : char}
            </span>
          );
        })}
      </div>
    );
  }

  if (animation === 'word-reveal') {
    const words = text.split(' ');
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: style.fontSize * 0.3, marginTop: 8, flexWrap: 'wrap' }}>
        {words.map((word, i) => {
          const wordDelay = i * fps * 0.15;
          const wordFrame = localFrame - wordDelay;
          const wordOpacity = interpolate(wordFrame, [0, fps * 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const wordScale = spring({ frame: Math.max(0, wordFrame), fps, config: { stiffness: 200, damping: 12, mass: 0.8 }, from: 0.5, to: 1 });
          const wordBlur = interpolate(wordFrame, [0, fps * 0.2], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <span key={i} style={{ fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, fontWeight: style.fontWeight || 400, opacity: wordOpacity, transform: `scale(${wordFrame < 0 ? 0.5 : wordScale})`, filter: `blur(${wordBlur}px)`, display: 'inline-block', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {word}
            </span>
          );
        })}
      </div>
    );
  }

  if (animation === 'glow-pulse') {
    const opacity = interpolate(localFrame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });
    const glowIntensity = interpolate(localFrame, [fps * 0.5, fps * 1.0, fps * 1.5], [0, 15, 8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scale = interpolate(localFrame, [0, fps * 0.5], [0.9, 1], { extrapolateRight: 'clamp' });
    return (
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, fontWeight: style.fontWeight || 400, opacity, transform: `scale(${scale})`, textShadow: `0 0 ${glowIntensity}px ${style.color}, 0 2px 8px rgba(0,0,0,0.4)`, whiteSpace: 'nowrap', marginTop: 8 }}>
        {text}
      </div>
    );
  }

  if (animation === 'cinematic-rise') {
    const opacity = interpolate(localFrame, [0, fps * 0.8], [0, 1], { extrapolateRight: 'clamp' });
    const translateY = interpolate(localFrame, [0, fps * 0.8], [60, 0], { extrapolateRight: 'clamp' });
    const letterSpacing = interpolate(localFrame, [0, fps * 0.8], [20, 2], { extrapolateRight: 'clamp' });
    return (
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, fontWeight: style.fontWeight || 400, opacity, transform: `translateY(${translateY}px)`, letterSpacing, whiteSpace: 'nowrap', textShadow: '0 2px 8px rgba(0,0,0,0.4)', marginTop: 8 }}>
        {text}
      </div>
    );
  }

  let opacity = 1;
  let translateY = 0;

  if (animation === 'fade') {
    opacity = interpolate(localFrame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animation === 'slide-up') {
    opacity = interpolate(localFrame, [0, fps * 0.4], [0, 1], { extrapolateRight: 'clamp' });
    translateY = interpolate(localFrame, [0, fps * 0.4], [30, 0], { extrapolateRight: 'clamp' });
  } else if (animation === 'none') {
    opacity = 1;
  } else {
    opacity = interpolate(localFrame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
        fontWeight: style.fontWeight || 400,
        opacity,
        transform: `translateY(${translateY}px)`,
        whiteSpace: 'nowrap',
        textShadow: '0 2px 8px rgba(0,0,0,0.4)',
        marginTop: 8,
      }}
    >
      {text}
    </div>
  );
};

const ContactReveal: React.FC<{
  website?: string;
  phone?: string;
  email?: string;
  style: { fontSize: number; color: string; fontWeight?: number; fontFamily?: string };
  animation: string;
  startFrame: number;
  fps: number;
  positionY?: number;
}> = ({ website, phone, email, style, animation, startFrame, fps, positionY }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  const items = [website, phone, email].filter(Boolean) as string[];
  
  if (items.length === 0) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        top: positionY ? `${positionY}%` : undefined,
        bottom: positionY ? undefined : '18%',
        left: '50%',
        transform: positionY ? 'translate(-50%, -50%)' : 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {items.map((item, index) => {
        const itemDelay = (animation === 'stagger' || animation === 'stagger-slide' || animation === 'stagger-scale')
          ? index * fps * 0.12
          : animation === 'cascade-blur' ? index * fps * 0.18 : 0;
        const itemFrame = localFrame - itemDelay;

        let opacity = interpolate(itemFrame, [0, fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        let translateY = 0;
        let translateX = 0;
        let scale = 1;
        let blur = 0;

        if (animation === 'stagger') {
          translateY = interpolate(itemFrame, [0, fps * 0.4], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        } else if (animation === 'slide-up' || animation === 'stagger-slide') {
          translateY = interpolate(itemFrame, [0, fps * 0.4], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        } else if (animation === 'slide-left') {
          translateX = interpolate(itemFrame, [0, fps * 0.4], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        } else if (animation === 'stagger-scale') {
          scale = spring({ frame: Math.max(0, itemFrame), fps, config: { stiffness: 200, damping: 12, mass: 0.7 }, from: 0, to: 1 });
        } else if (animation === 'cascade-blur') {
          blur = interpolate(itemFrame, [0, fps * 0.3], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          translateY = interpolate(itemFrame, [0, fps * 0.3], [15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        } else if (animation === 'none') {
          opacity = 1;
        }
        
        return (
          <div
            key={index}
            style={{
              fontSize: style.fontSize,
              color: style.color,
              fontFamily: style.fontFamily || 'Inter, sans-serif',
              fontWeight: style.fontWeight || 500,
              opacity,
              transform: `translateY(${translateY}px) translateX(${translateX}px) scale(${scale})`,
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
              textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
};

const SocialIconsReveal: React.FC<{
  icons: Array<{ platform: string; url: string }>;
  size: number;
  animation: string;
  startFrame: number;
  fps: number;
}> = ({ icons, size, animation, startFrame, fps }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 20,
      }}
    >
      {icons.map((icon, index) => {
        const iconDelay = animation === 'pop' ? index * fps * 0.1 : 0;
        const iconFrame = localFrame - iconDelay;
        
        const scale = animation === 'pop'
          ? spring({
              frame: Math.max(0, iconFrame),
              fps,
              config: { stiffness: 300, damping: 12, mass: 0.8 },
              from: 0,
              to: 1,
            })
          : interpolate(iconFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
        
        return (
          <div
            key={index}
            style={{
              width: size,
              height: size,
              transform: `scale(${scale})`,
            }}
          >
            <SocialIcon platform={icon.platform} size={size} />
          </div>
        );
      })}
    </div>
  );
};

const SocialIcon: React.FC<{ platform: string; size: number }> = ({ platform, size }) => {
  const iconColors: Record<string, string> = {
    facebook: '#1877F2',
    instagram: '#E4405F',
    twitter: '#1DA1F2',
    linkedin: '#0A66C2',
    youtube: '#FF0000',
    tiktok: '#000000',
  };
  
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: iconColors[platform.toLowerCase()] || '#666',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFF',
        fontSize: size * 0.5,
        fontWeight: 'bold',
      }}
    >
      {platform.charAt(0).toUpperCase()}
    </div>
  );
};
