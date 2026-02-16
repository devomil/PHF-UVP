import { useState } from 'react';
import { RefreshCw, Image, Video, Wand2, FileQuestion, AlertTriangle, Zap, Settings2, Sparkles, Camera, Film, Palette, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RegenerateOptions, PromptComplexityAnalysis, ReferenceMode } from '@shared/video-types';
import { RegenerationHistoryPanel } from './RegenerationHistoryPanel';
import { StrategyPreviewCard } from './StrategyPreviewCard';

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  supportsI2I?: boolean;
  supportsI2V?: boolean;
  supportsStyle?: boolean;
}

const IMAGE_PROVIDERS: ProviderInfo[] = [
  { id: 'flux', name: 'Flux.1', description: 'Product shots, food, objects', icon: '📸', supportsI2I: true, supportsI2V: false, supportsStyle: true },
  { id: 'falai', name: 'fal.ai', description: 'Lifestyle, people, natural scenes', icon: '🎨', supportsI2I: true, supportsI2V: false, supportsStyle: true },
  { id: 'stability', name: 'Stability AI', description: 'SDXL, versatile generation', icon: '🖼️', supportsI2I: true, supportsI2V: false, supportsStyle: true },
  { id: 'ideogram', name: 'Ideogram', description: 'Text rendering, logos', icon: '✏️', supportsI2I: true, supportsI2V: false, supportsStyle: false },
  { id: 'midjourney', name: 'Midjourney', description: 'Artistic, stylized imagery', icon: '🎭', supportsI2I: false, supportsI2V: false, supportsStyle: true },
  { id: 'dalle3', name: 'DALL-E 3', description: 'Diverse styles, text understanding', icon: '🌈', supportsI2I: false, supportsI2V: false, supportsStyle: false },
];

const VIDEO_PROVIDERS: ProviderInfo[] = [
  { id: 'kling-2.0', name: 'Kling 2.0', description: 'Native audio, motion control', icon: '🎬', supportsI2I: false, supportsI2V: true, supportsStyle: true },
  { id: 'kling-2.6-motion-control-pro', name: 'Kling 2.6 Motion Pro', description: 'Top quality, cinematic', icon: '👑', supportsI2I: false, supportsI2V: true, supportsStyle: true },
  { id: 'kling-2.6-pro', name: 'Kling 2.6 Pro', description: 'Professional quality', icon: '⭐', supportsI2I: false, supportsI2V: true, supportsStyle: true },
  { id: 'kling-2.6', name: 'Kling 2.6', description: 'Fast, cost-effective', icon: '🚀', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'kling-1.6', name: 'Kling 1.6', description: 'Human faces, lifestyle', icon: '🎭', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'runway', name: 'Runway Gen-3', description: 'Cinematic, dramatic shots', icon: '🎥', supportsI2I: false, supportsI2V: true, supportsStyle: true },
  { id: 'luma', name: 'Luma Dream Machine', description: 'Product reveals, smooth motion', icon: '✨', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'hailuo', name: 'Hailuo MiniMax', description: 'B-roll, nature, backgrounds', icon: '🌿', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'pika', name: 'Pika Labs', description: 'Creative transitions', icon: '⚡', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'genmo', name: 'Genmo', description: 'Long-form generation', icon: '🎞️', supportsI2I: false, supportsI2V: true, supportsStyle: false },
  { id: 'veo2', name: 'Google Veo 2', description: 'High fidelity video', icon: '🔵', supportsI2I: false, supportsI2V: true, supportsStyle: false },
];

interface RegenerationOptionsProps {
  sceneId: string;
  sceneIndex?: number;
  projectId?: string;
  currentMediaUrl?: string;
  currentPrompt?: string;
  mediaType?: 'image' | 'video';
  qualityIssues?: string[];
  suggestedImprovement?: string;
  complexity?: PromptComplexityAnalysis;
  referenceMode?: ReferenceMode;
  showHistory?: boolean;
  showStrategyPreview?: boolean;
  onRegenerate: (options: RegenerateOptions) => Promise<void>;
}

