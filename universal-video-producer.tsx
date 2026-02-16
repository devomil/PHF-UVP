import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceSelector } from "./voice-selector";
import { QualityReport } from "./quality-report";
import { QADashboard } from "./qa-dashboard";
import { BrandSettingsPanel, BrandSettings as UIBrandSettings } from "./brand-settings-panel";
import { EndCardSettingsPanel, EndCardSettings, DEFAULT_END_CARD_SETTINGS } from "./video/EndCardSettingsPanel";
import { SoundDesignSettingsPanel, SoundDesignSettings, DEFAULT_SOUND_DESIGN_SETTINGS } from "./video/SoundDesignSettingsPanel";
import { MusicStyleSelector } from "./music-style-selector";
import { ProviderSelector, ProviderSelectorPanel, getRecommendedProvider, getProviderName, VIDEO_PROVIDERS, IMAGE_PROVIDERS } from "./provider-selector";
import { getAvailableStyles } from "@shared/visual-style-config";
import { ContentTypeSelector, ContentType, getContentTypeIcon } from "./content-type-selector";
import { GenerationPreviewPanel } from "./generation-preview-panel";
import { ProviderRegistryPanel } from "./provider-registry-panel";
import { OverlayEditor, OverlayConfig, defaultOverlayConfig, getDefaultOverlayConfig } from "./overlay-editor";
import { OverlayPreview } from "./overlay-preview";
import { BrandMediaSelector, BrandAsset } from "./brand-media-selector";
import { ReferenceImageSection, RegenerationOptions, RegenerationHistoryPanel } from "./scene-editor";
import { WorkflowPathIndicator, WorkflowPathBadge } from "./workflow-path-indicator";
import { BrandAssetPreviewPanel, BrandAssetSummary } from "./brand-asset-preview-panel";
import { I2VSettingsPanel, I2VSettings, defaultI2VSettings } from "./i2v-settings-panel";
import { MotionControlSelector, MotionControlSettings, defaultMotionSettings } from "./motion-control-selector";
import { QuickCreateTab } from "./quick-create-tab";
import type { WorkflowDecision, WorkflowStepExecution } from "@shared/types/brand-workflow-types";
import type { AnimationSettings, ReferenceConfig, RegenerateOptions, PromptComplexityAnalysis } from "@shared/video-types";
import { 
  Video, Package, FileText, Play, Sparkles, AlertTriangle,
  CheckCircle, Clock, Loader2, ImageIcon, Volume2, Clapperboard,
  Download, RefreshCw, Settings, ChevronDown, ChevronUp, Upload, X, Star,
  FolderOpen, Plus, Minus, Eye, Layers, Pencil, Save, Music, Mic, VolumeX,
  Undo2, Redo2, GripVertical, ThumbsUp, ThumbsDown, XCircle, ShieldCheck, Copy, Check,
  Replace, ArrowLeftRight, MapPin, Timer, AlertCircle, Server, SkipForward
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { 
  VideoProject as SharedVideoProject, 
  Scene as SharedScene,
  ProductImage as SharedProductImage,
  ServiceFailure,
  VideoProjectStatus
} from "@shared/video-types";
import { SCENE_OVERLAY_DEFAULTS } from "@shared/video-types";

interface ProductImage extends SharedProductImage {
  _blobUrl?: string;
}

type WorkflowType = "product" | "script";

type Scene = SharedScene;

interface VideoProject extends SharedVideoProject {
  assets: SharedVideoProject['assets'] & {
    productImages: ProductImage[];
  };
}

type VisualStyleId = "hero" | "lifestyle" | "product" | "educational" | "social" | "premium";

interface ProductFormData {
  productName: string;
  productDescription: string;
  targetAudience: string;
  benefits: string[];
  duration: 15 | 20 | 30 | 60 | 90;
  platform: "youtube" | "tiktok" | "instagram" | "instagram-reels" | "facebook" | "website";
  style: VisualStyleId;
  callToAction: string;
  voiceId?: string;
  voiceName?: string;
  qualityTier: "standard" | "premium" | "ultra";
}

interface ScriptFormData {
  title: string;
  script: string;
  platform: "youtube" | "tiktok" | "instagram" | "instagram-reels" | "facebook" | "website";
  style: VisualStyleId;
  brandSettings?: UIBrandSettings;
  endCardSettings?: EndCardSettings;
  soundDesignSettings?: SoundDesignSettings;
}

type ScriptMode = "ai-generate" | "custom" | "quick-create";

interface UnifiedFormData {
  mode: ScriptMode;
  title: string;
  productName: string;
  productDescription: string;
  targetAudience: string;
  benefits: string[];
  customScript: string;
  duration: 15 | 20 | 30 | 60 | 90;
  platform: "youtube" | "tiktok" | "instagram" | "instagram-reels" | "facebook" | "website";
  style: string;
  callToAction: string;
  voiceId: string;
  voiceName: string;
  musicEnabled: boolean;
  musicMood: string;
  musicProvider: 'udio' | 'diffrhythm' | 'suno' | 'ace-step' | 'kling-sound';
  brandSettings: UIBrandSettings;
  qualityTier: "standard" | "premium" | "ultra";
  endCardSettings: EndCardSettings;
  soundDesignSettings: SoundDesignSettings;
}

const STEP_ICONS: Record<string, any> = {
  script: FileText,
  voiceover: Volume2,
  images: ImageIcon,
  videos: Video,
  music: Clapperboard,
  assembly: Sparkles,
  qa: ShieldCheck,
  rendering: Play,
};

function convertToDisplayUrl(url: string, bustCache?: boolean): string {
  if (!url) return '';
  
  let result = url;
  
  if (url.startsWith('http')) {
    result = url;
  } else if (url.startsWith('/objects')) {
    result = url;
  } else if (url.startsWith('/api/')) {
    result = url;
  } else if (url.startsWith('/replit-objstore-')) {
    result = `/objects${url}`;
  } else {
    let normalizedPath = url.startsWith('/') ? url : `/${url}`;
    result = `/objects${normalizedPath}`;
  }
  
  // Add cache-busting for video URLs to prevent stale video content
  if (bustCache && (url.endsWith('.mp4') || url.includes('.mp4') || url.includes('video'))) {
    const separator = result.includes('?') ? '&' : '?';
    result = `${result}${separator}_t=${Date.now()}`;
  }
  
  return result;
}

function getImageDisplayUrl(image: ProductImage): string {
  if (image._blobUrl) return image._blobUrl;
  return convertToDisplayUrl(image.url);
}

// Phase 9A: Quality score and status helper functions
function getScoreColor(score: number): string {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-yellow-100 text-yellow-700';
  if (score >= 50) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function getProviderDisplayName(provider: string | undefined): string | null {
  if (!provider) return null;
  const providerNames: Record<string, string> = {
    'kling': 'Kling 1.6',
    'kling-1.6': 'Kling 1.6',
    'runway': 'Runway',
    'luma': 'Luma',
    'hailuo': 'Hailuo',
    'flux': 'Flux.1',
    'flux-pro': 'Flux.1',
    'falai': 'fal.ai',
    'fal.ai': 'fal.ai',
  };
  return providerNames[provider.toLowerCase()] || provider;
}

function getProviderBadgeStyle(provider: string | undefined): string {
  if (!provider) return 'bg-gray-100 text-gray-600';
  const providerStyles: Record<string, string> = {
    'kling': 'bg-purple-100 text-purple-700',
    'kling-1.6': 'bg-purple-100 text-purple-700',
    'runway': 'bg-blue-100 text-blue-700',
    'luma': 'bg-pink-100 text-pink-700',
    'hailuo': 'bg-teal-100 text-teal-700',
    'flux': 'bg-orange-100 text-orange-700',
    'flux-pro': 'bg-orange-100 text-orange-700',
    'falai': 'bg-indigo-100 text-indigo-700',
    'fal.ai': 'bg-indigo-100 text-indigo-700',
    'pexels': 'bg-green-100 text-green-700',
    'unsplash': 'bg-gray-100 text-gray-700',
  };
  return providerStyles[provider.toLowerCase()] || 'bg-gray-100 text-gray-600';
}

const MemoizedVideoPlayer = memo(function MemoizedVideoPlayer({
  videoUrl,
  sceneId,
  convertToDisplayUrl,
  generationMethod,
}: {
  videoUrl: string;
  sceneId: string;
  convertToDisplayUrl: (url: string, addCacheBuster?: boolean) => string;
  generationMethod?: string;
}) {
  const displayUrl = convertToDisplayUrl(videoUrl, true);
  console.log(`[MemoizedVideoPlayer] Rendering scene=${sceneId}, videoUrl=${videoUrl?.substring(0, 60)}..., displayUrl=${displayUrl?.substring(0, 80)}...`);
  
  return (
    <div>
      <Label className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
        <Video className="w-4 h-4" /> B-Roll Video
        {generationMethod && (
          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
            {generationMethod}
          </span>
        )}
      </Label>
      <div className="w-full rounded-lg overflow-hidden border bg-black" style={{ aspectRatio: '16/9' }}>
        <video 
          key={`video-modal-${sceneId}-${videoUrl}`}
          src={displayUrl}
          className="w-full h-full object-contain i2v-video-fade"
          controls
          muted
          playsInline
          data-testid={`video-broll-modal-${sceneId}`}
          onLoadStart={() => console.log(`[MemoizedVideoPlayer] onLoadStart scene=${sceneId}, loading: ${displayUrl?.substring(0, 80)}`)}
          onLoadedData={() => console.log('[VideoModal] Video loaded successfully:', sceneId)}
          onError={(e) => console.error('[VideoModal] Video load error:', sceneId, videoUrl, e)}
        />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.videoUrl === nextProps.videoUrl && 
         prevProps.sceneId === nextProps.sceneId && 
         prevProps.generationMethod === nextProps.generationMethod;
});

function ProductImageUpload({
  projectId,
  images,
  onImagesChange,
}: {
  projectId: string | null;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    const newImages: ProductImage[] = [];
    const startingCount = images.length;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploadUrlRes = await apiRequest("POST", "/api/universal-video/upload-url");
        const uploadUrlData = await uploadUrlRes.json();
        
        if (!uploadUrlData.success) {
          throw new Error(uploadUrlData.error || "Failed to get upload URL");
        }

        const uploadResponse = await fetch(uploadUrlData.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload file");
        }

        if (projectId) {
          const addImageRes = await apiRequest("POST", `/api/universal-video/projects/${projectId}/product-images`, {
            objectPath: uploadUrlData.objectPath,
            name: file.name,
            isPrimary: startingCount + newImages.length === 0,
          });
          const addImageData = await addImageRes.json();
          
          if (addImageData.success) {
            newImages.push(addImageData.image);
          }
        } else {
          const tempImage: ProductImage = {
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: uploadUrlData.objectPath,
            name: file.name,
            isPrimary: startingCount + newImages.length === 0,
            _blobUrl: URL.createObjectURL(file),
          };
          newImages.push(tempImage);
        }
      } catch (error: any) {
        toast({
          title: "Upload Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
      toast({
        title: "Images Uploaded",
        description: `${newImages.length} image${newImages.length > 1 ? 's' : ''} added successfully.`,
      });
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = async (imageId: string) => {
    if (projectId) {
      try {
        const res = await apiRequest("DELETE", `/api/universal-video/projects/${projectId}/product-images/${imageId}`);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error);
        }
      } catch (error: any) {
        toast({
          title: "Delete Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }
    
    const newImages = images.filter(img => img.id !== imageId);
    if (images.find(img => img.id === imageId)?.isPrimary && newImages.length > 0) {
      newImages[0].isPrimary = true;
    }
    onImagesChange(newImages);
  };

  const setPrimary = (imageId: string) => {
    const newImages = images.map(img => ({
      ...img,
      isPrimary: img.id === imageId,
    }));
    onImagesChange(newImages);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Product Images (Optional)</Label>
        <Badge variant="outline" className="text-xs">
          {images.length} image{images.length !== 1 ? 's' : ''} uploaded
        </Badge>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Upload photos of your product. These will be used in scenes where your product appears. 
        AI will generate lifestyle imagery for other scenes.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-product-images"
      />
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((image) => (
          <div 
            key={image.id} 
            className="relative group aspect-square rounded-lg overflow-hidden border checkerboard-bg"
          >
            <img
              src={getImageDisplayUrl(image)}
              alt={image.name}
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:text-yellow-400"
                onClick={() => setPrimary(image.id)}
                data-testid={`button-set-primary-${image.id}`}
              >
                <Star className={`w-4 h-4 ${image.isPrimary ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:text-red-400"
                onClick={() => removeImage(image.id)}
                data-testid={`button-remove-image-${image.id}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {image.isPrimary && (
              <Badge className="absolute top-1 left-1 text-xs bg-yellow-500">
                Primary
              </Badge>
            )}
          </div>
        ))}
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
          data-testid="button-upload-image"
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Upload className="w-6 h-6" />
              <span className="text-xs">Add Image</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function VideoCreatorForm({ 
  onSubmitProduct, 
  onSubmitScript,
  isLoading 
}: { 
  onSubmitProduct: (data: ProductFormData) => void;
  onSubmitScript: (data: ScriptFormData) => void;
  isLoading: boolean;
}) {
  const [scriptMode, setScriptMode] = useState<ScriptMode>("ai-generate");
  
  const defaultFormData: UnifiedFormData = {
    mode: "ai-generate",
    title: "",
    productName: "",
    productDescription: "",
    targetAudience: "",
    benefits: [""],
    customScript: "",
    duration: 60,
    platform: "youtube",
    style: "lifestyle",
    callToAction: "Visit pinehillfarm.com",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    voiceName: "Rachel",
    musicEnabled: true,
    musicMood: "",
    musicProvider: "udio",
    brandSettings: {
      includeIntroLogo: true,
      includeWatermark: true,
      includeCTAOutro: true,
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
    },
    qualityTier: "premium",
    endCardSettings: DEFAULT_END_CARD_SETTINGS,
    soundDesignSettings: DEFAULT_SOUND_DESIGN_SETTINGS,
  };

  const [formData, setFormData] = useState<UnifiedFormData>(defaultFormData);

  const handleModeChange = (newMode: ScriptMode) => {
    setScriptMode(newMode);
    setFormData(prev => ({
      ...prev,
      mode: newMode,
      callToAction: newMode === "ai-generate" ? (prev.callToAction || "Visit pinehillfarm.com") : prev.callToAction,
    }));
  };

  const visualStyles = getAvailableStyles();

  const handleSubmit = () => {
    if (scriptMode === "ai-generate") {
      onSubmitProduct({
        productName: formData.productName,
        productDescription: formData.productDescription,
        targetAudience: formData.targetAudience,
        benefits: [],
        duration: formData.duration,
        platform: formData.platform,
        style: formData.style as any,
        callToAction: formData.callToAction,
        voiceId: formData.voiceId,
        voiceName: formData.voiceName,
        qualityTier: formData.qualityTier,
        endCardSettings: formData.endCardSettings,
        soundDesignSettings: formData.soundDesignSettings,
      } as any);
    } else {
      onSubmitScript({
        title: formData.title,
        script: formData.customScript,
        platform: formData.platform,
        style: formData.style as any,
        brandSettings: formData.brandSettings,
        endCardSettings: formData.endCardSettings,
        soundDesignSettings: formData.soundDesignSettings,
        musicEnabled: formData.musicEnabled,
        musicMood: formData.musicMood,
        voiceId: formData.voiceId,
        voiceName: formData.voiceName,
        qualityTier: formData.qualityTier,
      } as any);
    }
  };

  const isValidForSubmit = scriptMode === "quick-create" 
    ? false // Quick Create has its own submit mechanism
    : scriptMode === "ai-generate"
    ? formData.productName.trim() && 
      formData.productDescription.trim() && 
      formData.targetAudience.trim()
    : formData.title.trim() && formData.customScript.length >= 50;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-1 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => handleModeChange("ai-generate")}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            scriptMode === "ai-generate"
              ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-md border-2 border-emerald-500"
              : "bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
          data-testid="mode-ai-generate"
        >
          <Sparkles className="w-4 h-4" />
          AI-Generated Script
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("custom")}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            scriptMode === "custom"
              ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-md border-2 border-emerald-500"
              : "bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
          data-testid="mode-custom-script"
        >
          <FileText className="w-4 h-4" />
          Custom Script
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("quick-create")}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            scriptMode === "quick-create"
              ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-md border-2 border-emerald-500"
              : "bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
          data-testid="mode-quick-create"
        >
          <Upload className="w-4 h-4" />
          Quick Create
        </button>
      </div>

      {scriptMode === "ai-generate" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Title</Label>
              <Input
                id="productName"
                data-testid="input-product-name"
                placeholder="e.g., Weight Loss Support Capsules"
                value={formData.productName}
                onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetAudience">Target Audience</Label>
              <Input
                id="targetAudience"
                data-testid="input-target-audience"
                placeholder="e.g., Health-conscious adults 35-55"
                value={formData.targetAudience}
                onChange={(e) => setFormData(prev => ({ ...prev, targetAudience: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productDescription">Description</Label>
            <Textarea
              id="productDescription"
              data-testid="textarea-product-description"
              placeholder="Describe your product's features and benefits..."
              value={formData.productDescription}
              onChange={(e) => setFormData(prev => ({ ...prev, productDescription: e.target.value }))}
              rows={6}
            />
          </div>

        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Video Title</Label>
            <Input
              id="title"
              data-testid="input-script-title"
              placeholder="e.g., Weight Loss: The Hidden Toxin Connection"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="script">Full Script</Label>
            <Textarea
              id="script"
              data-testid="textarea-script"
              placeholder="Paste your full video script here..."
              value={formData.customScript}
              onChange={(e) => setFormData(prev => ({ ...prev, customScript: e.target.value }))}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Word count: {formData.customScript.split(/\s+/).filter(Boolean).length} | 
              Estimated duration: {Math.ceil(formData.customScript.split(/\s+/).filter(Boolean).length / 2.5)} seconds
            </p>
          </div>
        </div>
      )}

      {scriptMode === "quick-create" && (
        <QuickCreateTab
          onProjectCreated={(projectId) => {
            console.log('[QuickCreate] Project created:', projectId);
          }}
        />
      )}

      {scriptMode !== "quick-create" && (
        <>
          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={formData.platform}
                onValueChange={(val) => {
                  const platform = val as any;
                  const shortFormPlatforms = ['tiktok', 'instagram-reels'];
                  const suggestedDuration = shortFormPlatforms.includes(platform) ? 15 : formData.duration;
                  setFormData(prev => ({ ...prev, platform, duration: suggestedDuration as any }));
                }}
              >
                <SelectTrigger data-testid="select-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube (16:9)</SelectItem>
                  <SelectItem value="tiktok">TikTok (9:16)</SelectItem>
                  <SelectItem value="instagram">Instagram Post (1:1)</SelectItem>
                  <SelectItem value="instagram-reels">Instagram Reels (9:16)</SelectItem>
                  <SelectItem value="facebook">Facebook (16:9)</SelectItem>
                  <SelectItem value="website">Website (16:9)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Video Length</Label>
              <Select
                value={String(formData.duration)}
                onValueChange={(val) => setFormData(prev => ({ ...prev, duration: Number(val) as any }))}
              >
                <SelectTrigger data-testid="select-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15s - Short (2-3 scenes)</SelectItem>
                  <SelectItem value="20">20s - Quick (3 scenes)</SelectItem>
                  <SelectItem value="30">30s - Standard Short</SelectItem>
                  <SelectItem value="60">60s - Standard</SelectItem>
                  <SelectItem value="90">90s - Extended</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.duration <= 20 ? 'Great for TikTok & Reels' : formData.duration === 30 ? 'Perfect for social media ads' : formData.duration === 60 ? 'Ideal for product showcases' : 'Best for detailed storytelling'}
              </p>
            </div>
          </div>

      <div className="space-y-2">
        <Label>Quality Tier</Label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, qualityTier: "standard" }))}
            className={`p-3 rounded-lg border text-center transition-all ${
              formData.qualityTier === "standard" 
                ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            data-testid="quality-standard"
          >
            <p className="font-medium text-sm">Standard</p>
            <p className="text-xs text-gray-500 mt-1">AI Images</p>
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, qualityTier: "premium" }))}
            className={`p-3 rounded-lg border text-center transition-all ${
              formData.qualityTier === "premium" 
                ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            data-testid="quality-premium"
          >
            <p className="font-medium text-sm">Premium</p>
            <p className="text-xs text-gray-500 mt-1">AI Videos</p>
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, qualityTier: "ultra" }))}
            className={`p-3 rounded-lg border text-center transition-all ${
              formData.qualityTier === "ultra" 
                ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            data-testid="quality-ultra"
          >
            <p className="font-medium text-sm">Ultra</p>
            <p className="text-xs text-gray-500 mt-1">Premium AI Videos</p>
          </button>
        </div>
      </div>

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 -mx-2 group">
          <Label className="cursor-pointer">Visual Style</Label>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {visualStyles.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, style: style.id }))}
                className={`
                  p-3 rounded-lg border text-left transition-all
                  ${formData.style === style.id 
                    ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                    : 'border-gray-200 hover:border-gray-300'}
                `}
                data-testid={`button-style-${style.id}`}
              >
                <p className="font-medium text-sm">{style.name}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {style.description}
                </p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Style affects AI provider selection, prompt enhancement, and transitions
          </p>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 -mx-2 group">
          <Label className="cursor-pointer flex items-center gap-2">
            <Music className="h-4 w-4" />
            Background Music
          </Label>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <MusicStyleSelector
            enabled={formData.musicEnabled}
            onEnabledChange={(enabled) => setFormData(prev => ({ ...prev, musicEnabled: enabled }))}
            visualStyle={formData.style}
            customMood={formData.musicMood}
            onMoodChange={(mood) => setFormData(prev => ({ ...prev, musicMood: mood }))}
            musicProvider={formData.musicProvider}
            onProviderChange={(provider) => setFormData(prev => ({ ...prev, musicProvider: provider }))}
          />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md px-2 -mx-2 group">
          <Label className="cursor-pointer flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Voiceover
          </Label>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <VoiceSelector
            selectedVoiceId={formData.voiceId}
            onSelect={(voiceId, voiceName) => 
              setFormData(prev => ({ ...prev, voiceId, voiceName }))
            }
          />
        </CollapsibleContent>
      </Collapsible>

      <BrandSettingsPanel
        settings={formData.brandSettings}
        onSettingsChange={(brandSettings) => setFormData(prev => ({ ...prev, brandSettings }))}
        defaultExpanded={false}
      />

      <EndCardSettingsPanel
        settings={formData.endCardSettings}
        onSettingsChange={(endCardSettings) => setFormData(prev => ({ ...prev, endCardSettings }))}
      />

      <SoundDesignSettingsPanel
        settings={formData.soundDesignSettings}
        onSettingsChange={(soundDesignSettings) => setFormData(prev => ({ ...prev, soundDesignSettings }))}
      />

      <Button 
        className="w-full" 
        onClick={handleSubmit}
        disabled={isLoading || !isValidForSubmit}
        data-testid="button-create-project"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {scriptMode === "ai-generate" ? "Creating Project..." : "Parsing Script..."}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Create Video Project
          </>
        )}
      </Button>
        </>
      )}
    </div>
  );
}

type StepKey = keyof typeof STEP_ICONS;

interface QAReportSummary {
  overallScore: number;
  approvedCount: number;
  needsReviewCount: number;
  rejectedCount: number;
}

interface ProgressTrackerProps {
  project: VideoProject;
  qaScore?: number;
  qaStatus?: 'pending' | 'analyzing' | 'completed';
  qaReport?: QAReportSummary;
  onQAClick?: () => void;
}

function getQAScoreLabel(score: number): string {
  if (score >= 85) return 'Passed';
  if (score >= 70) return 'Review';
  return 'Issues';
}

function getQAScoreColors(score: number) {
  if (score >= 85) return { bg: 'bg-green-500', text: 'text-white', label: 'text-green-600' };
  if (score >= 70) return { bg: 'bg-yellow-500', text: 'text-white', label: 'text-yellow-600' };
  return { bg: 'bg-red-500', text: 'text-white', label: 'text-red-600' };
}

function ProgressTracker({ project, qaScore, qaStatus = 'pending', qaReport, onQAClick }: ProgressTrackerProps) {
  const steps: StepKey[] = ["script", "voiceover", "images", "videos", "music", "assembly", "qa", "rendering"];
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Overall Progress</span>
        <span className="text-sm text-muted-foreground">{project.progress.overallPercent}%</span>
      </div>
      <Progress value={project.progress.overallPercent} className="h-2" />
      
      <div className="grid grid-cols-8 gap-1 mt-4">
        {steps.map((step) => {
          const isQA = step === 'qa';
          const Icon = STEP_ICONS[step] || Settings;
          
          // Handle QA step separately
          if (isQA) {
            const qaIsCompleted = qaStatus === 'completed' && qaScore !== undefined;
            const qaIsAnalyzing = qaStatus === 'analyzing';
            const scoreColors = qaScore !== undefined ? getQAScoreColors(qaScore) : null;
            
            const qaStepContent = (
              <div 
                className={`flex flex-col items-center ${onQAClick ? 'cursor-pointer hover:opacity-80' : ''}`}
                onClick={onQAClick}
                data-testid="step-qa"
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center mb-1 border-2
                  ${qaIsCompleted && scoreColors ? `${scoreColors.bg} border-current` :
                    qaIsAnalyzing ? 'bg-blue-100 text-blue-600 border-blue-500' :
                    'bg-gray-100 text-gray-400 border-gray-300'}
                `}>
                  {qaIsCompleted && qaScore !== undefined ? (
                    <span className={`text-xs font-bold ${scoreColors?.text}`}>{qaScore}</span>
                  ) : qaIsAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
                <span className={`text-[10px] text-center capitalize ${
                  qaIsCompleted && scoreColors ? scoreColors.label :
                  qaIsAnalyzing ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {step}
                </span>
                {qaIsCompleted && qaScore !== undefined && (
                  <span className={`text-[9px] ${scoreColors?.label}`}>
                    {getQAScoreLabel(qaScore)}
                  </span>
                )}
              </div>
            );
            
            // Wrap with HoverCard if completed with report
            if (qaIsCompleted && qaReport) {
              return (
                <HoverCard key={step} openDelay={200}>
                  <HoverCardTrigger asChild>
                    {qaStepContent}
                  </HoverCardTrigger>
                  <HoverCardContent className="w-64" side="bottom">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Quality Score</span>
                        <span className={`font-bold text-lg ${
                          qaScore >= 85 ? 'text-green-600' :
                          qaScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {qaScore}/100
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1.5">
                        <div className="flex justify-between">
                          <span>Approved:</span>
                          <span className="text-green-600 font-medium">{qaReport.approvedCount} scenes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Needs Review:</span>
                          <span className="text-yellow-600 font-medium">{qaReport.needsReviewCount} scenes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rejected:</span>
                          <span className="text-red-600 font-medium">{qaReport.rejectedCount} scenes</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-xs text-blue-600">Click to open QA Dashboard</span>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            }
            
            return <div key={step}>{qaStepContent}</div>;
          }
          
          // Regular steps
          const stepData = project.progress.steps[step as keyof typeof project.progress.steps];
          if (!stepData) return null;
          
          return (
            <div key={step} className="flex flex-col items-center" data-testid={`step-${step}`}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center mb-1
                ${stepData.status === 'complete' ? 'bg-green-100 text-green-600' :
                  stepData.status === 'in-progress' ? 'bg-blue-100 text-blue-600' :
                  stepData.status === 'error' ? 'bg-red-100 text-red-600' :
                  stepData.status === 'skipped' ? 'bg-gray-100 text-gray-400' :
                  'bg-gray-100 text-gray-400'}
              `}>
                {stepData.status === 'in-progress' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : stepData.status === 'complete' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span className="text-[10px] text-center capitalize">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MUSIC_STYLES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'calm', label: 'Calm' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'health', label: 'Health' },
];

// Phase 4: Undo/Redo Controls Component
function UndoRedoControls({ 
  projectId,
  onProjectUpdate,
  refreshKey
}: { 
  projectId: string;
  onProjectUpdate: (project: VideoProject) => void;
  refreshKey?: number;
}) {
  const { toast } = useToast();
  const [historyStatus, setHistoryStatus] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    undoAction?: string;
    redoAction?: string;
  }>({ canUndo: false, canRedo: false });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch history status
  const fetchHistoryStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/universal-video/${projectId}/history`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setHistoryStatus({
          canUndo: data.canUndo,
          canRedo: data.canRedo,
          undoAction: data.undoAction,
          redoAction: data.redoAction,
        });
      }
    } catch (err) {
      console.error('Failed to fetch history status:', err);
    }
  }, [projectId]);

  // Refresh on mount and when refreshKey changes
  useEffect(() => {
    fetchHistoryStatus();
  }, [fetchHistoryStatus, refreshKey]);

  const handleUndo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Undone: ${data.undoneAction}` });
        if (data.project) onProjectUpdate(data.project);
        if (data.historyStatus) {
          setHistoryStatus({
            canUndo: data.historyStatus.canUndo,
            canRedo: data.historyStatus.canRedo,
            undoAction: data.historyStatus.undoAction,
            redoAction: data.historyStatus.redoAction,
          });
        }
      } else {
        toast({ title: 'Cannot undo', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/redo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Redone: ${data.redoneAction}` });
        if (data.project) onProjectUpdate(data.project);
        if (data.historyStatus) {
          setHistoryStatus({
            canUndo: data.historyStatus.canUndo,
            canRedo: data.historyStatus.canRedo,
            undoAction: data.historyStatus.undoAction,
            redoAction: data.historyStatus.redoAction,
          });
        }
      } else {
        toast({ title: 'Cannot redo', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          if (historyStatus.canRedo) handleRedo();
        } else {
          e.preventDefault();
          if (historyStatus.canUndo) handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyStatus.canUndo, historyStatus.canRedo]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleUndo}
        disabled={!historyStatus.canUndo || isLoading}
        title={historyStatus.undoAction ? `Undo: ${historyStatus.undoAction} (Ctrl+Z)` : 'Nothing to undo'}
        data-testid="button-undo"
      >
        <Undo2 className="h-4 w-4" />
        <span className="sr-only">Undo</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRedo}
        disabled={!historyStatus.canRedo || isLoading}
        title={historyStatus.redoAction ? `Redo: ${historyStatus.redoAction} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        data-testid="button-redo"
      >
        <Redo2 className="h-4 w-4" />
        <span className="sr-only">Redo</span>
      </Button>
    </div>
  );
}

function MusicControlsPanel({ 
  projectId, 
  musicVolume, 
  onUpdate 
}: { 
  projectId: string; 
  musicVolume: number; 
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [volume, setVolume] = useState(Math.round(musicVolume * 100));
  const [selectedStyle, setSelectedStyle] = useState('professional');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUpdatingVolume, setIsUpdatingVolume] = useState(false);

  const handleVolumeChange = async (newValue: number[]) => {
    const volumePercent = newValue[0];
    setVolume(volumePercent);
  };

  const handleVolumeCommit = async () => {
    setIsUpdatingVolume(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/music-volume`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ volume: volume / 100 })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Volume updated' });
        onUpdate();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsUpdatingVolume(false);
    }
  };

  const handleRegenerateMusic = async () => {
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/regenerate-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ style: selectedStyle })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Music regenerated', description: 'New background music has been generated.' });
        onUpdate();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium whitespace-nowrap">Music Controls</span>
        </div>
        
        <div className="flex items-center gap-2 flex-1">
          <VolumeX className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            onValueCommit={handleVolumeCommit}
            min={0}
            max={100}
            step={5}
            className="w-24"
            data-testid="slider-music-volume"
          />
          <span className="text-xs text-muted-foreground w-8">{volume}%</span>
        </div>
        
        <Select value={selectedStyle} onValueChange={setSelectedStyle}>
          <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-music-style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MUSIC_STYLES.map(style => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerateMusic}
          disabled={isRegenerating}
          data-testid="button-regenerate-music"
        >
          {isRegenerating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
        </Button>
        
        {isUpdatingVolume && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </Card>
  );
}

