import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface TreeLabel {
  text: string;
  position: 'root' | 'branch' | 'leaf' | 'trunk';
  branchIndex?: number;
  leafIndex?: number;
}

export interface TreeGrowthProps {
  trunkColor: string;
  branchColor: string;
  leafColor: string;
  labelColor: string;
  backgroundColor: string;
  
  labels: TreeLabel[];
  rootLabels?: string[];
  
  style: 'natural' | 'geometric' | 'minimal' | 'organic';
  rootsVisible: boolean;
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  growthDuration: number;
  labelDelay: number;
  holdDuration?: number;
}

export const TreeGrowth: React.FC<TreeGrowthProps> = ({
  trunkColor,
  branchColor,
  leafColor,
  labelColor,
  backgroundColor,
  labels,
  rootLabels = [],
  style,
  rootsVisible,
  labelStyle,
  growthDuration,
  labelDelay,
  holdDuration = 30,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const springProgress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 50 },
    durationInFrames: growthDuration,
  });
  
  const clampedGrowth = Math.min(springProgress, 1);
  
  const labelsVisible = frame > growthDuration + labelDelay;
  const labelOpacity = labelsVisible 
    ? Math.min((frame - growthDuration - labelDelay) / 30, 1) 
    : 0;
  
  const exitStartFrame = growthDuration + labelDelay + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  const centerX = width / 2;
  const groundY = height * 0.7;
  const trunkHeight = height * 0.35 * clampedGrowth;
  const trunkWidth = style === 'minimal' ? 12 : style === 'geometric' ? 24 : 20;
  
  const branchLabels = labels.filter(l => l.position === 'branch');
  const leafLabels = labels.filter(l => l.position === 'leaf');
  const trunkLabel = labels.find(l => l.position === 'trunk');
  
  const branchCount = Math.max(4, branchLabels.length);
  const branchLength = 120 * clampedGrowth;
  const branchStartY = groundY - trunkHeight * 0.4;
  
  const getRadius = () => {
    switch (style) {
      case 'geometric': return 0;
      case 'minimal': return 2;
      default: return 4;
    }
  };
  
  return (
    <AbsoluteFill style={{ backgroundColor, opacity: exitOpacity }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {rootsVisible && clampedGrowth > 0.1 && (
          <g>
            {[-1, 0, 1].map((dir, i) => {
              const rootProgress = Math.max(0, (clampedGrowth - 0.1) / 0.3);
              const rootLength = 80 * rootProgress;
              const rootAngle = dir * 35;
              const endX = centerX + Math.sin(rootAngle * Math.PI / 180) * rootLength;
              const endY = groundY + Math.cos(rootAngle * Math.PI / 180) * rootLength * 0.5;
              
              return (
                <g key={`root-${i}`}>
                  <path
                    d={`M ${centerX} ${groundY} Q ${centerX + dir * 20} ${groundY + 30} ${endX} ${endY}`}
                    stroke={trunkColor}
                    strokeWidth={8 - i * 2}
                    fill="none"
                    strokeLinecap="round"
                    opacity={rootProgress}
                  />
                  
                  {rootLabels[i] && labelOpacity > 0 && (
                    <text
                      x={endX + dir * 10}
                      y={endY + 20}
                      fill={labelColor}
                      fontSize={labelStyle.fontSize * 0.8}
                      fontFamily={labelStyle.fontFamily}
                      fontWeight={labelStyle.fontWeight}
                      textAnchor="middle"
                      opacity={labelOpacity}
                    >
                      {rootLabels[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
        
        <rect
          x={centerX - trunkWidth / 2}
          y={groundY - trunkHeight}
          width={trunkWidth}
          height={trunkHeight}
          fill={trunkColor}
          rx={getRadius()}
        />
        
        {clampedGrowth > 0.3 && (
          <g>
            {Array.from({ length: branchCount }).map((_, i) => {
              const branchProgress = Math.max(0, (clampedGrowth - 0.3 - i * 0.1) / 0.15);
              const side = i % 2 === 0 ? -1 : 1;
              const yOffset = i * 40;
              const startY = branchStartY - yOffset;
              const angle = side * (30 + i * 5);
              
              const endX = centerX + Math.cos(angle * Math.PI / 180) * branchLength * branchProgress * side;
              const endY = startY - Math.sin(Math.abs(angle) * Math.PI / 180) * branchLength * branchProgress * 0.5;
              
              const branchLabel = branchLabels.find(l => l.branchIndex === i) || branchLabels[i];
              const leafLabel = leafLabels.find(l => l.leafIndex === i) || leafLabels[i];
              
              const leafRadius = style === 'geometric' ? 20 : style === 'minimal' ? 18 : 25;
              
              return (
                <g key={`branch-${i}`} opacity={branchProgress}>
                  <path
                    d={style === 'geometric' 
                      ? `M ${centerX} ${startY} L ${endX} ${endY}`
                      : `M ${centerX} ${startY} Q ${centerX + side * 30} ${startY - 20} ${endX} ${endY}`
                    }
                    stroke={branchColor}
                    strokeWidth={style === 'minimal' ? 4 : 6}
                    fill="none"
                    strokeLinecap="round"
                  />
                  
                  {branchProgress > 0.5 && (
                    style === 'geometric' ? (
                      <rect
                        x={endX - leafRadius}
                        y={endY - leafRadius}
                        width={leafRadius * 2}
                        height={leafRadius * 2}
                        fill={leafColor}
                        opacity={0.9}
                      />
                    ) : (
                      <circle
                        cx={endX}
                        cy={endY}
                        r={leafRadius * (branchProgress - 0.5) * 2}
                        fill={leafColor}
                        opacity={0.9}
                      />
                    )
                  )}
                  
                  {branchLabel && labelOpacity > 0 && (
                    <text
                      x={endX + side * 40}
                      y={endY}
                      fill={labelColor}
                      fontSize={labelStyle.fontSize}
                      fontFamily={labelStyle.fontFamily}
                      fontWeight={labelStyle.fontWeight}
                      textAnchor={side === 1 ? 'start' : 'end'}
                      alignmentBaseline="middle"
                      opacity={labelOpacity}
                    >
                      {branchLabel.text}
                    </text>
                  )}
                  
                  {leafLabel && branchProgress > 0.5 && labelOpacity > 0 && (
                    <text
                      x={endX}
                      y={endY - leafRadius * (branchProgress - 0.5) * 2 - 10}
                      fill={labelColor}
                      fontSize={labelStyle.fontSize * 0.8}
                      fontFamily={labelStyle.fontFamily}
                      fontWeight={labelStyle.fontWeight}
                      textAnchor="middle"
                      opacity={labelOpacity * (branchProgress - 0.5) * 2}
                    >
                      {leafLabel.text}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
        
        {clampedGrowth > 0.7 && (
          style === 'geometric' ? (
            <polygon
              points={`${centerX},${groundY - trunkHeight - 80 * ((clampedGrowth - 0.7) / 0.3)} ${centerX - 80 * ((clampedGrowth - 0.7) / 0.3)},${groundY - trunkHeight + 20} ${centerX + 80 * ((clampedGrowth - 0.7) / 0.3)},${groundY - trunkHeight + 20}`}
              fill={leafColor}
              opacity={0.9}
            />
          ) : (
            <ellipse
              cx={centerX}
              cy={groundY - trunkHeight - 30}
              rx={80 * ((clampedGrowth - 0.7) / 0.3)}
              ry={60 * ((clampedGrowth - 0.7) / 0.3)}
              fill={leafColor}
              opacity={0.9}
            />
          )
        )}
        
        <line
          x1={centerX - 200}
          y1={groundY}
          x2={centerX + 200}
          y2={groundY}
          stroke={trunkColor}
          strokeWidth={2}
          opacity={0.3}
        />
        
        {trunkLabel && labelOpacity > 0 && clampedGrowth > 0.5 && (
          <text
            x={centerX}
            y={groundY - trunkHeight / 2}
            fill={labelColor}
            fontSize={labelStyle.fontSize}
            fontFamily={labelStyle.fontFamily}
            fontWeight={labelStyle.fontWeight}
            textAnchor="middle"
            opacity={labelOpacity}
            transform={`rotate(-90, ${centerX}, ${groundY - trunkHeight / 2})`}
          >
            {trunkLabel.text}
          </text>
        )}
      </svg>
    </AbsoluteFill>
  );
};

export default TreeGrowth;
