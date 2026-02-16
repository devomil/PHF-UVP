import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Video,
  Mic,
  Music,
  Volume2,
  Image,
  Clock,
  DollarSign,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  CheckCircle,
  Layers,
  Eye,
  Type,
  Shuffle,
  ShieldCheck,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ContentTypeWarning } from './scene-editor/ContentTypeWarning';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import QualityTierSelector, { type QualityTier } from './quality-tier-selector';
import { MediaTypeIndicator, type MediaType } from './media-type-indicator';
import { QualityWarning } from './quality-warning';

interface ProviderCostBreakdown {
  displayName: string;
  scenes: number;
  cost: string;
}

interface GenerationEstimate {
  project: {
    title: string;
    sceneCount: number;
    totalDuration: number;
    visualStyle: string;
  };
  providers: {
    video: Record<string, number>;
    videoCostByProvider?: Record<string, ProviderCostBreakdown>;
    images?: { midjourney?: number; flux: number; falai: number };
    imageCosts?: { 
      midjourney?: { count: number; cost: string };
      flux: { count: number; cost: string }; 
      falai: { count: number; cost: string };
    };
    voiceover: string;
    music: string;
    soundFx: string;
  };
  soundDesign?: {
    voiceover: { provider: string; voice: string; style?: string; totalDuration: number };
    music: { provider: string; style: string; mood: string; duration: number };
    ambientCount: number;
    transitionCount: number;
    accentCount: number;
  };
  intelligence?: {
    sceneAnalysis: { provider: string; enabled: boolean };
    textPlacement: { enabled: boolean; overlayCount: number };
    transitions: { enabled: boolean; moodMatched: boolean };
  };
  transitions?: {
    total: number;
    summary: {
      cuts: number;
      fades: number;
      dissolves: number;
      wipes: number;
      zooms: number;
      slides: number;
    };
  };
  qualityAssurance?: {
    enabled: boolean;
    provider: string;
    checks: string[];
  };
  tierSummaries?: {
    ultra: { total: number; video: number; images: number; voiceover: number; music: number; soundFx: number; sceneAnalysis: number; qualityAssurance: number; topVideoProviders: string[]; imageProviders: string[] };
    premium: { total: number; video: number; images: number; voiceover: number; music: number; soundFx: number; sceneAnalysis: number; qualityAssurance: number; topVideoProviders: string[]; imageProviders: string[] };
    standard: { total: number; video: number; images: number; voiceover: number; music: number; soundFx: number; sceneAnalysis: number; qualityAssurance: number; topVideoProviders: string[]; imageProviders: string[] };
  };
  sceneBreakdown: Array<{
    sceneIndex: number;
    sceneType: string;
    contentType: string;
    duration: number;
    provider: string;
    providerName?: string;
    fallbackProvider: string;
    costPerSecond?: number;
    providerReason?: string;
    confidence?: number;
    alternatives?: string[];
    mediaType?: 't2v' | 'i2v' | 'image-motion' | 'stock';
    mediaTypeReason?: string;
    forcedByTier?: boolean;
    intelligence?: {
      analysisStatus: 'pending' | 'complete' | 'error';
      textPlacement?: {
        position: 'top' | 'center' | 'bottom' | 'lower-third';
        alignment: 'left' | 'center' | 'right';
      };
      transitionToNext?: {
        type: string;
        duration: number;
        moodMatch: string;
        reason?: string;
      };
    };
  }>;
  costs: {
    video: string;
    videoCostBreakdown?: Record<string, ProviderCostBreakdown>;
    images?: string;
    voiceover: string;
    music: string;
    soundFx: string;
    sceneAnalysis?: string;
    qualityAssurance?: string;
    total: string;
  };
  time: {
    estimatedMinutes: string;
    perScene: number;
  };
  brandElements: Array<{
    type: string;
    name: string;
    description: string;
    scene: string;
  }>;
  brandName: string;
  warnings: string[];
  qualityTier?: 'ultra' | 'premium' | 'standard';
}

