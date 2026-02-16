import React from 'react';
import {
  AbsoluteFill,
  Img,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

export interface BeforeAfterProps {
  beforeMedia: {
    url: string;
    type: 'image' | 'video';
    label: string;
  };
  afterMedia: {
    url: string;
    type: 'image' | 'video';
    label: string;
  };
  
  transitionStyle: 'slider' | 'fade' | 'wipe' | 'flip';
  
  sliderConfig?: {
    startPosition: number;
    endPosition: number;
    handleColor: string;
    handleWidth: number;
  };
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    backgroundOpacity: number;
  };
  
  transitionStartFrame: number;
  transitionDuration: number;
  holdBeforeFrames: number;
  holdAfterFrames: number;
  
  backgroundColor: string;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

export const BeforeAfter: React.FC<BeforeAfterProps> = ({
  beforeMedia,
  afterMedia,
  transitionStyle,
  sliderConfig = {
    startPosition: 100,
    endPosition: 0,
    handleColor: '#FFFFFF',
    handleWidth: 6,
  },
  labelStyle,
  transitionStartFrame,
  transitionDuration,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const transitionProgress = interpolate(
    frame,
    [transitionStartFrame, transitionStartFrame + transitionDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const exitStartFrame = durationInFrames - Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const renderMedia = (media: typeof beforeMedia, style?: React.CSSProperties) => {
    if (media.type === 'video') {
      return (
        <Video
          src={media.url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...style,
          }}
        />
      );
    }
    return (
      <Img
        src={media.url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          ...style,
        }}
      />
    );
  };
  
  const renderLabel = (label: string, position: 'left' | 'right') => (
    <div
      data-testid={`label-${position}`}
      style={{
        position: 'absolute',
        top: 20,
        [position]: 20,
        padding: '8px 16px',
        backgroundColor: `rgba(${hexToRgb(labelStyle.backgroundColor)}, ${labelStyle.backgroundOpacity})`,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontSize: labelStyle.fontSize,
          fontWeight: labelStyle.fontWeight,
          fontFamily: labelStyle.fontFamily,
          color: labelStyle.color,
        }}
      >
        {label}
      </span>
    </div>
  );
  
  const sliderPosition = interpolate(
    transitionProgress,
    [0, 1],
    [sliderConfig.startPosition, sliderConfig.endPosition]
  );
  
  return (
    <AbsoluteFill style={{ backgroundColor, opacity: exitOpacity }}>
      {transitionStyle === 'slider' && (
        <>
          <AbsoluteFill data-testid="before-media">
            {renderMedia(beforeMedia)}
            {renderLabel(beforeMedia.label, 'left')}
          </AbsoluteFill>
          
          <div
            data-testid="after-media"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              clipPath: `inset(0 0 0 ${sliderPosition}%)`,
            }}
          >
            {renderMedia(afterMedia)}
            {renderLabel(afterMedia.label, 'right')}
          </div>
          
          <div
            data-testid="slider-handle"
            style={{
              position: 'absolute',
              top: 0,
              left: `${sliderPosition}%`,
              width: sliderConfig.handleWidth,
              height: '100%',
              backgroundColor: sliderConfig.handleColor,
              transform: 'translateX(-50%)',
              boxShadow: '0 0 10px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: sliderConfig.handleColor,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 2, height: 16, backgroundColor: '#666' }} />
                <div style={{ width: 2, height: 16, backgroundColor: '#666' }} />
              </div>
            </div>
          </div>
        </>
      )}
      
      {transitionStyle === 'fade' && (
        <>
          <AbsoluteFill data-testid="before-media" style={{ opacity: 1 - transitionProgress }}>
            {renderMedia(beforeMedia)}
            {renderLabel(beforeMedia.label, 'left')}
          </AbsoluteFill>
          <AbsoluteFill data-testid="after-media" style={{ opacity: transitionProgress }}>
            {renderMedia(afterMedia)}
            {renderLabel(afterMedia.label, 'right')}
          </AbsoluteFill>
        </>
      )}
      
      {transitionStyle === 'wipe' && (
        <>
          <AbsoluteFill data-testid="before-media">
            {renderMedia(beforeMedia)}
            {renderLabel(beforeMedia.label, 'left')}
          </AbsoluteFill>
          <div
            data-testid="after-media"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              clipPath: `inset(0 ${100 - transitionProgress * 100}% 0 0)`,
            }}
          >
            {renderMedia(afterMedia)}
            {renderLabel(afterMedia.label, 'right')}
          </div>
        </>
      )}
      
      {transitionStyle === 'flip' && (
        <div
          style={{
            width: '100%',
            height: '100%',
            perspective: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: `rotateY(${transitionProgress * 180}deg)`,
            }}
          >
            <AbsoluteFill
              data-testid="before-media"
              style={{
                backfaceVisibility: 'hidden',
              }}
            >
              {renderMedia(beforeMedia)}
              {renderLabel(beforeMedia.label, 'left')}
            </AbsoluteFill>
            
            <AbsoluteFill
              data-testid="after-media"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              {renderMedia(afterMedia)}
              {renderLabel(afterMedia.label, 'right')}
            </AbsoluteFill>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default BeforeAfter;
