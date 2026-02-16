import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface AnimatedChartProps {
  data: ChartDataPoint[];
  chartType: 'bar' | 'pie' | 'line' | 'donut';
  
  animationDuration: number;
  staggerDelay: number;
  holdDuration: number;
  
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  labelColor: string;
  
  titleText?: string;
  titleStyle?: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  labelStyle: {
    fontSize: number;
    fontWeight: string | number;
    fontFamily: string;
  };
  
  showValues: boolean;
  showLabels: boolean;
  showLegend: boolean;
  
  chartPadding?: number;
  barSpacing?: number;
  lineWidth?: number;
  dotSize?: number;
}

const DEFAULT_COLORS = [
  '#2d5a27',
  '#607e66',
  '#c9a227',
  '#5b7c99',
  '#8c93ad',
  '#6c97ab',
];

const BarChart: React.FC<{
  data: ChartDataPoint[];
  frame: number;
  fps: number;
  animationDuration: number;
  staggerDelay: number;
  primaryColor: string;
  labelColor: string;
  labelStyle: AnimatedChartProps['labelStyle'];
  showValues: boolean;
  showLabels: boolean;
  barSpacing: number;
}> = ({ data, frame, fps, animationDuration, staggerDelay, primaryColor, labelColor, labelStyle, showValues, showLabels, barSpacing }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = (100 - (data.length - 1) * barSpacing) / data.length;
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center', gap: `${barSpacing}%` }}>
      {data.map((item, index) => {
        const startFrame = index * staggerDelay;
        const localFrame = frame - startFrame;
        
        const progress = localFrame < 0 ? 0 : spring({
          frame: localFrame,
          fps,
          config: { damping: 15, stiffness: 80 },
          durationInFrames: animationDuration,
        });
        
        const heightPercent = (item.value / maxValue) * 100 * Math.min(progress, 1);
        const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || primaryColor;
        
        return (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${barWidth}%` }}>
            <div style={{ 
              width: '100%', 
              height: `${heightPercent}%`, 
              backgroundColor: color,
              borderRadius: '8px 8px 0 0',
              minHeight: progress > 0 ? 4 : 0,
              transition: 'background-color 0.3s',
            }} />
            {showValues && progress > 0.5 && (
              <div style={{
                ...labelStyle,
                color: labelColor,
                marginTop: 8,
                opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateRight: 'clamp' }),
              }}>
                {Math.round(item.value * progress)}
              </div>
            )}
            {showLabels && (
              <div style={{
                ...labelStyle,
                color: labelColor,
                fontSize: labelStyle.fontSize * 0.8,
                marginTop: 4,
                opacity: progress > 0 ? 1 : 0,
                textAlign: 'center',
              }}>
                {item.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const LineChart: React.FC<{
  data: ChartDataPoint[];
  frame: number;
  fps: number;
  animationDuration: number;
  primaryColor: string;
  labelColor: string;
  labelStyle: AnimatedChartProps['labelStyle'];
  showValues: boolean;
  showLabels: boolean;
  lineWidth: number;
  dotSize: number;
}> = ({ data, frame, fps, animationDuration, primaryColor, labelColor, labelStyle, showValues, showLabels, lineWidth, dotSize }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;
  
  const progress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 60 },
    durationInFrames: animationDuration,
  });
  
  const visiblePoints = Math.ceil(data.length * Math.min(progress, 1));
  const points = data.slice(0, visiblePoints).map((item, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((item.value - minValue) / range) * 80 - 10;
    return { x, y, item };
  });
  
  const pathD = points.reduce((d, point, index) => {
    return d + (index === 0 ? `M ${point.x} ${point.y}` : ` L ${point.x} ${point.y}`);
  }, '');
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        <path
          d={pathD}
          fill="none"
          stroke={primaryColor}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={dotSize}
            fill={primaryColor}
          />
        ))}
      </svg>
      {showLabels && points.map((point, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: `${point.x}%`,
            bottom: 0,
            transform: 'translateX(-50%)',
            ...labelStyle,
            color: labelColor,
            fontSize: labelStyle.fontSize * 0.7,
          }}
        >
          {point.item.label}
        </div>
      ))}
    </div>
  );
};

const PieChart: React.FC<{
  data: ChartDataPoint[];
  frame: number;
  fps: number;
  animationDuration: number;
  primaryColor: string;
  isDonut: boolean;
}> = ({ data, frame, fps, animationDuration, primaryColor, isDonut }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  const progress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 60 },
    durationInFrames: animationDuration,
  });
  
  const clampedProgress = Math.min(progress, 1);
  let currentAngle = -90;
  
  const createArcPath = (startAngle: number, endAngle: number, radius: number, innerRadius: number) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const x1 = 50 + radius * Math.cos(startRad);
    const y1 = 50 + radius * Math.sin(startRad);
    const x2 = 50 + radius * Math.cos(endRad);
    const y2 = 50 + radius * Math.sin(endRad);
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    if (isDonut) {
      const x3 = 50 + innerRadius * Math.cos(endRad);
      const y3 = 50 + innerRadius * Math.sin(endRad);
      const x4 = 50 + innerRadius * Math.cos(startRad);
      const y4 = 50 + innerRadius * Math.sin(startRad);
      
      return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    }
    
    return `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };
  
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
      {data.map((item, index) => {
        const sliceAngle = (item.value / total) * 360 * clampedProgress;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        currentAngle = endAngle;
        
        const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || primaryColor;
        const path = createArcPath(startAngle, endAngle, 40, isDonut ? 25 : 0);
        
        return (
          <path
            key={index}
            d={path}
            fill={color}
            stroke="white"
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
};

export const AnimatedChart: React.FC<AnimatedChartProps> = ({
  data,
  chartType,
  animationDuration,
  staggerDelay,
  holdDuration,
  primaryColor,
  secondaryColor,
  backgroundColor,
  labelColor,
  titleText,
  titleStyle = { fontSize: 32, fontWeight: 700, fontFamily: 'Inter, sans-serif' },
  labelStyle,
  showValues,
  showLabels,
  showLegend,
  chartPadding = 40,
  barSpacing = 4,
  lineWidth = 2,
  dotSize = 3,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  const exitStartFrame = animationDuration + (data.length * staggerDelay) + holdDuration;
  const exitDuration = Math.round(fps * 0.5);
  const exitOpacity = frame >= exitStartFrame
    ? interpolate(frame, [exitStartFrame, exitStartFrame + exitDuration], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  
  return (
    <AbsoluteFill style={{ backgroundColor, padding: chartPadding, opacity: exitOpacity }}>
      {titleText && (
        <div style={{
          ...titleStyle,
          color: labelColor,
          textAlign: 'center',
          marginBottom: 20,
        }}>
          {titleText}
        </div>
      )}
      
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {chartType === 'bar' && (
          <BarChart
            data={data}
            frame={frame}
            fps={fps}
            animationDuration={animationDuration}
            staggerDelay={staggerDelay}
            primaryColor={primaryColor}
            labelColor={labelColor}
            labelStyle={labelStyle}
            showValues={showValues}
            showLabels={showLabels}
            barSpacing={barSpacing}
          />
        )}
        
        {chartType === 'line' && (
          <LineChart
            data={data}
            frame={frame}
            fps={fps}
            animationDuration={animationDuration}
            primaryColor={primaryColor}
            labelColor={labelColor}
            labelStyle={labelStyle}
            showValues={showValues}
            showLabels={showLabels}
            lineWidth={lineWidth}
            dotSize={dotSize}
          />
        )}
        
        {(chartType === 'pie' || chartType === 'donut') && (
          <PieChart
            data={data}
            frame={frame}
            fps={fps}
            animationDuration={animationDuration}
            primaryColor={primaryColor}
            isDonut={chartType === 'donut'}
          />
        )}
      </div>
      
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 20 }}>
          {data.map((item, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || primaryColor,
              }} />
              <span style={{ ...labelStyle, color: labelColor, fontSize: labelStyle.fontSize * 0.9 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};

export default AnimatedChart;
