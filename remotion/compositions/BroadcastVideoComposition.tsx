import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig, Audio } from 'remotion';
import { SoundDesignLayer } from '../components/audio/SoundDesignLayer';
import { DuckedMusic, VolumeKeyframe } from '../components/audio/DuckedMusic';
import { AnimatedEndCard } from '../components/endcard/AnimatedEndCard';
import { EndCardConfig, DEFAULT_END_CARD_CONFIG } from '../../shared/config/end-card';
import { TransitionConfig, SoundDesignConfig, DEFAULT_SOUND_DESIGN_CONFIG } from '../../shared/config/sound-design';

interface SceneData {
  id: string;
  type: string;
  duration: number;
  assets?: {
    imageUrl?: string;
    videoUrl?: string;
  };
  textOverlays?: Array<{ text: string; style?: string }>;
  narration?: string;
}

interface BroadcastRenderConfig {
  filmTreatment?: {
    colorGrade?: string;
    grainIntensity?: number;
    vignetteIntensity?: number;
  };
  transitions: TransitionConfig[];
  soundDesign: SoundDesignConfig;
  watermark: {
    enabled: boolean;
    url: string;
    position: string;
    opacity: number;
  };
  endCard: EndCardConfig;
  audioDucking: VolumeKeyframe[];
}

interface BroadcastVideoProps {
  scenes: SceneData[];
  config: BroadcastRenderConfig;
  musicUrl?: string;
  voiceoverUrl?: string;
}

export const BroadcastVideoComposition: React.FC<BroadcastVideoProps> = ({
  scenes,
  config,
  musicUrl,
  voiceoverUrl,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  
  const sceneTimings = calculateSceneTimings(scenes, config.transitions, fps);
  
  const endCardDuration = Math.round((config.endCard?.duration || 5) * fps);
  const endCardStartFrame = durationInFrames - endCardDuration;
  
  return (
    <AbsoluteFill>
      {scenes.map((scene, index) => {
        const timing = sceneTimings[index];
        if (!timing) return null;
        
        return (
          <Sequence 
            key={scene.id} 
            from={timing.startFrame} 
            durationInFrames={timing.duration}
          >
            <SceneContent scene={scene} />
          </Sequence>
        );
      })}
      
      {config.watermark?.enabled && config.watermark.url && (
        <Sequence 
          from={Math.round(3 * fps)} 
          durationInFrames={Math.max(0, endCardStartFrame - Math.round(3 * fps))}
        >
          <WatermarkOverlay
            logoUrl={config.watermark.url}
            position={config.watermark.position}
            opacity={config.watermark.opacity}
          />
        </Sequence>
      )}
      
      {config.endCard && (
        <Sequence from={endCardStartFrame} durationInFrames={endCardDuration}>
          <AnimatedEndCard config={config.endCard} />
        </Sequence>
      )}
      
      {config.soundDesign?.enabled && (
        <SoundDesignLayer
          transitions={config.transitions.map((t, i) => ({
            config: t,
            startFrame: sceneTimings[i]?.endFrame - Math.round(t.duration * fps / 2) || 0,
          }))}
          logoRevealFrame={endCardStartFrame + Math.round(0.3 * fps)}
          ctaStartFrame={endCardStartFrame}
          enableAmbient={config.soundDesign.ambientLayer}
          ambientType={config.soundDesign.ambientType === 'nature' ? 'nature' : 'warm'}
          masterVolume={config.soundDesign.masterVolume}
        />
      )}
      
      {voiceoverUrl && (
        <Audio src={voiceoverUrl} volume={1.0} />
      )}
      
      {musicUrl && (
        <DuckedMusic
          musicUrl={musicUrl}
          baseVolume={0.35}
          volumeKeyframes={config.audioDucking || []}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

const SceneContent: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const { width, height } = useVideoConfig();
  
  const backgroundStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scene.assets?.videoUrl ? (
        <video src={scene.assets.videoUrl} style={backgroundStyle} muted autoPlay />
      ) : scene.assets?.imageUrl ? (
        <img src={scene.assets.imageUrl} style={backgroundStyle} alt="" />
      ) : (
        <div style={{ ...backgroundStyle, backgroundColor: '#1a1a2e' }} />
      )}
      
      {scene.textOverlays && scene.textOverlays.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            color: '#FFFFFF',
            fontSize: 36,
            fontWeight: 'bold',
            textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
            maxWidth: '80%',
          }}
        >
          {scene.textOverlays[0]?.text}
        </div>
      )}
    </AbsoluteFill>
  );
};

const WatermarkOverlay: React.FC<{
  logoUrl: string;
  position: string;
  opacity: number;
}> = ({ logoUrl, position, opacity }) => {
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    width: 80,
    height: 'auto',
    opacity,
  };
  
  switch (position) {
    case 'top-left':
      positionStyle.top = 20;
      positionStyle.left = 20;
      break;
    case 'top-right':
      positionStyle.top = 20;
      positionStyle.right = 20;
      break;
    case 'bottom-left':
      positionStyle.bottom = 20;
      positionStyle.left = 20;
      break;
    case 'bottom-right':
    default:
      positionStyle.bottom = 20;
      positionStyle.right = 20;
      break;
  }
  
  return <img src={logoUrl} style={positionStyle} alt="" />;
};

function calculateSceneTimings(
  scenes: SceneData[],
  transitions: TransitionConfig[],
  fps: number
): Array<{ startFrame: number; endFrame: number; duration: number }> {
  const timings: Array<{ startFrame: number; endFrame: number; duration: number }> = [];
  let currentFrame = 0;
  
  scenes.forEach((scene, index) => {
    const sceneDuration = Math.round(scene.duration * fps);
    const startFrame = currentFrame;
    const endFrame = currentFrame + sceneDuration;
    
    timings.push({ startFrame, endFrame, duration: sceneDuration });
    
    const transition = transitions[index];
    if (transition) {
      currentFrame = endFrame - Math.round(transition.duration * fps / 2);
    } else {
      currentFrame = endFrame;
    }
  });
  
  return timings;
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastRenderConfig = {
  transitions: [],
  soundDesign: DEFAULT_SOUND_DESIGN_CONFIG,
  watermark: {
    enabled: true,
    url: '',
    position: 'bottom-right',
    opacity: 0.7,
  },
  endCard: DEFAULT_END_CARD_CONFIG,
  audioDucking: [],
};
