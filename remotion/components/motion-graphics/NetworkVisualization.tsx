import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface NetworkNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
}

export interface NetworkConnection {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

export interface NetworkVisualizationProps {
  nodes: NetworkNode[];
  connections: NetworkConnection[];
  
  layout: 'custom' | 'circular' | 'hierarchical' | 'force';
  
  nodeStyle: {
    shape: 'circle' | 'square' | 'rounded';
    defaultSize: number;
    defaultColor: string;
    borderColor: string;
    borderWidth: number;
    labelColor: string;
  };
  
  connectionStyle: {
    color: string;
    width: number;
    animated: boolean;
  };
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  animationType: 'nodes-first' | 'connections-first' | 'simultaneous';
  nodeDuration: number;
  connectionDuration: number;
  staggerDelay: number;
  holdDuration?: number;
  
  backgroundColor: string;
}

export const NetworkVisualization: React.FC<NetworkVisualizationProps> = ({
  nodes,
  connections,
  layout,
  nodeStyle,
  connectionStyle,
  labelStyle,
  animationType,
  nodeDuration,
  connectionDuration,
  staggerDelay,
  holdDuration = 30,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  
  const positionedNodes = React.useMemo(() => {
    if (layout === 'custom') {
      return nodes.map(node => ({
        ...node,
        x: node.x ?? 50,
        y: node.y ?? 50,
      }));
    }
    
    return nodes.map((node, i) => {
      let x: number, y: number;
      
      if (layout === 'circular') {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const radius = 35;
        x = 50 + Math.cos(angle) * radius;
        y = 50 + Math.sin(angle) * radius;
      } else if (layout === 'hierarchical') {
        const levels = Math.ceil(Math.sqrt(nodes.length));
        const level = Math.floor(i / levels);
        const posInLevel = i % levels;
        const nodesInLevel = Math.min(levels, nodes.length - level * levels);
        x = nodesInLevel === 1 ? 50 : 20 + (posInLevel / (nodesInLevel - 1)) * 60;
        y = levels === 1 ? 50 : 20 + (level / (levels - 1)) * 60;
      } else if (layout === 'force') {
        const centerX = 50;
        const centerY = 50;
        const repulsionStrength = 25;
        const attractionStrength = 0.3;
        
        const baseAngle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const baseRadius = 30;
        let px = centerX + Math.cos(baseAngle) * baseRadius;
        let py = centerY + Math.sin(baseAngle) * baseRadius;
        
        for (let iter = 0; iter < 10; iter++) {
          let fx = 0, fy = 0;
          
          for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const otherAngle = (j / nodes.length) * Math.PI * 2 - Math.PI / 2;
            const ox = centerX + Math.cos(otherAngle) * baseRadius;
            const oy = centerY + Math.sin(otherAngle) * baseRadius;
            
            const dx = px - ox;
            const dy = py - oy;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            
            fx += (dx / dist) * (repulsionStrength / (dist * dist));
            fy += (dy / dist) * (repulsionStrength / (dist * dist));
          }
          
          fx += (centerX - px) * attractionStrength * 0.1;
          fy += (centerY - py) * attractionStrength * 0.1;
          
          px += fx;
          py += fy;
        }
        
        x = Math.max(15, Math.min(85, px));
        y = Math.max(15, Math.min(85, py));
      } else {
        const cols = Math.ceil(Math.sqrt(nodes.length));
        const rows = Math.ceil(nodes.length / cols);
        const row = Math.floor(i / cols);
        const col = i % cols;
        x = cols === 1 ? 50 : 20 + (col / (cols - 1)) * 60;
        y = rows === 1 ? 50 : 20 + (row / (rows - 1)) * 60;
      }
      
      return { ...node, x, y };
    });
  }, [nodes, layout]);
  
  const nodesStartFrame = animationType === 'connections-first' 
    ? connectionDuration + staggerDelay * connections.length 
    : 0;
  const connectionsStartFrame = animationType === 'nodes-first' 
    ? nodeDuration + staggerDelay * nodes.length 
    : 0;
  
  const totalAnimationTime = animationType === 'simultaneous'
    ? Math.max(nodeDuration + staggerDelay * nodes.length, connectionDuration + staggerDelay * connections.length)
    : nodeDuration + staggerDelay * nodes.length + connectionDuration + staggerDelay * connections.length;
  
  const exitStartFrame = totalAnimationTime + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  return (
    <AbsoluteFill style={{ backgroundColor, opacity: exitOpacity }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <g>
          {connections.map((conn, i) => {
            const fromNode = positionedNodes.find(n => n.id === conn.from);
            const toNode = positionedNodes.find(n => n.id === conn.to);
            
            if (!fromNode || !toNode) return null;
            
            const startFrame = connectionsStartFrame + i * staggerDelay;
            const localFrame = frame - startFrame;
            const progress = localFrame < 0 ? 0 : Math.min(localFrame / connectionDuration, 1);
            
            const x1 = (fromNode.x ?? 50) * width / 100;
            const y1 = (fromNode.y ?? 50) * height / 100;
            const x2 = (toNode.x ?? 50) * width / 100;
            const y2 = (toNode.y ?? 50) * height / 100;
            
            const lineLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const dashOffset = lineLength * (1 - progress);
            
            return (
              <g key={`conn-${i}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={connectionStyle.color}
                  strokeWidth={connectionStyle.width}
                  strokeDasharray={lineLength}
                  strokeDashoffset={dashOffset}
                  opacity={progress}
                />
                
                {conn.label && progress > 0.5 && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 10}
                    fill={nodeStyle.labelColor}
                    fontSize={labelStyle.fontSize * 0.8}
                    fontFamily={labelStyle.fontFamily}
                    textAnchor="middle"
                    opacity={(progress - 0.5) * 2}
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        
        <g>
          {positionedNodes.map((node, i) => {
            const startFrame = nodesStartFrame + i * staggerDelay;
            const localFrame = frame - startFrame;
            
            const springVal = localFrame >= 0 ? spring({
              frame: localFrame,
              fps,
              config: { damping: 12, stiffness: 200 },
            }) : 0;
            
            const scale = Math.min(springVal, 1);
            const opacity = localFrame < 0 ? 0 : Math.min(localFrame / 10, 1);
            
            const cx = (node.x ?? 50) * width / 100;
            const cy = (node.y ?? 50) * height / 100;
            const size = (node.size || nodeStyle.defaultSize) * scale;
            
            return (
              <g key={node.id} opacity={opacity}>
                {nodeStyle.shape === 'circle' && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={size / 2}
                    fill={node.color || nodeStyle.defaultColor}
                    stroke={nodeStyle.borderColor}
                    strokeWidth={nodeStyle.borderWidth}
                  />
                )}
                
                {nodeStyle.shape === 'square' && (
                  <rect
                    x={cx - size / 2}
                    y={cy - size / 2}
                    width={size}
                    height={size}
                    fill={node.color || nodeStyle.defaultColor}
                    stroke={nodeStyle.borderColor}
                    strokeWidth={nodeStyle.borderWidth}
                  />
                )}
                
                {nodeStyle.shape === 'rounded' && (
                  <rect
                    x={cx - size / 2}
                    y={cy - size / 2}
                    width={size}
                    height={size}
                    rx={size * 0.2}
                    fill={node.color || nodeStyle.defaultColor}
                    stroke={nodeStyle.borderColor}
                    strokeWidth={nodeStyle.borderWidth}
                  />
                )}
                
                <text
                  x={cx}
                  y={cy + size / 2 + 20}
                  fill={nodeStyle.labelColor}
                  fontSize={labelStyle.fontSize}
                  fontWeight={labelStyle.fontWeight}
                  fontFamily={labelStyle.fontFamily}
                  textAnchor="middle"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

export default NetworkVisualization;
