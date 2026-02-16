import { memo, useState } from 'react';
import { Sparkles, Folder, Archive, ChevronDown, ChevronUp, Image, Video, Wand2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  bestFor: string[];
  icon: string;
  color: string;
  supportsI2I: boolean;
  supportsI2V: boolean;
  supportsStyle: boolean;
}

export const VIDEO_PROVIDERS: ProviderInfo[] = [
  {
    id: 'kling-2.6-motion-control-pro',
    name: 'Kling 2.6 Motion Pro',
    description: 'Top quality, cinematic',
    bestFor: ['cinematic', 'dramatic', 'premium'],
    icon: '👑',
    color: 'amber',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    description: 'Professional quality',
    bestFor: ['professional', 'business', 'commercial'],
    icon: '⭐',
    color: 'yellow',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'kling-2.6',
    name: 'Kling 2.6',
    description: 'Fast, cost-effective',
    bestFor: ['fast', 'quick', 'budget'],
    icon: '🚀',
    color: 'blue',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'kling-2.0',
    name: 'Kling 2.0',
    description: 'Native audio, motion control',
    bestFor: ['audio', 'motion', 'dynamic'],
    icon: '🎬',
    color: 'purple',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'kling',
    name: 'Kling 1.6',
    description: 'Human faces, lifestyle scenes',
    bestFor: ['person', 'lifestyle', 'testimonial', 'face', 'human'],
    icon: '🎭',
    color: 'purple',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'runway',
    name: 'Runway Gen-3',
    description: 'Cinematic, dramatic shots',
    bestFor: ['cinematic', 'dramatic', 'hook'],
    icon: '🎥',
    color: 'blue',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'luma',
    name: 'Luma Dream Machine',
    description: 'Product reveals, smooth motion',
    bestFor: ['product', 'reveal', 'showcase'],
    icon: '✨',
    color: 'pink',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'hailuo',
    name: 'Hailuo MiniMax',
    description: 'B-roll, nature, backgrounds',
    bestFor: ['broll', 'nature', 'ambient', 'background'],
    icon: '🌿',
    color: 'teal',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'pika',
    name: 'Pika Labs',
    description: 'Creative transitions',
    bestFor: ['transition', 'creative', 'animation'],
    icon: '⚡',
    color: 'orange',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'genmo',
    name: 'Genmo',
    description: 'Long-form generation',
    bestFor: ['long', 'extended', 'continuous'],
    icon: '🎞️',
    color: 'indigo',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'veo2',
    name: 'Google Veo 2',
    description: 'High fidelity video',
    bestFor: ['high-quality', 'fidelity', 'realistic'],
    icon: '🔵',
    color: 'blue',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'veo-3',
    name: 'Google Veo 3.0',
    description: 'Latest Google model, excellent motion',
    bestFor: ['cinematic', 'high-quality', 'dramatic'],
    icon: '🔷',
    color: 'blue',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'veo-3.1',
    name: 'Google Veo 3.1',
    description: 'Best Google model, advanced physics',
    bestFor: ['premium', 'hero-shots', 'cinematic'],
    icon: '💎',
    color: 'blue',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    description: 'Fast, good quality, cost-effective',
    bestFor: ['fast', 'lifestyle', 'nature'],
    icon: '🚀',
    color: 'green',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'wan-2.1',
    name: 'Wan 2.1',
    description: 'Budget-friendly, reliable',
    bestFor: ['broll', 'simple-scenes', 'quick'],
    icon: '⚡',
    color: 'green',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'hunyuan',
    name: 'Hunyuan',
    description: 'Nature scenes, abstract content',
    bestFor: ['nature', 'abstract', 'artistic'],
    icon: '🎋',
    color: 'teal',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'skyreels',
    name: 'Skyreels',
    description: 'Reliable I2V generation',
    bestFor: ['product', 'general', 'reliable'],
    icon: '🎬',
    color: 'indigo',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
  {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo',
    description: 'Fast premium quality',
    bestFor: ['fast', 'dynamic', 'action'],
    icon: '⚡',
    color: 'yellow',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: true,
  },
  {
    id: 'seedance-1.0',
    name: 'Seedance 1.0',
    description: 'Dance and character motion',
    bestFor: ['dance', 'character', 'expressive'],
    icon: '💃',
    color: 'pink',
    supportsI2I: false,
    supportsI2V: true,
    supportsStyle: false,
  },
];

export const IMAGE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'flux',
    name: 'Flux.1',
    description: 'Product shots, food, objects',
    bestFor: ['product', 'food', 'object', 'still'],
    icon: '📸',
    color: 'orange',
    supportsI2I: true,
    supportsI2V: false,
    supportsStyle: true,
  },
  {
    id: 'falai',
    name: 'fal.ai',
    description: 'Lifestyle, people, natural scenes',
    bestFor: ['lifestyle', 'person', 'nature', 'scene', 'human', 'face'],
    icon: '🎨',
    color: 'indigo',
    supportsI2I: true,
    supportsI2V: false,
    supportsStyle: true,
  },
  {
    id: 'stability',
    name: 'Stability AI',
    description: 'SDXL, versatile generation',
    bestFor: ['versatile', 'general', 'artistic'],
    icon: '🖼️',
    color: 'purple',
    supportsI2I: true,
    supportsI2V: false,
    supportsStyle: true,
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    description: 'Text rendering, logos',
    bestFor: ['text', 'logo', 'typography', 'branding'],
    icon: '✏️',
    color: 'teal',
    supportsI2I: true,
    supportsI2V: false,
    supportsStyle: false,
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    description: 'Artistic, stylized imagery',
    bestFor: ['artistic', 'stylized', 'creative', 'aesthetic'],
    icon: '🎭',
    color: 'pink',
    supportsI2I: false,
    supportsI2V: false,
    supportsStyle: true,
  },
  {
    id: 'dalle3',
    name: 'DALL-E 3',
    description: 'Diverse styles, text understanding',
    bestFor: ['diverse', 'text', 'complex'],
    icon: '🌈',
    color: 'green',
    supportsI2I: false,
    supportsI2V: false,
    supportsStyle: false,
  },
];

