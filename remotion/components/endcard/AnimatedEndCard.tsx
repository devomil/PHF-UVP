import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, spring } from 'remotion';
import { EndCardConfig } from '../../../shared/config/end-card';

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
  
  return (
    <AbsoluteFill>
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
        <LogoReveal
          logoUrl={config.logo.url}
          size={config.logo.size}
          position={config.logo.position}
          animation={config.logo.animation}
          startFrame={Math.round(0.3 * fps)}
          fps={fps}
          width={width}
        />
      )}
      
      {config.tagline && (
        <TaglineReveal
          text={config.tagline.text}
          style={config.tagline.style}
          animation={config.tagline.animation}
          startFrame={Math.round(config.tagline.delay * fps)}
          fps={fps}
        />
      )}
      
      <ContactReveal
        website={config.contact.website}
        phone={config.contact.phone}
        email={config.contact.email}
        style={config.contact.style}
        animation={config.contact.animation}
        startFrame={Math.round(config.contact.delay * fps)}
        fps={fps}
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

const LogoReveal: React.FC<{
  logoUrl: string;
  size: number;
  position: { x: number; y: number };
  animation: string;
  startFrame: number;
  fps: number;
  width: number;
}> = ({ logoUrl, size, position, animation, startFrame, fps, width }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  const logoWidth = (size / 100) * width;
  
  const scale = animation === 'scale-bounce' 
    ? spring({
        frame: localFrame,
        fps,
        config: { stiffness: 200, damping: 15, mass: 1 },
        from: 0,
        to: 1,
      })
    : interpolate(localFrame, [0, fps * 0.5], [0.8, 1], { extrapolateRight: 'clamp' });
  
  const opacity = interpolate(localFrame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
  
  const shinePosition = interpolate(
    localFrame, 
    [fps * 0.5, fps * 1.5], 
    [-50, 150], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const translateY = animation === 'slide-up'
    ? interpolate(localFrame, [0, fps * 0.5], [50, 0], { extrapolateRight: 'clamp' })
    : 0;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) translateY(${translateY}px)`,
        opacity,
      }}
    >
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Img
          src={logoUrl}
          style={{
            width: logoWidth,
            height: 'auto',
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
  style: { fontSize: number; fontFamily: string; color: string };
  animation: string;
  startFrame: number;
  fps: number;
}> = ({ text, style, animation, startFrame, fps }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  const charsToShow = animation === 'typewriter'
    ? Math.floor(interpolate(localFrame, [0, fps * 1.5], [0, text.length], { extrapolateRight: 'clamp' }))
    : text.length;
  
  const opacity = animation !== 'typewriter'
    ? interpolate(localFrame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  
  const displayText = text.substring(0, charsToShow);
  const showCursor = animation === 'typewriter' && charsToShow < text.length;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '52%',
        transform: 'translateX(-50%)',
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        color: style.color,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {displayText}
      {showCursor && (
        <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0 }}>|</span>
      )}
    </div>
  );
};

const ContactReveal: React.FC<{
  website?: string;
  phone?: string;
  email?: string;
  style: { fontSize: number; color: string };
  animation: string;
  startFrame: number;
  fps: number;
}> = ({ website, phone, email, style, animation, startFrame, fps }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  
  if (localFrame < 0) return null;
  
  const items = [website, phone, email].filter(Boolean) as string[];
  
  if (items.length === 0) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {items.map((item, index) => {
        const itemDelay = animation === 'stagger' ? index * fps * 0.12 : 0;
        const itemFrame = localFrame - itemDelay;
        
        const opacity = interpolate(itemFrame, [0, fps * 0.4], [0, 1], { 
          extrapolateLeft: 'clamp', 
          extrapolateRight: 'clamp' 
        });
        
        const translateY = animation === 'slide-up'
          ? interpolate(itemFrame, [0, fps * 0.4], [30, 0], { 
              extrapolateLeft: 'clamp', 
              extrapolateRight: 'clamp' 
            })
          : 0;
        
        return (
          <div
            key={index}
            style={{
              fontSize: style.fontSize,
              color: style.color,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              opacity,
              transform: `translateY(${translateY}px)`,
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
