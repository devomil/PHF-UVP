// shared/config/motion-control.ts - Phase 16: Intelligent Motion Control

export interface MotionControlConfig {
  camera_movement: CameraMovement;
  intensity: number;
  description: string;
  rationale: string;
}

export type CameraMovement = 
  | 'static'
  | 'push_in'
  | 'pull_out'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'orbit_left'
  | 'orbit_right'
  | 'tracking'
  | 'crane_up'
  | 'crane_down'
  | 'dolly_in'
  | 'dolly_out'
  | 'handheld'
  | 'steadicam';

export const SCENE_TYPE_MOTION: Record<string, MotionControlConfig> = {
  
  'hook': {
    camera_movement: 'push_in',
    intensity: 0.6,
    description: 'Slow push in to draw viewer into the scene',
    rationale: 'Creates immediate engagement, pulls viewer into the story',
  },
  
  'intro': {
    camera_movement: 'crane_down',
    intensity: 0.5,
    description: 'Descending reveal of the scene',
    rationale: 'Establishes setting with cinematic grandeur',
  },
  
  'problem': {
    camera_movement: 'static',
    intensity: 0.0,
    description: 'Locked off, stable shot',
    rationale: 'Stability during problem statement builds trust and seriousness',
  },
  
  'pain-point': {
    camera_movement: 'handheld',
    intensity: 0.3,
    description: 'Subtle handheld shake',
    rationale: 'Slight unease mirrors the discomfort being discussed',
  },
  
  'solution': {
    camera_movement: 'orbit_left',
    intensity: 0.5,
    description: 'Slow orbit revealing new perspective',
    rationale: 'Orbiting suggests discovery, seeing from new angle',
  },
  
  'reveal': {
    camera_movement: 'pull_out',
    intensity: 0.6,
    description: 'Pull back to reveal the full picture',
    rationale: 'Reveals scope and possibility',
  },
  
  'benefit': {
    camera_movement: 'dolly_in',
    intensity: 0.5,
    description: 'Dolly in to highlight benefit',
    rationale: 'Moving closer emphasizes importance of the benefit',
  },
  
  'feature': {
    camera_movement: 'orbit_right',
    intensity: 0.4,
    description: 'Gentle orbit to show different angles',
    rationale: 'Shows product/feature from multiple perspectives',
  },
  
  'product': {
    camera_movement: 'orbit_left',
    intensity: 0.4,
    description: 'Slow orbit around product',
    rationale: 'Classic product hero shot, shows all angles',
  },
  
  'product-detail': {
    camera_movement: 'push_in',
    intensity: 0.7,
    description: 'Push in to detail/texture',
    rationale: 'Highlights quality and craftsmanship',
  },
  
  'product-lifestyle': {
    camera_movement: 'tracking',
    intensity: 0.5,
    description: 'Track with product in use',
    rationale: 'Shows product in context, in motion',
  },
  
  'proof': {
    camera_movement: 'static',
    intensity: 0.0,
    description: 'Stable, trustworthy framing',
    rationale: 'Stability conveys authenticity and trust',
  },
  
  'testimonial': {
    camera_movement: 'push_in',
    intensity: 0.3,
    description: 'Very slow push toward speaker',
    rationale: 'Subtle intimacy, drawing closer to the person',
  },
  
  'social-proof': {
    camera_movement: 'pan_right',
    intensity: 0.4,
    description: 'Pan across multiple elements',
    rationale: 'Shows breadth of proof/reviews/testimonials',
  },
  
  'cta': {
    camera_movement: 'pull_out',
    intensity: 0.5,
    description: 'Pull out to wider view',
    rationale: 'Opens up, inviting viewer to take action',
  },
  
  'outro': {
    camera_movement: 'crane_up',
    intensity: 0.6,
    description: 'Rise up and away',
    rationale: 'Cinematic ending, sense of completion and aspiration',
  },
  
  'closing': {
    camera_movement: 'dolly_out',
    intensity: 0.4,
    description: 'Gentle dolly back',
    rationale: 'Graceful exit, leaving space for reflection',
  },
  
  'b-roll': {
    camera_movement: 'steadicam',
    intensity: 0.5,
    description: 'Smooth floating movement',
    rationale: 'Cinematic, professional atmosphere shots',
  },
  
  'atmosphere': {
    camera_movement: 'pan_left',
    intensity: 0.3,
    description: 'Slow environmental pan',
    rationale: 'Establishes mood and setting',
  },
  
  'transition': {
    camera_movement: 'tracking',
    intensity: 0.6,
    description: 'Following movement through space',
    rationale: 'Creates visual bridge between scenes',
  },
  
  'default': {
    camera_movement: 'push_in',
    intensity: 0.4,
    description: 'Subtle push in',
    rationale: 'Safe default that adds cinematic quality',
  },
};