export const RegenerationOptions = ({
  sceneId,
  sceneIndex = 0,
  projectId,
  currentMediaUrl,
  currentPrompt = '',
  mediaType = 'image',
  qualityIssues = [],
  suggestedImprovement,
  complexity,
  referenceMode = 'none',
  showHistory = true,
  showStrategyPreview = true,
  onRegenerate,
}: RegenerationOptionsProps) => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('options');
  
  const hasQualityIssues = qualityIssues.length > 0;
  const isComplexPrompt = complexity?.category === 'complex' || complexity?.category === 'impossible';
  
  const handleRegenerate = async (options: RegenerateOptions) => {
    setIsRegenerating(true);
    try {
      await onRegenerate(options);
    } finally {
      setIsRegenerating(false);
    }
  };

  const getFilteredProviders = (providers: ProviderInfo[]): ProviderInfo[] => {
    if (referenceMode === 'none') return providers;
    
    return providers.filter(p => {
      if (referenceMode === 'image-to-image') return p.supportsI2I === true;
      if (referenceMode === 'image-to-video') return p.supportsI2V === true;
      if (referenceMode === 'style-reference') return p.supportsStyle === true;
      return true;
    });
  };

  const imageProviders = getFilteredProviders(IMAGE_PROVIDERS);
  const videoProviders = getFilteredProviders(VIDEO_PROVIDERS);
  const currentProviders = mediaType === 'video' ? videoProviders : imageProviders;
  
  const handleApplyStrategy = (strategy: { changes: { prompt?: string; provider?: string } }) => {
    if (strategy.changes.prompt) {
      handleRegenerate({ 
        mode: 'simplified-prompt', 
        newPrompt: strategy.changes.prompt 
      });
    } else if (strategy.changes.provider) {
      handleRegenerate({ 
        mode: 'different-provider', 
        newProvider: strategy.changes.provider 
      });
    } else {
      handleRegenerate({ mode: 'standard' });
    }
  };

  return (
    <div className="space-y-3" data-testid="container-regeneration-options">
      {showStrategyPreview && currentPrompt && projectId && (
        <StrategyPreviewCard
          prompt={currentPrompt}
          attemptCount={0}
          currentMediaUrl={currentMediaUrl}
          previousIssues={qualityIssues}
          onApplyStrategy={handleApplyStrategy}
        />
      )}

      {isComplexPrompt && complexity?.warning && (
        <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
            <strong>Complex Prompt Detected:</strong> {complexity.warning}
            {complexity.simplifiedPrompt && (
              <div className="mt-1 text-xs opacity-80">
                Suggested: "{complexity.simplifiedPrompt.substring(0, 100)}..."
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {hasQualityIssues && (
        <Alert className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-800 dark:text-red-200 text-sm">
            <strong>Quality issues found:</strong>
            <ul className="mt-1 list-disc list-inside">
              {qualityIssues.slice(0, 3).map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {referenceMode !== 'none' && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
          {referenceMode === 'image-to-image' && <Image className="w-4 h-4" />}
          {referenceMode === 'image-to-video' && <Film className="w-4 h-4" />}
          {referenceMode === 'style-reference' && <Palette className="w-4 h-4" />}
          <span>
            Showing {currentProviders.length} providers supporting {
              referenceMode === 'image-to-image' ? 'I2I' :
              referenceMode === 'image-to-video' ? 'I2V' : 'Style Transfer'
            }
          </span>
        </div>
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={hasQualityIssues ? "destructive" : "outline"} 
            className="w-full"
            disabled={isRegenerating}
            data-testid="button-regenerate-dropdown"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? 'Regenerating...' : `Regenerate (${currentProviders.length}+ options)`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Quick Actions
          </DropdownMenuLabel>
          
          <DropdownMenuItem 
            onClick={() => handleRegenerate({ mode: 'standard' })}
            data-testid="menu-item-standard"
          >
            <RefreshCw className="w-4 h-4 mr-2 text-gray-500" />
            <div>
              <div className="font-medium">Standard Regenerate</div>
              <div className="text-xs text-gray-500">Try again with same settings</div>
            </div>
          </DropdownMenuItem>
          
          {currentMediaUrl && (
            <DropdownMenuItem 
              onClick={() => handleRegenerate({ 
                mode: 'with-reference', 
                referenceUrl: currentMediaUrl 
              })}
              data-testid="menu-item-with-reference"
            >
              <Image className="w-4 h-4 mr-2 text-blue-500" />
              <div>
                <div className="font-medium">Refine Current (I2I)</div>
                <div className="text-xs text-gray-500">Use current as starting point</div>
              </div>
            </DropdownMenuItem>
          )}
          
          {suggestedImprovement && (
            <DropdownMenuItem 
              onClick={() => handleRegenerate({ 
                mode: 'standard', 
                newPrompt: suggestedImprovement 
              })}
              data-testid="menu-item-suggestion"
            >
              <Wand2 className="w-4 h-4 mr-2 text-purple-500" />
              <div>
                <div className="font-medium">Apply AI Suggestion</div>
                <div className="text-xs text-gray-500">Use improved prompt</div>
              </div>
            </DropdownMenuItem>
          )}
          
          {complexity?.simplifiedPrompt && (
            <DropdownMenuItem 
              onClick={() => handleRegenerate({ 
                mode: 'simplified-prompt', 
                newPrompt: complexity.simplifiedPrompt 
              })}
              data-testid="menu-item-simplified"
            >
              <FileQuestion className="w-4 h-4 mr-2 text-amber-500" />
              <div>
                <div className="font-medium">Try Simplified Prompt</div>
                <div className="text-xs text-gray-500">Better results for complex scenes</div>
              </div>
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem 
            onClick={() => handleRegenerate({ mode: 'different-provider' })}
            data-testid="menu-item-different-provider"
          >
            <Sparkles className="w-4 h-4 mr-2 text-indigo-500" />
            <div>
              <div className="font-medium">Auto-Select Best Provider</div>
              <div className="text-xs text-gray-500">AI picks optimal provider</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => handleRegenerate({ mode: 'stock-search' })}
            data-testid="menu-item-stock-search"
          >
            <Camera className="w-4 h-4 mr-2 text-green-500" />
            <div>
              <div className="font-medium">Search Stock Footage</div>
              <div className="text-xs text-gray-500">Find real footage instead</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {mediaType === 'image' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="submenu-image-providers">
                <Image className="w-4 h-4 mr-2" />
                <span>Image Providers ({imageProviders.length})</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                <DropdownMenuLabel>Select Provider</DropdownMenuLabel>
                {imageProviders.map((provider) => (
                  <DropdownMenuItem
                    key={provider.id}
                    onClick={() => handleRegenerate({ 
                      mode: 'different-provider',
                      newProvider: provider.id
                    })}
                    data-testid={`menu-item-provider-${provider.id}`}
                  >
                    <span className="mr-2">{provider.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-gray-500">{provider.description}</div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {provider.supportsI2I && <span className="text-[10px] px-1 bg-blue-100 text-blue-700 rounded">I2I</span>}
                      {provider.supportsStyle && <span className="text-[10px] px-1 bg-purple-100 text-purple-700 rounded">Style</span>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          
          {mediaType === 'video' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="submenu-video-providers">
                <Video className="w-4 h-4 mr-2" />
                <span>Video Providers ({videoProviders.length})</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-72 max-h-[50vh] overflow-y-auto">
                <DropdownMenuLabel>Select Provider</DropdownMenuLabel>
                <DropdownMenuLabel className="text-xs font-normal text-gray-500">
                  Kling 2.6 Family (Native Audio)
                </DropdownMenuLabel>
                {videoProviders.filter(p => p.id.startsWith('kling-2.6')).map((provider) => (
                  <DropdownMenuItem
                    key={provider.id}
                    onClick={() => handleRegenerate({ 
                      mode: 'different-provider',
                      newProvider: provider.id
                    })}
                    data-testid={`menu-item-provider-${provider.id}`}
                  >
                    <span className="mr-2">{provider.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-gray-500">{provider.description}</div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {provider.supportsI2V && <span className="text-[10px] px-1 bg-green-100 text-green-700 rounded">I2V</span>}
                      {provider.supportsStyle && <span className="text-[10px] px-1 bg-purple-100 text-purple-700 rounded">Style</span>}
                    </div>
                  </DropdownMenuItem>
                ))}
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-gray-500">
                  Other Video Providers
                </DropdownMenuLabel>
                {videoProviders.filter(p => !p.id.startsWith('kling-2.6')).map((provider) => (
                  <DropdownMenuItem
                    key={provider.id}
                    onClick={() => handleRegenerate({ 
                      mode: 'different-provider',
                      newProvider: provider.id
                    })}
                    data-testid={`menu-item-provider-${provider.id}`}
                  >
                    <span className="mr-2">{provider.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-gray-500">{provider.description}</div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {provider.supportsI2V && <span className="text-[10px] px-1 bg-green-100 text-green-700 rounded">I2V</span>}
                      {provider.supportsStyle && <span className="text-[10px] px-1 bg-purple-100 text-purple-700 rounded">Style</span>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />
          
          <DropdownMenuLabel className="flex items-center gap-2 text-xs">
            <Settings2 className="w-3 h-3" />
            Advanced Options
          </DropdownMenuLabel>
          
          <DropdownMenuItem
            onClick={() => handleRegenerate({ mode: 'with-reference' })}
            data-testid="menu-item-custom-reference"
          >
            <Image className="w-4 h-4 mr-2 text-teal-500" />
            <div>
              <div className="font-medium">Use Custom Reference</div>
              <div className="text-xs text-gray-500">Upload new reference image</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => handleRegenerate({ 
              mode: 'simplified-prompt',
              newPrompt: 'professional product photography, clean background, studio lighting'
            })}
            data-testid="menu-item-product-style"
          >
            <Camera className="w-4 h-4 mr-2 text-orange-500" />
            <div>
              <div className="font-medium">Product Photography Style</div>
              <div className="text-xs text-gray-500">Clean, professional look</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => handleRegenerate({ 
              mode: 'simplified-prompt',
              newPrompt: 'cinematic, dramatic lighting, film grain, movie scene'
            })}
            data-testid="menu-item-cinematic-style"
          >
            <Film className="w-4 h-4 mr-2 text-red-500" />
            <div>
              <div className="font-medium">Cinematic Style</div>
              <div className="text-xs text-gray-500">Dramatic, movie-like visuals</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => handleRegenerate({ 
              mode: 'simplified-prompt',
              newPrompt: 'natural, organic, warm earth tones, lifestyle photography'
            })}
            data-testid="menu-item-lifestyle-style"
          >
            <Sparkles className="w-4 h-4 mr-2 text-yellow-500" />
            <div>
              <div className="font-medium">Lifestyle Style</div>
              <div className="text-xs text-gray-500">Warm, natural aesthetic</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showHistory && projectId && (
        <RegenerationHistoryPanel
          projectId={projectId}
          sceneId={sceneId}
          sceneIndex={sceneIndex}
        />
      )}
    </div>
  );
};

export default RegenerationOptions;
