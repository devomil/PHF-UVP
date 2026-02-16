import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface ProcessStep {
  title: string;
  description?: string;
  icon?: string;
}

export interface ProcessFlowProps {
  steps: ProcessStep[];
  layout: 'horizontal' | 'vertical';
  stepStyle: {
    shape: 'circle' | 'square' | 'rounded';
    size: number;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    textColor: string;
  };
  connectorStyle: { type: 'line' | 'arrow' | 'dotted'; color: string; width: number };
  titleStyle: { fontSize: number; fontWeight: string | number; fontFamily: string; color: string };
  descriptionStyle: { fontSize: number; fontWeight: string | number; fontFamily: string; color: string };
  animationType: 'sequential' | 'simultaneous';
  stepDuration: number;
  stepSpacing: number;
  showNumbers: boolean;
  holdDuration?: number;
}

export const ProcessFlow: React.FC<ProcessFlowProps> = ({
  steps,
  layout,
  stepStyle,
  connectorStyle,
  titleStyle,
  descriptionStyle,
  animationType,
  stepDuration,
  stepSpacing,
  showNumbers,
  holdDuration = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  const totalAnimationTime = animationType === 'simultaneous' 
    ? stepDuration 
    : steps.length * stepDuration;
  const exitStartFrame = totalAnimationTime + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const getShapeRadius = () => {
    switch (stepStyle.shape) {
      case 'circle': return '50%';
      case 'rounded': return stepStyle.size * 0.2;
      default: return 0;
    }
  };
  
  const renderConnector = (index: number, progress: number) => {
    if (index >= steps.length - 1) return null;
    
    const connectorLength = 60;
    const isHorizontal = layout === 'horizontal';
    
    const baseStyle: React.CSSProperties = {
      backgroundColor: connectorStyle.type === 'dotted' ? 'transparent' : connectorStyle.color,
      borderStyle: connectorStyle.type === 'dotted' ? 'dotted' : 'solid',
      borderColor: connectorStyle.color,
      opacity: progress,
    };
    
    if (isHorizontal) {
      return (
        <div style={{
          ...baseStyle,
          width: connectorLength * progress,
          height: connectorStyle.width,
          borderWidth: connectorStyle.type === 'dotted' ? connectorStyle.width : 0,
          position: 'relative',
        }}>
          {connectorStyle.type === 'arrow' && progress > 0.8 && (
            <div style={{
              position: 'absolute',
              right: -8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderLeft: `10px solid ${connectorStyle.color}`,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
            }} />
          )}
        </div>
      );
    }
    
    return (
      <div style={{
        ...baseStyle,
        width: connectorStyle.width,
        height: connectorLength * progress,
        borderWidth: connectorStyle.type === 'dotted' ? connectorStyle.width : 0,
        position: 'relative',
      }}>
        {connectorStyle.type === 'arrow' && progress > 0.8 && (
          <div style={{
            position: 'absolute',
            bottom: -8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderTop: `10px solid ${connectorStyle.color}`,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
          }} />
        )}
      </div>
    );
  };
  
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '8%', opacity: exitOpacity }}>
      <div style={{
        display: 'flex',
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        alignItems: 'center',
        gap: stepSpacing,
      }}>
        {steps.map((step, index) => {
          const startFrame = animationType === 'simultaneous' ? 0 : index * stepDuration;
          const localFrame = frame - startFrame;
          
          const progress = localFrame < 0 ? 0 : Math.min(localFrame / 20, 1);
          const springProgress = localFrame >= 0 ? spring({
            frame: localFrame, fps, config: { damping: 12, stiffness: 200 },
          }) : 0;
          
          return (
            <React.Fragment key={index}>
              <div style={{
                display: 'flex',
                flexDirection: layout === 'horizontal' ? 'column' : 'row',
                alignItems: 'center',
                gap: 12,
                opacity: progress,
                transform: `scale(${0.5 + Math.min(springProgress, 1) * 0.5})`,
              }}>
                <div style={{
                  width: stepStyle.size,
                  height: stepStyle.size,
                  backgroundColor: stepStyle.backgroundColor,
                  border: `${stepStyle.borderWidth}px solid ${stepStyle.borderColor}`,
                  borderRadius: getShapeRadius(),
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: stepStyle.size * 0.4,
                  color: stepStyle.textColor,
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}>
                  {step.icon || (showNumbers ? index + 1 : '')}
                </div>
                <div style={{ textAlign: layout === 'horizontal' ? 'center' : 'left', maxWidth: 150 }}>
                  <div style={{ ...titleStyle }}>{step.title}</div>
                  {step.description && (
                    <div style={{ ...descriptionStyle, marginTop: 4 }}>{step.description}</div>
                  )}
                </div>
              </div>
              
              {renderConnector(index, progress)}
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export default ProcessFlow;