const OTHER_SOURCES = [
  {
    id: 'brand_media',
    name: 'Brand Media',
    description: 'Your uploaded brand assets',
    icon: <Folder className="h-4 w-4" />,
  },
  {
    id: 'asset_library',
    name: 'Asset Library',
    description: 'Previously generated assets',
    icon: <Archive className="h-4 w-4" />,
  },
];

type ReferenceMode = 'none' | 'image-to-image' | 'image-to-video' | 'style-reference';

interface ProviderSelectorProps {
  type: 'image' | 'video';
  selectedProvider: string | undefined;
  onSelectProvider: (provider: string) => void;
  recommendedProvider?: string;
  sceneContentType?: string;
  disabled?: boolean;
  referenceMode?: ReferenceMode;
}

function determineRecommended(providers: ProviderInfo[], contentType?: string): string {
  if (!contentType) return providers[0]?.id || 'flux';
  
  for (const provider of providers) {
    if (provider.bestFor.some(type => contentType.toLowerCase().includes(type))) {
      return provider.id;
    }
  }
  
  return providers[0]?.id || 'flux';
}

function filterProvidersByMode(providers: ProviderInfo[], referenceMode: ReferenceMode): ProviderInfo[] {
  if (referenceMode === 'none') return providers;
  
  return providers.filter(p => {
    if (referenceMode === 'image-to-image') return p.supportsI2I === true;
    if (referenceMode === 'image-to-video') return p.supportsI2V === true;
    if (referenceMode === 'style-reference') return p.supportsStyle === true;
    return true;
  });
}

