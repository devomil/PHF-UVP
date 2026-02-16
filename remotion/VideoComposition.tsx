import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export interface SceneAsset {
  id: string;
  type: "image" | "video" | "ai_image" | "ai_video" | "broll";
  url: string;
  section: string;
  duration: number;
  sceneIndex: number;
  visualDirection?: string;
  transition?: "fade" | "slide" | "zoom" | "none";
}

export interface WatermarkConfig {
  url: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  opacity: number;
  size: number;
}

export interface VideoCompositionProps {
  scenes: SceneAsset[];
  voiceoverUrl: string | null;
  musicUrl: string | null;
  watermark: WatermarkConfig | null;
  productName: string;
  style: string;
}

const SceneWithTransition: React.FC<{
  scene: SceneAsset;
  isFirst: boolean;
  isLast: boolean;
}> = ({ scene, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationInFrames = scene.duration * fps;

  const fadeInDuration = isFirst ? 0 : 15;
  const fadeOutDuration = isLast ? 0 : 15;

  const opacity = interpolate(
    frame,
    [0, fadeInDuration, durationInFrames - fadeOutDuration, durationInFrames],
    [isFirst ? 1 : 0, 1, 1, isLast ? 1 : 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1, 1.05],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const isVideo = scene.type === "video" || scene.type === "ai_video" || scene.type === "broll";

  return (
    <AbsoluteFill style={{ opacity }}>
      {isVideo ? (
        <Video
          src={scene.url}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <Img
          src={scene.url}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

const Watermark: React.FC<{ config: WatermarkConfig }> = ({ config }) => {
  const { width, height } = useVideoConfig();

  const positionStyles: Record<string, React.CSSProperties> = {
    "top-left": { top: 20, left: 20 },
    "top-right": { top: 20, right: 20 },
    "bottom-left": { bottom: 20, left: 20 },
    "bottom-right": { bottom: 20, right: 20 },
    center: {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    },
  };

  const watermarkSize = (config.size / 100) * width;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          ...positionStyles[config.position],
          opacity: config.opacity / 100,
        }}
      >
        <Img
          src={config.url}
          style={{
            width: watermarkSize,
            height: "auto",
            maxHeight: watermarkSize,
            objectFit: "contain",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ productName: string; style: string }> = ({
  productName,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 200, mass: 0.5 },
  });

  const titleY = interpolate(titleOpacity, [0, 1], [50, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: style === "dark" ? "#000" : "#fff",
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontSize: 72,
          fontWeight: "bold",
          color: style === "dark" ? "#fff" : "#000",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {productName}
      </div>
    </AbsoluteFill>
  );
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  voiceoverUrl,
  musicUrl,
  watermark,
  productName,
  style,
}) => {
  const { fps } = useVideoConfig();

  let currentFrame = 0;
  const sceneSequences = scenes.map((scene, index) => {
    const durationInFrames = scene.duration * fps;
    const sequence = (
      <Sequence
        key={scene.id}
        from={currentFrame}
        durationInFrames={durationInFrames}
      >
        <SceneWithTransition
          scene={scene}
          isFirst={index === 0}
          isLast={index === scenes.length - 1}
        />
      </Sequence>
    );
    currentFrame += durationInFrames;
    return sequence;
  });

  const totalDuration = currentFrame;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.length === 0 ? (
        <TitleCard productName={productName} style={style} />
      ) : (
        sceneSequences
      )}

      {watermark && <Watermark config={watermark} />}

      {musicUrl && (
        <Audio src={musicUrl} volume={0.3} />
      )}

      {voiceoverUrl && (
        <Audio src={voiceoverUrl} volume={1} />
      )}
    </AbsoluteFill>
  );
};
