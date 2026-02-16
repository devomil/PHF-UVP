import { useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedLightLeak } from './LightLeak';
import { FilmBurnTransition } from './FilmBurn';
import { WhipPanTransition } from './WhipPan';
import { ElegantDissolve } from './ElegantDissolve';

export type TransitionType = 
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'elegant-dissolve'
  | 'light-leak'
  | 'light-leak-golden'
  | 'light-leak-warm'
  | 'film-burn'
  | 'film-burn-classic'
  | 'whip-pan'
  | 'whip-pan-left'
  | 'whip-pan-up'
  | 'whip-pan-down';

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
}

interface TransitionManagerProps {
  transition: TransitionConfig;
  fromContent: React.ReactNode;
  toContent: React.ReactNode;
  startFrame: number;
}

export const TransitionManager: React.FC<TransitionManagerProps> = ({
  transition,
  fromContent,
  toContent,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const transitionDuration = Math.max(1, Math.round(transition.duration * fps));
  const relativeFrame = frame - startFrame;
  
  if (transition.type === 'cut' || transition.duration <= 0) {
    return <>{relativeFrame < 0 ? fromContent : toContent}</>;
  }
  
  const progress = Math.min(1, Math.max(0, relativeFrame / transitionDuration));
  const isInTransition = relativeFrame >= 0 && relativeFrame <= transitionDuration;

  if (!isInTransition) {
    return <>{relativeFrame < 0 ? fromContent : toContent}</>;
  }

  switch (transition.type) {

    case 'fade':
    case 'dissolve':
      return (
        <ElegantDissolve
          durationInFrames={transitionDuration}
          fromContent={fromContent}
          toContent={toContent}
          easing="ease-in-out"
          scaleEffect={false}
        />
      );

    case 'elegant-dissolve':
      return (
        <ElegantDissolve
          durationInFrames={transitionDuration}
          fromContent={fromContent}
          toContent={toContent}
          easing="exponential"
          scaleEffect={true}
        />
      );

    case 'light-leak':
    case 'light-leak-warm':
      return (
        <>
          <ElegantDissolve
            durationInFrames={transitionDuration}
            fromContent={fromContent}
            toContent={toContent}
            easing="ease-in-out"
          />
          <AnimatedLightLeak
            durationInFrames={transitionDuration}
            style="warm"
            direction="corner"
            intensity={0.9}
          />
        </>
      );

    case 'light-leak-golden':
      return (
        <>
          <ElegantDissolve
            durationInFrames={transitionDuration}
            fromContent={fromContent}
            toContent={toContent}
            easing="ease-in-out"
          />
          <AnimatedLightLeak
            durationInFrames={transitionDuration}
            style="golden"
            direction="corner"
            intensity={0.85}
          />
        </>
      );

    case 'film-burn':
    case 'film-burn-classic':
      return (
        <FilmBurnTransition
          durationInFrames={transitionDuration}
          style={transition.type === 'film-burn-classic' ? 'classic' : 'warm'}
          outgoingContent={fromContent}
          incomingContent={toContent}
        />
      );

    case 'whip-pan':
      return (
        <WhipPanTransition
          durationInFrames={transitionDuration}
          direction="right"
          outgoingContent={fromContent}
          incomingContent={toContent}
        />
      );

    case 'whip-pan-left':
      return (
        <WhipPanTransition
          durationInFrames={transitionDuration}
          direction="left"
          outgoingContent={fromContent}
          incomingContent={toContent}
        />
      );

    case 'whip-pan-up':
      return (
        <WhipPanTransition
          durationInFrames={transitionDuration}
          direction="up"
          outgoingContent={fromContent}
          incomingContent={toContent}
        />
      );

    case 'whip-pan-down':
      return (
        <WhipPanTransition
          durationInFrames={transitionDuration}
          direction="down"
          outgoingContent={fromContent}
          incomingContent={toContent}
        />
      );

    default:
      return <>{progress < 0.5 ? fromContent : toContent}</>;
  }
};

export const getTransitionDurationFrames = (config: TransitionConfig, fps: number): number => {
  return Math.round(config.duration * fps);
};
