import React from 'react';
import {
  AbsoluteFill,
  Img,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

export interface SplitPanel {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  label?: string;
  labelPosition?: 'top' | 'bottom' | 'overlay';
}

export type SplitLayout = 
  | '2-horizontal'
  | '2-vertical'
  | '3-horizontal'
  | '3-vertical'
  | '4-grid'
  | '1-2-horizontal'
  | '2-1-horizontal'
  | '1-2-vertical'
  | '2-1-vertical';

export interface SplitScreenProps {
  panels: SplitPanel[];
  layout: SplitLayout;
  
  dividerStyle: {
    width: number;
    color: string;
    animated: boolean;
  };
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    backgroundOpacity: number;
    padding: number;
  };
  
  transitionType: 'simultaneous' | 'sequential' | 'wipe-left' | 'wipe-right' | 'wipe-down';
  transitionDuration: number;
  staggerDelay: number;
  
  backgroundColor: string;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function calculatePanelPositions(
  layout: SplitLayout,
  width: number,
  height: number,
  dividerWidth: number
): Array<{ x: number; y: number; width: number; height: number }> {
  const gap = dividerWidth;
  
  switch (layout) {
    case '2-horizontal':
      return [
        { x: 0, y: 0, width: (width - gap) / 2, height },
        { x: (width + gap) / 2, y: 0, width: (width - gap) / 2, height },
      ];
      
    case '2-vertical':
      return [
        { x: 0, y: 0, width, height: (height - gap) / 2 },
        { x: 0, y: (height + gap) / 2, width, height: (height - gap) / 2 },
      ];
      
    case '3-horizontal': {
      const thirdWidth = (width - gap * 2) / 3;
      return [
        { x: 0, y: 0, width: thirdWidth, height },
        { x: thirdWidth + gap, y: 0, width: thirdWidth, height },
        { x: (thirdWidth + gap) * 2, y: 0, width: thirdWidth, height },
      ];
    }
      
    case '3-vertical': {
      const thirdHeight = (height - gap * 2) / 3;
      return [
        { x: 0, y: 0, width, height: thirdHeight },
        { x: 0, y: thirdHeight + gap, width, height: thirdHeight },
        { x: 0, y: (thirdHeight + gap) * 2, width, height: thirdHeight },
      ];
    }
      
    case '4-grid': {
      const halfWidth = (width - gap) / 2;
      const halfHeight = (height - gap) / 2;
      return [
        { x: 0, y: 0, width: halfWidth, height: halfHeight },
        { x: halfWidth + gap, y: 0, width: halfWidth, height: halfHeight },
        { x: 0, y: halfHeight + gap, width: halfWidth, height: halfHeight },
        { x: halfWidth + gap, y: halfHeight + gap, width: halfWidth, height: halfHeight },
      ];
    }
      
    case '1-2-horizontal': {
      const twoThirds = (width - gap) * 2 / 3;
      const oneThird = (width - gap) / 3;
      return [
        { x: 0, y: 0, width: twoThirds, height },
        { x: twoThirds + gap, y: 0, width: oneThird, height: (height - gap) / 2 },
        { x: twoThirds + gap, y: (height + gap) / 2, width: oneThird, height: (height - gap) / 2 },
      ];
    }
      
    case '2-1-horizontal': {
      const oneThird = (width - gap) / 3;
      const twoThirds = (width - gap) * 2 / 3;
      return [
        { x: 0, y: 0, width: oneThird, height: (height - gap) / 2 },
        { x: 0, y: (height + gap) / 2, width: oneThird, height: (height - gap) / 2 },
        { x: oneThird + gap, y: 0, width: twoThirds, height },
      ];
    }
      
    case '1-2-vertical': {
      const twoThirds = (height - gap) * 2 / 3;
      const oneThird = (height - gap) / 3;
      return [
        { x: 0, y: 0, width, height: twoThirds },
        { x: 0, y: twoThirds + gap, width: (width - gap) / 2, height: oneThird },
        { x: (width + gap) / 2, y: twoThirds + gap, width: (width - gap) / 2, height: oneThird },
      ];
    }
      
    case '2-1-vertical': {
      const oneThird = (height - gap) / 3;
      const twoThirds = (height - gap) * 2 / 3;
      return [
        { x: 0, y: 0, width: (width - gap) / 2, height: oneThird },
        { x: (width + gap) / 2, y: 0, width: (width - gap) / 2, height: oneThird },
        { x: 0, y: oneThird + gap, width, height: twoThirds },
      ];
    }
      
    default:
      return [{ x: 0, y: 0, width, height }];
  }
}

const Dividers: React.FC<{
  layout: SplitLayout;
  dividerStyle: SplitScreenProps['dividerStyle'];
  width: number;
  height: number;
  frame: number;
  transitionDuration: number;
  exitOpacity: number;
}> = ({ layout, dividerStyle, width, height, frame, transitionDuration, exitOpacity }) => {
  const progress = Math.min(frame / transitionDuration, 1);
  const animatedLength = dividerStyle.animated ? progress : 1;
  
  const getDividers = (): Array<{ x1: number; y1: number; x2: number; y2: number }> => {
    const dividers: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    
    switch (layout) {
      case '2-horizontal':
        dividers.push({ x1: width / 2, y1: 0, x2: width / 2, y2: height });
        break;
      case '2-vertical':
        dividers.push({ x1: 0, y1: height / 2, x2: width, y2: height / 2 });
        break;
      case '3-horizontal': {
        const thirdWidth = width / 3;
        dividers.push({ x1: thirdWidth, y1: 0, x2: thirdWidth, y2: height });
        dividers.push({ x1: thirdWidth * 2, y1: 0, x2: thirdWidth * 2, y2: height });
        break;
      }
      case '3-vertical': {
        const thirdHeight = height / 3;
        dividers.push({ x1: 0, y1: thirdHeight, x2: width, y2: thirdHeight });
        dividers.push({ x1: 0, y1: thirdHeight * 2, x2: width, y2: thirdHeight * 2 });
        break;
      }
      case '4-grid':
        dividers.push({ x1: width / 2, y1: 0, x2: width / 2, y2: height });
        dividers.push({ x1: 0, y1: height / 2, x2: width, y2: height / 2 });
        break;
      case '1-2-horizontal': {
        const twoThirds = width * 2 / 3;
        dividers.push({ x1: twoThirds, y1: 0, x2: twoThirds, y2: height });
        dividers.push({ x1: twoThirds, y1: height / 2, x2: width, y2: height / 2 });
        break;
      }
      case '2-1-horizontal': {
        const oneThird = width / 3;
        dividers.push({ x1: oneThird, y1: 0, x2: oneThird, y2: height });
        dividers.push({ x1: 0, y1: height / 2, x2: oneThird, y2: height / 2 });
        break;
      }
      case '1-2-vertical': {
        const twoThirds = height * 2 / 3;
        dividers.push({ x1: 0, y1: twoThirds, x2: width, y2: twoThirds });
        dividers.push({ x1: width / 2, y1: twoThirds, x2: width / 2, y2: height });
        break;
      }
      case '2-1-vertical': {
        const oneThird = height / 3;
        dividers.push({ x1: 0, y1: oneThird, x2: width, y2: oneThird });
        dividers.push({ x1: width / 2, y1: 0, x2: width / 2, y2: oneThird });
        break;
      }
    }
    
    return dividers;
  };
  
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: exitOpacity }}
    >
      {getDividers().map((d, i) => (
        <line
          key={i}
          x1={d.x1}
          y1={d.y1}
          x2={d.x1 + (d.x2 - d.x1) * animatedLength}
          y2={d.y1 + (d.y2 - d.y1) * animatedLength}
          stroke={dividerStyle.color}
          strokeWidth={dividerStyle.width}
        />
      ))}
    </svg>
  );
};