const VOICE_OPTIONS = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Warm & calm - ideal for wellness' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft & friendly' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', description: 'Warm British accent' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Deep & trustworthy male' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', description: 'Calm & professional male' },
  { id: 'Yko7PKHZNXotIFUBG7I9', name: 'Aria', description: 'Expressive female' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', description: 'Young & warm' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', description: 'Mature & comforting' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'British authoritative' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', description: 'Hoarse & mature' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Casual Australian' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Young American male' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', description: 'Young & friendly' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Expressive American' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Upbeat American' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Warm Australian' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Warm British' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', description: 'Non-binary American' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', description: 'Confident American male' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Deep American male' },
];

function VoiceoverControlsPanel({ 
  projectId, 
  currentVoiceId,
  currentVoiceName,
  onUpdate 
}: { 
  projectId: string; 
  currentVoiceId?: string;
  currentVoiceName?: string;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [selectedVoiceId, setSelectedVoiceId] = useState(currentVoiceId || '21m00Tcm4TlvDq8ikWAM');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const selectedVoice = VOICE_OPTIONS.find(v => v.id === selectedVoiceId) || VOICE_OPTIONS[0];

  const handleRegenerateVoiceover = async () => {
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/regenerate-voiceover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ voiceId: selectedVoiceId })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Voiceover regenerated', description: 'New voiceover has been generated with the selected voice.' });
        onUpdate();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium whitespace-nowrap">Voiceover</span>
        </div>
        
        <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
          <SelectTrigger className="flex-1 h-8 text-xs" data-testid="select-voice">
            <SelectValue>
              {selectedVoice.name} - {selectedVoice.description}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {VOICE_OPTIONS.map(voice => (
              <SelectItem key={voice.id} value={voice.id}>
                <span className="font-medium">{voice.name}</span>
                <span className="text-muted-foreground ml-2">- {voice.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          size="sm"
          onClick={handleRegenerateVoiceover}
          disabled={isRegenerating}
          data-testid="button-regenerate-voiceover"
        >
          {isRegenerating ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Regenerating...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Regenerate Voiceover
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function ServiceFailureAlert({ failures }: { failures: ServiceFailure[] }) {
  if (!failures || failures.length === 0) return null;
  
  const paidServiceFailures = failures.filter(f => 
    f.service === 'fal.ai' || f.service === 'elevenlabs'
  );
  
  if (paidServiceFailures.length === 0) return null;
  
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Paid Service Issues</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside mt-2">
          {paidServiceFailures.map((f, i) => (
            <li key={i} className="text-sm">
              <strong>{f.service}</strong>: {f.error}
              {f.fallbackUsed && <span className="text-muted-foreground"> (Used: {f.fallbackUsed})</span>}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

type OverlayPosition = { x: 'left' | 'center' | 'right'; y: 'top' | 'center' | 'bottom' };
type OverlayAnimation = 'fade' | 'zoom' | 'slide' | 'none';

function ScenePreview({ 
  scenes, 
  assets,
  projectId,
  projectTitle,
  projectQualityTier,
  onToggleProductOverlay,
  onSceneUpdate,
  onProjectUpdate
}: { 
  scenes: Scene[]; 
  assets: VideoProject['assets'];
  projectId?: string;
  projectTitle?: string;
  projectQualityTier?: 'ultra' | 'premium' | 'standard';
  onToggleProductOverlay?: (sceneId: string, useOverlay: boolean) => void;
  onSceneUpdate?: () => void;
  onProjectUpdate?: (project: VideoProject) => void;
}) {
  const [sceneEditorOpen, setSceneEditorOpen] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [replacingObject, setReplacingObject] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<Record<string, string>>({});
  const [editingNarration, setEditingNarration] = useState<string | null>(null);
  const [editedNarration, setEditedNarration] = useState<Record<string, string>>({});
  const [savingNarration, setSavingNarration] = useState<string | null>(null);
  const [editingVisualDirection, setEditingVisualDirection] = useState<string | null>(null);
  const [editedVisualDirection, setEditedVisualDirection] = useState<Record<string, string>>({});
  const [editedSearchQueries, setEditedSearchQueries] = useState<Record<string, { searchQuery?: string; fallbackQuery?: string }>>({});
  const [savingVisualDirection, setSavingVisualDirection] = useState<string | null>(null);
  const [askingSuzzie, setAskingSuzzie] = useState<string | null>(null);
  const [savingOverlay, setSavingOverlay] = useState<string | null>(null);
  const [overlaySettings, setOverlaySettings] = useState<Record<string, {
    x: 'left' | 'center' | 'right';
    y: 'top' | 'center' | 'bottom';
    scale: number;
    animation: OverlayAnimation;
  }>>({});
  const [isReordering, setIsReordering] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState<string | null>(null);
  const [mediaPickerType, setMediaPickerType] = useState<'image' | 'video'>('image');
  const [mediaPickerSource, setMediaPickerSource] = useState<'brand' | 'library'>('brand');
  const [applyingMedia, setApplyingMedia] = useState<string | null>(null);
  const [brandMediaSelectorOpen, setBrandMediaSelectorOpen] = useState<string | null>(null);
  const [sceneActionPending, setSceneActionPending] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState<{ sceneIndex: number; sceneId: string } | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, string>>({});
  const [sceneMediaType, setSceneMediaType] = useState<Record<string, 'image' | 'video'>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [sceneFilter, setSceneFilter] = useState<'all' | 'needs_review' | 'approved' | 'rejected'>('all');
  const [bulkRegeneratingVideos, setBulkRegeneratingVideos] = useState(false);
  const [bulkRegenerateProgress, setBulkRegenerateProgress] = useState({ current: 0, total: 0 });
  const [overlayPreviewMode, setOverlayPreviewMode] = useState<Record<string, boolean>>({});
  const [previewOverlayConfig, setPreviewOverlayConfig] = useState<Record<string, OverlayConfig>>({});
  const [overlaysExpanded, setOverlaysExpanded] = useState<Record<string, boolean>>({});
  const [selectedProductAsset, setSelectedProductAsset] = useState<Record<string, { id: number; url: string; name: string } | null>>({});
  const [selectedLocationAsset, setSelectedLocationAsset] = useState<Record<string, { id: number; url: string; name: string } | null>>({});
  const [videoGenMode, setVideoGenMode] = useState<Record<string, 't2v' | 'i2v'>>({});
  const [customSourceImage, setCustomSourceImage] = useState<Record<string, { url: string; name: string } | null>>({});
  const [uploadingSourceImage, setUploadingSourceImage] = useState<string | null>(null);
  const [i2vSettings, setI2vSettings] = useState<Record<string, I2VSettings>>({});
  const [motionSettings, setMotionSettings] = useState<Record<string, MotionControlSettings>>({});
  const [localSceneQualityTier, setLocalSceneQualityTier] = useState<Record<string, 'ultra' | 'premium' | 'standard' | null>>({});
  const [workflowAnalysis, setWorkflowAnalysis] = useState<Record<string, {
    decision: WorkflowDecision;
    matchedAssets: { products: any[]; logos: any[]; locations: any[] };
  }>>({});
  const [analyzingWorkflow, setAnalyzingWorkflow] = useState<Record<string, boolean>>({});
  const [pipelineStepExecutions, setPipelineStepExecutions] = useState<Record<string, WorkflowStepExecution[]>>({});
  const [executingPipeline, setExecutingPipeline] = useState<Record<string, boolean>>({});
  const pollingTimeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});
  const onProjectUpdateRef = useRef(onProjectUpdate);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Keep onProjectUpdate ref up to date to avoid stale closure in polling
  useEffect(() => {
    onProjectUpdateRef.current = onProjectUpdate;
  }, [onProjectUpdate]);
  
  // Refresh project data when scene editor modal opens to ensure fresh video URLs
  useEffect(() => {
    if (sceneEditorOpen && projectId) {
      console.log('[ScenePreview] Modal opened - fetching fresh project data for', projectId);
      fetch(`/api/universal-video/projects/${projectId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.project) {
            const scene = data.project.scenes?.find((s: any) => s.id === sceneEditorOpen);
            console.log('[ScenePreview] Fresh data received, scene videoUrl:', scene?.background?.videoUrl || scene?.assets?.videoUrl);
            onProjectUpdate?.(data.project);
          }
        })
        .catch(err => console.error('[ScenePreview] Failed to refresh project data:', err));
    }
  }, [sceneEditorOpen, projectId]);
  
  // Cleanup polling timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingTimeoutRefs.current).forEach(timeout => clearTimeout(timeout));
      pollingTimeoutRefs.current = {};
    };
  }, []);
  
  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  // Handle drag end for scene reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !projectId) return;
    
    const oldIndex = scenes.findIndex(s => s.id === active.id);
    const newIndex = scenes.findIndex(s => s.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // Calculate new order
    const newSceneOrder = arrayMove(scenes.map(s => s.id), oldIndex, newIndex);
    
    setIsReordering(true);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/reorder-scenes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sceneOrder: newSceneOrder })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Scenes reordered' });
        if (data.project) onProjectUpdate?.(data.project);
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsReordering(false);
    }
  };
  
  const getOverlaySettings = (scene: Scene) => {
    if (overlaySettings[scene.id]) {
      return overlaySettings[scene.id];
    }
    return {
      x: scene.assets?.productOverlayPosition?.x || 'center',
      y: scene.assets?.productOverlayPosition?.y || 'center',
      scale: scene.assets?.productOverlayPosition?.scale || 0.4,
      animation: scene.assets?.productOverlayPosition?.animation || 'fade'
    };
  };
  
  const updateLocalOverlay = (sceneId: string, updates: Partial<typeof overlaySettings[string]>) => {
    setOverlaySettings(prev => ({
      ...prev,
      [sceneId]: { ...getOverlaySettings(scenes.find(s => s.id === sceneId)!), ...updates }
    }));
  };

  const updateProductOverlay = async (
    sceneId: string, 
    settings: { 
      position?: OverlayPosition; 
      scale?: number; 
      animation?: OverlayAnimation;
      enabled?: boolean;
    }
  ) => {
    if (!projectId) return;
    setSavingOverlay(sceneId);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/product-overlay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Overlay updated' });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingOverlay(null);
    }
  };
  
  // Phase 9A: Scene approval, rejection, and regeneration handlers
  const handleSceneApprove = async (sceneIndex: number) => {
    if (!projectId) return;
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    setSceneActionPending(scene.id);
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneIndex}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Scene Approved', description: 'Scene manually approved for final render.' });
        
        // Fetch updated project to refresh local state
        try {
          const refreshRes = await fetch(`/api/universal-video/projects/${projectId}`, { credentials: 'include' });
          const refreshData = await refreshRes.json();
          if (refreshData.project) {
            onProjectUpdate?.(refreshData.project);
          }
        } catch (err) {
          console.error('Failed to refresh project after approval:', err);
        }
        
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSceneActionPending(null);
    }
  };
  
  const handleSceneReject = async (sceneIndex: number, reason: string) => {
    if (!projectId) return;
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    setSceneActionPending(scene.id);
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneIndex}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Scene Rejected', description: 'Scene marked for regeneration.' });
        
        // Fetch updated project to refresh local state
        try {
          const refreshRes = await fetch(`/api/universal-video/projects/${projectId}`, { credentials: 'include' });
          const refreshData = await refreshRes.json();
          if (refreshData.project) {
            onProjectUpdate?.(refreshData.project);
          }
        } catch (err) {
          console.error('Failed to refresh project after rejection:', err);
        }
        
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSceneActionPending(null);
    }
  };
  
  const handleSceneRegenerate = async (sceneIndex: number) => {
    if (!projectId) return;
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    setSceneActionPending(scene.id);
    try {
      toast({ 
        title: 'Running Quality Analysis', 
        description: `Analyzing scene ${sceneIndex + 1} with Claude Vision...` 
      });
      
      const res = await fetch(`/api/universal-video/${projectId}/analyze-quality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      
      if (data.success) {
        // Extract scene score from sceneStatuses array (correct API response structure)
        const sceneStatus = data.sceneStatuses?.[sceneIndex];
        const score = sceneStatus?.score ?? data.overallScore ?? 0;
        toast({ 
          title: 'Quality Analysis Complete', 
          description: `Scene ${sceneIndex + 1} scored ${score}/100` 
        });
        
        // Fetch updated project to refresh local state
        try {
          const refreshRes = await fetch(`/api/universal-video/projects/${projectId}`, { credentials: 'include' });
          const refreshData = await refreshRes.json();
          console.log('[Re-analyze] Fetched updated project:', refreshData.project?.scenes?.[sceneIndex]?.qualityScore);
          if (refreshData.project) {
            onProjectUpdate?.(refreshData.project);
            console.log('[Re-analyze] Called onProjectUpdate with new project data');
          }
        } catch (err) {
          console.error('Failed to refresh project after analysis:', err);
        }
        
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
        onSceneUpdate?.();
      } else {
        toast({ 
          title: 'Analysis Failed', 
          description: data.error || 'Quality analysis failed. Please try again.', 
          variant: 'destructive' 
        });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSceneActionPending(null);
    }
  };

  const saveNarration = async (sceneId: string) => {
    if (!projectId) return;
    const newNarration = editedNarration[sceneId];
    if (!newNarration?.trim()) {
      toast({ title: 'Error', description: 'Narration cannot be empty', variant: 'destructive' });
      return;
    }
    setSavingNarration(sceneId);
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/narration`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ narration: newNarration })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Narration saved', description: 'Regenerate voiceover to update audio.' });
        setEditingNarration(null);
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNarration(null);
    }
  };

  const saveVisualDirection = async (sceneId: string) => {
    if (!projectId) return;
    const newVisualDirection = editedVisualDirection[sceneId];
    if (!newVisualDirection?.trim()) {
      toast({ title: 'Error', description: 'Visual direction cannot be empty', variant: 'destructive' });
      return;
    }
    setSavingVisualDirection(sceneId);
    try {
      // Include search queries if they were generated by Ask Suzzie
      const searchQueries = editedSearchQueries[sceneId] || {};
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/visual-direction`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          visualDirection: newVisualDirection,
          searchQuery: searchQueries.searchQuery,
          fallbackQuery: searchQueries.fallbackQuery
        })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Visual direction saved', description: 'Regenerate image/video to apply changes.' });
        setEditingVisualDirection(null);
        // Clear the search queries state for this scene
        setEditedSearchQueries(prev => {
          const { [sceneId]: _, ...rest } = prev;
          return rest;
        });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingVisualDirection(null);
    }
  };

  // Ask Suzzie (Claude AI) to generate visual direction idea
  const askSuzzie = async (sceneId: string, narration: string, sceneType: string) => {
    if (!projectId) return;
    setAskingSuzzie(sceneId);
    try {
      // Get matched brand assets and workflow info for this scene
      const sceneWorkflowData = workflowAnalysis[sceneId];
      const selectedProduct = selectedProductAsset[sceneId];
      
      const res = await fetch(`/api/universal-video/ask-suzzie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          narration, 
          sceneType,
          projectTitle: projectTitle || 'Marketing Video',
          // Include workflow and brand asset context
          workflowPath: sceneWorkflowData?.decision?.path,
          matchedAssets: sceneWorkflowData?.matchedAssets,
          selectedProduct: selectedProduct ? {
            name: selectedProduct.name,
            url: selectedProduct.url
          } : undefined
        })
      });
      const data = await res.json();
      if (data.success && data.visualDirection) {
        // Put user into edit mode with the generated suggestion
        setEditingVisualDirection(sceneId);
        setEditedVisualDirection(prev => ({ ...prev, [sceneId]: data.visualDirection }));
        // Store the optimized search queries for when user saves
        if (data.searchQuery || data.fallbackQuery) {
          setEditedSearchQueries(prev => ({ 
            ...prev, 
            [sceneId]: { 
              searchQuery: data.searchQuery, 
              fallbackQuery: data.fallbackQuery 
            } 
          }));
        }
        toast({ 
          title: 'Suzzie has an idea!', 
          description: 'Review and edit the suggestion, then save.' 
        });
      } else {
        toast({ title: 'Failed', description: data.error || 'Could not generate suggestion', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAskingSuzzie(null);
    }
  };

  const analyzeSceneWorkflow = async (sceneId: string, visualDirection: string, narration: string) => {
    if (workflowAnalysis[sceneId] || analyzingWorkflow[sceneId]) return;
    setAnalyzingWorkflow(prev => ({ ...prev, [sceneId]: true }));
    try {
      const res = await fetch('/api/universal-video/workflow/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visualDirection, narration })
      });
      const data = await res.json();
      if (data.success) {
        setWorkflowAnalysis(prev => ({
          ...prev,
          [sceneId]: {
            decision: data.decision,
            matchedAssets: data.matchedAssets || { products: [], logos: [], locations: [] }
          }
        }));
      }
    } catch (err) {
      console.error('Failed to analyze workflow:', err);
    } finally {
      setAnalyzingWorkflow(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const executePipelineStep = async (sceneId: string, stepName: string) => {
    if (!projectId) return;
    
    setPipelineStepExecutions(prev => ({
      ...prev,
      [sceneId]: [
        ...(prev[sceneId] || []).filter(e => e.stepName !== stepName),
        { stepName, status: 'running', startedAt: new Date().toISOString() }
      ]
    }));
    
    const scene = scenes.find(s => s.id === sceneId);
    const intermediates = scene?.pipelineIntermediates || {};
    const provider = selectedProviders[sceneId];
    const qualityTier = localSceneQualityTier[sceneId] || projectQualityTier;
    
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/pipeline-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stepName, intermediates, provider, qualityTier })
      });
      const data = await res.json();
      
      if (data.success) {
        setPipelineStepExecutions(prev => ({
          ...prev,
          [sceneId]: [
            ...(prev[sceneId] || []).filter(e => e.stepName !== stepName),
            { stepName, status: 'completed', resultUrl: data.resultUrl, completedAt: new Date().toISOString() }
          ]
        }));
        onSceneUpdate?.();
        toast({ title: `${stepName} completed`, description: 'Step finished successfully' });
      } else {
        setPipelineStepExecutions(prev => ({
          ...prev,
          [sceneId]: [
            ...(prev[sceneId] || []).filter(e => e.stepName !== stepName),
            { stepName, status: 'failed', error: data.error, completedAt: new Date().toISOString() }
          ]
        }));
        toast({ title: `${stepName} failed`, description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      setPipelineStepExecutions(prev => ({
        ...prev,
        [sceneId]: [
          ...(prev[sceneId] || []).filter(e => e.stepName !== stepName),
          { stepName, status: 'failed', error: err.message, completedAt: new Date().toISOString() }
        ]
      }));
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const runFullPipeline = async (sceneId: string) => {
    if (!projectId) return;
    
    setExecutingPipeline(prev => ({ ...prev, [sceneId]: true }));
    
    const stepNames = ['Generate Environment', 'Compose Products', 'Animate Image', 'Add Logo Overlay'];
    setPipelineStepExecutions(prev => ({
      ...prev,
      [sceneId]: stepNames.map(name => ({ stepName: name, status: 'pending' as const }))
    }));
    
    const provider = selectedProviders[`video-${sceneId}`] || selectedProviders[sceneId] || 'runway';
    const qualityTier = localSceneQualityTier[sceneId] || projectQualityTier;
    
    try {
      const res = await fetch(`/api/universal-video/projects/${projectId}/scenes/${sceneId}/run-full-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, qualityTier })
      });
      const data = await res.json();
      
      if (data.success) {
        setPipelineStepExecutions(prev => ({
          ...prev,
          [sceneId]: stepNames.map(name => {
            const keyMap: Record<string, string> = {
              'Generate Environment': 'environmentImage',
              'Compose Products': 'composedImage',
              'Animate Image': 'preLogoVideo'
            };
            const key = keyMap[name];
            return { 
              stepName: name, 
              status: 'completed' as const, 
              resultUrl: key && data.intermediates ? data.intermediates[key] : undefined
            };
          })
        }));
        onSceneUpdate?.();
        toast({ title: 'Pipeline complete', description: `Video generated in ${(data.executionTimeMs / 1000).toFixed(1)}s` });
      } else {
        toast({ title: 'Pipeline failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setExecutingPipeline(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const regenerateImage = async (sceneId: string, provider?: string) => {
    if (!projectId) return;
    setRegenerating(`image-${sceneId}`);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          prompt: customPrompt[sceneId] || undefined,
          provider: provider || undefined 
        })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Image regenerated', description: `New image from ${data.source}` });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRegenerating(null);
    }
  };

  const regenerateVideo = async (sceneId: string, provider?: string, sourceImageUrl?: string) => {
    console.log('[regenerateVideo] FUNCTION CALLED with sceneId:', sceneId, 'provider:', provider, 'sourceImageUrl:', sourceImageUrl?.substring(0, 50), 'projectId:', projectId);
    if (!projectId) {
      console.error('[regenerateVideo] EARLY RETURN - projectId is undefined');
      toast({ title: 'Error', description: 'Project ID is missing', variant: 'destructive' });
      return;
    }
    console.log('[regenerateVideo] Setting regenerating state...');
    setRegenerating(`video-${sceneId}`);
    const url = `/api/universal-video/${projectId}/scenes/${sceneId}/regenerate-video`;
    
    // Get I2V settings for this scene (if sourceImageUrl provided, it's an I2V request)
    const sceneI2vSettings = sourceImageUrl ? (i2vSettings[sceneId] || defaultI2VSettings) : undefined;
    const sceneMotionSettings = motionSettings[sceneId] || defaultMotionSettings;
    
    const body = { 
      query: customPrompt[sceneId] || undefined,
      provider: provider || undefined,
      sourceImageUrl: sourceImageUrl || undefined, // For I2V: matched brand asset product photo
      i2vSettings: sceneI2vSettings ? {
        imageControlStrength: sceneI2vSettings.imageControlStrength / 100, // Convert to 0-1
        animationStyle: sceneI2vSettings.animationStyle,
        motionStrength: sceneI2vSettings.motionStrength / 100, // Convert to 0-1
      } : undefined,
      motionControl: sceneMotionSettings.cameraMovement !== 'auto' ? {
        camera_movement: sceneMotionSettings.cameraMovement,
        intensity: sceneMotionSettings.intensity / 100, // Convert to 0-1
      } : undefined, // undefined means use intelligent auto-detection
      forceRegenerate: true, // Always create new job when user explicitly clicks regenerate
    };
    console.log('[regenerateVideo] About to fetch:', url, 'with body:', JSON.stringify(body));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      console.log('[regenerateVideo] Fetch response status:', res.status);
      const data = await res.json();
      console.log('[regenerateVideo] Response data:', data);
      
      if (data.success && data.jobId) {
        toast({ 
          title: 'Video generation started', 
          description: 'This may take 3-5 minutes. Progress will update automatically.' 
        });
        
        // Job started - polling will track progress via console.log
        
        // Clear any existing polling for this scene
        if (pollingTimeoutRefs.current[sceneId]) {
          clearTimeout(pollingTimeoutRefs.current[sceneId]);
        }
        
        // Start polling for job status
        const pollJobStatus = () => {
          const maxPolls = 120; // 10 minutes max (5 second intervals)
          let pollCount = 0;
          
          const cleanupPolling = () => {
            delete pollingTimeoutRefs.current[sceneId];
            setRegenerating(null);
          };
          
          const poll = async (): Promise<void> => {
            pollCount++;
            if (pollCount > maxPolls) {
              toast({ 
                title: 'Video generation timeout', 
                description: 'The job is taking longer than expected. It may still complete.', 
                variant: 'destructive' 
              });
              cleanupPolling();
              return;
            }
            
            try {
              const statusRes = await fetch(
                `/api/universal-video/${projectId}/scenes/${sceneId}/video-job/${data.jobId}`,
                { credentials: 'include' }
              );
              
              // Handle 404 - job not found (e.g., server restarted, job lost)
              if (statusRes.status === 404) {
                console.warn('[regenerateVideo] Job not found (may have been lost on server restart)');
                toast({ 
                  title: 'Job not found', 
                  description: 'The generation job was lost. Please try again.', 
                  variant: 'destructive' 
                });
                cleanupPolling();
                return;
              }
              
              const statusData = await statusRes.json();
              
              if (statusData.success && statusData.job) {
                const job = statusData.job;
                console.log(`[regenerateVideo] Job ${data.jobId} status: ${job.status}, progress: ${job.progress}%`);
                
                // Progress update - no state change to avoid re-renders/flashing
                // Just log progress, don't trigger re-renders
                
                if (job.status === 'succeeded') {
                  const successTimestamp = new Date().toISOString();
                  console.log(`[regenerateVideo ${successTimestamp}] SUCCESS - Job ${data.jobId} completed`);
                  console.log(`[regenerateVideo ${successTimestamp}] Job video URL from status: ${job.videoUrl}`);
                  toast({ title: 'Video generated successfully!' });
                  
                  console.log(`[regenerateVideo ${successTimestamp}] Invalidating React Query caches...`);
                  queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
                  console.log(`[regenerateVideo ${successTimestamp}] Cache invalidation complete`);
                  
                  try {
                    console.log(`[regenerateVideo ${successTimestamp}] Fetching fresh project from: /api/universal-video/projects/${projectId}`);
                    const freshRes = await fetch(`/api/universal-video/projects/${projectId}`, { credentials: 'include' });
                    console.log(`[regenerateVideo ${successTimestamp}] Fresh response status: ${freshRes.status}`);
                    const freshData = await freshRes.json();
                    console.log(`[regenerateVideo ${successTimestamp}] Fresh data received, has project: ${!!freshData.project}`);
                    if (freshData.project) {
                      const updatedScene = freshData.project.scenes?.find((s: any) => s.id === sceneId);
                      const newVideoUrl = updatedScene?.background?.videoUrl || updatedScene?.assets?.videoUrl;
                      console.log(`[regenerateVideo ${successTimestamp}] Scene ${sceneId} video URL from fresh data: ${newVideoUrl}`);
                      console.log(`[regenerateVideo ${successTimestamp}] onProjectUpdateRef available: ${!!onProjectUpdateRef.current}`);
                      if (onProjectUpdateRef.current) {
                        console.log(`[regenerateVideo ${successTimestamp}] Calling onProjectUpdateRef with fresh project...`);
                        onProjectUpdateRef.current(freshData.project);
                        console.log(`[regenerateVideo ${successTimestamp}] Project state updated successfully`);
                      } else {
                        console.error(`[regenerateVideo ${successTimestamp}] ERROR: onProjectUpdateRef.current is not defined!`);
                      }
                    } else {
                      console.error(`[regenerateVideo ${successTimestamp}] ERROR: freshData.project is falsy:`, freshData);
                    }
                  } catch (refreshErr) {
                    console.error(`[regenerateVideo ${successTimestamp}] Failed to fetch fresh project:`, refreshErr);
                    if (statusData.project && onProjectUpdateRef.current) {
                      console.log(`[regenerateVideo ${successTimestamp}] Using fallback statusData.project`);
                      onProjectUpdateRef.current(statusData.project);
                    }
                  }
                  
                  onSceneUpdate?.();
                  cleanupPolling();
                  return;
                } else if (job.status === 'failed') {
                  toast({ 
                    title: 'Video generation failed', 
                    description: job.errorMessage || 'Unknown error', 
                    variant: 'destructive' 
                  });
                  cleanupPolling();
                  return;
                } else if (job.status === 'cancelled') {
                  toast({ title: 'Video generation cancelled' });
                  cleanupPolling();
                  return;
                }
                
                // Still pending or running - continue polling with tracked timeout
                pollingTimeoutRefs.current[sceneId] = setTimeout(poll, 5000);
              } else {
                console.error('[regenerateVideo] Failed to get job status');
                pollingTimeoutRefs.current[sceneId] = setTimeout(poll, 5000);
              }
            } catch (pollErr) {
              console.error('[regenerateVideo] Poll error:', pollErr);
              pollingTimeoutRefs.current[sceneId] = setTimeout(poll, 5000);
            }
          };
          
          // Start polling after initial delay
          pollingTimeoutRefs.current[sceneId] = setTimeout(poll, 3000);
        };
        
        pollJobStatus();
      } else if (data.success && data.newVideoUrl) {
        // Fallback for direct response (legacy)
        toast({ title: 'Video regenerated', description: `New video from ${data.source}` });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
        setRegenerating(null);
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
        setRegenerating(null);
      }
    } catch (err: any) {
      console.error('[regenerateVideo] FETCH ERROR:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setRegenerating(null);
    }
  };

  const replaceObjectInVideo = async (sceneId: string, replacementImageUrl: string, objectDescription?: string) => {
    if (!projectId) {
      toast({ title: 'Error', description: 'Project ID is missing', variant: 'destructive' });
      return;
    }
    
    if (!replacementImageUrl) {
      toast({ title: 'Select a brand asset', description: 'Please select a product image to replace the object with', variant: 'destructive' });
      return;
    }
    
    setReplacingObject(sceneId);
    const url = `/api/universal-video/${projectId}/scenes/${sceneId}/replace-object`;
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          replacementImageUrl,
          objectDescription: objectDescription || 'the product bottle',
          prompt: `Replace the product/bottle in this video with the Pine Hill Farm product shown in the reference image. Maintain the same motion, lighting, and camera movement.`,
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast({ 
          title: 'Object replaced!', 
          description: 'The product in the video has been replaced with your brand asset.' 
        });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        const errorMessage = typeof data.error === 'string' 
          ? data.error 
          : (data.error?.message || data.error?.raw_message || JSON.stringify(data.error) || 'Unable to replace object in video');
        toast({ 
          title: 'Object replacement failed', 
          description: errorMessage, 
          variant: 'destructive' 
        });
      }
    } catch (err: any) {
      console.error('[replaceObjectInVideo] Error:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setReplacingObject(null);
    }
  };

  const regenerateAllVideos = async () => {
    console.log('[regenerateAllVideos] Button clicked, projectId:', projectId, 'bulkRegeneratingVideos:', bulkRegeneratingVideos, 'scenes.length:', scenes.length);
    if (!projectId || bulkRegeneratingVideos) {
      console.log('[regenerateAllVideos] Early return - projectId:', projectId, 'bulkRegeneratingVideos:', bulkRegeneratingVideos);
      return;
    }
    
    console.log('[regenerateAllVideos] Starting bulk regeneration...');
    setBulkRegeneratingVideos(true);
    setBulkRegenerateProgress({ current: 0, total: scenes.length });
    
    toast({
      title: 'Regenerating all scene videos',
      description: `Starting regeneration of ${scenes.length} scenes. This may take a while.`
    });
    
    try {
      const res = await fetch(`/api/universal-video/${projectId}/regenerate-all-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      
      if (data.success) {
        toast({
          title: 'Bulk video regeneration started',
          description: `Regenerating ${data.totalScenes} scenes. Check back in a few minutes.`
        });
        
        const pollBulkStatus = async () => {
          let completed = false;
          let polls = 0;
          const maxPolls = 360;
          
          while (!completed && polls < maxPolls) {
            polls++;
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            try {
              const statusRes = await fetch(
                `/api/universal-video/${projectId}/regenerate-all-videos/status`,
                { credentials: 'include' }
              );
              const statusData = await statusRes.json();
              
              if (statusData.success) {
                setBulkRegenerateProgress({
                  current: statusData.completed || 0,
                  total: statusData.total || scenes.length
                });
                
                if (statusData.status === 'completed' || statusData.completed >= statusData.total) {
                  completed = true;
                  const successCount = statusData.completed - (statusData.failed || 0);
                  if (statusData.failed > 0) {
                    toast({
                      title: 'Video regeneration completed with issues',
                      description: `${successCount} videos regenerated, ${statusData.failed} failed.`,
                      variant: 'destructive'
                    });
                  } else {
                    toast({
                      title: 'All videos regenerated!',
                      description: `Successfully regenerated ${statusData.completed} scene videos. Refreshing...`
                    });
                  }
                  onSceneUpdate?.();
                  queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
                  // Force a page-level refetch after a short delay
                  setTimeout(() => {
                    window.location.reload();
                  }, 1500);
                } else if (statusData.status === 'failed') {
                  completed = true;
                  toast({
                    title: 'Bulk regeneration failed',
                    description: statusData.errors?.[0] || 'All scenes failed to regenerate',
                    variant: 'destructive'
                  });
                }
              } else {
                completed = true;
                toast({
                  title: 'Status check failed',
                  description: 'Could not get regeneration status. Some videos may have been updated.',
                  variant: 'destructive'
                });
              }
            } catch (err) {
              console.error('[regenerateAllVideos] Poll error:', err);
            }
          }
          
          setBulkRegeneratingVideos(false);
          setBulkRegenerateProgress({ current: 0, total: 0 });
        };
        
        pollBulkStatus();
      } else {
        toast({
          title: 'Bulk regeneration failed',
          description: data.error || 'Unknown error',
          variant: 'destructive'
        });
        setBulkRegeneratingVideos(false);
      }
    } catch (err: any) {
      console.error('[regenerateAllVideos] Error:', err);
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive'
      });
      setBulkRegeneratingVideos(false);
    }
  };

  const switchBackground = async (sceneId: string, preferVideo: boolean) => {
    if (!projectId) return;
    setRegenerating(`switch-${sceneId}`);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/switch-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preferVideo })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: preferVideo ? 'Switched to video' : 'Switched to image' });
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRegenerating(null);
    }
  };

  // Apply media from library/source to scene
  const applyMediaToScene = async (sceneId: string, mediaUrl: string, mediaType: 'image' | 'video', sourceName: string) => {
    if (!projectId) return;
    setApplyingMedia(sceneId);
    try {
      const res = await fetch(`/api/universal-video/${projectId}/scenes/${sceneId}/set-media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mediaUrl, mediaType, source: sourceName })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Media applied', description: `Scene updated with ${sourceName} content.` });
        setMediaPickerOpen(null);
        // Update project immediately with returned data for instant UI refresh
        if (data.project) {
          onProjectUpdate?.(data.project);
        }
        onSceneUpdate?.();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setApplyingMedia(null);
    }
  };
  
  // Phase 11D: Apply brand media with animation settings
  const applyBrandMedia = async (sceneId: string, asset: BrandAsset, animationSettings?: AnimationSettings) => {
    if (!projectId) return;
    setApplyingMedia(sceneId);
    try {
      const isVideo = ['video', 'broll', 'intro', 'outro'].includes(asset.mediaType);
      
      // Find the current scene to preserve all non-media-url fields
      const currentScene = scenes.find(s => s.id === sceneId);
      const existingAssets = currentScene?.assets ? { ...currentScene.assets } : {};
      
      // Clone existing assets and only modify media-related keys
      const updatedAssets = { ...existingAssets };
      
      if (isVideo) {
        // Set video, clear image fields
        updatedAssets.videoUrl = asset.url;
        updatedAssets.videoSource = 'brand';
        updatedAssets.imageUrl = undefined;
      } else {
        // Set image, clear video fields
        updatedAssets.imageUrl = asset.url;
        updatedAssets.videoUrl = undefined;
        updatedAssets.videoSource = undefined;
      }
      
      // Build updates object
      const updates: Record<string, any> = {
        mediaSource: 'brand',
        brandAssetId: asset.id,
        brandAssetUrl: asset.url,
        brandAssetType: isVideo ? 'video' : 'image',
        assets: updatedAssets,
      };
      
      // Only include animationSettings when applicable
      if (isVideo) {
        // Videos don't use Ken Burns - clear animation settings
        updates.animationSettings = null;
      } else if (animationSettings) {
        // Images with animation settings
        updates.animationSettings = animationSettings;
      }
      // If image without animation settings, don't modify existing animationSettings
      
      await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${sceneId}`, updates);
      
      toast({ 
        title: 'Brand media applied', 
        description: animationSettings && !isVideo 
          ? `${asset.name} with ${animationSettings.type} animation` 
          : asset.name 
      });
      setBrandMediaSelectorOpen(null);
      onSceneUpdate?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setApplyingMedia(null);
    }
  };

  // Open media picker for a scene
  const openMediaPicker = (sceneId: string, type: 'image' | 'video', source: 'brand' | 'library') => {
    setMediaPickerOpen(sceneId);
    setMediaPickerType(type);
    setMediaPickerSource(source);
  };
  
  // Sortable scene item wrapper
  const SortableSceneItem = ({ scene, index, children }: { scene: Scene; index: number; children: (dragHandle: JSX.Element) => JSX.Element }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 100 : 'auto',
    };
    
    const dragHandle = (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-2 hover:bg-primary/10 rounded-md border border-transparent hover:border-primary/30 transition-all flex flex-col items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
              data-testid={`drag-handle-scene-${scene.id}`}
            >
              <GripVertical className="w-5 h-5 text-muted-foreground hover:text-primary" />
              <span className="text-[9px] text-muted-foreground font-medium">DRAG</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Drag to reorder scenes</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    
    return (
      <div ref={setNodeRef} style={style as any}>
        {children(dragHandle)}
      </div>
    );
  };

  // Filter scenes based on selected filter (include manually approved scenes)
  const filteredScenes = scenes.filter(scene => {
    const isManuallyApproved = (scene as any).userApproved === true;
    if (sceneFilter === 'all') return true;
    if (sceneFilter === 'needs_review') return !isManuallyApproved && scene.analysisResult?.recommendation === 'needs_review';
    if (sceneFilter === 'approved') return isManuallyApproved || scene.analysisResult?.recommendation === 'approved';
    if (sceneFilter === 'rejected') return !isManuallyApproved && (scene.analysisResult?.recommendation === 'regenerate' || scene.analysisResult?.recommendation === 'critical_fail');
    return true;
  });
  
  // Count scenes by status (include manually approved scenes)
  const statusCounts = {
    all: scenes.length,
    needs_review: scenes.filter(s => !(s as any).userApproved && s.analysisResult?.recommendation === 'needs_review').length,
    approved: scenes.filter(s => (s as any).userApproved === true || s.analysisResult?.recommendation === 'approved').length,
    rejected: scenes.filter(s => !(s as any).userApproved && (s.analysisResult?.recommendation === 'regenerate' || s.analysisResult?.recommendation === 'critical_fail')).length,
  };
  
  // Handle reject with dialog
  const handleRejectWithDialog = (sceneIndex: number, sceneId: string) => {
    setRejectDialogOpen({ sceneIndex, sceneId });
    setRejectReason('');
  };
  
  const submitRejection = () => {
    if (rejectDialogOpen) {
      handleSceneReject(rejectDialogOpen.sceneIndex, rejectReason || 'Manual rejection');
      setRejectDialogOpen(null);
      setRejectReason('');
    }
  };

  return (
    <>
    {/* Phase 9A: Scene Filter Controls */}
    <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="scene-filter-controls">
      <span className="text-sm font-medium text-muted-foreground">Filter:</span>
      <Button
        size="sm"
        variant={sceneFilter === 'all' ? 'default' : 'outline'}
        onClick={() => setSceneFilter('all')}
        data-testid="filter-all"
      >
        All ({statusCounts.all})
      </Button>
      <Button
        size="sm"
        variant={sceneFilter === 'needs_review' ? 'default' : 'outline'}
        className={sceneFilter === 'needs_review' ? '' : 'border-yellow-400 text-yellow-700 hover:bg-yellow-50'}
        onClick={() => setSceneFilter('needs_review')}
        data-testid="filter-needs-review"
      >
        <AlertTriangle className="w-3 h-3 mr-1" /> Needs Review ({statusCounts.needs_review})
      </Button>
      <Button
        size="sm"
        variant={sceneFilter === 'approved' ? 'default' : 'outline'}
        className={sceneFilter === 'approved' ? '' : 'border-green-400 text-green-700 hover:bg-green-50'}
        onClick={() => setSceneFilter('approved')}
        data-testid="filter-approved"
      >
        <CheckCircle className="w-3 h-3 mr-1" /> Approved ({statusCounts.approved})
      </Button>
      <Button
        size="sm"
        variant={sceneFilter === 'rejected' ? 'default' : 'outline'}
        className={sceneFilter === 'rejected' ? '' : 'border-red-400 text-red-700 hover:bg-red-50'}
        onClick={() => setSceneFilter('rejected')}
        data-testid="filter-rejected"
      >
        <XCircle className="w-3 h-3 mr-1" /> Rejected ({statusCounts.rejected})
      </Button>
      
      <div className="ml-auto">
        <Button
          size="sm"
          variant="outline"
          onClick={regenerateAllVideos}
          disabled={bulkRegeneratingVideos || scenes.length === 0}
          className="border-blue-400 text-blue-700 hover:bg-blue-50"
          data-testid="button-regenerate-all-videos"
        >
          {bulkRegeneratingVideos ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Regenerating {bulkRegenerateProgress.current}/{bulkRegenerateProgress.total}...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Regenerate All Videos
            </>
          )}
        </Button>
      </div>
    </div>
    
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={filteredScenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {isReordering && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-muted/50 rounded">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving new order...
            </div>
          )}
          {filteredScenes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No scenes match the selected filter.
            </div>
          )}
          {filteredScenes.map((scene) => {
            const index = scenes.findIndex(s => s.id === scene.id);
            const imageAsset = assets.images.find(img => img.sceneId === scene.id);
            const isEditing = sceneEditorOpen === scene.id;
            const hasAIBackground = scene.assets?.backgroundUrl;
            const hasProductOverlay = scene.assets?.productOverlayUrl && scene.assets?.useProductOverlay !== false;
            // Check for video URL in both background and assets for compatibility
            const sceneVideoUrl = scene.background?.videoUrl || scene.assets?.videoUrl;
            const hasBrollVideo = (scene.background?.type === 'video' && scene.background?.videoUrl) || !!scene.assets?.videoUrl;
            
            // Debug: Log video URL when scene renders (only log if video URL changes or on first render)
            if (sceneVideoUrl) {
              console.log(`[SceneRender] ${scene.id} videoUrl:`, sceneVideoUrl?.substring(0, 80));
            }
            const defaultOverlay = SCENE_OVERLAY_DEFAULTS[scene.type] ?? false;
            const showsProductOverlay = scene.assets?.useProductOverlay ?? defaultOverlay;
            
            // Phase 9A: Determine border styling based on analysis status and manual approval
            const isManuallyApproved = (scene as any).userApproved === true;
            const borderClass = isManuallyApproved
              ? 'border-2 border-green-400'
              : scene.analysisResult?.recommendation === 'needs_review' 
                ? 'border-2 border-yellow-400' 
                : (scene.analysisResult?.recommendation === 'regenerate' || scene.analysisResult?.recommendation === 'critical_fail')
                  ? 'border-2 border-red-400'
                  : scene.analysisResult?.recommendation === 'approved'
                    ? 'border-2 border-green-400'
                    : '';
            
            return (
              <SortableSceneItem key={scene.id} scene={scene} index={index}>
                {(dragHandle) => (
                  <Card className={`overflow-hidden ${borderClass}`} data-testid={`card-scene-${scene.id}`}>
                    <div 
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => setSceneEditorOpen(scene.id)}
                    >
                      {dragHandle}
              <div className="w-28 h-16 bg-muted rounded overflow-hidden flex-shrink-0 relative">
                {hasBrollVideo && sceneVideoUrl ? (
                  <div className="relative w-full h-full">
                    <video 
                      key={`video-card-${scene.id}-${sceneVideoUrl}`}
                      src={convertToDisplayUrl(sceneVideoUrl, true)}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onLoadStart={() => console.log('[VideoCard] Loading video:', sceneVideoUrl?.substring(0, 80))}
                      onLoadedData={() => console.log('[VideoCard] Video loaded successfully:', scene.id)}
                      onError={(e) => console.error('[VideoCard] Video load error:', scene.id, sceneVideoUrl, e)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Video className="w-5 h-5 text-white drop-shadow" />
                    </div>
                  </div>
                ) : hasAIBackground ? (
                  <>
                    <img 
                      src={convertToDisplayUrl(scene.assets!.backgroundUrl!)} 
                      alt={`Scene ${index + 1} background`}
                      className="w-full h-full object-cover"
                    />
                    {hasProductOverlay && showsProductOverlay && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <img 
                          src={convertToDisplayUrl(scene.assets!.productOverlayUrl!)} 
                          alt="Product overlay"
                          className="max-w-[60%] max-h-[80%] object-contain drop-shadow-lg"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </>
                ) : imageAsset?.url ? (
                  <img 
                    src={convertToDisplayUrl(imageAsset.url)} 
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs capitalize" data-testid={`badge-scene-type-${scene.id}`}>
                    {scene.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid={`scene-duration-${scene.id}`}>
                    {scene.duration}s
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`content-type-icon-${scene.id}`}>
                    {getContentTypeIcon((scene as any).contentType || 'lifestyle')}
                  </span>
                  {hasBrollVideo && (
                    <Badge className="text-xs bg-blue-500">
                      <Video className="w-3 h-3 mr-1" /> B-Roll
                    </Badge>
                  )}
                  {hasAIBackground && (
                    <Badge className={`text-xs ${showsProductOverlay ? 'bg-gradient-to-r from-purple-500 to-blue-500' : 'bg-purple-500'}`}>
                      {showsProductOverlay ? 'AI + Product' : 'AI Background'}
                    </Badge>
                  )}
                  {/* Phase 9A: Quality Score Badge - Phase 10A: Added simulated indicator */}
                  {scene.qualityScore !== undefined && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            className={`text-xs ${
                              scene.analysisResult?.analysisModel?.includes('simulated') 
                                ? 'bg-orange-500 border-orange-600' 
                                : getScoreColor(scene.qualityScore)
                            }`} 
                            data-testid={`badge-quality-${scene.id}`}
                          >
                            {scene.analysisResult?.analysisModel?.includes('simulated') ? '⚠️ ' : ''}
                            Q: {scene.qualityScore}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {scene.analysisResult?.analysisModel?.includes('simulated') ? (
                            <div className="text-orange-300">
                              <p className="font-bold">⚠️ SIMULATED SCORE</p>
                              <p>This is a fake score - Claude Vision not configured.</p>
                              <p className="text-xs mt-1">Configure ANTHROPIC_API_KEY for real analysis.</p>
                            </div>
                          ) : (
                            <p>Quality Score: {scene.qualityScore}/100</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {/* Phase 9A: Status Indicator */}
                  {scene.analysisResult?.recommendation && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center" data-testid={`status-indicator-${scene.id}`}>
                            {scene.analysisResult.recommendation === 'approved' && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                            {scene.analysisResult.recommendation === 'needs_review' && (
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            )}
                            {(scene.analysisResult.recommendation === 'regenerate' || scene.analysisResult.recommendation === 'critical_fail') && (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{scene.analysisResult.recommendation === 'approved' ? 'Approved' : 
                              scene.analysisResult.recommendation === 'needs_review' ? 'Needs Review' : 
                              'Regeneration Needed'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {/* Phase 9A: Provider Badge */}
                  {scene.assets?.videoSource && getProviderDisplayName(scene.assets.videoSource) && (
                    <Badge className={`text-xs ${getProviderBadgeStyle(scene.assets.videoSource)}`} data-testid={`badge-provider-${scene.id}`}>
                      {getProviderDisplayName(scene.assets.videoSource)}
                    </Badge>
                  )}
                </div>
                <p className="text-sm truncate mt-1">{scene.narration.substring(0, 60)}...</p>
              </div>
              <ChevronDown className="w-4 h-4" />
            </div>
            
            {/* Scene content is now in modal - see SceneEditorModal below */}
                  </Card>
                )}
              </SortableSceneItem>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
    
    {/* Scene Editor Modal */}
    {sceneEditorOpen && (() => {
      const scene = scenes.find(s => s.id === sceneEditorOpen);
      if (!scene) return null;
      const index = scenes.findIndex(s => s.id === sceneEditorOpen);
      const imageAsset = assets.images.find(img => img.sceneId === scene.id);
      const hasAIBackground = scene.assets?.backgroundUrl;
      const hasProductOverlay = scene.assets?.productOverlayUrl && scene.assets?.useProductOverlay !== false;
      // Check for video URL in both background and assets for compatibility
      const sceneVideoUrl = scene.background?.videoUrl || scene.assets?.videoUrl;
      const hasBrollVideo = (scene.background?.type === 'video' && scene.background?.videoUrl) || !!scene.assets?.videoUrl;
      const defaultOverlay = SCENE_OVERLAY_DEFAULTS[scene.type] ?? false;
      const showsProductOverlay = scene.assets?.useProductOverlay ?? defaultOverlay;
      const sceneWorkflow = workflowAnalysis[scene.id];
      
      if (!workflowAnalysis[scene.id] && !analyzingWorkflow[scene.id]) {
        analyzeSceneWorkflow(scene.id, scene.background?.source || scene.visualDirection || '', scene.narration);
      }
      
      return (
        <Dialog key={`scene-editor-${scene.id}-${scene.qualityScore || 0}-${scene.analysisResult?.overallScore || 0}-${sceneVideoUrl?.split('/').pop() || 'no-video'}`} open={true} onOpenChange={(open) => !open && setSceneEditorOpen(null)}>
          <DialogContent className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] max-w-[1920px] max-h-[1080px] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {scene.type}
                </Badge>
                Scene {index + 1} - {scene.duration}s
                {hasBrollVideo && (
                  <Badge className="text-xs bg-blue-500">
                    <Video className="w-3 h-3 mr-1" /> B-Roll
                  </Badge>
                )}
                {hasAIBackground && (
                  <Badge className={`text-xs ${showsProductOverlay ? 'bg-gradient-to-r from-purple-500 to-blue-500' : 'bg-purple-500'}`}>
                    {showsProductOverlay ? 'AI + Product' : 'AI Background'}
                  </Badge>
                )}
                {sceneWorkflow && (
                  <WorkflowPathIndicator 
                    decision={sceneWorkflow.decision} 
                    compact 
                    projectQualityTier={projectQualityTier} 
                    sceneQualityTier={localSceneQualityTier[scene.id] !== undefined ? localSceneQualityTier[scene.id] : scene.qualityTier}
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 mr-8 h-7 px-2"
                  title="Refresh scene data from database"
                  onClick={async () => {
                    console.log('[ScenePreview] Manual refresh triggered for', projectId, 'scene:', sceneEditorOpen);
                    console.log('[ScenePreview] Current videoUrl:', sceneVideoUrl);
                    try {
                      const res = await fetch(`/api/universal-video/projects/${projectId}`, { 
                        credentials: 'include',
                        cache: 'no-store',
                        headers: { 'Cache-Control': 'no-cache' }
                      });
                      const data = await res.json();
                      if (data.success && data.project) {
                        const freshScene = data.project.scenes?.find((s: any) => s.id === sceneEditorOpen);
                        const newVideoUrl = freshScene?.background?.videoUrl || freshScene?.assets?.videoUrl;
                        console.log('[ScenePreview] Fresh videoUrl from DB:', newVideoUrl);
                        const urlChanged = newVideoUrl !== sceneVideoUrl;
                        toast({ 
                          title: urlChanged ? 'Video Updated!' : 'Refreshed', 
                          description: urlChanged 
                            ? `New video loaded: ${newVideoUrl?.split('/').pop()?.substring(0, 30) || 'unknown'}` 
                            : 'Scene data is already current'
                        });
                        onProjectUpdate?.(data.project);
                      } else {
                        console.error('[ScenePreview] API returned error:', data);
                        toast({ title: 'Refresh failed', description: data.error || 'Unknown error', variant: 'destructive' });
                      }
                    } catch (err) {
                      console.error('[ScenePreview] Refresh failed:', err);
                      toast({ title: 'Refresh failed', variant: 'destructive' });
                    }
                  }}
                  data-testid="btn-refresh-scene"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </DialogTitle>
              <DialogDescription>
                Edit scene content, media sources, and overlay settings
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Large Media Preview */}
              <div className="space-y-4">
                {/* Preview Mode Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Preview Mode</Label>
                  <div className="flex border rounded-md overflow-hidden">
                    <Button
                      size="sm"
                      variant={!overlayPreviewMode[scene.id] ? 'default' : 'ghost'}
                      className="h-7 text-xs rounded-none"
                      onClick={() => setOverlayPreviewMode(prev => ({ ...prev, [scene.id]: false }))}
                      data-testid={`button-preview-media-${scene.id}`}
                    >
                      <ImageIcon className="w-3 h-3 mr-1" /> Media
                    </Button>
                    <Button
                      size="sm"
                      variant={overlayPreviewMode[scene.id] ? 'default' : 'ghost'}
                      className="h-7 text-xs rounded-none"
                      onClick={() => setOverlayPreviewMode(prev => ({ ...prev, [scene.id]: true }))}
                      data-testid={`button-preview-overlay-${scene.id}`}
                    >
                      <Layers className="w-3 h-3 mr-1" /> With Overlays
                    </Button>
                  </div>
                </div>
                
                {/* Overlay Preview Mode */}
                {overlayPreviewMode[scene.id] && (hasBrollVideo || hasAIBackground || imageAsset?.url) ? (
                  <OverlayPreview
                    key={`overlay-${scene.id}-${JSON.stringify((previewOverlayConfig[scene.id] || scene.overlayConfig)?.logo?.position || 'center')}`}
                    mediaUrl={convertToDisplayUrl(
                      hasBrollVideo && sceneVideoUrl ? sceneVideoUrl :
                      hasAIBackground ? scene.assets!.backgroundUrl! :
                      imageAsset!.url
                    )}
                    mediaType={hasBrollVideo ? 'video' : 'image'}
                    config={previewOverlayConfig[scene.id] || (scene.overlayConfig as OverlayConfig) || getDefaultOverlayConfig(scene.type || 'general')}
                    convertUrl={convertToDisplayUrl}
                  />
                ) : hasBrollVideo && sceneVideoUrl ? (
                  <MemoizedVideoPlayer
                    videoUrl={sceneVideoUrl!}
                    sceneId={scene.id}
                    convertToDisplayUrl={convertToDisplayUrl}
                    generationMethod={scene.generationMethod}
                  />
                ) : hasAIBackground ? (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                      AI Background
                      {scene.generationMethod && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
                          {scene.generationMethod}
                        </span>
                      )}
                    </Label>
                    <div className="w-full rounded-lg overflow-hidden border relative bg-black" style={{ aspectRatio: '16/9' }}>
                      <img 
                        src={convertToDisplayUrl(scene.assets!.backgroundUrl!)} 
                        alt="AI background"
                        className="w-full h-full object-contain"
                      />
                      {showsProductOverlay && scene.assets?.productOverlayUrl && (() => {
                        const settings = getOverlaySettings(scene);
                        const positionStyles: React.CSSProperties = {
                          position: 'absolute',
                          transform: `scale(${settings.scale})`,
                          transformOrigin: `${settings.x} ${settings.y}`,
                          maxWidth: '45%',
                          maxHeight: '60%',
                          objectFit: 'contain' as const,
                          ...(settings.x === 'left' ? { left: '5%' } : settings.x === 'right' ? { right: '5%' } : { left: '50%', marginLeft: '-22.5%' }),
                          ...(settings.y === 'top' ? { top: '5%' } : settings.y === 'bottom' ? { bottom: '5%' } : { top: '50%', marginTop: '-30%' }),
                        };
                        return (
                          <img 
                            src={convertToDisplayUrl(scene.assets!.productOverlayUrl!)} 
                            alt="Product overlay"
                            className="drop-shadow-lg"
                            style={positionStyles}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ) : imageAsset?.url ? (
                  <div>
                    <Label className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                      Scene Image
                      {scene.generationMethod && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
                          {scene.generationMethod}
                        </span>
                      )}
                    </Label>
                    <div className="w-full rounded-lg overflow-hidden border bg-black" style={{ aspectRatio: '16/9' }}>
                      <img 
                        src={convertToDisplayUrl(imageAsset.url)} 
                        alt={`Scene ${index + 1}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full rounded-lg border bg-muted flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                
                {/* Media Source Selector Controls */}
                {projectId && (
                  <div className="p-4 bg-muted/30 rounded-lg border space-y-4">
                    {/* Custom prompt input */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Custom Prompt (optional)</Label>
                      <Input
                        placeholder="Override the visual direction with a custom prompt..."
                        value={customPrompt[scene.id] || ''}
                        onChange={(e) => setCustomPrompt(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        className="text-sm"
                        data-testid={`input-custom-prompt-modal-${scene.id}`}
                      />
                    </div>
                    
                    {/* Phase 13D: Provider Selector Panel with dropdowns */}
                    <ProviderSelectorPanel
                      selectedImageProvider={selectedProviders[`image-${scene.id}`] || 'flux'}
                      selectedVideoProvider={selectedProviders[`video-${scene.id}`] || 'runway'}
                      onSelectImageProvider={(provider) => {
                        const newProviders = { ...selectedProviders };
                        newProviders[`image-${scene.id}`] = provider;
                        delete newProviders[`video-${scene.id}`];
                        setSelectedProviders(newProviders);
                        setSceneMediaType(prev => ({ ...prev, [scene.id]: 'image' }));
                        if (provider === 'brand_media') {
                          setBrandMediaSelectorOpen(scene.id);
                        } else if (provider === 'asset_library') {
                          openMediaPicker(scene.id, 'image', 'library');
                        }
                      }}
                      onSelectVideoProvider={(provider) => {
                        const newProviders = { ...selectedProviders };
                        newProviders[`video-${scene.id}`] = provider;
                        delete newProviders[`image-${scene.id}`];
                        setSelectedProviders(newProviders);
                        setSceneMediaType(prev => ({ ...prev, [scene.id]: 'video' }));
                        if (provider === 'brand_media') {
                          setBrandMediaSelectorOpen(scene.id);
                        } else if (provider === 'asset_library') {
                          openMediaPicker(scene.id, 'video', 'library');
                        }
                      }}
                      recommendedImageProvider="flux"
                      recommendedVideoProvider="runway"
                      sceneContentType={scene.visualDirection || scene.type}
                      disabled={!!regenerating || !!applyingMedia}
                      referenceMode={scene.referenceConfig?.mode || 'none'}
                      activeMediaType={sceneMediaType[scene.id] || (scene.background?.type === 'video' ? 'video' : 'image')}
                      onMediaTypeChange={(type) => {
                        setSceneMediaType(prev => ({ ...prev, [scene.id]: type }));
                        switchBackground(scene.id, type === 'video');
                        fetch(`/api/universal-video/projects/${projectId}/media-mode`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mediaMode: type }),
                        }).then(() => {
                          queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
                        }).catch(err => console.warn('[MediaMode] Failed to save:', err));
                      }}
                      qualityTier={localSceneQualityTier[scene.id] !== undefined ? localSceneQualityTier[scene.id] : scene.qualityTier || projectQualityTier}
                      onGenerate={() => {
                        const sceneQuality = localSceneQualityTier[scene.id] !== undefined ? localSceneQualityTier[scene.id] : scene.qualityTier || projectQualityTier;
                        const mediaType = sceneMediaType[scene.id] || (scene.background?.type === 'video' ? 'video' : 'image');
                        const provider = selectedProviders[`${mediaType}-${scene.id}`] || getRecommendedProvider(mediaType, scene.type, scene.visualDirection);
                        // Get user-selected asset (product or location)
                        const selectedProduct = selectedProductAsset[scene.id];
                        const selectedLocation = selectedLocationAsset[scene.id];
                        const userSelectedAssetUrl = selectedProduct?.url || selectedLocation?.url;
                        
                        const sceneWorkflow = workflowAnalysis[scene.id];
                        const matchedProductAsset = sceneWorkflow?.matchedAssets?.products?.[0]?.url;
                        const matchedLocationAsset = sceneWorkflow?.matchedAssets?.locations?.[0]?.url;
                        
                        // Only use location assets for I2V if the visual direction is about the location itself
                        // NOT for scenes requiring AI-generated people/activities (montage, people, yoga, etc.)
                        const visualDir = scene.visualDirection?.toLowerCase() || '';
                        const requiresPeopleContent = visualDir.includes('montage') || 
                                                       visualDir.includes('people') || 
                                                       visualDir.includes('person') ||
                                                       visualDir.includes('adults') ||
                                                       visualDir.includes('yoga') ||
                                                       visualDir.includes('cooking') ||
                                                       visualDir.includes('hiking') ||
                                                       visualDir.includes('activity');
                        const shouldUseLocationAsset = matchedLocationAsset && !requiresPeopleContent;
                        // User-selected asset takes priority, then fall back to matched assets
                        const sourceImageUrl = userSelectedAssetUrl || scene.brandAssetUrl || scene.assets?.imageUrl || matchedProductAsset || (shouldUseLocationAsset ? matchedLocationAsset : undefined);
                        console.log('[Generate Click] sceneId:', scene.id, 'qualityTier:', sceneQuality, 'mediaType:', mediaType, 'provider:', provider, 'sourceImageUrl:', sourceImageUrl?.substring(0, 50), 'hasMatchedAsset:', !!(matchedProductAsset || matchedLocationAsset));
                        if (mediaType === 'video') {
                          regenerateVideo(scene.id, provider, sourceImageUrl);
                        } else {
                          regenerateImage(scene.id, provider);
                        }
                      }}
                      isGenerating={regenerating === `image-${scene.id}` || regenerating === `video-${scene.id}`}
                    />
                    
                    {/* I2V Settings Panel - shown when a product or location asset is selected for I2V generation */}
                    {(selectedProductAsset[scene.id] || selectedLocationAsset[scene.id]) && (
                      <I2VSettingsPanel
                        settings={i2vSettings[scene.id] || defaultI2VSettings}
                        onChange={(newSettings) => {
                          setI2vSettings(prev => ({ ...prev, [scene.id]: newSettings }));
                        }}
                        disabled={!!regenerating}
                        compact
                      />
                    )}
                    
                    {/* Motion Control Selector - Phase 16 intelligent camera movement */}
                    <MotionControlSelector
                      settings={motionSettings[scene.id] || defaultMotionSettings}
                      onChange={(newSettings) => {
                        setMotionSettings(prev => ({ ...prev, [scene.id]: newSettings }));
                      }}
                      sceneType={scene.type}
                      disabled={!!regenerating}
                      compact
                    />
                    
                    {/* DEPRECATED: Phase 13D Reference Image Section - replaced by Matched Brand Assets for I2V */}
                    {/* Use the "Matched Brand Assets" panel below instead for I2V generation with product photos */}
                    
                    {/* NOTE: RegenerationOptions component removed - duplicate functionality now consolidated in right panel */}
                  </div>
                )}
              </div>
              
              {/* Right Column: Text Content & Settings */}
              <div className="space-y-4">
                {/* Narration Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Narration</Label>
                    {projectId && editingNarration !== scene.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditingNarration(scene.id);
                          setEditedNarration(prev => ({ ...prev, [scene.id]: scene.narration }));
                        }}
                        data-testid={`button-edit-narration-modal-${scene.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  {editingNarration === scene.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editedNarration[scene.id] || ''}
                        onChange={(e) => setEditedNarration(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        className="text-sm min-h-[100px]"
                        placeholder="Enter narration text..."
                        data-testid={`textarea-narration-modal-${scene.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveNarration(scene.id)}
                          disabled={savingNarration === scene.id}
                          data-testid={`button-save-narration-modal-${scene.id}`}
                        >
                          {savingNarration === scene.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingNarration(null)}
                          disabled={savingNarration === scene.id}
                          data-testid={`button-cancel-narration-modal-${scene.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        After saving, regenerate voiceover to update audio.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm bg-muted/50 p-3 rounded">{scene.narration}</p>
                  )}
                </div>
                
                {/* Visual Direction Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Visual Direction</Label>
                    {projectId && editingVisualDirection !== scene.id && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingVisualDirection(scene.id);
                            setEditedVisualDirection(prev => ({ ...prev, [scene.id]: scene.background.source }));
                          }}
                          data-testid={`button-edit-visual-direction-modal-${scene.id}`}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    )}
                  </div>
                  {editingVisualDirection === scene.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editedVisualDirection[scene.id] || ''}
                        onChange={(e) => setEditedVisualDirection(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        className="text-sm min-h-[100px]"
                        placeholder="Describe the visual scene..."
                        data-testid={`textarea-visual-direction-modal-${scene.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveVisualDirection(scene.id)}
                          disabled={savingVisualDirection === scene.id}
                          data-testid={`button-save-visual-direction-modal-${scene.id}`}
                        >
                          {savingVisualDirection === scene.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingVisualDirection(null)}
                          disabled={savingVisualDirection === scene.id}
                          data-testid={`button-cancel-visual-direction-modal-${scene.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        After saving, regenerate image/video to update visuals.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm bg-muted/50 p-3 rounded">{scene.background.source}</p>
                  )}
                  
                </div>
                
                {/* Simplified Workflow Display - just shows workflow type badge */}
                <div className="space-y-3">
                  {sceneWorkflow?.decision && (
                    <WorkflowPathIndicator 
                      decision={sceneWorkflow.decision} 
                      isLoading={analyzingWorkflow[scene.id] || false}
                      projectQualityTier={projectQualityTier}
                      sceneQualityTier={localSceneQualityTier[scene.id] !== undefined ? localSceneQualityTier[scene.id] : scene.qualityTier}
                      compact
                    />
                  )}
                  
                  {/* Phase 14B: Brand Asset Preview Panel */}
                  {sceneWorkflow && (
                    <BrandAssetPreviewPanel
                      products={sceneWorkflow.matchedAssets.products}
                      logos={sceneWorkflow.matchedAssets.logos}
                      locations={sceneWorkflow.matchedAssets.locations}
                      isLoading={analyzingWorkflow[scene.id] || false}
                      appliedAssetId={(() => {
                        const config = previewOverlayConfig[scene.id] || (scene.overlayConfig as OverlayConfig);
                        const logoName = config?.logo?.logoName;
                        if (!logoName) return undefined;
                        return sceneWorkflow.matchedAssets.logos.find((l: any) => l.name === logoName)?.id;
                      })()}
                      onApplyToOverlay={async (asset, overlayType) => {
                        if (!projectId) return;
                        const normalizedUrl = convertToDisplayUrl(asset.url);
                        const currentConfig = previewOverlayConfig[scene.id] || (scene.overlayConfig as OverlayConfig) || getDefaultOverlayConfig(scene.type || 'general');
                        const updatedConfig: OverlayConfig = {
                          ...currentConfig,
                          logo: overlayType === 'logo' ? {
                            ...currentConfig.logo,
                            enabled: true,
                            logoUrl: normalizedUrl,
                            logoName: asset.name,
                          } : currentConfig.logo,
                          watermark: overlayType === 'watermark' ? {
                            ...currentConfig.watermark,
                            enabled: true,
                            watermarkUrl: normalizedUrl,
                            watermarkName: asset.name,
                          } : currentConfig.watermark,
                        };
                        setPreviewOverlayConfig(prev => ({ ...prev, [scene.id]: updatedConfig }));
                        try {
                          await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { overlayConfig: updatedConfig });
                          onSceneUpdate?.();
                          toast({ title: 'Applied', description: `${asset.name} added as ${overlayType} overlay.` });
                        } catch (err) {
                          setPreviewOverlayConfig(prev => ({ ...prev, [scene.id]: currentConfig }));
                          toast({ title: 'Error', description: 'Failed to apply overlay', variant: 'destructive' });
                        }
                      }}
                      onSwapAsset={(category, oldId, newAsset) => {
                        setWorkflowAnalysis(prev => {
                          const current = prev[scene.id];
                          if (!current) return prev;
                          return {
                            ...prev,
                            [scene.id]: {
                              ...current,
                              matchedAssets: {
                                ...current.matchedAssets,
                                [category]: current.matchedAssets[category].map((a: any) =>
                                  a.id === oldId ? { ...newAsset, matchScore: 1 } : a
                                )
                              }
                            }
                          };
                        });
                        toast({ title: 'Asset swapped', description: `Using ${newAsset.name} instead.` });
                      }}
                      onSelectProductAsset={(asset) => {
                        setSelectedProductAsset(prev => ({
                          ...prev,
                          [scene.id]: { id: asset.id, url: asset.url, name: asset.name }
                        }));
                        setSelectedLocationAsset(prev => ({
                          ...prev,
                          [scene.id]: null
                        }));
                        if (projectId) {
                          apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, {
                            brandAssetUrl: asset.url,
                            brandAssetId: asset.id,
                          }).catch((err: any) => console.warn('[ProductAsset] Failed to persist selection:', err.message));
                        }
                        toast({ title: 'Product selected', description: `${asset.name} selected as I2V source.` });
                      }}
                      selectedProductAssetId={selectedProductAsset[scene.id]?.id}
                      onSelectLocationAsset={(asset) => {
                        setSelectedLocationAsset(prev => ({
                          ...prev,
                          [scene.id]: { id: asset.id, url: asset.url, name: asset.name }
                        }));
                        setSelectedProductAsset(prev => ({
                          ...prev,
                          [scene.id]: null
                        }));
                        if (projectId) {
                          apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, {
                            brandAssetUrl: asset.url,
                            brandAssetId: asset.id,
                          }).catch((err: any) => console.warn('[LocationAsset] Failed to persist selection:', err.message));
                        }
                        // Check if visual direction requires people/activity content
                        const visualDir = scene.visualDirection?.toLowerCase() || '';
                        const requiresPeopleContent = visualDir.includes('montage') || 
                                                       visualDir.includes('people') || 
                                                       visualDir.includes('person') ||
                                                       visualDir.includes('adults') ||
                                                       visualDir.includes('yoga') ||
                                                       visualDir.includes('cooking') ||
                                                       visualDir.includes('hiking') ||
                                                       visualDir.includes('activity');
                        
                        if (requiresPeopleContent) {
                          toast({ 
                            title: 'Note: Visual direction mismatch', 
                            description: `Your visual direction calls for people/activities. Using this location photo for I2V will animate the static image, not generate new people. Consider using T2V (text-to-video) instead.`,
                            duration: 8000,
                          });
                        } else {
                          toast({ title: 'Location selected', description: `${asset.name} selected as I2V source.` });
                        }
                      }}
                      selectedLocationAssetId={selectedLocationAsset[scene.id]?.id}
                    />
                  )}
                </div>
                
                {/* Scene Duration Section */}
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Scene Duration
                  </Label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={async () => {
                        const newDuration = Math.max(1, (scene.duration || 5) - 1);
                        try {
                          await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { duration: newDuration });
                          onSceneUpdate?.();
                          toast({ title: 'Duration updated', description: `Scene duration set to ${newDuration}s` });
                        } catch (err) {
                          toast({ title: 'Error', description: 'Failed to update duration', variant: 'destructive' });
                        }
                      }}
                      disabled={(scene.duration || 5) <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={scene.duration || 5}
                      onChange={async (e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 60) {
                          try {
                            await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { duration: val });
                            onSceneUpdate?.();
                          } catch (err) {
                            toast({ title: 'Error', description: 'Failed to update duration', variant: 'destructive' });
                          }
                        }
                      }}
                      className="w-20 text-center h-8"
                    />
                    <span className="text-sm text-muted-foreground">seconds</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={async () => {
                        const newDuration = Math.min(60, (scene.duration || 5) + 1);
                        try {
                          await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { duration: newDuration });
                          onSceneUpdate?.();
                          toast({ title: 'Duration updated', description: `Scene duration set to ${newDuration}s` });
                        } catch (err) {
                          toast({ title: 'Error', description: 'Failed to update duration', variant: 'destructive' });
                        }
                      }}
                      disabled={(scene.duration || 5) >= 60}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Controls how long this scene plays in the final video (1-60 seconds)
                  </p>
                </div>
                
                {/* Per-Scene Quality Tier Section */}
                {(() => {
                  const currentSceneTier = localSceneQualityTier[scene.id] !== undefined 
                    ? localSceneQualityTier[scene.id] 
                    : scene.qualityTier || null;
                  return (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                        Scene Quality Tier
                      </Label>
                      <div className="grid grid-cols-4 gap-2">
                        <button
                          onClick={async () => {
                            setLocalSceneQualityTier(prev => ({ ...prev, [scene.id]: null }));
                            try {
                              await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { qualityTier: null });
                              onSceneUpdate?.();
                              toast({ title: 'Using project default', description: `Scene will use project quality tier (${projectQualityTier || 'premium'})` });
                            } catch (err) {
                              toast({ title: 'Error', description: 'Failed to update quality tier', variant: 'destructive' });
                            }
                          }}
                          className={`p-2 rounded-lg border text-center transition-all text-xs ${
                            currentSceneTier === null
                              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium">Default</div>
                          <div className="text-muted-foreground text-[10px]">{projectQualityTier || 'Premium'}</div>
                        </button>
                        <button
                          onClick={async () => {
                            setLocalSceneQualityTier(prev => ({ ...prev, [scene.id]: 'standard' }));
                            try {
                              await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { qualityTier: 'standard' });
                              onSceneUpdate?.();
                              toast({ title: 'Standard quality', description: 'Scene set to Standard quality (AI images)' });
                            } catch (err) {
                              toast({ title: 'Error', description: 'Failed to update quality tier', variant: 'destructive' });
                            }
                          }}
                          className={`p-2 rounded-lg border text-center transition-all text-xs ${
                            currentSceneTier === 'standard' 
                              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium">Standard</div>
                          <div className="text-muted-foreground text-[10px]">AI Images</div>
                        </button>
                        <button
                          onClick={async () => {
                            setLocalSceneQualityTier(prev => ({ ...prev, [scene.id]: 'premium' }));
                            try {
                              await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { qualityTier: 'premium' });
                              onSceneUpdate?.();
                              toast({ title: 'Premium quality', description: 'Scene set to Premium quality (AI videos)' });
                            } catch (err) {
                              toast({ title: 'Error', description: 'Failed to update quality tier', variant: 'destructive' });
                            }
                          }}
                          className={`p-2 rounded-lg border text-center transition-all text-xs ${
                            currentSceneTier === 'premium' 
                              ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium text-amber-700">Premium</div>
                          <div className="text-muted-foreground text-[10px]">AI Videos</div>
                        </button>
                        <button
                          onClick={async () => {
                            setLocalSceneQualityTier(prev => ({ ...prev, [scene.id]: 'ultra' }));
                            try {
                              await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { qualityTier: 'ultra' });
                              onSceneUpdate?.();
                              toast({ title: 'Ultra quality', description: 'Scene set to Ultra quality (Premium AI videos)' });
                            } catch (err) {
                              toast({ title: 'Error', description: 'Failed to update quality tier', variant: 'destructive' });
                            }
                          }}
                          className={`p-2 rounded-lg border text-center transition-all text-xs ${
                            currentSceneTier === 'ultra' 
                              ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium text-purple-700">Ultra</div>
                          <div className="text-muted-foreground text-[10px]">Best Quality</div>
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Override project quality for this scene. Ultra uses best AI video providers for maximum quality.
                      </p>
                    </div>
                  );
                })()}
                
                {/* Overlays Section - Collapsible */}
                <Collapsible 
                  open={overlaysExpanded[scene.id] ?? false}
                  onOpenChange={(open) => setOverlaysExpanded(prev => ({ ...prev, [scene.id]: open }))}
                  className="space-y-3"
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-sm font-medium cursor-pointer">Overlays</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        {overlaysExpanded[scene.id] ?? false ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="space-y-3">
                    {/* Product Overlay Toggle - Only show when AI background exists */}
                    {hasAIBackground && (
                      <div className="flex items-center justify-between p-2 pl-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Product Overlay</Label>
                          {!defaultOverlay && (
                            <span className="text-xs text-muted-foreground">(Off by default)</span>
                          )}
                        </div>
                        <Switch 
                          checked={showsProductOverlay}
                          onCheckedChange={(checked) => {
                            if (onToggleProductOverlay) {
                              onToggleProductOverlay(scene.id, checked);
                            }
                          }}
                          data-testid={`switch-product-overlay-modal-${scene.id}`}
                        />
                      </div>
                    )}
                    
                    {showsProductOverlay && projectId && scene.assets?.productOverlayUrl && (
                      <div className="p-4 bg-muted/30 rounded-lg border space-y-4">
                        <Label className="text-sm font-medium flex items-center gap-1">
                          <Settings className="w-4 h-4" /> Overlay Settings
                          {savingOverlay === scene.id && <Loader2 className="w-3 h-3 animate-spin ml-2" />}
                        </Label>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Horizontal</Label>
                            <Select 
                              value={getOverlaySettings(scene).x}
                              onValueChange={(val) => {
                                const newX = val as 'left' | 'center' | 'right';
                                updateLocalOverlay(scene.id, { x: newX });
                                updateProductOverlay(scene.id, { 
                                  position: { x: newX, y: getOverlaySettings(scene).y }
                                });
                              }}
                            >
                              <SelectTrigger className="h-9" data-testid={`select-overlay-x-modal-${scene.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Vertical</Label>
                            <Select 
                              value={getOverlaySettings(scene).y}
                              onValueChange={(val) => {
                                const newY = val as 'top' | 'center' | 'bottom';
                                updateLocalOverlay(scene.id, { y: newY });
                                updateProductOverlay(scene.id, { 
                                  position: { x: getOverlaySettings(scene).x, y: newY }
                                });
                              }}
                            >
                              <SelectTrigger className="h-9" data-testid={`select-overlay-y-modal-${scene.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="top">Top</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="bottom">Bottom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Animation</Label>
                            <Select 
                              value={getOverlaySettings(scene).animation}
                              onValueChange={(val) => {
                                const newAnim = val as OverlayAnimation;
                                updateLocalOverlay(scene.id, { animation: newAnim });
                                updateProductOverlay(scene.id, { animation: newAnim });
                              }}
                            >
                              <SelectTrigger className="h-9" data-testid={`select-overlay-animation-modal-${scene.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fade">Fade</SelectItem>
                                <SelectItem value="zoom">Zoom</SelectItem>
                                <SelectItem value="slide">Slide</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Scale</Label>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(getOverlaySettings(scene).scale * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[getOverlaySettings(scene).scale * 100]}
                            onValueChange={(val) => updateLocalOverlay(scene.id, { scale: val[0] / 100 })}
                            onValueCommit={(val) => updateProductOverlay(scene.id, { scale: val[0] / 100 })}
                            min={10}
                            max={80}
                            step={5}
                            className="w-full"
                            data-testid={`slider-overlay-scale-modal-${scene.id}`}
                          />
                        </div>
                      </div>
                    )}
                      {/* Scene Overlays (Text, Logo, Watermark, etc.) */}
                      <div className="space-y-3 pt-2 border-t">
                        <OverlayEditor
                          config={previewOverlayConfig[scene.id] || (scene.overlayConfig as OverlayConfig) || getDefaultOverlayConfig(scene.type || 'general')}
                          onChange={async (config) => {
                            console.log('[OverlayEditor] onChange called - projectId:', projectId, 'sceneId:', scene.id, 'config:', config);
                            if (!projectId) {
                              console.error('[OverlayEditor] Cannot save - projectId is undefined');
                              setPreviewOverlayConfig(prev => ({ ...prev, [scene.id]: config }));
                              toast({
                                title: 'Warning',
                                description: 'Project not saved yet. Overlay settings will be applied when you save the project.',
                                variant: 'default',
                              });
                              return;
                            }
                            try {
                              console.log('[OverlayEditor] Making PATCH request to save overlay config');
                              await apiRequest('PATCH', `/api/universal-video/projects/${projectId}/scenes/${scene.id}`, { overlayConfig: config });
                              setPreviewOverlayConfig(prev => ({ ...prev, [scene.id]: config }));
                              onSceneUpdate?.();
                              console.log('[OverlayEditor] Save successful');
                              toast({
                                title: 'Saved',
                                description: 'Overlay settings saved successfully',
                              });
                            } catch (err) {
                              console.error('[OverlayEditor] Failed to update overlay config:', err);
                              toast({
                                title: 'Error',
                                description: 'Failed to save overlay settings',
                                variant: 'destructive',
                              });
                            }
                          }}
                          onPreview={(config) => {
                            setPreviewOverlayConfig(prev => ({ ...prev, [scene.id]: config }));
                            if (!overlayPreviewMode[scene.id]) {
                              setOverlayPreviewMode(prev => ({ ...prev, [scene.id]: true }));
                            }
                          }}
                          extractedText={scene.extractedOverlayText ?? []}
                          sceneType={scene.type ?? 'general'}
                        />
                      </div>
                  </CollapsibleContent>
                </Collapsible>
                
                {/* Regenerate Section - With provider selection */}
                <div className="space-y-3 mt-4 pt-4 border-t">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Regenerate Scene
                  </Label>
                  
                  {/* T2V / I2V Mode Toggle */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Video Generation Mode</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={videoGenMode[scene.id] !== 'i2v' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setVideoGenMode(prev => ({ ...prev, [scene.id]: 't2v' }));
                          setSelectedProductAsset(prev => ({ ...prev, [scene.id]: null }));
                          setSelectedLocationAsset(prev => ({ ...prev, [scene.id]: null }));
                          setCustomSourceImage(prev => ({ ...prev, [scene.id]: null }));
                        }}
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Text-to-Video
                      </Button>
                      <Button
                        variant={videoGenMode[scene.id] === 'i2v' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => setVideoGenMode(prev => ({ ...prev, [scene.id]: 'i2v' }))}
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Image-to-Video
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {videoGenMode[scene.id] === 'i2v' 
                        ? 'Animate a source image using your visual direction as motion guidance' 
                        : 'Generate video purely from your visual direction text'}
                    </p>
                  </div>
                  
                  {/* I2V Source Image Selection - Only shown in I2V mode */}
                  {videoGenMode[scene.id] === 'i2v' && (
                    <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <Label className="text-xs font-medium text-purple-700">Source Image for Animation</Label>
                      
                      {/* Current source image display */}
                      {(customSourceImage[scene.id] || selectedProductAsset[scene.id] || selectedLocationAsset[scene.id]) ? (
                        <div className="flex items-center gap-2 p-2 bg-white rounded border">
                          <img 
                            src={customSourceImage[scene.id]?.url || selectedProductAsset[scene.id]?.url || selectedLocationAsset[scene.id]?.url} 
                            alt="Source" 
                            className="w-12 h-12 object-cover rounded"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {customSourceImage[scene.id]?.name || selectedProductAsset[scene.id]?.name || selectedLocationAsset[scene.id]?.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {customSourceImage[scene.id] ? 'Custom upload' : 'Brand asset'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setCustomSourceImage(prev => ({ ...prev, [scene.id]: null }));
                              setSelectedProductAsset(prev => ({ ...prev, [scene.id]: null }));
                              setSelectedLocationAsset(prev => ({ ...prev, [scene.id]: null }));
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-purple-600">No source image selected. Upload or select from brand assets below.</p>
                      )}
                      
                      {/* Upload custom image button */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={uploadingSourceImage === scene.id}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (!file) return;
                              
                              setUploadingSourceImage(scene.id);
                              try {
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('category', 'scene-source');
                                
                                const res = await fetch('/api/brand-media-library/upload', {
                                  method: 'POST',
                                  credentials: 'include',
                                  body: formData,
                                });
                                
                                if (res.ok) {
                                  const data = await res.json();
                                  console.log('[I2V Upload] Response data:', data);
                                  const uploadedUrl = data.asset?.url || data.url;
                                  console.log('[I2V Upload] Using URL:', uploadedUrl);
                                  setCustomSourceImage(prev => ({
                                    ...prev,
                                    [scene.id]: { url: uploadedUrl, name: file.name }
                                  }));
                                  setSelectedProductAsset(prev => ({ ...prev, [scene.id]: null }));
                                  setSelectedLocationAsset(prev => ({ ...prev, [scene.id]: null }));
                                  toast({ title: 'Image uploaded!', description: 'Ready for video generation.' });
                                } else {
                                  toast({ title: 'Upload failed', variant: 'destructive' });
                                }
                              } catch (err) {
                                toast({ title: 'Upload error', variant: 'destructive' });
                              } finally {
                                setUploadingSourceImage(null);
                              }
                            };
                            input.click();
                          }}
                        >
                          {uploadingSourceImage === scene.id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Upload Image
                        </Button>
                      </div>
                      
                      <p className="text-xs text-purple-600">
                        Or select from Matched Brand Assets above
                      </p>
                    </div>
                  )}
                  
                  {/* Video Provider Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Video Provider</Label>
                    <Select
                      value={selectedProviders[`video-${scene.id}`] || 'runway'}
                      onValueChange={(val) => setSelectedProviders(prev => ({ ...prev, [`video-${scene.id}`]: val }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_PROVIDERS.filter(p => p.supportsI2V).map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.icon} {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Generate Video Button */}
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={regenerating === `video-${scene.id}` || (videoGenMode[scene.id] === 'i2v' && !customSourceImage[scene.id] && !selectedProductAsset[scene.id] && !selectedLocationAsset[scene.id])}
                    onClick={() => {
                      const provider = selectedProviders[`video-${scene.id}`] || 'runway';
                      
                      if (videoGenMode[scene.id] === 'i2v') {
                        const sourceImageUrl = customSourceImage[scene.id]?.url || 
                                               selectedProductAsset[scene.id]?.url || 
                                               selectedLocationAsset[scene.id]?.url;
                        console.log('[I2V Generate] Mode: i2v, sourceImageUrl:', sourceImageUrl);
                        console.log('[I2V Generate] customSourceImage:', customSourceImage[scene.id]);
                        console.log('[I2V Generate] selectedProductAsset:', selectedProductAsset[scene.id]);
                        regenerateVideo(scene.id, provider, sourceImageUrl);
                      } else {
                        console.log('[T2V Generate] Mode: t2v, no source image');
                        regenerateVideo(scene.id, provider, undefined);
                      }
                    }}
                  >
                    {regenerating === `video-${scene.id}` ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Video...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {videoGenMode[scene.id] === 'i2v' ? 'Generate Video from Image' : 'Generate Video from Text'}
                      </>
                    )}
                  </Button>
                  {videoGenMode[scene.id] === 'i2v' && !customSourceImage[scene.id] && !selectedProductAsset[scene.id] && !selectedLocationAsset[scene.id] && (
                    <p className="text-xs text-amber-600">Please upload or select a source image first</p>
                  )}
                  
                  {/* Image Provider Selection (I2I) */}
                  <div className="space-y-2 mt-3 pt-3 border-t border-dashed">
                    <Label className="text-xs text-muted-foreground">Image Provider (I2I)</Label>
                    <Select
                      value={selectedProviders[`image-${scene.id}`] || 'flux'}
                      onValueChange={(val) => setSelectedProviders(prev => ({ ...prev, [`image-${scene.id}`]: val }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {IMAGE_PROVIDERS.filter(p => p.supportsI2I).map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.icon} {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Regenerate Image Button */}
                  <Button
                    variant="outline"
                    className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                    disabled={regenerating === `image-${scene.id}`}
                    onClick={() => {
                      const provider = selectedProviders[`image-${scene.id}`] || 'flux';
                      regenerateImage(scene.id, provider);
                    }}
                  >
                    {regenerating === `image-${scene.id}` ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Regenerating Image...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Regenerate Image
                      </>
                    )}
                  </Button>
                  
                  {/* Regeneration History Panel */}
                  {projectId && (
                    <RegenerationHistoryPanel
                      projectId={projectId}
                      sceneId={scene.id}
                      sceneIndex={index}
                    />
                  )}
                </div>
              </div>
            </div>
            
            {/* Phase 9A: Quality Review Section */}
            {(scene.analysisResult || scene.qualityScore !== undefined) && (
              <div className="mt-6 pt-4 border-t">
                <Label className="text-sm font-medium mb-3 block">Quality & Review</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Quality Scores */}
                  <div className="space-y-2">
                    {scene.qualityScore !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-28">Overall Score:</span>
                        <Badge className={`${getScoreColor(scene.qualityScore)}`} data-testid={`modal-quality-score-${scene.id}`}>
                          {scene.qualityScore}/100
                        </Badge>
                        {scene.analysisResult?.recommendation && (
                          <Badge variant="outline" className="capitalize" data-testid={`modal-recommendation-${scene.id}`}>
                            {scene.analysisResult.recommendation.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                    )}
                    {scene.analysisResult && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-28">Technical:</span>
                          <Progress value={scene.analysisResult.technicalScore} className="w-20 h-2" />
                          <span className="text-xs">{scene.analysisResult.technicalScore}/100</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-28">Content Match:</span>
                          <Progress value={scene.analysisResult.contentMatchScore} className="w-20 h-2" />
                          <span className="text-xs">{scene.analysisResult.contentMatchScore}/100</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-28">Composition:</span>
                          <Progress value={scene.analysisResult.compositionScore} className="w-20 h-2" />
                          <span className="text-xs">{scene.analysisResult.compositionScore}/100</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Issues List */}
                  {scene.analysisResult?.issues && scene.analysisResult.issues.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Issues Found:</span>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {scene.analysisResult.issues.map((issue, idx) => (
                          <div key={idx} className={`text-xs p-2 rounded ${
                            issue.severity === 'critical' ? 'bg-red-50 text-red-700' :
                            issue.severity === 'major' ? 'bg-orange-50 text-orange-700' :
                            'bg-yellow-50 text-yellow-700'
                          }`}>
                            <span className="font-medium capitalize">[{issue.severity}]</span> {issue.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Action Buttons */}
                {scene.analysisResult?.recommendation === 'needs_review' && projectId && (
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                      onClick={() => handleSceneApprove(index)}
                      disabled={!!sceneActionPending}
                      data-testid={`button-approve-scene-${scene.id}`}
                    >
                      {sceneActionPending === scene.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <ThumbsUp className="w-4 h-4 mr-1" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                      onClick={() => handleRejectWithDialog(index, scene.id)}
                      disabled={!!sceneActionPending}
                      data-testid={`button-reject-scene-${scene.id}`}
                    >
                      <ThumbsDown className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSceneRegenerate(index)}
                      disabled={!!sceneActionPending}
                      data-testid={`button-reanalyze-scene-${scene.id}`}
                    >
                      {sceneActionPending === scene.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-1" />
                      )}
                      Re-analyze
                    </Button>
                  </div>
                )}
                {(scene.analysisResult?.recommendation === 'regenerate' || scene.analysisResult?.recommendation === 'critical_fail') && projectId && (
                  <div className="space-y-3 mt-4">
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        Quality analysis found issues. You can regenerate the scene, re-analyze, or approve anyway to proceed with rendering.
                      </AlertDescription>
                    </Alert>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                        onClick={() => handleSceneApprove(index)}
                        disabled={!!sceneActionPending}
                        data-testid={`button-force-approve-${scene.id}`}
                      >
                        {sceneActionPending === scene.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <ThumbsUp className="w-4 h-4 mr-1" />
                        )}
                        Approve Anyway
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSceneRegenerate(index)}
                        disabled={!!sceneActionPending}
                        data-testid={`button-regenerate-critical-${scene.id}`}
                      >
                        {sceneActionPending === scene.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4 mr-1" />
                        )}
                        Re-analyze
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}
    
    {/* Media Picker Dialog */}
    <MediaPickerDialog
      open={!!mediaPickerOpen}
      onClose={() => setMediaPickerOpen(null)}
      sceneId={mediaPickerOpen || ''}
      mediaType={mediaPickerType}
      source={mediaPickerSource}
      onSourceChange={setMediaPickerSource}
      onMediaSelect={(url, type, source) => {
        if (mediaPickerOpen) {
          applyMediaToScene(mediaPickerOpen, url, type, source);
        }
      }}
      isApplying={!!applyingMedia}
    />
    
    {/* Phase 11D: Brand Media Selector with Animation Controls */}
    {brandMediaSelectorOpen && (
      <BrandMediaSelector
        isOpen={!!brandMediaSelectorOpen}
        onClose={() => setBrandMediaSelectorOpen(null)}
        onSelect={(asset, animationSettings) => {
          if (brandMediaSelectorOpen) {
            applyBrandMedia(brandMediaSelectorOpen, asset, animationSettings);
          }
        }}
      />
    )}
    
    {/* Phase 9A: Reject Reason Dialog */}
    <Dialog open={!!rejectDialogOpen} onOpenChange={(open) => !open && setRejectDialogOpen(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ThumbsDown className="w-5 h-5 text-red-500" />
            Reject Scene
          </DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting this scene. This helps improve future generations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection Reason</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g., Incorrect product placement, poor lighting, doesn't match brand style..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              data-testid="input-reject-reason"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(null)}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitRejection}
              disabled={!!sceneActionPending}
              data-testid="button-submit-reject"
            >
              {sceneActionPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <ThumbsDown className="w-4 h-4 mr-1" />
              )}
              Reject Scene
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// Media Picker Dialog Component
function MediaPickerDialog({
  open,
  onClose,
  sceneId,
  mediaType,
  source,
  onSourceChange,
  onMediaSelect,
  isApplying
}: {
  open: boolean;
  onClose: () => void;
  sceneId: string;
  mediaType: 'image' | 'video';
  source: 'brand' | 'library';
  onSourceChange: (source: 'brand' | 'library') => void;
  onMediaSelect: (url: string, type: 'image' | 'video', source: string) => void;
  isApplying: boolean;
}) {
  
  // Fetch brand media library
  const { data: brandMediaData } = useQuery<{ success: boolean; assets: any[] }>({
    queryKey: ['/api/brand-media-library'],
    enabled: open && source === 'brand',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  
  // Fetch asset library (Phase 11E - AI-generated assets)
  const { data: assetLibraryData } = useQuery<any[]>({
    queryKey: ['/api/asset-library', { type: mediaType }],
    enabled: open && source === 'library',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  
  const brandAssets = brandMediaData?.assets || [];
  const libraryAssets = assetLibraryData || [];
  
  // Filter brand assets by media type
  const filteredBrandAssets = brandAssets.filter(a => {
    if (mediaType === 'video') return a.mediaType === 'video';
    return a.mediaType === 'photo' || a.mediaType === 'image';
  });
  
  // Filter library assets by type  
  const filteredLibraryAssets = libraryAssets.filter(a => {
    if (mediaType === 'video') return a.assetType === 'video';
    return a.assetType === 'image';
  });
  
  const getSourceLabel = () => {
    switch (source) {
      case 'brand': return 'Brand Media Library';
      case 'library': return 'Asset Library';
      default: return 'Select Source';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mediaType === 'video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            Select {mediaType === 'video' ? 'Video' : 'Image'} from {getSourceLabel()}
          </DialogTitle>
          <DialogDescription>
            Choose media to use for this scene. Click on an item to apply it.
          </DialogDescription>
        </DialogHeader>
        
        {/* Source Tabs */}
        <div className="flex gap-1 flex-wrap border-b pb-2">
          {(['brand', 'library'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={source === s ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => onSourceChange(s)}
            >
              {s === 'brand' ? 'Brand Media' : 'Asset Library'}
            </Button>
          ))}
        </div>
        
        {/* Results Grid */}
        <ScrollArea className="flex-1 min-h-[300px]">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 p-1">
            {/* Brand Media Results */}
            {source === 'brand' && filteredBrandAssets.map((item) => (
              <div
                key={item.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden border hover:border-primary transition-colors"
                onClick={() => onMediaSelect(item.url, mediaType, 'Brand Media')}
              >
                <div className="aspect-video bg-gray-200">
                  <img 
                    src={item.thumbnailUrl || item.url} 
                    alt={item.name} 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div className="p-1.5">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.entityType}</p>
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" disabled={isApplying}>
                    {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use This'}
                  </Button>
                </div>
              </div>
            ))}
            
            {/* Asset Library Results (Phase 11E) */}
            {source === 'library' && filteredLibraryAssets.map((item) => (
              <div
                key={item.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden border hover:border-primary transition-colors"
                onClick={() => onMediaSelect(item.assetUrl, mediaType, 'Asset Library')}
                data-testid={`asset-library-item-${item.id}`}
              >
                <div className="aspect-video bg-gray-200">
                  {item.assetType === 'video' ? (
                    <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
                      <Video className="w-8 h-8 text-white/70" />
                      {item.thumbnailUrl && (
                        <img 
                          src={item.thumbnailUrl} 
                          alt="" 
                          className="absolute inset-0 w-full h-full object-cover opacity-70" 
                        />
                      )}
                    </div>
                  ) : (
                    <img 
                      src={item.thumbnailUrl || item.assetUrl} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="text-xs font-medium truncate">{item.visualDirection || item.prompt || 'AI Generated'}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] text-muted-foreground">{item.provider || 'Unknown'}</p>
                    {item.qualityScore && (
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${item.qualityScore >= 85 ? 'border-green-500 text-green-600' : item.qualityScore >= 70 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600'}`}>
                        Q:{item.qualityScore}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" disabled={isApplying}>
                    {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use This'}
                  </Button>
                </div>
                {item.isFavorite && (
                  <div className="absolute top-1 right-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                  </div>
                )}
              </div>
            ))}
            
            {/* Empty states */}
            {source === 'brand' && filteredBrandAssets.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No {mediaType}s in Brand Media Library</p>
              </div>
            )}
            {source === 'library' && filteredLibraryAssets.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No {mediaType}s in Asset Library</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectWithMeta extends VideoProject {
  renderId?: string;
  bucketName?: string;
  outputUrl?: string;
}

function ProjectsList({ onSelectProject, onCreateNew }: { 
  onSelectProject: (project: ProjectWithMeta) => void; 
  onCreateNew: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const { data: projectsData, isLoading } = useQuery<{ success: boolean; projects: ProjectWithMeta[] }>({
    queryKey: ['/api/universal-video/projects'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest('DELETE', `/api/universal-video/projects/${projectId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
      toast({
        title: "Project Deleted",
        description: "The video project has been removed.",
      });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete the project.",
        variant: "destructive",
      });
    },
  });

  const projects: ProjectWithMeta[] = projectsData?.projects || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Complete</Badge>;
      case 'rendering':
      case 'lambda_pending':
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Rendering</Badge>;
      case 'ready':
        return <Badge className="bg-yellow-500"><Play className="w-3 h-3 mr-1" /> Ready to Render</Badge>;
      case 'generating':
        return <Badge className="bg-purple-500"><Sparkles className="w-3 h-3 mr-1" /> Generating</Badge>;
      case 'queued':
        return <Badge className="bg-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Queued</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Error</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" /> {status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Video Projects</h3>
        <Button onClick={onCreateNew} data-testid="button-create-new-project">
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="p-8 text-center">
          <Video className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">You don't have any video projects yet.</p>
          <Button onClick={onCreateNew}>Create Your First Video</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card 
              key={project.id} 
              className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => onSelectProject(project)}
              data-testid={`card-project-${project.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{project.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(project.status)}
                    {deleteConfirmId === project.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(project.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-confirm-delete-${project.id}`}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Delete"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          data-testid={`button-cancel-delete-${project.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(project.id);
                        }}
                        data-testid={`button-delete-${project.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clapperboard className="w-4 h-4" />
                    {project.scenes.length} scenes
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {Math.round(project.totalDuration)}s
                  </span>
                  <span className="flex items-center gap-1">
                    <Video className="w-4 h-4" />
                    {project.outputFormat.aspectRatio}
                  </span>
                </div>
                
                {project.status === 'complete' && project.outputUrl && (
                  <div className="mt-3 flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(project.outputUrl, '_blank');
                      }}
                      data-testid={`button-download-${project.id}`}
                    >
                      <Download className="w-4 h-4 mr-1" /> Download
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(project);
                      }}
                      data-testid={`button-view-${project.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                  </div>
                )}

                {(project.status === 'rendering' || project.status === 'lambda_pending') && project.renderId && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Rendering in progress...</span>
                    </div>
                    <Progress value={project.progress.steps.rendering?.progress || 0} className="mt-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type ViewMode = 'list' | 'create' | 'edit';

export default function UniversalVideoProducer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [project, setProject] = useState<VideoProject | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<{
    progressPercent: number;
    elapsedSeconds: number;
    estimatedRemainingSeconds: number;
    renderPhase: 'initializing' | 'rendering' | 'encoding' | 'complete';
  } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSceneIndex, setPreviewSceneIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [showGenerationPreview, setShowGenerationPreview] = useState(false);
  const [showProviderRegistry, setShowProviderRegistry] = useState(false);
  const [showQADashboard, setShowQADashboard] = useState(false);
  const [qaReport, setQAReport] = useState<{
    projectId: string;
    overallScore: number;
    sceneStatuses: Array<{
      sceneIndex: number;
      score: number;
      status: 'approved' | 'needs_review' | 'rejected' | 'pending';
      issues: Array<{ severity: string; description: string }>;
      userApproved: boolean;
      autoApproved?: boolean;
      regenerationCount?: number;
    }>;
    approvedCount: number;
    needsReviewCount: number;
    rejectedCount: number;
    pendingCount: number;
    criticalIssueCount: number;
    majorIssueCount: number;
    minorIssueCount: number;
    passesThreshold: boolean;
    canRender: boolean;
    blockingReasons: string[];
    lastAnalyzedAt: string;
  } | null>(null);
  const [isAnalyzingQA, setIsAnalyzingQA] = useState(false);
  const [isFixingIssues, setIsFixingIssues] = useState(false);
  const [fixingProgress, setFixingProgress] = useState<{ current: number; total: number } | undefined>(undefined);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await apiRequest("POST", "/api/universal-video/projects/product", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        setViewMode('edit');
        toast({
          title: "Project Created",
          description: `Generated ${data.project.scenes.length} scenes for your video.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createScriptMutation = useMutation({
    mutationFn: async (data: ScriptFormData) => {
      const response = await apiRequest("POST", "/api/universal-video/projects/script", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        setViewMode('edit');
        toast({
          title: "Script Parsed",
          description: `Identified ${data.project.scenes.length} scenes from your script.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Parsing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateAssetsMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/generate-assets`, {
        skipMusic: !musicEnabled
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        if (data.paidServiceFailures) {
          toast({
            title: "Assets Generated with Issues",
            description: "Some paid services failed. Check the notifications.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Assets Generated",
            description: "All assets have been generated successfully.",
          });
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Asset Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateStepMutation = useMutation({
    mutationFn: async (step: string) => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/generate-step`, {
        step,
        skipMusic: !musicEnabled
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        toast({
          title: `${data.completedStep.charAt(0).toUpperCase() + data.completedStep.slice(1)} Complete`,
          description: `Review the results, then continue to the next step.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Step Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const skipToStepMutation = useMutation({
    mutationFn: async (targetStep: string) => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/skip-to-step`, {
        targetStep,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        toast({
          title: "Skipped ahead",
          description: data.message,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Skip failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const renderMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/render`);
      const data = await response.json();
      
      // Phase 10D: Handle QA gate blocked response
      if (!response.ok && data.qaGateBlocked) {
        throw new Error(`QA_GATE_BLOCKED:${JSON.stringify(data)}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Render failed');
      }
      
      return data;
    },
    onSuccess: async (data) => {
      if (data.success) {
        if (data.renderMethod === 'chunked') {
          toast({
            title: "Chunked Render Queued",
            description: data.message || "Your long video is queued for chunked rendering.",
          });
          queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project?.id] });
          try {
            const refreshRes = await fetch(`/api/universal-video/projects/${project?.id}`);
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              if (refreshData.project) setProject(refreshData.project);
            }
          } catch {}
        } else {
          setRenderId(data.renderId);
          setBucketName(data.bucketName);
          toast({
            title: "Render Started",
            description: "Your video is being rendered on AWS Lambda.",
          });
          pollRenderStatus(data.renderId, data.bucketName);
        }
      }
    },
    onError: (error: Error) => {
      // Phase 10D: Handle QA gate blocked errors specially
      if (error.message.startsWith('QA_GATE_BLOCKED:')) {
        try {
          const data = JSON.parse(error.message.replace('QA_GATE_BLOCKED:', ''));
          toast({
            title: "Rendering Blocked",
            description: data.blockingReasons?.join(', ') || data.error || 'Quality gate not passed',
            variant: "destructive",
          });
          setShowQADashboard(true);
          return;
        } catch {
          // Fall through to generic error handling
        }
      }
      
      toast({
        title: "Render Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Phase 4: Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/preview`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPreviewSceneIndex(0);
        setShowPreviewModal(true);
        setIsPreviewPlaying(true);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!project) return;
    const isChunkedInProgress = 
      (project.status === 'render_queued' || project.status === 'rendering' || project.status === 'lambda_pending') &&
      ((project.progress as any)?.renderMethod === 'chunked' || project.status === 'lambda_pending');
    
    if (!isChunkedInProgress) return;

    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      try {
        const response = await apiRequest('GET', `/api/universal-video/projects/${project.id}`);
        const data = await response.json();
        if (active && data.project) {
          setProject(data.project);
          const rs = (data.project.progress as any)?.renderStatus;
          if (rs?.percent !== undefined) {
            setRenderProgress({
              progressPercent: rs.percent || 0,
              elapsedSeconds: 0,
              estimatedRemainingSeconds: 0,
              renderPhase: rs.phase || 'rendering',
            });
          }
          if (data.project.status === 'completed' && data.project.outputUrl) {
            setOutputUrl(data.project.outputUrl);
            setRenderProgress(null);
          }
          if (data.project.status === 'error') {
            setRenderProgress(null);
          }
        }
      } catch (err) {
        console.error('[ChunkedPoll] Error fetching project:', err);
      }
    }, 5000);

    return () => { active = false; clearInterval(interval); };
  }, [project?.id, project?.status, (project?.progress as any)?.renderMethod]);

  // Preview playback effect - auto-advance scenes
  useEffect(() => {
    if (!isPreviewPlaying || !project || !showPreviewModal) {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      return;
    }

    const currentScene = project.scenes[previewSceneIndex];
    if (!currentScene) return;

    const duration = (currentScene.duration || 5) * 1000;
    previewTimerRef.current = setTimeout(() => {
      if (previewSceneIndex < project.scenes.length - 1) {
        setPreviewSceneIndex(prev => prev + 1);
      } else {
        setIsPreviewPlaying(false);
        setPreviewSceneIndex(0);
      }
    }, duration);

    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, [isPreviewPlaying, previewSceneIndex, project, showPreviewModal]);

  const pollRenderStatus = async (id: string, bucket: string) => {
    if (!project) return;
    
    let pollInterval = 5000; // Start with 5 second intervals
    
    const poll = async () => {
      try {
        const response = await apiRequest(
          "GET",
          `/api/universal-video/projects/${project.id}/render-status?renderId=${id}&bucketName=${bucket}`
        );
        const data = await response.json();
        
        // Update project state from response
        if (data.project) {
          setProject(data.project);
        }
        
        // Update render progress details
        if (data.progressPercent !== undefined) {
          setRenderProgress({
            progressPercent: data.progressPercent,
            elapsedSeconds: data.elapsedSeconds || 0,
            estimatedRemainingSeconds: data.estimatedRemainingSeconds || 0,
            renderPhase: data.renderPhase || 'rendering',
          });
        }
        
        // Handle rate limiting - slow down polling
        if (data.rateLimited) {
          pollInterval = Math.min(pollInterval * 1.5, 15000); // Increase delay, max 15s
          console.log(`Rate limited, slowing poll to ${pollInterval}ms`);
          setTimeout(poll, pollInterval);
          return;
        }
        
        // Reset poll interval on successful response
        pollInterval = 5000;
        
        // Handle timeout or errors
        if (data.timeout || (data.errors && data.errors.length > 0)) {
          setRenderProgress(null);
          toast({
            title: "Render Failed",
            description: data.errors?.[0] || "Render timed out. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Handle success with output
        if (data.success && data.done && data.outputUrl) {
          setOutputUrl(data.outputUrl);
          setRenderProgress(null);
          toast({
            title: "Video Complete!",
            description: "Your video has been rendered successfully.",
          });
          return;
        }
        
        // Continue polling if not done and no errors
        if (data.success && !data.done) {
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        console.error("Poll error:", error);
        // On error, slow down but keep trying
        pollInterval = Math.min(pollInterval * 2, 20000);
        setTimeout(poll, pollInterval);
      }
    };
    
    poll();
  };

  const redeployLambdaSiteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/remotion/redeploy-site");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Lambda Site Redeployed",
          description: "Video rendering compositions have been updated.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Redeployment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetStatusMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("No project");
      const response = await apiRequest("POST", `/api/universal-video/projects/${project.id}/reset-status`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setProject(data.project);
        setRenderId(null);
        setBucketName(null);
        setOutputUrl(null);
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
        toast({
          title: "Project Reset",
          description: "You can now retry rendering.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleProductOverlayMutation = useMutation({
    mutationFn: async ({ sceneId, useOverlay }: { sceneId: string; useOverlay: boolean }) => {
      if (!project) throw new Error("No project selected");
      const response = await apiRequest("PATCH", `/api/universal-video/${project.id}/scenes/${sceneId}/product-overlay`, {
        enabled: useOverlay
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.project) {
        setProject(data.project);
        toast({
          title: "Scene Updated",
          description: data.message || "Product overlay setting updated.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleProductOverlay = (sceneId: string, useOverlay: boolean) => {
    toggleProductOverlayMutation.mutate({ sceneId, useOverlay });
  };

  const resetProject = () => {
    setProject(null);
    setRenderId(null);
    setBucketName(null);
    setOutputUrl(null);
    setViewMode('list');
    queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
  };

  useEffect(() => {
    if (!project || (project.status !== 'generating' && project.status !== 'queued') || viewMode !== 'edit') return;
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/universal-video/projects/${project.id}`, { credentials: 'include' });
        const data = await response.json();
        if (data.project) {
          setProject(data.project);
          if (data.project.status !== 'generating' && data.project.status !== 'queued') {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('[AutoRefresh] Failed to refresh project:', err);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [project?.id, project?.status, viewMode]);

  const handleSelectProject = async (selectedProject: ProjectWithMeta) => {
    // Always fetch fresh project data to ensure we have the latest video URLs
    // This prevents stale cache issues when videos are regenerated
    try {
      console.log('[handleSelectProject] Fetching fresh project data for:', selectedProject.id);
      const response = await fetch(`/api/universal-video/projects/${selectedProject.id}`, { credentials: 'include' });
      const data = await response.json();
      
      if (data.project) {
        console.log('[handleSelectProject] Fresh data received, scenes count:', data.project.scenes?.length);
        // Log video URLs for debugging
        data.project.scenes?.forEach((scene: any, idx: number) => {
          const videoUrl = scene.background?.videoUrl || scene.assets?.videoUrl;
          if (videoUrl) {
            console.log(`[handleSelectProject] Scene ${idx} (${scene.id}) video:`, videoUrl.substring(0, 80));
          }
        });
        setProject(data.project);
        setRenderId(data.project.renderId || null);
        setBucketName(data.project.bucketName || null);
        setOutputUrl(data.project.outputUrl || null);
      } else {
        // Fallback to the passed project if fetch fails
        console.warn('[handleSelectProject] No project in response, using cached data');
        setProject(selectedProject);
        setRenderId(selectedProject.renderId || null);
        setBucketName(selectedProject.bucketName || null);
        setOutputUrl(selectedProject.outputUrl || null);
      }
    } catch (err) {
      console.error('[handleSelectProject] Failed to fetch fresh data:', err);
      // Fallback to the passed project
      setProject(selectedProject);
      setRenderId(selectedProject.renderId || null);
      setBucketName(selectedProject.bucketName || null);
      setOutputUrl(selectedProject.outputUrl || null);
    }
    
    setViewMode('edit');
    
    if ((selectedProject.status === 'rendering' || selectedProject.status === 'lambda_pending') && selectedProject.renderId && selectedProject.bucketName) {
      pollRenderStatus(selectedProject.renderId, selectedProject.bucketName);
    }
  };

  const handleCreateNew = () => {
    setProject(null);
    setRenderId(null);
    setBucketName(null);
    setOutputUrl(null);
    setViewMode('create');
  };

  const handleBackToList = () => {
    setViewMode('list');
    queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects'] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                Universal Video Producer
              </CardTitle>
              <CardDescription>
                Create professional marketing videos using AI-powered generation
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => redeployLambdaSiteMutation.mutate()}
                disabled={redeployLambdaSiteMutation.isPending}
                title="Update Lambda rendering compositions"
                data-testid="button-redeploy-lambda"
              >
                {redeployLambdaSiteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
              {viewMode !== 'list' && (
                <Button variant="outline" onClick={handleBackToList} data-testid="button-back-to-projects">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  My Projects
                </Button>
              )}
              {project && (
                <Button variant="outline" onClick={handleCreateNew} data-testid="button-new-project">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'list' ? (
            <ProjectsList onSelectProject={handleSelectProject} onCreateNew={handleCreateNew} />
          ) : !project ? (
            <VideoCreatorForm 
              onSubmitProduct={(data) => createProductMutation.mutate(data)}
              onSubmitScript={(data) => createScriptMutation.mutate(data)}
              isLoading={createProductMutation.isPending || createScriptMutation.isPending}
            />
          ) : (
            <div className="space-y-6">
              <ServiceFailureAlert failures={project.progress.serviceFailures} />
              
              {/* Generation Preview Panel - Phase 5D + Phase 9E enhancements */}
              {showGenerationPreview && project.status === 'draft' && (
                <div className="space-y-4">
                  <GenerationPreviewPanel
                    projectId={project.id}
                    onGenerate={() => {
                      setShowGenerationPreview(false);
                      generateStepMutation.mutate('assembly');
                    }}
                    onCancel={() => setShowGenerationPreview(false)}
                    isGenerating={generateStepMutation.isPending}
                    qaStats={qaReport ? {
                      approved: qaReport.approvedCount,
                      needsReview: qaReport.needsReviewCount,
                      rejected: qaReport.rejectedCount,
                      score: qaReport.overallScore,
                    } : null}
                    onOpenQADashboard={() => setShowQADashboard(true)}
                    scenes={project.scenes.map((s, idx) => ({
                      id: s.id,
                      order: idx + 1,
                      type: s.type,
                      visualDirection: s.visualDirection,
                      contentType: (s as any).contentType,
                      contentTypeSource: (s as any).contentTypeSource,
                    }))}
                  />
                  
                  {/* Phase 13: Provider Registry Toggle */}
                  <div className="flex flex-col items-center gap-2 p-3 bg-muted/30 rounded-lg border border-dashed">
                    <p className="text-xs text-muted-foreground text-center">
                      Above shows providers selected for this project. View all available AI providers:
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowProviderRegistry(!showProviderRegistry)}
                      className="bg-background hover:bg-accent"
                      data-testid="button-toggle-provider-registry"
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      {showProviderRegistry ? 'Hide' : 'View All'} Provider Registry (17 Video + 4 Image)
                    </Button>
                  </div>
                  
                  {/* Phase 13: Provider Registry Panel */}
                  {showProviderRegistry && (
                    <ProviderRegistryPanel />
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{project.title}</h3>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <span>{project.scenes.length} scenes | {project.totalDuration}s</span>
                    <Badge variant="outline" className="ml-2 capitalize">{project.status}</Badge>
                  </div>
                </div>
                
                <div className="flex gap-2 items-center">
                  {(project.status === 'generating' || project.status === 'queued') && (
                    (() => {
                      if (project.status === 'queued') {
                        return (
                          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Queued for processing
                          </Badge>
                        );
                      }
                      const stalledMs = project.updatedAt ? Date.now() - new Date(project.updatedAt).getTime() : 0;
                      const isStalled = stalledMs > 180000;
                      if (!isStalled) return (
                        <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Generating assets...
                        </Badge>
                      );
                      return (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-orange-300 text-orange-700 hover:bg-orange-50"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const btn = e.currentTarget;
                              btn.disabled = true;
                              try {
                                const res = await fetch(`/api/universal-video/projects/${project.id}/reset-status`, {
                                  method: 'POST',
                                  credentials: 'include',
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setProject(data.project);
                                  toast({ title: 'Project ready', description: 'You can now preview and render your video.' });
                                } else {
                                  toast({ title: 'Reset failed', description: data.error, variant: 'destructive' });
                                }
                              } catch {
                                toast({ title: 'Reset failed', description: 'Could not reach server', variant: 'destructive' });
                              }
                              setTimeout(() => { btn.disabled = false; }, 5000);
                            }}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Ready
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const btn = e.currentTarget;
                              btn.disabled = true;
                              try {
                                const res = await fetch(`/api/universal-video/projects/${project.id}/generate-assets`, {
                                  method: 'POST',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({}),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  toast({ title: 'Generation restarted', description: 'Asset generation has been re-queued.' });
                                } else {
                                  toast({ title: 'Retry failed', description: data.error, variant: 'destructive' });
                                }
                              } catch {
                                toast({ title: 'Retry failed', description: 'Could not reach server', variant: 'destructive' });
                              }
                              setTimeout(() => { btn.disabled = false; }, 10000);
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Retry
                          </Button>
                        </div>
                      );
                    })()
                  )}
                  {project.status === 'draft' && !showGenerationPreview && (() => {
                    const steps = ['voiceover', 'images', 'videos', 'music', 'assembly'] as const;
                    const stepLabels: Record<string, string> = {
                      voiceover: 'Voiceover', images: 'Images', videos: 'Videos', music: 'Music', assembly: 'Final Assembly'
                    };
                    const nextStep = steps.find(s => {
                      const stepData = project.progress.steps[s as keyof typeof project.progress.steps];
                      return !stepData || stepData.status === 'pending' || stepData.status === 'error';
                    });
                    const allStepsComplete = !nextStep;

                    const stepIcons: Record<string, any> = {
                      voiceover: Volume2, images: ImageIcon, videos: Clapperboard, music: Music, assembly: Sparkles
                    };
                    const hasAnyStepStarted = steps.some(s => {
                      const d = project.progress.steps[s as keyof typeof project.progress.steps];
                      return d && (d.status === 'complete' || d.status === 'skipped');
                    });

                    return (
                      <>
                        {hasAnyStepStarted && (
                          <div className="flex items-center gap-1">
                            {steps.map((s, i) => {
                              const d = project.progress.steps[s as keyof typeof project.progress.steps];
                              const isDone = d && (d.status === 'complete' || d.status === 'skipped');
                              const isNext = s === nextStep;
                              const Icon = stepIcons[s];
                              return (
                                <div key={s} className="flex items-center">
                                  {i > 0 && <div className={`w-4 h-px mx-0.5 ${isDone ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                                          isDone ? 'bg-green-500/20 text-green-600' : isNext ? 'bg-blue-500/20 text-blue-600 ring-1 ring-blue-400' : 'bg-muted text-muted-foreground'
                                        }`}>
                                          {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="text-xs">
                                        {stepLabels[s]}: {isDone ? 'Complete' : isNext ? 'Next' : 'Pending'}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-2 px-3 py-1 border rounded-md bg-muted/30">
                          <Music className="w-4 h-4 text-muted-foreground" />
                          <Label htmlFor="music-toggle" className="text-sm cursor-pointer">Music</Label>
                          <Switch
                            id="music-toggle"
                            checked={musicEnabled}
                            onCheckedChange={setMusicEnabled}
                            data-testid="switch-music-enabled"
                          />
                        </div>
                        {allStepsComplete ? (
                          <Button
                            onClick={() => setShowGenerationPreview(true)}
                            disabled={generateAssetsMutation.isPending}
                            data-testid="button-generate-assets"
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Finalize & Render
                          </Button>
                        ) : nextStep && (
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => generateStepMutation.mutate(nextStep)}
                              disabled={generateStepMutation.isPending || skipToStepMutation.isPending}
                              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                              data-testid={`button-generate-step-${nextStep}`}
                            >
                              {generateStepMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                              )}
                              {generateStepMutation.isPending
                                ? `Generating ${stepLabels[nextStep]}...`
                                : `Generate ${stepLabels[nextStep]}`}
                            </Button>
                            {(() => {
                              const skipTargets: { key: string; label: string }[] = [];
                              const currentIdx = steps.indexOf(nextStep);
                              if (currentIdx < steps.indexOf('music')) skipTargets.push({ key: 'music', label: 'Music' });
                              if (currentIdx < steps.indexOf('assembly')) skipTargets.push({ key: 'assembly', label: 'Assembly' });
                              skipTargets.push({ key: 'render', label: 'Render' });
                              if (skipTargets.length === 0) return null;
                              return (
                                <Select
                                  value=""
                                  onValueChange={(val) => {
                                    if (val) skipToStepMutation.mutate(val);
                                  }}
                                >
                                  <SelectTrigger className="w-auto h-9 px-2 border-dashed" data-testid="skip-to-step-trigger">
                                    <SkipForward className="w-4 h-4" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {skipTargets.map(t => (
                                      <SelectItem key={t.key} value={t.key}>
                                        Skip to {t.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  
                  {(project.status === 'ready' || project.status === 'error' || project.status === 'complete') && (
                    <Button
                      variant="outline"
                      onClick={() => previewMutation.mutate()}
                      disabled={previewMutation.isPending}
                      data-testid="button-preview-video"
                    >
                      {previewMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      Quick Preview
                    </Button>
                  )}
                  
                  {(project.status === 'ready' || project.status === 'error') && (
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => {
                          // Phase 10D: Check QA gate before rendering
                          if (qaReport && !qaReport.canRender) {
                            toast({
                              variant: 'destructive',
                              title: 'Cannot render',
                              description: qaReport.blockingReasons?.join(', ') || 'Quality gate not passed. Review and approve scenes first.',
                            });
                            setShowQADashboard(true);
                            return;
                          }
                          renderMutation.mutate();
                        }}
                        disabled={renderMutation.isPending || !!(qaReport && qaReport.canRender === false)}
                        className={qaReport && !qaReport.canRender ? 'bg-gray-400 cursor-not-allowed' : ''}
                        data-testid="button-render-video"
                      >
                        {renderMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : qaReport && !qaReport.canRender ? (
                          <AlertTriangle className="w-4 h-4 mr-2" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        {qaReport && !qaReport.canRender 
                          ? 'Cannot Render - QA Issues' 
                          : project.status === 'error' 
                            ? 'Retry Render' 
                            : 'Render Video'}
                      </Button>
                      
                      {qaReport && !qaReport.canRender && qaReport.blockingReasons && qaReport.blockingReasons.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2">
                          <div className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">
                            Rendering blocked:
                          </div>
                          <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5">
                            {qaReport.blockingReasons.map((reason, i) => (
                              <li key={i}>• {reason}</li>
                            ))}
                          </ul>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 text-xs"
                            onClick={() => setShowQADashboard(true)}
                          >
                            Review Issues in QA Dashboard
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {(project.status === 'rendering' || project.status === 'lambda_pending' || project.status === 'render_queued') && (
                    <Button
                      variant="outline"
                      onClick={() => resetStatusMutation.mutate()}
                      disabled={resetStatusMutation.isPending}
                      data-testid="button-reset-render"
                    >
                      {resetStatusMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Reset & Retry
                    </Button>
                  )}
                  
                  {project.status === 'complete' && outputUrl && (
                    <>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          if (confirm('This will re-render the video with the latest overlay and scene settings. Continue?')) {
                            renderMutation.mutate();
                          }
                        }}
                        disabled={renderMutation.isPending}
                        data-testid="button-rerender-video"
                      >
                        {renderMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Re-render
                      </Button>
                      <Button asChild data-testid="button-download-video">
                        <a href={outputUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4 mr-2" />
                          Download Video
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              <ProgressTracker 
                project={project}
                qaScore={qaReport?.overallScore}
                qaStatus={isAnalyzingQA ? 'analyzing' : qaReport ? 'completed' : 'pending'}
                qaReport={qaReport ? {
                  overallScore: qaReport.overallScore,
                  approvedCount: qaReport.approvedCount,
                  needsReviewCount: qaReport.needsReviewCount,
                  rejectedCount: qaReport.rejectedCount,
                } : undefined}
                onQAClick={() => setShowQADashboard(true)}
              />
              
              {project.status !== 'draft' && project.assets?.music && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <MusicControlsPanel 
                    projectId={project.id}
                    musicVolume={project.assets.music.volume || 0.3}
                    onUpdate={() => queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] })}
                  />
                  <VoiceoverControlsPanel
                    projectId={project.id}
                    currentVoiceId={project.voiceId}
                    currentVoiceName={project.voiceName}
                    onUpdate={() => queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] })}
                  />
                </div>
              )}
              
              {/* Quality Report - shown for completed videos */}
              <QualityReport 
                projectId={project.id}
                projectStatus={project.status}
                onRegenerateComplete={() => queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] })}
              />
              
              {(project.status === 'rendering' || project.status === 'lambda_pending' || project.status === 'render_queued' || 
                (project.status === 'error' && (project.progress as any)?.renderStatus)) && (() => {
                const rs = (project.progress as any)?.renderStatus as {
                  phase: string; totalChunks: number; completedChunks: number;
                  currentChunk?: number; percent: number; message: string;
                  startedAt: number; lastUpdateAt: number; elapsedMs: number; error: string | null;
                } | undefined;
                const isChunked = (project.progress as any)?.renderMethod === 'chunked';
                const isError = project.status === 'error' || rs?.phase === 'error';
                const renderPct = isError ? (rs?.percent ?? project.progress.steps.rendering?.progress ?? 0) 
                  : (renderProgress?.progressPercent ?? rs?.percent ?? project.progress.steps.rendering?.progress ?? 0);
                const elapsedMs = rs?.elapsedMs ?? (rs?.startedAt ? Date.now() - rs.startedAt : 0);
                const elapsedSec = Math.floor(elapsedMs / 1000);
                const elapsedMin = Math.floor(elapsedSec / 60);
                const elapsedSecRem = elapsedSec % 60;
                const lastUpdateAge = rs?.lastUpdateAt ? Math.floor((Date.now() - rs.lastUpdateAt) / 1000) : 0;
                const isStalled = !isError && lastUpdateAge > 300 && rs?.phase !== 'queued';
                const isWaiting = project.status === 'render_queued' || rs?.phase === 'queued';

                const errorMessage = rs?.error || rs?.message || project.progress.steps.rendering?.message || 'Unknown error';
                const friendlyError = errorMessage.includes('Concurrency limit') || errorMessage.includes('Rate Exceeded')
                  ? 'The cloud rendering service is currently busy (too many simultaneous renders). This is a temporary issue.'
                  : errorMessage.includes('timeout') || errorMessage.includes('Timeout')
                  ? 'The rendering process timed out. This can happen with longer or more complex videos.'
                  : errorMessage.includes('Missing render')
                  ? 'The render configuration was lost. Please try rendering again.'
                  : 'The rendering process encountered an error.';

                const phaseLabel = isError ? 'Failed'
                  : rs?.phase === 'queued' ? 'Queued' 
                  : rs?.phase === 'preparing' ? 'Preparing'
                  : rs?.phase === 'rendering' ? 'Rendering'
                  : rs?.phase === 'downloading' ? 'Downloading'
                  : rs?.phase === 'concatenating' ? 'Combining'
                  : rs?.phase === 'uploading' ? 'Uploading'
                  : rs?.phase === 'complete' ? 'Complete'
                  : renderProgress?.renderPhase === 'initializing' ? 'Initializing'
                  : renderProgress?.renderPhase === 'rendering' ? 'Rendering'
                  : renderProgress?.renderPhase === 'encoding' ? 'Encoding'
                  : 'Processing';

                const phaseIcon = isError ? <AlertCircle className="h-4 w-4 text-red-500" />
                  : isStalled ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                  : isWaiting ? <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                  : rs?.phase === 'complete' ? <CheckCircle className="h-4 w-4 text-green-500" />
                  : <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;

                return (
                  <div className={`rounded-lg border-2 p-4 space-y-4 ${
                    isError ? 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700' 
                    : isStalled ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700' 
                    : 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {phaseIcon}
                        <span className="font-semibold text-sm">
                          {isError ? 'Rendering failed' : isStalled ? 'Render may be stalled' : isWaiting ? 'Waiting for render worker...' : 'Video is rendering'}
                        </span>
                        <Badge variant={isError ? "destructive" : "outline"} className="text-xs font-mono">
                          {phaseLabel}
                        </Badge>
                        {isChunked && (
                          <Badge variant="secondary" className="text-xs">
                            Chunked
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {elapsedSec > 0 && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {elapsedMin > 0 ? `${elapsedMin}m ${String(elapsedSecRem).padStart(2, '0')}s` : `${elapsedSec}s`}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          Worker
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{Math.round(renderPct)}%</span>
                        {isChunked && rs && rs.totalChunks > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {isError 
                              ? `Failed at chunk ${(rs.completedChunks || 0) + 1} of ${rs.totalChunks}`
                              : `Chunk ${(rs.completedChunks || 0) + (rs.phase === 'rendering' ? 1 : 0)} of ${rs.totalChunks}`
                            }
                          </span>
                        )}
                      </div>
                      <Progress value={renderPct} className={`h-2.5 ${isError ? '[&>div]:bg-red-500' : ''}`} />
                    </div>

                    {isChunked && rs && rs.totalChunks > 1 && (
                      <div className="flex gap-1">
                        {Array.from({ length: rs.totalChunks }, (_, i) => {
                          const isDone = i < (rs.completedChunks || 0);
                          const isFailed = isError && i === (rs.completedChunks || 0);
                          const isCurrent = !isError && i === (rs.currentChunk ?? rs.completedChunks ?? 0) && rs.phase === 'rendering';
                          return (
                            <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                              isDone ? 'bg-green-500' : isFailed ? 'bg-red-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-200 dark:bg-gray-700'
                            }`} title={`Chunk ${i + 1}${isDone ? ' (done)' : isFailed ? ' (failed)' : isCurrent ? ' (rendering)' : ''}`} />
                          );
                        })}
                      </div>
                    )}

                    <div className="text-xs space-y-1.5">
                      {isError ? (
                        <>
                          <p className="text-red-700 dark:text-red-300 font-medium">
                            {friendlyError}
                          </p>
                          <p className="text-red-600/80 dark:text-red-400/80">
                            You can try again by clicking the "Retry Render" button above. If the problem persists, try waiting a few minutes before retrying.
                          </p>
                          <details className="mt-1">
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                              Technical details
                            </summary>
                            <p className="text-muted-foreground/70 mt-1 font-mono text-[10px] break-all bg-black/5 dark:bg-white/5 rounded p-2">
                              {errorMessage}
                            </p>
                          </details>
                        </>
                      ) : (
                        <>
                          <p className="text-muted-foreground">
                            {rs?.message || project.progress.steps.rendering?.message || 'Processing...'}
                          </p>
                          {isStalled && (
                            <p className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              No progress update for {Math.floor(lastUpdateAge / 60)}m {lastUpdateAge % 60}s. 
                              The worker may be processing a large chunk or may need a retry.
                            </p>
                          )}
                          <p className="text-muted-foreground/70">
                            You can navigate away - rendering continues in the background via an isolated worker process.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              <Separator />
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Scenes Preview</h4>
                  <UndoRedoControls 
                    projectId={project.id}
                    onProjectUpdate={(updatedProject) => setProject(updatedProject)}
                    refreshKey={Date.parse(project.updatedAt)}
                  />
                </div>
                <ScrollArea className="h-[550px] pr-4">
                  <ScenePreview 
                    scenes={project.scenes} 
                    assets={project.assets}
                    projectId={project.id}
                    projectTitle={project.title}
                    projectQualityTier={project.qualityTier}
                    onToggleProductOverlay={handleToggleProductOverlay}
                    onSceneUpdate={() => queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] })}
                    onProjectUpdate={(updatedProject) => setProject(updatedProject)}
                  />
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={(open) => {
        setShowPreviewModal(open);
        if (!open) {
          setIsPreviewPlaying(false);
          setPreviewSceneIndex(0);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Quick Preview
            </DialogTitle>
            <DialogDescription>
              Scene-by-scene preview of your video ({project?.scenes.length || 0} scenes, {project?.totalDuration || 0}s total)
            </DialogDescription>
          </DialogHeader>
          
          {project && project.scenes[previewSceneIndex] && (
            <div className="space-y-4">
              {/* Scene Progress */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Scene {previewSceneIndex + 1} of {project.scenes.length}</span>
                <Progress value={((previewSceneIndex + 1) / project.scenes.length) * 100} className="flex-1" />
              </div>

              {/* Preview Display */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {(() => {
                  const scene = project.scenes[previewSceneIndex];
                  const videoUrl = scene.assets?.videoUrl ? convertToDisplayUrl(scene.assets.videoUrl) : null;
                  const imageUrl = scene.assets?.imageUrl ? convertToDisplayUrl(scene.assets.imageUrl) : null;
                  
                  if (videoUrl) {
                    return (
                      <video
                        key={`preview-video-${scene.id}-${videoUrl}`}
                        src={videoUrl}
                        className="w-full h-full object-cover i2v-video-fade"
                        autoPlay
                        muted
                        loop={false}
                        playsInline
                      />
                    );
                  } else if (imageUrl) {
                    return (
                      <img
                        key={`preview-img-${scene.id}-${imageUrl}`}
                        src={imageUrl}
                        alt={`Scene ${scene.order}`}
                        className="w-full h-full object-cover"
                      />
                    );
                  } else {
                    return (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-900 to-green-700">
                        <div className="text-center text-white">
                          <ImageIcon className="w-16 h-16 mx-auto opacity-50 mb-2" />
                          <p className="text-lg font-medium">Scene {scene.order}: {scene.type}</p>
                        </div>
                      </div>
                    );
                  }
                })()}
                
                {/* Product Overlay */}
                {(() => {
                  const scene = project.scenes[previewSceneIndex];
                  if (!scene.assets?.useProductOverlay) return null;
                  
                  // Resolve product overlay URL
                  let overlayUrl = scene.assets.productOverlayUrl;
                  if (!overlayUrl && scene.assets.assignedProductImageId) {
                    const assignedImage = project.assets.productImages?.find(
                      img => img.id === scene.assets?.assignedProductImageId
                    );
                    if (assignedImage) overlayUrl = assignedImage.url;
                  }
                  if (!overlayUrl && project.assets.productImages?.length) {
                    overlayUrl = project.assets.productImages[0].url;
                  }
                  if (!overlayUrl) return null;
                  
                  const displayUrl = convertToDisplayUrl(overlayUrl);
                  const pos = scene.assets.productOverlayPosition || { x: 'right', y: 'bottom', scale: 0.25 };
                  
                  // Calculate position styles
                  const positionStyles: React.CSSProperties = {
                    position: 'absolute',
                    maxWidth: `${(pos.scale || 0.25) * 100}%`,
                    maxHeight: `${(pos.scale || 0.25) * 100}%`,
                    objectFit: 'contain',
                  };
                  
                  // Horizontal position
                  if (pos.x === 'left') {
                    positionStyles.left = '5%';
                  } else if (pos.x === 'center') {
                    positionStyles.left = '50%';
                    positionStyles.transform = 'translateX(-50%)';
                  } else {
                    positionStyles.right = '5%';
                  }
                  
                  // Vertical position
                  if (pos.y === 'top') {
                    positionStyles.top = '5%';
                  } else if (pos.y === 'center') {
                    positionStyles.top = '50%';
                    positionStyles.transform = positionStyles.transform 
                      ? 'translate(-50%, -50%)' 
                      : 'translateY(-50%)';
                  } else {
                    positionStyles.bottom = '20%'; // Above the info overlay
                  }
                  
                  return (
                    <img
                      key={`preview-overlay-${scene.id}`}
                      src={displayUrl}
                      alt="Product overlay"
                      style={positionStyles}
                      className="drop-shadow-lg"
                      data-testid="preview-product-overlay"
                    />
                  );
                })()}
                
                {/* Scene Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{project.scenes[previewSceneIndex].type}</Badge>
                    <span className="text-white/70 text-xs">{project.scenes[previewSceneIndex].duration}s</span>
                  </div>
                  <h3 className="text-white font-medium">Scene {project.scenes[previewSceneIndex].order}: {project.scenes[previewSceneIndex].type}</h3>
                  <p className="text-white/80 text-sm line-clamp-2">{project.scenes[previewSceneIndex].narration}</p>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewSceneIndex(Math.max(0, previewSceneIndex - 1))}
                  disabled={previewSceneIndex === 0}
                  data-testid="button-preview-prev"
                >
                  Previous
                </Button>
                
                <Button
                  variant={isPreviewPlaying ? "secondary" : "default"}
                  size="sm"
                  onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                  data-testid="button-preview-play"
                >
                  {isPreviewPlaying ? (
                    <>Pause</>
                  ) : (
                    <><Play className="w-4 h-4 mr-1" /> Play</>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewSceneIndex(Math.min(project.scenes.length - 1, previewSceneIndex + 1))}
                  disabled={previewSceneIndex === project.scenes.length - 1}
                  data-testid="button-preview-next"
                >
                  Next
                </Button>
              </div>

              {/* Scene Thumbnails */}
              <ScrollArea className="h-20">
                <div className="flex gap-2">
                  {project.scenes.map((scene, index) => {
                    const thumbUrl = scene.assets?.imageUrl ? convertToDisplayUrl(scene.assets.imageUrl) : null;
                    return (
                      <button
                        key={scene.id}
                        onClick={() => {
                          setPreviewSceneIndex(index);
                          setIsPreviewPlaying(false);
                        }}
                        className={`relative flex-shrink-0 w-24 h-14 rounded overflow-hidden border-2 transition-all ${
                          index === previewSceneIndex ? 'border-primary ring-2 ring-primary/30' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                        data-testid={`button-preview-scene-${index}`}
                      >
                        {thumbUrl ? (
                          <img src={thumbUrl} alt={`Scene ${scene.order}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-green-800 to-green-600 flex items-center justify-center">
                            <span className="text-white text-xs">{index + 1}</span>
                          </div>
                        )}
                        {index === previewSceneIndex && isPreviewPlaying && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white" fill="white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QA Dashboard Modal - Full Screen */}
      <Dialog open={showQADashboard} onOpenChange={setShowQADashboard}>
        <DialogContent className="w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Quality Assurance Dashboard
            </DialogTitle>
            <DialogDescription>
              Review and approve scenes before rendering
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
          <QADashboard
            report={qaReport}
            isLoading={isAnalyzingQA}
            isFixingIssues={isFixingIssues}
            fixingProgress={fixingProgress}
            onRunAnalysis={async () => {
              if (!project) return;
              setIsAnalyzingQA(true);
              try {
                const res = await fetch(`/api/universal-video/${project.id}/analyze-quality`, {
                  method: 'POST',
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                  // Backend returns report fields directly on response, not nested under 'report'
                  const report = {
                    projectId: data.projectId || project.id,
                    overallScore: data.overallScore,
                    sceneStatuses: data.sceneStatuses || data.sceneResults || [],
                    approvedCount: data.approvedCount || 0,
                    needsReviewCount: data.needsReviewCount || 0,
                    rejectedCount: data.rejectedCount || 0,
                    pendingCount: data.pendingCount || 0,
                    criticalIssueCount: data.criticalIssueCount || 0,
                    majorIssueCount: data.majorIssueCount || 0,
                    minorIssueCount: data.minorIssueCount || 0,
                    passesThreshold: data.passesThreshold,
                    canRender: data.canRender,
                    blockingReasons: data.blockingReasons || [],
                    lastAnalyzedAt: data.lastAnalyzedAt || new Date().toISOString(),
                  };
                  setQAReport(report);
                  toast({
                    title: "Analysis Complete",
                    description: `Quality score: ${report.overallScore}/100`,
                  });
                } else {
                  toast({
                    title: "Analysis Failed",
                    description: data.error || "Could not run quality analysis",
                    variant: "destructive",
                  });
                }
              } catch (err) {
                toast({
                  title: "Analysis Failed",
                  description: "Could not run quality analysis",
                  variant: "destructive",
                });
              } finally {
                setIsAnalyzingQA(false);
              }
            }}
            onApproveScene={async (sceneIndex) => {
              if (!project || !qaReport) return;
              try {
                const res = await fetch(`/api/universal-video/${project.id}/approve-scene/${sceneIndex}`, {
                  method: 'POST',
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                  setQAReport(data.report);
                  toast({ title: "Scene Approved" });
                }
              } catch (err) {
                toast({
                  title: "Approval Failed",
                  variant: "destructive",
                });
              }
            }}
            onRejectScene={async (sceneIndex, reason) => {
              if (!project || !qaReport) return;
              try {
                const res = await fetch(`/api/universal-video/${project.id}/reject-scene/${sceneIndex}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reason }),
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                  setQAReport(data.report);
                  toast({ title: "Scene Rejected" });
                }
              } catch (err) {
                toast({
                  title: "Rejection Failed",
                  variant: "destructive",
                });
              }
            }}
            onRegenerateScene={async (sceneIndex) => {
              if (!project) return;
              try {
                toast({ title: "Starting Regeneration", description: `Scene ${sceneIndex + 1} is being regenerated...` });
                const res = await fetch(`/api/universal-video/projects/${project.id}/scenes/${sceneIndex}/auto-regenerate`, {
                  method: 'POST',
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                  if (data.project) setProject(data.project);
                  if (data.isVideoRegeneration) {
                    toast({ title: "Video Regenerating", description: `Job started: ${data.jobId}` });
                  } else {
                    toast({ title: "Scene Regenerated", description: "Image has been regenerated" });
                  }
                  queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] });
                  setTimeout(async () => {
                    try {
                      const refreshRes = await fetch(`/api/universal-video/projects/${project.id}`, { credentials: 'include' });
                      const refreshData = await refreshRes.json();
                      if (refreshData.project) setProject(refreshData.project);
                    } catch {}
                  }, 2000);
                } else {
                  toast({ title: "Regeneration Failed", description: data.error || "Unknown error", variant: "destructive" });
                }
              } catch (err) {
                toast({
                  title: "Regeneration Failed",
                  variant: "destructive",
                });
              }
            }}
            onApproveAll={async () => {
              if (!project || !qaReport) return;
              try {
                const res = await fetch(`/api/universal-video/${project.id}/approve-all-scenes`, {
                  method: 'POST',
                  credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                  setQAReport(data.report);
                  toast({ title: "All Scenes Approved" });
                }
              } catch (err) {
                toast({
                  title: "Approval Failed",
                  variant: "destructive",
                });
              }
            }}
            onProceedToRender={() => {
              setShowQADashboard(false);
              renderMutation.mutate();
            }}
            onFixAllIssues={async () => {
              if (!project || !qaReport) return;
              const rejectedScenes = qaReport.sceneStatuses.filter(
                s => s.status === 'rejected' || (s.score < 50 && !s.userApproved)
              );
              if (rejectedScenes.length === 0) {
                toast({ title: "No Issues to Fix", description: "All scenes are approved" });
                return;
              }
              
              setIsFixingIssues(true);
              setFixingProgress({ current: 0, total: rejectedScenes.length });
              
              let successCount = 0;
              let failCount = 0;
              
              for (let i = 0; i < rejectedScenes.length; i++) {
                const scene = rejectedScenes[i];
                setFixingProgress({ current: i + 1, total: rejectedScenes.length });
                
                try {
                  const res = await fetch(`/api/universal-video/projects/${project.id}/scenes/${scene.sceneIndex}/auto-regenerate`, {
                    method: 'POST',
                    credentials: 'include'
                  });
                  const data = await res.json();
                  if (data.success) {
                    successCount++;
                  } else {
                    failCount++;
                  }
                } catch {
                  failCount++;
                }
              }
              
              setIsFixingIssues(false);
              setFixingProgress(undefined);
              
              if (successCount > 0) {
                toast({ 
                  title: "Issues Fixed", 
                  description: `Successfully regenerated ${successCount} scene(s)${failCount > 0 ? `, ${failCount} failed` : ''}. Click Re-Analyze to verify.`
                });
              } else {
                toast({ 
                  title: "Regeneration Failed", 
                  description: "Could not regenerate any scenes", 
                  variant: "destructive" 
                });
              }
              
              queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', project.id] });
              
              // Refresh project data
              try {
                const refreshRes = await fetch(`/api/universal-video/projects/${project.id}`, { credentials: 'include' });
                const refreshData = await refreshRes.json();
                if (refreshData.project) setProject(refreshData.project);
              } catch {}
            }}
          />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