export function analyzeMotionFromContent(visualDirection: string): Partial<MotionControlConfig> | null {
  const lower = visualDirection.toLowerCase();
  
  const explicitMotions: Array<{ keywords: string[]; config: Partial<MotionControlConfig> }> = [
    {
      keywords: ['push in', 'zoom in', 'move closer', 'approach'],
      config: { camera_movement: 'push_in', intensity: 0.6 },
    },
    {
      keywords: ['pull out', 'zoom out', 'pull back', 'reveal wide'],
      config: { camera_movement: 'pull_out', intensity: 0.6 },
    },
    {
      keywords: ['pan left', 'move left', 'look left'],
      config: { camera_movement: 'pan_left', intensity: 0.5 },
    },
    {
      keywords: ['pan right', 'move right', 'look right'],
      config: { camera_movement: 'pan_right', intensity: 0.5 },
    },
    {
      keywords: ['orbit', 'circle around', 'rotate around', '360'],
      config: { camera_movement: 'orbit_left', intensity: 0.5 },
    },
    {
      keywords: ['tracking', 'follow', 'following'],
      config: { camera_movement: 'tracking', intensity: 0.5 },
    },
    {
      keywords: ['crane up', 'rise', 'ascending', 'lift up'],
      config: { camera_movement: 'crane_up', intensity: 0.5 },
    },
    {
      keywords: ['crane down', 'descend', 'lower', 'drop down'],
      config: { camera_movement: 'crane_down', intensity: 0.5 },
    },
    {
      keywords: ['static', 'locked', 'still', 'no movement'],
      config: { camera_movement: 'static', intensity: 0.0 },
    },
    {
      keywords: ['handheld', 'documentary', 'organic movement'],
      config: { camera_movement: 'handheld', intensity: 0.4 },
    },
    {
      keywords: ['dolly', 'parallax'],
      config: { camera_movement: 'dolly_in', intensity: 0.5 },
    },
    {
      keywords: ['steadicam', 'smooth', 'floating', 'glide'],
      config: { camera_movement: 'steadicam', intensity: 0.5 },
    },
  ];
  
  for (const motion of explicitMotions) {
    if (motion.keywords.some(kw => lower.includes(kw))) {
      return motion.config;
    }
  }
  
  if (lower.includes('walking') || lower.includes('moving') || lower.includes('running')) {
    return { camera_movement: 'tracking', intensity: 0.5 };
  }
  
  if (lower.includes('product') && (lower.includes('table') || lower.includes('display'))) {
    return { camera_movement: 'orbit_left', intensity: 0.4 };
  }
  
  if (lower.includes('landscape') || lower.includes('wide shot') || lower.includes('establishing')) {
    return { camera_movement: 'pan_right', intensity: 0.3 };
  }
  
  if (lower.includes('detail') || lower.includes('close-up') || lower.includes('macro')) {
    return { camera_movement: 'push_in', intensity: 0.5 };
  }
  
  return null;
}

export function getMotionControl(
  sceneType: string,
  visualDirection: string,
  overrideConfig?: Partial<MotionControlConfig>
): MotionControlConfig {
  const contentMotion = analyzeMotionFromContent(visualDirection);
  const sceneTypeMotion = SCENE_TYPE_MOTION[sceneType] || SCENE_TYPE_MOTION['default'];
  
  return {
    ...sceneTypeMotion,
    ...contentMotion,
    ...overrideConfig,
  };
}