export const SplitScreen: React.FC<SplitScreenProps> = ({
  panels = [],
  layout = '2-horizontal',
  dividerStyle = { width: 4, color: '#FFFFFF', animated: true },
  labelStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'sans-serif',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    padding: 12,
  },
  transitionType = 'simultaneous',
  transitionDuration = 30,
  staggerDelay = 10,
  backgroundColor = '#000000',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const safeDividerStyle = dividerStyle || { width: 4, color: '#FFFFFF', animated: true };
  const panelConfigs = calculatePanelPositions(layout, width, height, safeDividerStyle.width || 4);
  
  const exitStartFrame = durationInFrames - Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  return (
    <AbsoluteFill style={{ backgroundColor, opacity: exitOpacity }}>
      {panels.map((panel, index) => {
        if (index >= panelConfigs.length) return null;
        
        const config = panelConfigs[index];
        const startFrame = transitionType === 'sequential' ? index * staggerDelay : 0;
        const localFrame = frame - startFrame;
        
        let clipPath = 'none';
        let opacity = 1;
        let transform = '';
        
        if (localFrame < 0) {
          opacity = 0;
          if (transitionType === 'sequential') {
            transform = 'scale(0.9)';
          }
        } else if (localFrame < transitionDuration) {
          const progress = Math.min(localFrame / transitionDuration, 1);
          
          switch (transitionType) {
            case 'wipe-left':
              clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
              break;
            case 'wipe-right':
              clipPath = `inset(0 0 0 ${(1 - progress) * 100}%)`;
              break;
            case 'wipe-down':
              clipPath = `inset(0 0 ${(1 - progress) * 100}% 0)`;
              break;
            case 'sequential':
              opacity = progress;
              transform = `scale(${0.9 + progress * 0.1})`;
              break;
            default:
              opacity = progress;
          }
        } else {
          opacity = 1;
          clipPath = 'none';
          transform = transitionType === 'sequential' ? 'scale(1)' : '';
        }
        
        return (
          <div
            key={index}
            data-testid={`split-panel-${index}`}
            style={{
              position: 'absolute',
              left: config.x,
              top: config.y,
              width: config.width,
              height: config.height,
              overflow: 'hidden',
              clipPath,
              opacity,
              transform,
            }}
          >
            {panel.mediaType === 'video' ? (
              <Video
                src={panel.mediaUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <Img
                src={panel.mediaUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            
            {panel.label && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  ...(panel.labelPosition === 'top' && { top: 0 }),
                  ...((panel.labelPosition === 'bottom' || !panel.labelPosition) && { bottom: 0 }),
                  ...(panel.labelPosition === 'overlay' && { top: '50%', transform: 'translateY(-50%)' }),
                  padding: labelStyle.padding,
                  backgroundColor: `rgba(${hexToRgb(labelStyle.backgroundColor)}, ${labelStyle.backgroundOpacity})`,
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
                  {panel.label}
                </span>
              </div>
            )}
          </div>
        );
      })}
      
      {safeDividerStyle.width > 0 && (
        <Dividers
          layout={layout}
          dividerStyle={safeDividerStyle}
          width={width}
          height={height}
          frame={frame}
          transitionDuration={transitionDuration}
          exitOpacity={exitOpacity}
        />
      )}
    </AbsoluteFill>
  );
};

export default SplitScreen;