interface QAStats {
  approved: number;
  needsReview: number;
  rejected: number;
  score: number;
}

interface SceneForContentType {
  id: string;
  order: number;
  type?: string;
  visualDirection?: string;
  contentType?: string;
}

interface GenerationPreviewPanelProps {
  projectId: string;
  onGenerate: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  qaStats?: QAStats | null;
  onOpenQADashboard?: () => void;
  scenes?: SceneForContentType[];
}

const PROVIDER_COLORS: Record<string, string> = {
  runway: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'runway-gen3': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  kling: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'kling-1.6': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'kling-2.0': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'kling-2.1': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'kling-2.5-turbo': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'kling-avatar': 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  'kling-effects': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  hailuo: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'hailuo-minimax': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  luma: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'luma-dream-machine': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  hunyuan: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  veo: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'veo-2': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'veo-3.1': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'wan-2.1': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'wan-2.6': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'seedance-1.0': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  'remotion-motion-graphics': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  flux: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'flux-1-dev': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'fal.ai': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
};

const PROVIDER_NAMES: Record<string, string> = {
  runway: 'Runway Gen-3',
  kling: 'Kling AI',
  'kling-1.6': 'Kling 1.6',
  'kling-2.0': 'Kling 2.0',
  'kling-2.1': 'Kling 2.1',
  'kling-2.5-turbo': 'Kling 2.5 Turbo',
  'kling-avatar': 'Kling Avatar',
  'kling-effects': 'Kling Effects',
  hailuo: 'Hailuo MiniMax',
  'hailuo-minimax': 'Hailuo MiniMax',
  luma: 'Luma Dream Machine',
  'luma-dream-machine': 'Luma Dream Machine',
  hunyuan: 'Hunyuan',
  veo: 'Veo',
  'veo-2': 'Veo 2',
  'veo-3.1': 'Veo 3.1',
  'wan-2.1': 'Wan 2.1',
  'wan-2.6': 'Wan 2.6',
  'seedance-1.0': 'Seedance 1.0',
  'remotion-motion-graphics': 'Remotion (Motion Graphics)',
  flux: 'Flux.1',
  'flux-1-dev': 'Flux.1 Dev',
  'fal.ai': 'fal.ai',
  falai: 'fal.ai',
};

