import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export type LogoIntroTemplate = 'classic-glow' | 'minimal' | 'cinematic' | 'elegant-fade';

interface LogoIntroProps {
  logoUrl: string;
  backgroundColor: string;
  animation: 'fade' | 'zoom' | 'slide-up' | 'none';
  duration: number;
  tagline?: string;
  position?: 'center' | 'lower-third';
  template?: LogoIntroTemplate;
  backgroundImageUrl?: string;
  logoScale?: number;
}

export const LogoIntro: React.FC<LogoIntroProps> = ({
  logoUrl,
  backgroundColor,
  animation,
  duration,
  tagline,
  position = 'center',
  template = 'classic-glow',
  backgroundImageUrl,
  logoScale = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationFrames = duration * fps;

  const fadeIn = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(
    frame,
    [durationFrames - fps * 0.6, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  let scale = 1;
  let translateY = 0;

  if (animation === 'zoom') {
    scale = spring({
      frame,
      fps,
      config: { damping: 12, stiffness: 100 },
    });
  } else if (animation === 'slide-up') {
    translateY = interpolate(frame, [0, fps * 0.5], [80, 0], {
      extrapolateRight: 'clamp',
    });
  }

  const isLowerThird = position === 'lower-third';

  switch (template) {
    case 'minimal':
      return (
        <MinimalIntro
          logoUrl={logoUrl}
          backgroundColor={backgroundColor}
          tagline={tagline}
          opacity={opacity}
          scale={scale}
          translateY={translateY}
          frame={frame}
          fps={fps}
          width={width}
          height={height}
          isLowerThird={isLowerThird}
          logoScale={logoScale}
        />
      );
    case 'cinematic':
      return (
        <CinematicIntro
          logoUrl={logoUrl}
          backgroundColor={backgroundColor}
          backgroundImageUrl={backgroundImageUrl}
          tagline={tagline}
          opacity={opacity}
          scale={scale}
          translateY={translateY}
          frame={frame}
          fps={fps}
          width={width}
          height={height}
          durationFrames={durationFrames}
          isLowerThird={isLowerThird}
          logoScale={logoScale}
        />
      );
    case 'elegant-fade':
      return (
        <ElegantFadeIntro
          logoUrl={logoUrl}
          backgroundColor={backgroundColor}
          tagline={tagline}
          opacity={opacity}
          scale={scale}
          translateY={translateY}
          frame={frame}
          fps={fps}
          width={width}
          height={height}
          durationFrames={durationFrames}
          isLowerThird={isLowerThird}
          logoScale={logoScale}
        />
      );
    case 'classic-glow':
    default:
      return (
        <ClassicGlowIntro
          logoUrl={logoUrl}
          backgroundColor={backgroundColor}
          tagline={tagline}
          opacity={opacity}
          scale={scale}
          translateY={translateY}
          frame={frame}
          fps={fps}
          width={width}
          height={height}
          isLowerThird={isLowerThird}
          logoScale={logoScale}
        />
      );
  }
};

interface TemplateBaseProps {
  logoUrl: string;
  backgroundColor: string;
  tagline?: string;
  opacity: number;
  scale: number;
  translateY: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  isLowerThird: boolean;
  logoScale: number;
}

const ClassicGlowIntro: React.FC<TemplateBaseProps> = ({
  logoUrl,
  backgroundColor,
  tagline,
  opacity,
  scale,
  translateY,
  frame,
  fps,
  width,
  height,
  isLowerThird,
  logoScale,
}) => {
  const glowPulse = 0.35 + Math.sin(frame * 0.04) * 0.1;
  const baseLogoWidth = isLowerThird ? width * 0.4 : width * 0.55;
  const logoWidth = baseLogoWidth * logoScale;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${lightenColor(backgroundColor, 0.15)} 0%, ${backgroundColor} 60%, ${darkenColor(backgroundColor, 0.3)} 100%)`,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isLowerThird ? 'flex-end' : 'center',
          paddingBottom: isLowerThird ? height * 0.1 : 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: width * 0.5,
            height: width * 0.5,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,${glowPulse}) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)`,
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 1,
            gap: isLowerThird ? 16 : 24,
          }}
        >
          <Img
            src={logoUrl}
            style={{
              width: logoWidth,
              maxHeight: isLowerThird ? height * 0.35 : height * 0.4,
              objectFit: 'contain',
              transform: `scale(${scale}) translateY(${translateY}px)`,
              filter: isDarkBackground(backgroundColor)
                ? 'brightness(0) invert(1) drop-shadow(0 0 30px rgba(255,255,255,0.25)) drop-shadow(0 6px 16px rgba(0,0,0,0.5))'
                : 'drop-shadow(0 0 30px rgba(255,255,255,0.25)) drop-shadow(0 6px 16px rgba(0,0,0,0.5))',
            }}
          />

          {tagline && (
            <p
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: isLowerThird ? Math.round(height * 0.035) : Math.round(height * 0.045),
                fontStyle: 'italic',
                fontWeight: 300,
                letterSpacing: 4,
                textShadow: '0 2px 10px rgba(0,0,0,0.6), 0 0 30px rgba(255,255,255,0.1)',
                opacity: interpolate(frame, [fps * 0.5, fps * 1.0], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${interpolate(frame, [fps * 0.5, fps * 1.0], [20, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}px)`,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {tagline}
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '25%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.25) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const MinimalIntro: React.FC<TemplateBaseProps> = ({
  logoUrl,
  backgroundColor,
  tagline,
  opacity,
  scale,
  translateY,
  frame,
  fps,
  width,
  height,
  isLowerThird,
  logoScale,
}) => {
  const baseLogoWidth = isLowerThird ? width * 0.35 : width * 0.45;
  const logoWidth = baseLogoWidth * logoScale;

  const lineWidth = interpolate(frame, [fps * 0.3, fps * 1.0], [0, width * 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: backgroundColor,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isLowerThird ? 'flex-end' : 'center',
          paddingBottom: isLowerThird ? height * 0.12 : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <Img
            src={logoUrl}
            style={{
              width: logoWidth,
              maxHeight: isLowerThird ? height * 0.3 : height * 0.35,
              objectFit: 'contain',
              transform: `scale(${scale}) translateY(${translateY}px)`,
              filter: isDarkBackground(backgroundColor)
                ? 'brightness(0) invert(1) drop-shadow(0 4px 12px rgba(255,255,255,0.15))'
                : 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))',
            }}
          />

          <div
            style={{
              width: lineWidth,
              height: 1,
              backgroundColor: isDarkBackground(backgroundColor) ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
            }}
          />

          {tagline && (
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: Math.round(height * 0.032),
                fontWeight: 300,
                letterSpacing: 6,
                textTransform: 'uppercase',
                opacity: interpolate(frame, [fps * 0.6, fps * 1.0], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                margin: 0,
                textAlign: 'center',
              }}
            >
              {tagline}
            </p>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

interface CinematicIntroProps extends TemplateBaseProps {
  backgroundImageUrl?: string;
  durationFrames: number;
}

const CinematicIntro: React.FC<CinematicIntroProps> = ({
  logoUrl,
  backgroundColor,
  backgroundImageUrl,
  tagline,
  opacity,
  scale,
  translateY,
  frame,
  fps,
  width,
  height,
  durationFrames,
  isLowerThird,
  logoScale,
}) => {
  const baseLogoWidth = isLowerThird ? width * 0.4 : width * 0.5;
  const logoWidth = baseLogoWidth * logoScale;

  const kenBurnsScale = interpolate(frame, [0, durationFrames], [1.05, 1.15], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      {backgroundImageUrl ? (
        <AbsoluteFill>
          <Img
            src={backgroundImageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${kenBurnsScale})`,
            }}
          />
          <AbsoluteFill
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.85) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, ${lightenColor(backgroundColor, 0.1)} 0%, ${backgroundColor} 40%, ${darkenColor(backgroundColor, 0.4)} 100%)`,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isLowerThird ? 'flex-end' : 'center',
          paddingBottom: isLowerThird ? height * 0.12 : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 30,
          }}
        >
          <Img
            src={logoUrl}
            style={{
              width: logoWidth,
              maxHeight: height * 0.4,
              objectFit: 'contain',
              transform: `scale(${scale}) translateY(${translateY}px)`,
              filter: 'drop-shadow(0 0 40px rgba(255,255,255,0.2)) drop-shadow(0 8px 24px rgba(0,0,0,0.6))',
            }}
          />

          {tagline && (
            <p
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: Math.round(height * 0.04),
                fontStyle: 'italic',
                fontWeight: 300,
                letterSpacing: 3,
                textShadow: '0 3px 12px rgba(0,0,0,0.7)',
                opacity: interpolate(frame, [fps * 0.6, fps * 1.2], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${interpolate(frame, [fps * 0.6, fps * 1.2], [25, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })}px)`,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {tagline}
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)`,
          opacity: interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)`,
          opacity: interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
    </AbsoluteFill>
  );
};

