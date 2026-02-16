import { Composition, CalculateMetadataFunction } from "remotion";
import { VideoComposition } from "./VideoComposition";
import type { VideoCompositionProps } from "./VideoComposition";
import { UniversalVideoComposition } from "./UniversalVideoComposition";
import type { UniversalVideoProps } from "./UniversalVideoComposition";
import { BroadcastVideoComposition, BroadcastInputProps } from "./BroadcastVideoComposition";
import { PINE_HILL_FARM_BRAND, OUTPUT_FORMATS } from "../shared/video-types";

const defaultUniversalProps: UniversalVideoProps = {
  scenes: [],
  voiceoverUrl: null,
  musicUrl: null,
  musicVolume: 0.18,
  brand: PINE_HILL_FARM_BRAND,
  outputFormat: OUTPUT_FORMATS.youtube,
};

const defaultBroadcastProps: BroadcastInputProps = {
  ...defaultUniversalProps,
  filmTreatment: {
    enabled: true,
    colorGrade: 'warm-cinematic',
    colorIntensity: 1.0,
    grainIntensity: 0.04,
    vignetteIntensity: 0.2,
    letterbox: 'none',
  },
};

const calculateBroadcastMetadata: CalculateMetadataFunction<BroadcastInputProps> = async ({ props }) => {
  const sceneDuration = props.scenes.reduce(
    (acc: number, scene) => acc + (scene.duration || 4),
    0
  );
  return {
    durationInFrames: Math.max(sceneDuration * 30, 150),
    props,
  };
};

const calculateUniversalMetadata: CalculateMetadataFunction<UniversalVideoProps> = async ({ props }) => {
  const totalDuration = props.scenes.reduce(
    (acc: number, scene) => acc + (scene.duration || 4),
    0
  );
  return {
    durationInFrames: Math.max(totalDuration * 30, 150),
    props,
  };
};

const calculateLegacyMetadata: CalculateMetadataFunction<VideoCompositionProps> = async ({ props }) => {
  const totalDuration = props.scenes.reduce(
    (acc: number, scene) => acc + (scene.duration || 4),
    0
  );
  return {
    durationInFrames: Math.max(totalDuration * 30, 150),
    props,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Universal Video Compositions - New System */}
      <Composition
        id="UniversalVideo"
        component={UniversalVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultUniversalProps}
        calculateMetadata={calculateUniversalMetadata}
      />
      <Composition
        id="UniversalVideoVertical"
        component={UniversalVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          ...defaultUniversalProps,
          outputFormat: OUTPUT_FORMATS.tiktok,
        }}
        calculateMetadata={calculateUniversalMetadata}
      />
      <Composition
        id="UniversalVideoSquare"
        component={UniversalVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          ...defaultUniversalProps,
          outputFormat: OUTPUT_FORMATS.instagram,
        }}
        calculateMetadata={calculateUniversalMetadata}
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* BROADCAST COMPOSITIONS (Phase 18H - Primary)                    */}
      {/* Use these for all production renders                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Composition
        id="BroadcastVideoComposition"
        component={BroadcastVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultBroadcastProps}
        calculateMetadata={calculateBroadcastMetadata}
      />
      <Composition
        id="PreviewComposition"
        component={BroadcastVideoComposition}
        durationInFrames={900}
        fps={24}
        width={854}
        height={480}
        defaultProps={{
          ...defaultBroadcastProps,
          filmTreatment: {
            enabled: true,
            colorGrade: 'warm-cinematic',
            colorIntensity: 0.8,
            grainIntensity: 0.02,
            vignetteIntensity: 0.15,
            letterbox: 'none',
          },
        }}
        calculateMetadata={calculateBroadcastMetadata}
      />
      <Composition
        id="SocialVerticalComposition"
        component={BroadcastVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          ...defaultBroadcastProps,
          outputFormat: OUTPUT_FORMATS.tiktok,
          filmTreatment: {
            enabled: true,
            colorGrade: 'vibrant-lifestyle',
            colorIntensity: 1.0,
            grainIntensity: 0.01,
            vignetteIntensity: 0.05,
            letterbox: 'none',
          },
        }}
        calculateMetadata={calculateBroadcastMetadata}
      />
      
      {/* Legacy Marketing Video Compositions */}
      <Composition
        id="MarketingVideo"
        component={VideoComposition}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: [],
          voiceoverUrl: null,
          musicUrl: null,
          watermark: null,
          productName: "Product",
          style: "professional",
        }}
        calculateMetadata={calculateLegacyMetadata}
      />
      <Composition
        id="MarketingVideoVertical"
        component={VideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          scenes: [],
          voiceoverUrl: null,
          musicUrl: null,
          watermark: null,
          productName: "Product",
          style: "professional",
        }}
        calculateMetadata={calculateLegacyMetadata}
      />
      <Composition
        id="MarketingVideoSquare"
        component={VideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          scenes: [],
          voiceoverUrl: null,
          musicUrl: null,
          watermark: null,
          productName: "Product",
          style: "professional",
        }}
        calculateMetadata={calculateLegacyMetadata}
      />
    </>
  );
};