const IMAGE_PROVIDER_INFO: Record<string, { displayName: string; useCase: string; colorClass: string }> = {
  midjourney: { displayName: 'Midjourney', useCase: 'premium', colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  flux: { displayName: 'Flux.1', useCase: 'products', colorClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  falai: { displayName: 'fal.ai', useCase: 'lifestyle', colorClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
};

export function GenerationPreviewPanel({
  projectId,
  onGenerate,
  onCancel,
  isGenerating,
  qaStats,
  onOpenQADashboard,
  scenes,
}: GenerationPreviewPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showSceneDetails, setShowSceneDetails] = useState(false);

  // Phase 14C: Quality tier state
  const [qualityTier, setQualityTier] = useState<QualityTier>('premium');
  const [hasUserChangedTier, setHasUserChangedTier] = useState(false);

  // State to track batch updates
  const [batchUpdateCount, setBatchUpdateCount] = useState(0);
  
  // Phase 14C: Quality tier mutation
  const updateQualityTierMutation = useMutation({
    mutationFn: async (tier: QualityTier) => {
      const response = await apiRequest(
        'PATCH',
        `/api/universal-video/projects/${projectId}/quality-tier`,
        { qualityTier: tier }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update quality tier');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId, 'generation-estimate'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update quality tier",
        variant: "destructive",
      });
    },
  });
  
  const handleQualityTierChange = (tier: QualityTier) => {
    setHasUserChangedTier(true);
    setQualityTier(tier);
    updateQualityTierMutation.mutate(tier);
  };
  
  // Phase 12 Addendum: Shared helper for content type API call
  const updateContentTypeApi = async (sceneId: string, contentType: string) => {
    const response = await apiRequest(
      'PATCH',
      `/api/universal-video/projects/${projectId}/scenes/${sceneId}/content-type`,
      { contentType }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to update content type');
    }
    return response.json();
  };
  
  // Single-item mutation with immediate feedback
  const updateContentTypeMutation = useMutation({
    mutationFn: async ({ sceneId, contentType }: { sceneId: string; contentType: string }) => {
      return updateContentTypeApi(sceneId, contentType);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId, 'generation-estimate'] });
      toast({
        title: "Content Type Updated",
        description: "Scene content type has been set.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update content type",
        variant: "destructive",
      });
    },
  });
  
  // Handle single content type change
  const handleContentTypeChange = (sceneId: string, contentType: string) => {
    updateContentTypeMutation.mutate({ sceneId, contentType });
  };

  // Handle batch update for Accept All - executes sequentially using shared API helper
  const handleBatchContentTypeChange = async (updates: { sceneId: string; contentType: string }[]) => {
    if (updates.length === 0) return;
    
    setBatchUpdateCount(updates.length);
    let successCount = 0;
    const errors: string[] = [];
    
    // Execute updates sequentially using the shared API helper
    for (const { sceneId, contentType } of updates) {
      try {
        await updateContentTypeApi(sceneId, contentType);
        successCount++;
      } catch (err: any) {
        errors.push(err.message || `Scene ${sceneId} failed`);
      }
    }
    
    // Always refresh to show current state after all updates
    await queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
    queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId, 'generation-estimate'] });
    
    if (successCount === updates.length) {
      toast({
        title: "All Content Types Updated",
        description: `${successCount} scene(s) updated successfully.`,
      });
    } else if (successCount > 0) {
      toast({
        title: "Partial Update",
        description: `${successCount}/${updates.length} scenes updated. ${errors.length} failed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Update Failed",
        description: errors[0] || "All updates failed",
        variant: "destructive",
      });
    }
    
    setBatchUpdateCount(0);
  };

  const { data: estimate, isLoading, error } = useQuery<GenerationEstimate>({
    queryKey: ['/api/universal-video/projects', projectId, 'generation-estimate', qualityTier],
    queryFn: async () => {
      const response = await fetch(`/api/universal-video/projects/${projectId}/generation-estimate?tier=${qualityTier}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load estimate');
      return response.json();
    },
    staleTime: 30 * 1000,
  });
  
  useEffect(() => {
    // Only sync from backend on initial load, not after user has changed the tier
    if (!hasUserChangedTier && estimate?.qualityTier && estimate.qualityTier !== qualityTier) {
      setQualityTier(estimate.qualityTier);
    }
  }, [estimate?.qualityTier, hasUserChangedTier]);

  if (isLoading) {
    return (
      <Card className="border-primary/50 bg-primary/5" data-testid="generation-preview-loading">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Calculating generation preview...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !estimate) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950" data-testid="generation-preview-error">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load generation preview</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" data-testid="generation-preview-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Generation Preview
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Phase 14C: Quality Tier Selector - uses backend tier summaries for accurate costs */}
        <QualityTierSelector
          value={qualityTier}
          onChange={handleQualityTierChange}
          sceneDuration={estimate.project.totalDuration}
          sceneCount={estimate.project.sceneCount}
          tierSummaries={estimate.tierSummaries}
        />
        
        {/* Provider Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="provider-summary">
          {/* Video - Enhanced with per-provider costs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Video className="h-4 w-4" />
              <span className="text-xs font-medium">Video</span>
            </div>
            <div className="space-y-1">
              {estimate.providers.videoCostByProvider ? (
                Object.entries(estimate.providers.videoCostByProvider).map(([provider, info]) => (
                  <div key={provider} className="flex items-center justify-between">
                    <Badge variant="secondary" className={`text-xs ${PROVIDER_COLORS[provider] || ''}`} data-testid={`provider-badge-${provider}`}>
                      {info.displayName}
                    </Badge>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {info.scenes} × ${info.cost}
                    </span>
                  </div>
                ))
              ) : (
                Object.entries(estimate.providers.video).map(([provider, count]) => (
                  <div key={provider} className="flex items-center justify-between">
                    <Badge variant="secondary" className={`text-xs ${PROVIDER_COLORS[provider] || ''}`} data-testid={`provider-badge-${provider}`}>
                      {PROVIDER_NAMES[provider] || provider}
                    </Badge>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{count} scenes</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Voiceover - Enhanced Phase 9E */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Mic className="h-4 w-4" />
              <span className="text-xs font-medium">Voiceover</span>
            </div>
            <div data-testid="provider-voiceover">
              {estimate.soundDesign?.voiceover ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {estimate.soundDesign.voiceover.provider} - {estimate.soundDesign.voiceover.voice}
                    {estimate.soundDesign.voiceover.style && (
                      <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
                        ({estimate.soundDesign.voiceover.style})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(estimate.soundDesign.voiceover.totalDuration)}s total
                  </p>
                </div>
              ) : (
                <p className="text-sm font-medium">{estimate.providers.voiceover}</p>
              )}
            </div>
          </div>

          {/* Music - Enhanced Phase 9E */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Music className="h-4 w-4" />
              <span className="text-xs font-medium">Music</span>
            </div>
            <div data-testid="provider-music">
              {estimate.soundDesign?.music ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {estimate.soundDesign.music.provider} - {estimate.soundDesign.music.style}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {estimate.soundDesign.music.mood} • {Math.round(estimate.soundDesign.music.duration)}s
                  </p>
                </div>
              ) : (
                <p className="text-sm font-medium">{estimate.providers.music}</p>
              )}
            </div>
          </div>

          {/* Sound FX - Enhanced with Kling Sound details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Volume2 className="h-4 w-4" />
              <span className="text-xs font-medium">Sound FX</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium" data-testid="provider-soundfx">{estimate.providers.soundFx}</p>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                <div className="flex justify-between">
                  <span>Ambient sounds</span>
                  <span>{estimate.soundDesign?.ambientCount ?? estimate.project.sceneCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transitions</span>
                  <span>{estimate.soundDesign?.transitionCount ?? Math.max(0, estimate.project.sceneCount - 1)}</span>
                </div>
                {(estimate.soundDesign?.accentCount ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Accent sounds</span>
                    <span>{estimate.soundDesign?.accentCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Images Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border" data-testid="images-section">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
            <Image className="h-4 w-4" />
            <span className="text-xs font-medium">Image Generation</span>
          </div>
          {(estimate.providers.images?.midjourney ?? 0) > 0 || (estimate.providers.images?.flux ?? 0) > 0 || (estimate.providers.images?.falai ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {(estimate.providers.images?.midjourney ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={`text-xs ${IMAGE_PROVIDER_INFO.midjourney.colorClass}`}>
                    {IMAGE_PROVIDER_INFO.midjourney.displayName}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {estimate.providers.images?.midjourney ?? 0} images
                    </span>
                    <span className="text-xs text-gray-400">
                      ({IMAGE_PROVIDER_INFO.midjourney.useCase})
                    </span>
                    {estimate.providers.imageCosts?.midjourney && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ${estimate.providers.imageCosts.midjourney.cost}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {(estimate.providers.images?.flux ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={`text-xs ${IMAGE_PROVIDER_INFO.flux.colorClass}`}>
                    {IMAGE_PROVIDER_INFO.flux.displayName}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {estimate.providers.images?.flux ?? 0} images
                    </span>
                    <span className="text-xs text-gray-400">
                      ({IMAGE_PROVIDER_INFO.flux.useCase})
                    </span>
                    {estimate.providers.imageCosts?.flux && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ${estimate.providers.imageCosts.flux.cost}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {(estimate.providers.images?.falai ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={`text-xs ${IMAGE_PROVIDER_INFO.falai.colorClass}`}>
                    {IMAGE_PROVIDER_INFO.falai.displayName}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {estimate.providers.images?.falai ?? 0} images
                    </span>
                    <span className="text-xs text-gray-400">
                      ({IMAGE_PROVIDER_INFO.falai.useCase})
                    </span>
                    {estimate.providers.imageCosts?.falai && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ${estimate.providers.imageCosts.falai.cost}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No standalone images needed</p>
          )}
        </div>

        {/* Intelligence Features (Phase 7D) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border" data-testid="intelligence-section">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
            <Brain className="h-4 w-4" />
            <span className="text-xs font-medium">Intelligence</span>
          </div>
          <div className="space-y-2">
            {/* Scene Analysis */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm">Scene Analysis</span>
              </div>
              <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                {estimate.intelligence?.sceneAnalysis?.provider || 'Claude Vision'}
              </Badge>
            </div>
            
            {/* Text Placement */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-sm">Text Placement</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Smart positioning ({estimate.intelligence?.textPlacement?.overlayCount || estimate.project.sceneCount} overlays)
              </span>
            </div>
            
            {/* Transitions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shuffle className="h-3.5 w-3.5 text-green-500" />
                <span className="text-sm">Transitions</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Mood-matched ({estimate.transitions?.total ?? Math.max(0, estimate.project.sceneCount - 1)})
              </span>
            </div>
            
            {/* Transition breakdown */}
            {estimate.transitions && (estimate.transitions.summary.dissolves > 0 || estimate.transitions.summary.fades > 0 || estimate.transitions.summary.cuts > 0) && (
              <div className="pl-5 text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                {estimate.transitions.summary.dissolves > 0 && (
                  <div>{estimate.transitions.summary.dissolves} dissolves</div>
                )}
                {estimate.transitions.summary.fades > 0 && (
                  <div>{estimate.transitions.summary.fades} fades</div>
                )}
                {estimate.transitions.summary.cuts > 0 && (
                  <div>{estimate.transitions.summary.cuts} cuts</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quality Assurance - Enhanced Phase 9E */}
        <div 
          className={`bg-white dark:bg-gray-800 rounded-lg p-3 border ${onOpenQADashboard ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors' : ''}`}
          onClick={onOpenQADashboard}
          data-testid="qa-section"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-medium">Quality Assurance</span>
            </div>
            {onOpenQADashboard && (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
          
          {qaStats ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5 inline mr-1" />
                  {qaStats.approved} approved
                </span>
                <span className="text-gray-300 dark:text-gray-600">│</span>
                <span className="text-yellow-600 dark:text-yellow-400">
                  {qaStats.needsReview} need review
                </span>
                <span className="text-gray-300 dark:text-gray-600">│</span>
                <span className={`font-bold ${
                  qaStats.score >= 85 ? 'text-green-600 dark:text-green-400' :
                  qaStats.score >= 70 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {qaStats.score}/100
                </span>
              </div>
              {qaStats.rejected > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  {qaStats.rejected} scenes need attention
                </div>
              )}
            </div>
          ) : estimate.qualityAssurance?.enabled ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-sm">Automated Review</span>
                </div>
                <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                  {estimate.qualityAssurance.provider}
                </Badge>
              </div>
              
              <div className="text-xs text-gray-500 dark:text-gray-400 pl-5 space-y-1">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>AI artifact detection (text, UI)</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>Brand compliance scoring</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>Technical quality check</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">
              QA analysis pending...
            </div>
          )}
        </div>

        {/* Brand Elements */}
        {estimate.brandElements.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border" data-testid="brand-elements-section">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Image className="h-4 w-4" />
              <span className="text-xs font-medium">Brand Elements ({estimate.brandName})</span>
            </div>
            <div className="space-y-2">
              {estimate.brandElements.map((element, idx) => (
                <div key={idx} className="flex items-start justify-between text-sm" data-testid={`brand-element-${element.type}`}>
                  <div>
                    <span className="font-medium">{element.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs block">{element.description}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {element.scene}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 15G: Quality Warning for Standard Tier */}
        {(() => {
          const imageMotionCount = estimate.sceneBreakdown.filter(s => s.mediaType === 'image-motion').length;
          const tier = qualityTier || estimate.qualityTier || 'standard';
          if (imageMotionCount > 0 && tier === 'standard') {
            return (
              <QualityWarning 
                tier="standard" 
                imageMotionScenes={imageMotionCount}
                totalScenes={estimate.sceneBreakdown.length}
              />
            );
          }
          return null;
        })()}

        {/* Scene Breakdown (Collapsible) */}
        <Collapsible open={showSceneDetails} onOpenChange={setShowSceneDetails}>
          <CollapsibleTrigger asChild>
            <button 
              className="flex items-center justify-between w-full bg-white dark:bg-gray-800 rounded-lg p-3 border hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              data-testid="scene-breakdown-trigger"
            >
              <span className="text-sm font-medium">
                Scene Breakdown ({estimate.project.sceneCount} scenes, {estimate.project.totalDuration}s)
              </span>
              {showSceneDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg border divide-y dark:divide-gray-700" data-testid="scene-breakdown-list">
              {estimate.sceneBreakdown.map((scene) => (
                <div key={scene.sceneIndex} className="p-2 text-sm" data-testid={`scene-breakdown-${scene.sceneIndex}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-6">#{scene.sceneIndex + 1}</span>
                      <Badge variant="secondary" className="text-xs">
                        {scene.sceneType}
                      </Badge>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{scene.contentType}</span>
                      {/* Phase 15G: Media Type Indicator */}
                      {scene.mediaType && (
                        <MediaTypeIndicator mediaType={scene.mediaType} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{scene.duration}s</span>
                      <Badge variant="secondary" className={`text-xs ${PROVIDER_COLORS[scene.provider] || ''}`} title={scene.providerReason || ''}>
                        {scene.providerName || PROVIDER_NAMES[scene.provider] || scene.provider}
                      </Badge>
                      {scene.confidence !== undefined && (
                        <span className={`text-xs ${scene.confidence >= 80 ? 'text-green-600' : scene.confidence >= 60 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {scene.confidence}%
                        </span>
                      )}
                    </div>
                  </div>
                  {(scene.providerReason || (scene.alternatives && scene.alternatives.length > 0) || scene.mediaTypeReason) && (
                    <div className="ml-6 mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      {scene.providerReason && (
                        <span className="italic">{scene.providerReason}</span>
                      )}
                      {scene.mediaTypeReason && (
                        <span className={`italic ${scene.forcedByTier ? 'text-amber-500' : ''}`}>
                          {scene.mediaTypeReason}
                        </span>
                      )}
                      {scene.alternatives && scene.alternatives.length > 0 && (
                        <span className="hidden md:inline">
                          Alt: {scene.alternatives.map(a => PROVIDER_NAMES[a] || a).join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Phase 7D: Per-scene intelligence info */}
                  {scene.intelligence && (
                    <div className="ml-6 mt-1 space-y-1">
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {scene.intelligence.textPlacement && (
                          <span className="flex items-center gap-1">
                            <Type className="h-3 w-3 text-purple-400" />
                            Text: {scene.intelligence.textPlacement.position}
                          </span>
                        )}
                      </div>
                      {scene.intelligence.transitionToNext && (
                        <div className="text-xs text-gray-400 space-y-0.5 border-l-2 border-green-400/30 pl-2 ml-0.5">
                          <div className="flex items-center gap-2">
                            <Shuffle className="h-3 w-3 text-green-400" />
                            <span className="text-gray-500">Scene {scene.sceneIndex + 1} → Scene {scene.sceneIndex + 2} transition:</span>
                          </div>
                          <div className="pl-5">
                            <div>Type: <span className="text-green-500">{scene.intelligence.transitionToNext.type}</span> ({scene.intelligence.transitionToNext.duration}s)</div>
                            {scene.intelligence.transitionToNext.moodMatch && (
                              <div>Mood match: <span className="text-blue-400">{scene.intelligence.transitionToNext.moodMatch}</span></div>
                            )}
                            {scene.intelligence.transitionToNext.reason && (
                              <div className="text-gray-500 italic">Reason: {scene.intelligence.transitionToNext.reason}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Cost & Time */}
        <div className="grid grid-cols-2 gap-3" data-testid="cost-time-section">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Estimated Cost</span>
            </div>
            <p className="text-2xl font-bold text-primary" data-testid="total-cost">${estimate.costs.total}</p>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
              <div className="flex justify-between">
                <span>Video generation</span>
                <span>${estimate.costs.video}</span>
              </div>
              {estimate.costs.images && parseFloat(estimate.costs.images) > 0 && (
                <div className="flex justify-between">
                  <span>Image generation</span>
                  <span>${estimate.costs.images}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Voiceover</span>
                <span>${estimate.costs.voiceover}</span>
              </div>
              <div className="flex justify-between">
                <span>Music</span>
                <span>${estimate.costs.music}</span>
              </div>
              <div className="flex justify-between">
                <span>Sound FX</span>
                <span>${estimate.costs.soundFx}</span>
              </div>
              {estimate.costs.sceneAnalysis && parseFloat(estimate.costs.sceneAnalysis) > 0 && (
                <div className="flex justify-between">
                  <span>Scene analysis</span>
                  <span>${estimate.costs.sceneAnalysis}</span>
                </div>
              )}
              {estimate.costs.qualityAssurance && parseFloat(estimate.costs.qualityAssurance) > 0 && (
                <div className="flex justify-between">
                  <span>Quality assurance</span>
                  <span>${estimate.costs.qualityAssurance}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Estimated Time</span>
            </div>
            <p className="text-2xl font-bold" data-testid="estimated-time">{estimate.time.estimatedMinutes} min</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ~{estimate.time.perScene}s per scene
            </p>
          </div>
        </div>

        {/* Phase 12 Addendum: Actionable Content Type Warning */}
        {scenes && scenes.length > 0 && (
          <ContentTypeWarning
            scenes={scenes}
            onContentTypeChange={handleContentTypeChange}
            onBatchContentTypeChange={handleBatchContentTypeChange}
            isPending={updateContentTypeMutation.isPending || batchUpdateCount > 0}
          />
        )}

        {/* Generic Warnings (excluding content type warnings which are now actionable) */}
        {estimate.warnings.filter(w => !w.toLowerCase().includes('content type')).length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3" data-testid="warnings-section">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Warnings</span>
            </div>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              {estimate.warnings.filter(w => !w.toLowerCase().includes('content type')).map((warning, idx) => (
                <li key={idx} className="flex items-start gap-2" data-testid={`warning-${idx}`}>
                  <span className="text-yellow-500">•</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t" data-testid="action-buttons">
          <Button variant="ghost" onClick={onCancel} disabled={isGenerating} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={onGenerate} 
            disabled={isGenerating} 
            className={cn(
              "gap-2",
              qualityTier === 'ultra' ? 'bg-purple-600 hover:bg-purple-700 text-white' :
              qualityTier === 'premium' ? 'bg-amber-600 hover:bg-amber-700 text-white' :
              'bg-blue-600 hover:bg-blue-700 text-white'
            )}
            data-testid="button-generate"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Assets (${estimate.costs.total})
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default GenerationPreviewPanel;