export const ProviderSelector = memo(function ProviderSelector({
  type,
  selectedProvider,
  onSelectProvider,
  recommendedProvider,
  sceneContentType,
  disabled = false,
  referenceMode = 'none',
}: ProviderSelectorProps) {
  const allProviders = type === 'video' ? VIDEO_PROVIDERS : IMAGE_PROVIDERS;
  const providers = filterProvidersByMode(allProviders, referenceMode);
  
  const recommended = recommendedProvider || determineRecommended(providers, sceneContentType);
  
  const colorClasses: Record<string, string> = {
    purple: 'border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/30',
    blue: 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30',
    pink: 'border-pink-300 bg-pink-50 dark:border-pink-600 dark:bg-pink-900/30',
    teal: 'border-teal-300 bg-teal-50 dark:border-teal-600 dark:bg-teal-900/30',
    orange: 'border-orange-300 bg-orange-50 dark:border-orange-600 dark:bg-orange-900/30',
    indigo: 'border-indigo-300 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-900/30',
    amber: 'border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/30',
    yellow: 'border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/30',
    green: 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/30',
  };
  
  const isColumnActive = selectedProvider !== undefined;
  
  return (
    <div className={`space-y-3 transition-opacity ${isColumnActive ? '' : 'opacity-60'}`}>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {type === 'video' ? 'VIDEO PROVIDERS' : 'IMAGE PROVIDERS'}
        {referenceMode !== 'none' && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({providers.length} available)
          </span>
        )}
      </div>
      
      <RadioGroup 
        value={selectedProvider || ''} 
        onValueChange={onSelectProvider}
        disabled={disabled}
      >
        {providers.map((provider) => {
          const isRecommended = provider.id === recommended;
          const isSelected = provider.id === selectedProvider;
          
          return (
            <div
              key={provider.id}
              className={`
                flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer
                transition-all duration-150
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                ${isSelected ? colorClasses[provider.color] : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}
              `}
              onClick={() => !disabled && onSelectProvider(provider.id)}
              data-testid={`provider-${provider.id}`}
            >
              <RadioGroupItem 
                value={provider.id} 
                id={`provider-${provider.id}`} 
                className="mt-1" 
              />
              
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{provider.icon}</span>
                  <Label 
                    htmlFor={`provider-${provider.id}`} 
                    className="font-medium cursor-pointer"
                  >
                    {provider.name}
                  </Label>
                  {isRecommended && (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Best for this scene
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {provider.description}
                </p>
              </div>
            </div>
          );
        })}
        
        <div className="border-t my-2 dark:border-gray-700" />
        
        {OTHER_SOURCES.map((source) => (
          <div
            key={source.id}
            className={`
              flex items-start gap-3 p-3 rounded-lg border cursor-pointer
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              ${selectedProvider === source.id 
                ? 'border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800' 
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}
            `}
            onClick={() => !disabled && onSelectProvider(source.id)}
            data-testid={`provider-${source.id}`}
          >
            <RadioGroupItem 
              value={source.id} 
              id={`provider-${source.id}`} 
              className="mt-1" 
            />
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {source.icon}
                <Label 
                  htmlFor={`provider-${source.id}`} 
                  className="font-medium cursor-pointer"
                >
                  {source.name}
                </Label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {source.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
});

interface ProviderSelectorPanelProps {
  selectedImageProvider?: string;
  selectedVideoProvider?: string;
  onSelectImageProvider: (provider: string) => void;
  onSelectVideoProvider: (provider: string) => void;
  recommendedImageProvider?: string;
  recommendedVideoProvider?: string;
  sceneContentType?: string;
  disabled?: boolean;
  referenceMode?: ReferenceMode;
  activeMediaType: 'image' | 'video';
  onMediaTypeChange: (type: 'image' | 'video') => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  qualityTier?: 'ultra' | 'premium' | 'standard' | null;
}

export const ProviderSelectorPanel = memo(function ProviderSelectorPanel({
  selectedImageProvider,
  selectedVideoProvider,
  onSelectImageProvider,
  onSelectVideoProvider,
  recommendedImageProvider,
  recommendedVideoProvider,
  sceneContentType,
  disabled = false,
  referenceMode = 'none',
  activeMediaType,
  onMediaTypeChange,
  onGenerate,
  isGenerating = false,
  qualityTier,
}: ProviderSelectorPanelProps) {
  const effectiveMediaType = activeMediaType;
  const [imageExpanded, setImageExpanded] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  
  const filteredImageProviders = filterProvidersByMode(IMAGE_PROVIDERS, referenceMode);
  const filteredVideoProviders = filterProvidersByMode(VIDEO_PROVIDERS, referenceMode);
  
  const validateRecommendation = (recommended: string | undefined, filteredProviders: ProviderInfo[]): string | undefined => {
    if (!recommended) return filteredProviders[0]?.id;
    if (filteredProviders.some(p => p.id === recommended)) return recommended;
    return filteredProviders[0]?.id;
  };
  
  const imageRecommended = validateRecommendation(
    recommendedImageProvider || determineRecommended(IMAGE_PROVIDERS, sceneContentType),
    filteredImageProviders
  );
  const videoRecommended = validateRecommendation(
    recommendedVideoProvider || determineRecommended(VIDEO_PROVIDERS, sceneContentType),
    filteredVideoProviders
  );
  
  const isImageProviderValid = selectedImageProvider && 
    (filteredImageProviders.some(p => p.id === selectedImageProvider) || 
     selectedImageProvider === 'brand_media' || selectedImageProvider === 'asset_library');
  const isVideoProviderValid = selectedVideoProvider && 
    (filteredVideoProviders.some(p => p.id === selectedVideoProvider) || 
     selectedVideoProvider === 'brand_media' || selectedVideoProvider === 'asset_library');
  
  const effectiveImageProvider = isImageProviderValid ? selectedImageProvider : imageRecommended;
  const effectiveVideoProvider = isVideoProviderValid ? selectedVideoProvider : videoRecommended;
  
  const hasValidImageProviders = filteredImageProviders.length > 0;
  const hasValidVideoProviders = filteredVideoProviders.length > 0;
  
  const currentProvider = effectiveMediaType === 'video' 
    ? effectiveVideoProvider
    : effectiveImageProvider;
  
  const currentProviderName = currentProvider ? getProviderName(currentProvider) : 'None';
  
  const colorClasses: Record<string, string> = {
    purple: 'border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/30',
    blue: 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30',
    pink: 'border-pink-300 bg-pink-50 dark:border-pink-600 dark:bg-pink-900/30',
    teal: 'border-teal-300 bg-teal-50 dark:border-teal-600 dark:bg-teal-900/30',
    orange: 'border-orange-300 bg-orange-50 dark:border-orange-600 dark:bg-orange-900/30',
    indigo: 'border-indigo-300 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-900/30',
    amber: 'border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/30',
    yellow: 'border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/30',
    green: 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/30',
  };

  const renderProviderCard = (
    provider: ProviderInfo,
    isSelected: boolean,
    isRecommended: boolean,
    onClick: () => void,
    radioGroupId: string
  ) => (
    <div
      key={provider.id}
      className={`
        flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer
        transition-all duration-150
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isSelected ? colorClasses[provider.color] : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}
      `}
      onClick={() => !disabled && onClick()}
      data-testid={`provider-${provider.id}`}
    >
      <RadioGroupItem 
        value={provider.id} 
        id={`${radioGroupId}-${provider.id}`} 
        className="mt-1" 
      />
      
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">{provider.icon}</span>
          <Label 
            htmlFor={`${radioGroupId}-${provider.id}`} 
            className="font-medium cursor-pointer"
          >
            {provider.name}
          </Label>
          {isRecommended && (
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Best for this scene
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {provider.description}
        </p>
      </div>
    </div>
  );

  const renderOtherSource = (
    source: typeof OTHER_SOURCES[0],
    isSelected: boolean,
    onClick: () => void,
    radioGroupId: string
  ) => (
    <div
      key={source.id}
      className={`
        flex items-start gap-3 p-3 rounded-lg border cursor-pointer
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isSelected 
          ? 'border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800' 
          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}
      `}
      onClick={() => !disabled && onClick()}
      data-testid={`provider-${source.id}`}
    >
      <RadioGroupItem 
        value={source.id} 
        id={`${radioGroupId}-${source.id}`} 
        className="mt-1" 
      />
      
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {source.icon}
          <Label 
            htmlFor={`${radioGroupId}-${source.id}`} 
            className="font-medium cursor-pointer"
          >
            {source.name}
          </Label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {source.description}
        </p>
      </div>
    </div>
  );
  
  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Media Source Controls</Label>
      
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant={effectiveMediaType === 'image' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMediaTypeChange('image')}
          className="flex items-center gap-2"
          data-testid="media-type-image"
        >
          <Image className="h-4 w-4" />
          Image
        </Button>
        <Button
          variant={effectiveMediaType === 'video' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMediaTypeChange('video')}
          className="flex items-center gap-2"
          data-testid="media-type-video"
        >
          <Video className="h-4 w-4" />
          Video
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Collapsible open={imageExpanded} onOpenChange={setImageExpanded}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700" data-testid="image-providers-toggle">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              <span className="text-sm font-medium">IMAGE PROVIDERS</span>
              {referenceMode !== 'none' && (
                <span className="text-xs text-muted-foreground">
                  ({filteredImageProviders.length})
                </span>
              )}
            </div>
            {imageExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <RadioGroup 
              value={effectiveImageProvider || ''} 
              onValueChange={(value) => {
                onSelectImageProvider(value);
                onMediaTypeChange('image');
              }}
              disabled={disabled}
            >
              {filteredImageProviders.map((provider) => 
                renderProviderCard(
                  provider,
                  provider.id === effectiveImageProvider,
                  provider.id === imageRecommended,
                  () => {
                    onSelectImageProvider(provider.id);
                    onMediaTypeChange('image');
                  },
                  'image-provider'
                )
              )}
              
              <div className="border-t my-2 dark:border-gray-700" />
              
              {OTHER_SOURCES.map((source) => 
                renderOtherSource(
                  source,
                  effectiveImageProvider === source.id,
                  () => {
                    onSelectImageProvider(source.id);
                    onMediaTypeChange('image');
                  },
                  'image-source'
                )
              )}
            </RadioGroup>
          </CollapsibleContent>
        </Collapsible>
        
        <Collapsible open={videoExpanded} onOpenChange={setVideoExpanded}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700" data-testid="video-providers-toggle">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span className="text-sm font-medium">VIDEO PROVIDERS</span>
              {referenceMode !== 'none' && (
                <span className="text-xs text-muted-foreground">
                  ({filteredVideoProviders.length})
                </span>
              )}
            </div>
            {videoExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <RadioGroup 
              value={effectiveVideoProvider || ''} 
              onValueChange={(value) => {
                onSelectVideoProvider(value);
                onMediaTypeChange('video');
              }}
              disabled={disabled}
            >
              {filteredVideoProviders.map((provider) => 
                renderProviderCard(
                  provider,
                  provider.id === effectiveVideoProvider,
                  provider.id === videoRecommended,
                  () => {
                    onSelectVideoProvider(provider.id);
                    onMediaTypeChange('video');
                  },
                  'video-provider'
                )
              )}
              
              <div className="border-t my-2 dark:border-gray-700" />
              
              {OTHER_SOURCES.map((source) => 
                renderOtherSource(
                  source,
                  effectiveVideoProvider === source.id,
                  () => {
                    onSelectVideoProvider(source.id);
                    onMediaTypeChange('video');
                  },
                  'video-source'
                )
              )}
            </RadioGroup>
          </CollapsibleContent>
        </Collapsible>
      </div>
      
      {/* Warning when no providers available for current mode */}
      {referenceMode !== 'none' && (
        (activeMediaType === 'image' && !hasValidImageProviders) ||
        (activeMediaType === 'video' && !hasValidVideoProviders)
      ) && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No {activeMediaType} providers support the current reference mode. 
            {activeMediaType === 'image' ? ' Try video providers or change the reference mode.' : ' Try image providers or change the reference mode.'}
          </p>
        </div>
      )}
      
      <Button
        onClick={onGenerate}
        disabled={disabled || isGenerating || !currentProvider}
        className="w-full mt-4"
        data-testid="generate-with-provider"
      >
        <Wand2 className="h-4 w-4 mr-2" />
        {isGenerating ? 'Generating...' : currentProvider ? `Generate with ${currentProviderName}` : 'No provider available'}
      </Button>
    </div>
  );
});

export function getRecommendedProvider(
  type: 'image' | 'video', 
  sceneType?: string,
  visualDirection?: string
): string {
  const content = `${sceneType || ''} ${visualDirection || ''}`.toLowerCase();
  
  if (type === 'video') {
    const hasHumanContent = 
      content.includes('person') || 
      content.includes('woman') || 
      content.includes('man ') ||
      content.includes('human') ||
      content.includes('face') ||
      content.includes('people') ||
      content.includes('testimonial') || 
      content.includes('lifestyle') ||
      content.includes('conversation') ||
      content.includes('authentic') ||
      content.includes('expression') ||
      /\b(her|his|she|he)\b/.test(content);
    
    if (hasHumanContent) {
      return 'kling';
    }
    if (content.includes('cinematic') || content.includes('dramatic') || content.includes('premium')) {
      return 'kling-2.6-motion-control-pro';
    }
    if (content.includes('product') || content.includes('reveal')) {
      return 'luma';
    }
    if (content.includes('broll') || content.includes('nature') || content.includes('ambient')) {
      return 'hailuo';
    }
    return 'kling';
  } else {
    const hasHumanContent = 
      content.includes('person') || 
      content.includes('woman') || 
      content.includes('man ') ||
      content.includes('human') ||
      content.includes('face') ||
      content.includes('people') ||
      content.includes('lifestyle');
    
    if (hasHumanContent) {
      return 'falai';
    }
    if (content.includes('product') || content.includes('food') || content.includes('object')) {
      return 'flux';
    }
    if (content.includes('text') || content.includes('logo') || content.includes('typography')) {
      return 'ideogram';
    }
    if (content.includes('artistic') || content.includes('stylized')) {
      return 'midjourney';
    }
    return 'falai';
  }
}

export function getProviderName(providerId: string): string {
  const allProviders = [...VIDEO_PROVIDERS, ...IMAGE_PROVIDERS];
  const provider = allProviders.find(p => p.id === providerId);
  if (provider) return provider.name;
  
  const otherSource = OTHER_SOURCES.find(s => s.id === providerId);
  if (otherSource) return otherSource.name;
  
  return providerId;
}
