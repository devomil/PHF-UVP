import React from 'react';
import { Audio, Sequence, useVideoConfig } from 'remotion';
import { SoundEffect, SOUND_EFFECTS, getSoundForTransition, TransitionConfig } from '../../../shared/config/sound-design';
import type { SoundDesignConfig, TransitionSound } from '../../../shared/types/sound-design';

// Legacy interface (current usage)
interface SoundDesignLayerLegacyProps {
  transitions: Array<{
    config: TransitionConfig;
    startFrame: number;
  }>;
  logoRevealFrame?: number;
  ctaStartFrame?: number;
  enableAmbient: boolean;
  ambientType?: 'warm' | 'nature';
  masterVolume?: number;
}

// Phase 18D interface
interface SoundDesignLayerPhase18DProps {
  config: SoundDesignConfig;
  transitions: TransitionSound[];
  logoRevealFrame: number;
  ctaStartFrame: number;
  soundEffectsBaseUrl: string;
}

type SoundDesignLayerProps = SoundDesignLayerLegacyProps | SoundDesignLayerPhase18DProps;

function isPhase18DProps(props: SoundDesignLayerProps): props is SoundDesignLayerPhase18DProps {
  return 'config' in props && 'soundEffectsBaseUrl' in props;
}

export const SoundDesignLayer: React.FC<SoundDesignLayerProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  
  if (isPhase18DProps(props)) {
    // Phase 18D implementation
    const { config, transitions, logoRevealFrame, ctaStartFrame, soundEffectsBaseUrl } = props;
    
    if (!config.enabled) {
      return null;
    }
    
    const getSfxUrl = (name: string) => `${soundEffectsBaseUrl}/${name}.mp3`;
    
    return (
      <>
        {/* Transition sounds */}
        {config.transitions.enabled && transitions.map((transition, index) => (
          <Sequence
            key={`transition-${index}`}
            from={transition.startFrame}
            durationInFrames={Math.round(fps * 0.8)}
            name={`Transition-Sound-${index}`}
          >
            <Audio
              src={getSfxUrl(transition.sound || config.transitions.defaultSound)}
              volume={transition.volume || config.transitions.volume}
            />
          </Sequence>
        ))}
        
        {/* Logo reveal impact */}
        {config.logoReveal.enabled && logoRevealFrame > 0 && (
          <Sequence
            from={logoRevealFrame}
            durationInFrames={Math.round(fps * 1.5)}
            name="Logo-Reveal-Sound"
          >
            <Audio
              src={getSfxUrl(config.logoReveal.sound)}
              volume={config.logoReveal.volume}
            />
          </Sequence>
        )}
        
        {/* Rise/swell before CTA */}
        {config.riseSwell.enabled && ctaStartFrame > 0 && (
          <Sequence
            from={ctaStartFrame - Math.round(config.riseSwell.durationBeforeCTA * fps)}
            durationInFrames={Math.round(config.riseSwell.durationBeforeCTA * fps)}
            name="Rise-Swell"
          >
            <Audio
              src={getSfxUrl('rise-swell')}
              volume={config.riseSwell.volume}
            />
          </Sequence>
        )}
        
        {/* Ambient layer */}
        {config.ambient.enabled && (
          <Audio
            src={getSfxUrl(config.ambient.sound)}
            volume={config.ambient.volume}
            loop
          />
        )}
      </>
    );
  }
  
  // Legacy implementation
  const { transitions, logoRevealFrame, ctaStartFrame, enableAmbient, ambientType = 'warm', masterVolume = 1.0 } = props;
  
  const applyMasterVolume = (volume: number) => volume * masterVolume;
  
  const ambientSoundKey = ambientType === 'nature' ? 'room-tone-nature' : 'room-tone-warm';
  const ambientSound = SOUND_EFFECTS[ambientSoundKey];
  const logoSound = SOUND_EFFECTS['logo-reveal'];
  const riseSound = SOUND_EFFECTS['rise-swell'];
  
  return (
    <>
      {transitions.map((transition, index) => {
        const sound = getSoundForTransition(transition.config.type);
        if (!sound) return null;
        
        return (
          <Sequence key={`trans-${index}`} from={transition.startFrame}>
            <Audio
              src={sound.file}
              volume={applyMasterVolume(sound.volume)}
              startFrom={0}
            />
          </Sequence>
        );
      })}
      
      {logoRevealFrame !== undefined && logoRevealFrame > 0 && logoSound && (
        <Sequence from={logoRevealFrame}>
          <Audio
            src={logoSound.file}
            volume={applyMasterVolume(logoSound.volume)}
          />
        </Sequence>
      )}
      
      {ctaStartFrame !== undefined && ctaStartFrame > 0 && riseSound && (
        <Sequence from={ctaStartFrame - Math.round(3 * fps)}>
          <Audio
            src={riseSound.file}
            volume={applyMasterVolume(riseSound.volume)}
          />
        </Sequence>
      )}
      
      {enableAmbient && ambientSound && (
        <Audio
          src={ambientSound.file}
          volume={applyMasterVolume(ambientSound.volume)}
          loop
        />
      )}
    </>
  );
};