export const KLING_CAMERA_MAP: Record<CameraMovement, string> = {
  'static': 'none',
  'push_in': 'zoom_in',
  'pull_out': 'zoom_out',
  'pan_left': 'pan_left',
  'pan_right': 'pan_right',
  'tilt_up': 'tilt_up',
  'tilt_down': 'tilt_down',
  'orbit_left': 'rotate_left',
  'orbit_right': 'rotate_right',
  'tracking': 'tracking',
  'crane_up': 'crane_up',
  'crane_down': 'crane_down',
  'dolly_in': 'zoom_in',
  'dolly_out': 'zoom_out',
  'handheld': 'none',
  'steadicam': 'tracking',
};

export const VEO_MOTION_DESCRIPTIONS: Record<CameraMovement, string> = {
  'static': 'locked off camera, no movement',
  'push_in': 'slow cinematic push in toward subject',
  'pull_out': 'gradual pull back revealing wider scene',
  'pan_left': 'smooth horizontal pan to the left',
  'pan_right': 'smooth horizontal pan to the right',
  'tilt_up': 'gentle tilt upward',
  'tilt_down': 'gentle tilt downward',
  'orbit_left': 'camera slowly orbits around subject to the left',
  'orbit_right': 'camera slowly orbits around subject to the right',
  'tracking': 'camera smoothly tracks with moving subject',
  'crane_up': 'camera rises smoothly upward',
  'crane_down': 'camera descends smoothly',
  'dolly_in': 'camera dollies forward with parallax',
  'dolly_out': 'camera dollies backward with parallax',
  'handheld': 'subtle organic handheld movement',
  'steadicam': 'smooth floating steadicam movement',
};

export function mapToKlingMotion(config: MotionControlConfig): object {
  return {
    camera_control: {
      type: KLING_CAMERA_MAP[config.camera_movement] || 'none',
      config: {
        intensity: config.intensity,
      },
    },
  };
}

export function buildVeoMotionPrompt(
  basePrompt: string,
  motionConfig: MotionControlConfig
): string {
  const motionDescription = VEO_MOTION_DESCRIPTIONS[motionConfig.camera_movement] || '';
  
  const intensityModifier = motionConfig.intensity > 0.7 
    ? 'pronounced' 
    : motionConfig.intensity > 0.4 
      ? 'gentle' 
      : 'subtle';
  
  if (motionConfig.camera_movement === 'static') {
    return `${basePrompt}. Static shot, locked off camera, no movement.`;
  }
  
  return `${basePrompt}. Camera: ${intensityModifier} ${motionDescription}.`;
}

export const MOTION_OPTIONS = [
  { value: 'auto', label: 'Auto (Recommended)', description: 'AI selects based on scene type' },
  { value: 'static', label: 'Static', description: 'No camera movement' },
  { value: 'push_in', label: 'Push In', description: 'Zoom toward subject' },
  { value: 'pull_out', label: 'Pull Out', description: 'Zoom away from subject' },
  { value: 'orbit_left', label: 'Orbit Left', description: 'Circle around subject' },
  { value: 'orbit_right', label: 'Orbit Right', description: 'Circle around subject' },
  { value: 'pan_left', label: 'Pan Left', description: 'Horizontal pan' },
  { value: 'pan_right', label: 'Pan Right', description: 'Horizontal pan' },
  { value: 'tracking', label: 'Tracking', description: 'Follow moving subject' },
  { value: 'crane_up', label: 'Crane Up', description: 'Rise upward' },
  { value: 'crane_down', label: 'Crane Down', description: 'Descend' },
  { value: 'steadicam', label: 'Steadicam', description: 'Smooth floating movement' },
  { value: 'handheld', label: 'Handheld', description: 'Organic, documentary feel' },
  { value: 'dolly_in', label: 'Dolly In', description: 'Move forward with parallax' },
  { value: 'dolly_out', label: 'Dolly Out', description: 'Move backward with parallax' },
  { value: 'tilt_up', label: 'Tilt Up', description: 'Vertical tilt upward' },
  { value: 'tilt_down', label: 'Tilt Down', description: 'Vertical tilt downward' },
];
