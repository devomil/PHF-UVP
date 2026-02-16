import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
} from 'remotion';

export interface TransformationStep {
  label: string;
  description?: string;
  imageUrl?: string;
  iconElement?: React.ReactNode;
  color?: string;
}

export interface TransformationSequenceProps {
  steps: TransformationStep[];
  transitionType: 'morph' | 'fade' | 'slide' | 'flip' | 'zoom';
  
  stepDuration: number;
  transitionDuration: number;
  holdDuration: number;
  
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  labelColor: string;
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  descriptionStyle?: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  showProgressIndicator: boolean;
  showStepNumbers: boolean;
  showArrows: boolean;
  
  containerPadding?: number;
  stepSize?: number;
}

const ArrowIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const MorphTransition: React.FC<{
  from: TransformationStep;
  to: TransformationStep;
  progress: number;
  size: number;
  labelStyle: TransformationSequenceProps['labelStyle'];
  labelColor: string;
  primaryColor: string;
}> = ({ from, to, progress, size, labelStyle, labelColor, primaryColor }) => {
  const fromOpacity = interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: 'clamp' });
  const toOpacity = interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp' });
  const scale = interpolate(progress, [0, 0.5, 1], [1, 0.8, 1], { extrapolateRight: 'clamp' });
  
  return (
    <div style={{ position: 'relative', width: size, height: size, transform: `scale(${scale})` }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fromOpacity,
      }}>
        <div style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: '50%',
          backgroundColor: from.color || primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {from.imageUrl ? (
            <Img src={from.imageUrl} style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : from.iconElement}
        </div>
        <div style={{ ...labelStyle, color: labelColor, marginTop: 16, textAlign: 'center' }}>
          {from.label}
        </div>
      </div>
      
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: toOpacity,
      }}>
        <div style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: '50%',
          backgroundColor: to.color || primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {to.imageUrl ? (
            <Img src={to.imageUrl} style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : to.iconElement}
        </div>
        <div style={{ ...labelStyle, color: labelColor, marginTop: 16, textAlign: 'center' }}>
          {to.label}
        </div>
      </div>
    </div>
  );
};

const SlideTransition: React.FC<{
  from: TransformationStep;
  to: TransformationStep;
  progress: number;
  size: number;
  labelStyle: TransformationSequenceProps['labelStyle'];
  labelColor: string;
  primaryColor: string;
}> = ({ from, to, progress, size, labelStyle, labelColor, primaryColor }) => {
  const fromX = interpolate(progress, [0, 1], [0, -size], { extrapolateRight: 'clamp' });
  const toX = interpolate(progress, [0, 1], [size, 0], { extrapolateLeft: 'clamp' });
  
  return (
    <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateX(${fromX}px)`,
      }}>
        <div style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: '50%',
          backgroundColor: from.color || primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {from.imageUrl ? (
            <Img src={from.imageUrl} style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : from.iconElement}
        </div>
        <div style={{ ...labelStyle, color: labelColor, marginTop: 16, textAlign: 'center' }}>
          {from.label}
        </div>
      </div>
      
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateX(${toX}px)`,
      }}>
        <div style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: '50%',
          backgroundColor: to.color || primaryColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {to.imageUrl ? (
            <Img src={to.imageUrl} style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : to.iconElement}
        </div>
        <div style={{ ...labelStyle, color: labelColor, marginTop: 16, textAlign: 'center' }}>
          {to.label}
        </div>
      </div>
    </div>
  );
};

export const TransformationSequence: React.FC<TransformationSequenceProps> = ({
  steps,
  transitionType,
  stepDuration,
  transitionDuration,
  holdDuration,
  primaryColor,
  secondaryColor,
  backgroundColor,
  labelColor,
  labelStyle,
  descriptionStyle = { fontSize: 16, fontWeight: 400, fontFamily: 'Inter, sans-serif' },
  showProgressIndicator,
  showStepNumbers,
  showArrows,
  containerPadding = 60,
  stepSize = 200,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const cycleDuration = stepDuration + transitionDuration;
  const totalCycles = steps.length - 1;
  
  const currentCycle = Math.floor(frame / cycleDuration);
  const cycleFrame = frame % cycleDuration;
  
  const currentStepIndex = Math.min(currentCycle, steps.length - 1);
  const nextStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);
  
  const isTransitioning = cycleFrame >= stepDuration && currentStepIndex < steps.length - 1;
  const transitionProgress = isTransitioning 
    ? (cycleFrame - stepDuration) / transitionDuration 
    : 0;
  
  const currentStep = steps[currentStepIndex];
  const nextStep = steps[nextStepIndex];
  
  const totalDurationNeeded = (steps.length - 1) * cycleDuration + holdDuration;
  const exitStartFrame = totalDurationNeeded;
  const exitDuration = Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const entranceOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <AbsoluteFill style={{ backgroundColor, padding: containerPadding, opacity: exitOpacity * entranceOpacity }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        {showProgressIndicator && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
            {steps.map((_, index) => (
              <React.Fragment key={index}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: index <= currentStepIndex ? primaryColor : secondaryColor,
                  transition: 'background-color 0.3s',
                }} />
                {index < steps.length - 1 && showArrows && (
                  <ArrowIcon color={index < currentStepIndex ? primaryColor : secondaryColor} size={16} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          {isTransitioning ? (
            transitionType === 'slide' ? (
              <SlideTransition
                from={currentStep}
                to={nextStep}
                progress={transitionProgress}
                size={stepSize}
                labelStyle={labelStyle}
                labelColor={labelColor}
                primaryColor={primaryColor}
              />
            ) : (
              <MorphTransition
                from={currentStep}
                to={nextStep}
                progress={transitionProgress}
                size={stepSize}
                labelStyle={labelStyle}
                labelColor={labelColor}
                primaryColor={primaryColor}
              />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: stepSize * 0.6,
                height: stepSize * 0.6,
                borderRadius: '50%',
                backgroundColor: currentStep.color || primaryColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}>
                {showStepNumbers && (
                  <div style={{
                    position: 'absolute',
                    top: -10,
                    right: -10,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: secondaryColor,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                  }}>
                    {currentStepIndex + 1}
                  </div>
                )}
                {currentStep.imageUrl ? (
                  <Img src={currentStep.imageUrl} style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : currentStep.iconElement}
              </div>
              <div style={{ ...labelStyle, color: labelColor, marginTop: 24, textAlign: 'center' }}>
                {currentStep.label}
              </div>
              {currentStep.description && (
                <div style={{ ...descriptionStyle, color: labelColor, marginTop: 12, textAlign: 'center', maxWidth: 400, opacity: 0.8 }}>
                  {currentStep.description}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default TransformationSequence;
