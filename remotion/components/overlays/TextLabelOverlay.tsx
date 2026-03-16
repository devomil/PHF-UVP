import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { TextLabel, BrandSettings } from "../../../shared/video-types";

export interface TextLabelOverlayProps {
  labels: TextLabel[];
  brand: BrandSettings;
}

export const TextLabelOverlay: React.FC<TextLabelOverlayProps> = ({
  labels,
  brand,
}) => {
  if (!labels || labels.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {labels.map((label) => (
        <SingleTextLabel key={label.id} label={label} brand={brand} />
      ))}
    </AbsoluteFill>
  );
};

const SingleTextLabel: React.FC<{
  label: TextLabel;
  brand: BrandSettings;
}> = ({ label, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = label.timing.startAt * fps;
  const endFrame = startFrame + label.timing.duration * fps;
  const animInFrames = fps * 0.4;
  const animOutFrames = fps * 0.3;

  if (frame < startFrame || frame > endFrame) return null;

  const localFrame = frame - startFrame;
  const totalFrames = endFrame - startFrame;

  let opacity = 1;
  let translateY = 0;
  let translateX = 0;
  let scale = 1;

  if (localFrame < animInFrames) {
    const progress = localFrame / animInFrames;
    opacity = interpolate(progress, [0, 1], [0, 1]);

    switch (label.visualTreatment) {
      case "floating-tag":
        translateY = interpolate(progress, [0, 1], [20, 0]);
        break;
      case "holographic-panel":
        scale = interpolate(progress, [0, 1], [0.8, 1]);
        break;
      case "neon-glow":
        scale = interpolate(progress, [0, 1], [0.9, 1]);
        break;
      case "handwritten":
        translateX = interpolate(progress, [0, 1], [-15, 0]);
        break;
      case "pill":
      case "badge":
        scale = spring({
          frame: localFrame,
          fps,
          config: { damping: 12, stiffness: 200 },
        });
        break;
      default:
        break;
    }
  }

  if (localFrame > totalFrames - animOutFrames) {
    const exitProgress = (localFrame - (totalFrames - animOutFrames)) / animOutFrames;
    opacity = interpolate(exitProgress, [0, 1], [1, 0]);
    if (label.visualTreatment === "floating-tag") {
      translateY = interpolate(exitProgress, [0, 1], [0, -10]);
    }
  }

  const positionStyle = getPositionStyle(label.position);
  const treatmentStyle = getTreatmentStyle(label, brand);

  return (
    <div
      style={{
        ...positionStyle,
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        }}
      >
        <div style={treatmentStyle}>{label.text}</div>
      </div>
    </div>
  );
};

function getPositionStyle(
  position: TextLabel["position"]
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    display: "flex",
    zIndex: 10,
  };

  switch (position) {
    case "top-left":
      return { ...base, top: 60, left: 60 };
    case "top-center":
      return { ...base, top: 60, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { ...base, top: 60, right: 60 };
    case "center-left":
      return { ...base, top: "50%", left: 60, transform: "translateY(-50%)" };
    case "center":
      return {
        ...base,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    case "center-right":
      return { ...base, top: "50%", right: 60, transform: "translateY(-50%)" };
    case "bottom-left":
      return { ...base, bottom: 200, left: 60 };
    case "bottom-center":
      return {
        ...base,
        bottom: 200,
        left: "50%",
        transform: "translateX(-50%)",
      };
    case "bottom-right":
      return { ...base, bottom: 200, right: 60 };
    default:
      return { ...base, top: 60, left: "50%", transform: "translateX(-50%)" };
  }
}

function getTreatmentStyle(
  label: TextLabel,
  brand: BrandSettings
): React.CSSProperties {
  const fontSize = label.fontSize || 32;
  const baseStyle: React.CSSProperties = {
    fontFamily: brand.fonts.body,
    fontSize,
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };

  switch (label.visualTreatment) {
    case "badge":
      return {
        ...baseStyle,
        color: label.color || "#ffffff",
        backgroundColor:
          label.backgroundColor || brand.colors.primary,
        padding: "10px 24px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      };

    case "floating-tag":
      return {
        ...baseStyle,
        color: label.color || "#ffffff",
        backgroundColor:
          label.backgroundColor || "rgba(0,0,0,0.6)",
        padding: "8px 20px",
        borderRadius: 20,
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.15)",
      };

    case "holographic-panel":
      return {
        ...baseStyle,
        color: label.color || "#00f0ff",
        backgroundColor:
          label.backgroundColor || "rgba(0,240,255,0.1)",
        padding: "12px 28px",
        borderRadius: 4,
        border: `1px solid ${label.color || "#00f0ff"}`,
        boxShadow: `0 0 20px ${label.color || "rgba(0,240,255,0.3)"}, inset 0 0 20px ${label.color || "rgba(0,240,255,0.05)"}`,
        textShadow: `0 0 10px ${label.color || "#00f0ff"}`,
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
      };

    case "handwritten":
      return {
        ...baseStyle,
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        fontWeight: 400,
        color: label.color || "#333333",
        backgroundColor:
          label.backgroundColor || "rgba(255,255,240,0.85)",
        padding: "8px 20px",
        borderRadius: 4,
        transform: "rotate(-2deg)",
        boxShadow: "2px 2px 8px rgba(0,0,0,0.15)",
      };

    case "neon-glow":
      return {
        ...baseStyle,
        color: label.color || "#f500ff",
        backgroundColor: "transparent",
        padding: "8px 16px",
        textShadow: `0 0 7px ${label.color || "#f500ff"}, 0 0 20px ${label.color || "#f500ff"}, 0 0 42px ${label.color || "#f500ff"}`,
        fontWeight: 700,
        letterSpacing: "0.03em",
      };

    case "pill":
      return {
        ...baseStyle,
        color: label.color || brand.colors.primary,
        backgroundColor:
          label.backgroundColor || "rgba(255,255,255,0.9)",
        padding: "8px 24px",
        borderRadius: 100,
        fontWeight: 700,
        fontSize: fontSize * 0.9,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      };

    case "underline":
      return {
        ...baseStyle,
        color: label.color || "#ffffff",
        backgroundColor: "transparent",
        padding: "4px 8px",
        borderBottom: `3px solid ${brand.colors.accent}`,
        textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
        fontWeight: 700,
      };

    case "minimal":
    default:
      return {
        ...baseStyle,
        color: label.color || "#ffffff",
        backgroundColor: "transparent",
        padding: "4px 8px",
        textShadow: "2px 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)",
        fontWeight: 600,
      };
  }
}

export default TextLabelOverlay;