interface ElegantFadeIntroProps extends TemplateBaseProps {
  durationFrames: number;
}

const ElegantFadeIntro: React.FC<ElegantFadeIntroProps> = ({
  logoUrl,
  backgroundColor,
  tagline,
  opacity,
  scale,
  translateY,
  frame,
  fps,
  width,
  height,
  durationFrames,
  isLowerThird,
  logoScale,
}) => {
  const baseLogoWidth = isLowerThird ? width * 0.4 : width * 0.5;
  const logoWidth = baseLogoWidth * logoScale;

  const shimmerX = interpolate(frame, [0, durationFrames], [-width * 0.5, width * 1.5], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${darkenColor(backgroundColor, 0.2)} 0%, ${backgroundColor} 50%, ${darkenColor(backgroundColor, 0.15)} 100%)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)`,
          transform: `translateX(${shimmerX}px)`,
          width: width * 0.5,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isLowerThird ? 'flex-end' : 'center',
          paddingBottom: isLowerThird ? height * 0.12 : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
          }}
        >
          <div
            style={{
              opacity: interpolate(frame, [fps * 0.2, fps * 0.7], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            <Img
              src={logoUrl}
              style={{
                width: logoWidth,
                maxHeight: height * 0.38,
                objectFit: 'contain',
                transform: `scale(${scale}) translateY(${translateY}px)`,
                filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))',
              }}
            />
          </div>

          {tagline && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: interpolate(frame, [fps * 0.7, fps * 1.2], [0, 40], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.4)',
                }}
              />
              <p
                style={{
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: Math.round(height * 0.035),
                  fontWeight: 300,
                  letterSpacing: 5,
                  opacity: interpolate(frame, [fps * 0.7, fps * 1.2], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  margin: 0,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {tagline}
              </p>
              <div
                style={{
                  width: interpolate(frame, [fps * 0.7, fps * 1.2], [0, 40], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.4)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

function isDarkBackground(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.4;
}

function lightenColor(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.min(255, parseInt(result[1], 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(result[2], 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(result[3], 16) + Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function darkenColor(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.max(0, parseInt(result[1], 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(result[2], 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(result[3], 16) - Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}
