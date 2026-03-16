import { useQuery } from '@tanstack/react-query';
import {
  Video,
  Image,
  Zap,
  DollarSign,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  Cpu,
  Volume2,
  Film,
  Sparkles,
  Move,
  Filter,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

interface ProviderCapabilities {
  imageToVideo: boolean;
  textToVideo: boolean;
  imageToImage: boolean;
  videoToVideo?: boolean;
  maxResolution: string;
  maxFps: number;
  maxDuration: number;
  strengths: string[];
  weaknesses: string[];
  motionQuality: string;
  temporalConsistency: string;
  nativeAudio: boolean;
  lipSync: boolean;
  effectsPresets: string[];
  audioCapabilities?: {
    voiceGeneration: boolean;
    soundEffects: boolean;
    ambientSound: boolean;
    audioVisualSync: boolean;
    supportedLanguages?: string[];
  };
  motionControlCapabilities?: {
    motionTransfer: boolean;
    referenceVideoDuration: { min: number; max: number };
    maxAnimatedElements: number;
    audioPreservation: boolean;
    supportedActions: string[];
  };
}

interface Provider {
  id: string;
  name: string;
  version: string;
  costPer10Seconds: number;
  capabilities: ProviderCapabilities;
  apiProvider: string;
  modelId: string;
  isExecutable: boolean;
  legacyId: string;
}

interface ProviderRegistryResponse {
  success: boolean;
  totalProviders: number;
  providers: Provider[];
  families: {
    kling: Provider[];
    wan: Provider[];
    veo: Provider[];
    other: Provider[];
  };
  videoProviders: Array<{
    id: string;
    name: string;
    costPer10Seconds: number;
    isExecutable: boolean;
  }>;
}

const FAMILY_COLORS: Record<string, string> = {
  kling: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300',
  wan: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300',
  veo: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 border-gray-300',
};

const MOTION_QUALITY_COLORS: Record<string, string> = {
  excellent: 'text-green-600 dark:text-green-400',
  cinematic: 'text-purple-600 dark:text-purple-400',
  good: 'text-blue-600 dark:text-blue-400',
  basic: 'text-gray-600 dark:text-gray-400',
};

function ProviderCard({ provider, familyColor }: { provider: Provider; familyColor: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`rounded-lg border p-3 ${familyColor}`} data-testid={`provider-card-${provider.id}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{provider.name}</span>
                <Badge variant="outline" className="text-xs">
                  v{provider.version}
                </Badge>
                {(provider.capabilities.nativeAudio || provider.capabilities.audioCapabilities) && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    <Volume2 className="w-3 h-3 mr-0.5" />
                    Audio
                  </Badge>
                )}
                {provider.capabilities.motionControlCapabilities && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    <Move className="w-3 h-3 mr-0.5" />
                    Motion
                  </Badge>
                )}
                {provider.isExecutable ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-gray-400" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">${provider.costPer10Seconds.toFixed(2)}/10s</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t border-current/10 space-y-2 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              {provider.capabilities.textToVideo && (
                <div className="flex items-center gap-1">
                  <Film className="h-3 w-3" />
                  <span>Text→Video</span>
                </div>
              )}
              {provider.capabilities.imageToVideo && (
                <div className="flex items-center gap-1">
                  <Image className="h-3 w-3" />
                  <span>Image→Video</span>
                </div>
              )}
              {provider.capabilities.videoToVideo && (
                <div className="flex items-center gap-1">
                  <Move className="h-3 w-3" />
                  <span>Video→Video</span>
                </div>
              )}
              {provider.capabilities.nativeAudio && (
                <div className="flex items-center gap-1">
                  <Volume2 className="h-3 w-3" />
                  <span>Audio</span>
                </div>
              )}
              {provider.capabilities.lipSync && (
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  <span>Lip Sync</span>
                </div>
              )}
            </div>
            
            {/* Motion Control capabilities */}
            {provider.capabilities.motionControlCapabilities && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-2 text-xs">
                <div className="font-medium text-purple-700 dark:text-purple-300 mb-1">Motion Control</div>
                <div className="text-purple-600 dark:text-purple-400">
                  Reference: {provider.capabilities.motionControlCapabilities.referenceVideoDuration.min}-{provider.capabilities.motionControlCapabilities.referenceVideoDuration.max}s
                  • Up to {provider.capabilities.motionControlCapabilities.maxAnimatedElements} animated elements
                </div>
                <div className="text-purple-500 dark:text-purple-500 mt-1">
                  Actions: {provider.capabilities.motionControlCapabilities.supportedActions.slice(0, 4).join(', ')}...
                </div>
              </div>
            )}
            
            {/* Audio capabilities details */}
            {provider.capabilities.audioCapabilities && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 text-xs">
                <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">Native Audio Generation</div>
                <div className="flex gap-3 text-blue-600 dark:text-blue-400">
                  {provider.capabilities.audioCapabilities.voiceGeneration && <span>Voice</span>}
                  {provider.capabilities.audioCapabilities.soundEffects && <span>SFX</span>}
                  {provider.capabilities.audioCapabilities.ambientSound && <span>Ambient</span>}
                  {provider.capabilities.audioCapabilities.audioVisualSync && <span>A/V Sync</span>}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-gray-500">Motion:</span>
              <span className={MOTION_QUALITY_COLORS[provider.capabilities.motionQuality] || ''}>
                {provider.capabilities.motionQuality}
              </span>
              <span className="text-gray-500 ml-2">Max:</span>
              <span>{provider.capabilities.maxDuration}s @ {provider.capabilities.maxResolution}</span>
            </div>

            <div>
              <span className="text-gray-500">Strengths: </span>
              <span>{provider.capabilities.strengths.join(', ')}</span>
            </div>

            {provider.capabilities.weaknesses.length > 0 && (
              <div>
                <span className="text-gray-500">Weaknesses: </span>
                <span className="text-orange-600 dark:text-orange-400">
                  {provider.capabilities.weaknesses.join(', ')}
                </span>
              </div>
            )}

            {provider.capabilities.effectsPresets.length > 0 && (
              <div>
                <span className="text-gray-500">Effects: </span>
                <span>{provider.capabilities.effectsPresets.join(', ')}</span>
              </div>
            )}

            <div className="text-gray-400 pt-1">
              API: {provider.apiProvider} • Model: {provider.modelId}
              {provider.legacyId !== provider.id && ` • Legacy ID: ${provider.legacyId}`}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ProviderFamily({ 
  name, 
  providers, 
  colorClass 
}: { 
  name: string; 
  providers: Provider[]; 
  colorClass: string;
}) {
  const [expanded, setExpanded] = useState(name === 'kling');

  if (providers.length === 0) return null;

  const executableCount = providers.filter(p => p.isExecutable).length;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button 
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          data-testid={`provider-family-${name}`}
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-gray-500" />
            <span className="font-medium capitalize">{name} Family</span>
            <Badge variant="secondary" className="text-xs">
              {providers.length} providers
            </Badge>
            {executableCount > 0 && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                {executableCount} active
              </Badge>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-2 pl-6">
          {providers.map(provider => (
            <ProviderCard key={provider.id} provider={provider} familyColor={colorClass} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface CapabilityFilters {
  hasAudio: boolean;
  hasMotionControl: boolean;
  textToVideo: boolean;
  imageToVideo: boolean;
  activeOnly: boolean;
}

function applyFilters(providers: Provider[], filters: CapabilityFilters): Provider[] {
  return providers.filter(provider => {
    if (filters.activeOnly && !provider.isExecutable) return false;
    if (filters.hasAudio && !provider.capabilities.nativeAudio && !provider.capabilities.audioCapabilities) return false;
    if (filters.hasMotionControl && !provider.capabilities.motionControlCapabilities) return false;
    if (filters.textToVideo && !provider.capabilities.textToVideo) return false;
    if (filters.imageToVideo && !provider.capabilities.imageToVideo) return false;
    return true;
  });
}

export function ProviderRegistryPanel() {
  const [filters, setFilters] = useState<CapabilityFilters>({
    hasAudio: false,
    hasMotionControl: false,
    textToVideo: false,
    imageToVideo: false,
    activeOnly: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  
  const { data, isLoading, error } = useQuery<ProviderRegistryResponse>({
    queryKey: ['/api/universal-video/provider-registry'],
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card data-testid="provider-registry-loading">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-gray-500">
            <Cpu className="h-4 w-4 animate-pulse" />
            <span>Loading provider registry...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card className="border-red-200" data-testid="provider-registry-error">
        <CardContent className="p-6">
          <div className="text-red-600 dark:text-red-400">
            Failed to load provider registry
          </div>
        </CardContent>
      </Card>
    );
  }

  const executableProviders = data.providers.filter(p => p.isExecutable);
  const totalCostRange = {
    min: Math.min(...data.providers.map(p => p.costPer10Seconds)),
    max: Math.max(...data.providers.map(p => p.costPer10Seconds)),
  };
  
  // Apply filters to each family
  const filteredFamilies = {
    kling: applyFilters(data.families.kling, filters),
    wan: applyFilters(data.families.wan, filters),
    veo: applyFilters(data.families.veo, filters),
    other: applyFilters(data.families.other, filters),
  };
  
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  return (
    <Card data-testid="provider-registry-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Provider Registry
          </div>
          <div className="flex items-center gap-2 text-sm font-normal">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={activeFiltersCount > 0 ? 'border-blue-400 bg-blue-50' : ''}
              data-testid="toggle-filters-button"
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            <Badge variant="secondary">
              {data.totalProviders} total
            </Badge>
            <Badge variant="outline" className="text-green-600 border-green-300">
              {executableProviders.length} active
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Capability Filters */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-3" data-testid="capability-filters">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Filter by Capability</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="filter-audio"
                  checked={filters.hasAudio}
                  onCheckedChange={(checked) => setFilters(f => ({ ...f, hasAudio: checked }))}
                  data-testid="filter-audio-switch"
                />
                <Label htmlFor="filter-audio" className="text-sm flex items-center gap-1">
                  <Volume2 className="h-3.5 w-3.5" /> Native Audio
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="filter-motion"
                  checked={filters.hasMotionControl}
                  onCheckedChange={(checked) => setFilters(f => ({ ...f, hasMotionControl: checked }))}
                  data-testid="filter-motion-switch"
                />
                <Label htmlFor="filter-motion" className="text-sm flex items-center gap-1">
                  <Move className="h-3.5 w-3.5" /> Motion Control
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="filter-text-to-video"
                  checked={filters.textToVideo}
                  onCheckedChange={(checked) => setFilters(f => ({ ...f, textToVideo: checked }))}
                  data-testid="filter-t2v-switch"
                />
                <Label htmlFor="filter-text-to-video" className="text-sm flex items-center gap-1">
                  <Film className="h-3.5 w-3.5" /> Text→Video
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="filter-image-to-video"
                  checked={filters.imageToVideo}
                  onCheckedChange={(checked) => setFilters(f => ({ ...f, imageToVideo: checked }))}
                  data-testid="filter-i2v-switch"
                />
                <Label htmlFor="filter-image-to-video" className="text-sm flex items-center gap-1">
                  <Image className="h-3.5 w-3.5" /> Image→Video
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="filter-active"
                  checked={filters.activeOnly}
                  onCheckedChange={(checked) => setFilters(f => ({ ...f, activeOnly: checked }))}
                  data-testid="filter-active-switch"
                />
                <Label htmlFor="filter-active" className="text-sm flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> Active Only
                </Label>
              </div>
            </div>
            {activeFiltersCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setFilters({ hasAudio: false, hasMotionControl: false, textToVideo: false, imageToVideo: false, activeOnly: false })}
                className="text-xs"
                data-testid="clear-filters-button"
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Video Providers</div>
            <div className="font-medium">{data.videoProviders.length}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Cost Range</div>
            <div className="font-medium">
              ${totalCostRange.min.toFixed(2)} - ${totalCostRange.max.toFixed(2)}/10s
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Kling Family</div>
            <div className="font-medium">{data.families.kling.length} variants</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-gray-500 text-xs mb-1">Veo Family</div>
            <div className="font-medium">{data.families.veo.length} variants</div>
          </div>
        </div>

        <div className="space-y-2">
          <ProviderFamily 
            name="kling" 
            providers={filteredFamilies.kling} 
            colorClass={FAMILY_COLORS.kling}
          />
          <ProviderFamily 
            name="wan" 
            providers={filteredFamilies.wan} 
            colorClass={FAMILY_COLORS.wan}
          />
          <ProviderFamily 
            name="veo" 
            providers={filteredFamilies.veo} 
            colorClass={FAMILY_COLORS.veo}
          />
          <ProviderFamily 
            name="other" 
            providers={filteredFamilies.other} 
            colorClass={FAMILY_COLORS.other}
          />
        </div>
      </CardContent>
    </Card>
  );
}
