export type WorkflowPath = 
  | 'standard'
  | 'product-image'
  | 'product-video'
  | 'logo-overlay-only'
  | 'brand-asset-direct'
  | 'product-hero';

export interface WorkflowDecision {
  path: WorkflowPath;
  confidence: number;
  reasons: string[];
  steps: WorkflowStep[];
  qualityImpact: 'higher' | 'same' | 'lower';
  costMultiplier: number;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  name: string;
  service: string;
  input: string;
  output: string;
  optional: boolean;
}

export interface WorkflowStepExecution {
  stepName: string;
  status: StepStatus;
  resultUrl?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowResult {
  success: boolean;
  path: WorkflowPath;
  imageUrl?: string;
  videoUrl?: string;
  intermediates: {
    environmentImage?: string;
    composedImage?: string;
    preLogoVideo?: string;
  };
  quality: {
    brandAccuracy: number;
    logoClarity: number;
    productVisibility: number;
    overallScore: number;
  };
  executionTimeMs: number;
  error?: string;
}

export interface WorkflowExecutionContext {
  sceneId: string;
  visualDirection: string;
  narration: string;
  sceneDuration: number;
  outputType: 'image' | 'video';
}

export interface LogoOverlayConfig {
  sceneId: string;
  duration: number;
  logos: Array<{
    type: 'primary' | 'watermark' | 'certification' | 'partner';
    position: string;
    animation: string;
  }>;
}
