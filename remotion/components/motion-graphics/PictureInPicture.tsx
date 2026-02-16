import React from 'react';
import {
  AbsoluteFill,
  Img,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface PictureInPictureProps {
  mainMedia: {
    url: string;
    type: 'image' | 'video';
  };
  pipMedia: {
    url: string;
    type: 'image' | 'video';
    label?: string;
  };
  
  pipPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  pipSize: number;
  pipMargin: number;
  
  pipStyle: {
    borderWidth: number;
    borderColor: string;
    borderRadius: number;
    shadow: boolean;
  };
  
  labelStyle?: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
  };
  
  pipEntranceFrame: number;
  pipEntranceDuration: number;
  pipEntranceStyle: 'fade' | 'scale' | 'slide';
  
  backgroundColor: string;
}

export const PictureInPicture: React.FC<PictureInPictureProps> = ({
  mainMedia,
  pipMedia,
  pipPosition,
  pipSize,
  pipMargin,
  pipStyle,
  labelStyle,
  pipEntranceFrame,
  pipEntranceDuration,
  pipEntranceStyle,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const pipWidth = width * (pipSize / 100);
  const pipHeight = pipWidth * (9 / 16);
  
  const pipPositionStyles: React.CSSProperties = {
    position: 'absolute',
    width: pipWidth,
    height: pipHeight,
  };
  
  switch (pipPosition) {
    case 'top-left':
      pipPositionStyles.top = pipMargin;
      pipPositionStyles.left = pipMargin;
      break;
    case 'top-right':
      pipPositionStyles.top = pipMargin;
      pipPositionStyles.right = pipMargin;
      break;
    case 'bottom-left':
      pipPositionStyles.bottom = pipMargin;
      pipPositionStyles.left = pipMargin;
      break;
    case 'bottom-right':
      pipPositionStyles.bottom = pipMargin;
      pipPositionStyles.right = pipMargin;
      break;
  }
  
  const pipLocalFrame = frame - pipEntranceFrame;
  let pipOpacity = 0;
  let pipTransform = '';
  
  if (pipLocalFrame >= 0) {
    const progress = Math.min(pipLocalFrame / pipEntranceDuration, 1);
    const springProgress = spring({
      frame: pipLocalFrame,
      fps,
      config: { damping: 15, stiffness: 200 },
    });
    
    switch (pipEntranceStyle) {
      case 'fade':
        pipOpacity = progress;
        break;
      case 'scale':
        pipOpacity = progress;
        pipTransform = `scale(${Math.min(springProgress, 1)})`;
        break;
      case 'slide':
        pipOpacity = progress;
        const slideOffset = (1 - Math.min(springProgress, 1)) * 50;
        if (pipPosition.includes('right')) {
          pipTransform = `translateX(${slideOffset}px)`;
        } else {
          pipTransform = `translateX(${-slideOffset}px)`;
        }
        break;
    }
  }
  
  const exitStartFrame = durationInFrames - Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const renderMedia = (media: typeof mainMedia, style?: React.CSSProperties) => {
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
  
  return (
    <AbsoluteFill style={{ backgroundColor, opacity: exitOpacity }}>
      <AbsoluteFill data-testid="main-media">
        {renderMedia(mainMedia)}
      </AbsoluteFill>
      
      <div
        data-testid="pip-overlay"
        style={{
          ...pipPositionStyles,
          opacity: pipOpacity,
          transform: pipTransform,
          border: `${pipStyle.borderWidth}px solid ${pipStyle.borderColor}`,
          borderRadius: pipStyle.borderRadius,
          overflow: 'hidden',
          boxShadow: pipStyle.shadow ? '0 4px 20px rgba(0,0,0,0.3)' : 'none',
        }}
      >
        {renderMedia(pipMedia)}
        
        {pipMedia.label && labelStyle && (
          <div
            data-testid="pip-label"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '6px 10px',
              backgroundColor: labelStyle.backgroundColor,
              textAlign: 'center',
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
              {pipMedia.label}
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default PictureInPicture;
