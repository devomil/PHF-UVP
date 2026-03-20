import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Image,
  Video,
  ImagePlus,
  Sparkles,
  Loader2,
  Upload,
  X,
  Layers,
  Film,
  ArrowUpCircle,
  Scissors,
  User,
  Wand2,
  Save,
  Check,
} from 'lucide-react';
import { AssetSuzzieChat } from './AssetSuzzieChat';

type GenerationMode =
  | 't2i' | 't2v' | 'i2v' | 'i2i' | 'v2v'
  | 'upscale-image' | 'upscale-video'
  | 'bg-remove-image' | 'bg-remove-video'
  | 'character-performance'
  | 'character';

type ModeCategory = 'generate' | 'transform' | 'toolkit';

interface AssetCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobStarted?: (jobId: string) => void;
}

const VIDEO_PROVIDERS = [
  { id: 'auto', name: 'Auto (Best Match)' },
  { id: 'kling-2.6', name: 'Kling 2.6' },
  { id: 'kling-2.6-pro', name: 'Kling 2.6 Pro' },
  { id: 'kling-effects', name: 'Kling Effects (VFX)' },
  { id: 'veo-3.1', name: 'Veo 3.1' },
  { id: 'luma', name: 'Luma Dream Machine' },
  { id: 'hailuo', name: 'Hailuo MiniMax' },
  { id: 'wan-2.6', name: 'Wan 2.6' },
  { id: 'pika', name: 'Pika' },
  { id: 'seedance-1.0', name: 'Seedance 1.0' },
  { id: 'sora-2', name: 'Sora 2' },
  { id: 'runway', name: 'Runway Gen-3' },
  { id: 'runway-4.5', name: 'Runway 4.5' },
  { id: 'runway-gen4', name: 'Runway Gen-4' },
  { id: 'runway-gen4-aleph', name: 'Runway Gen-4 Aleph' },
  { id: 'runway-act-two', name: 'Runway Act Two' },
];

const IMAGE_PROVIDERS = [
  { id: 'auto', name: 'Auto (Best Match)' },
  { id: 'flux', name: 'Flux Schnell' },
  { id: 'flux-1-dev', name: 'Flux Dev' },
  { id: 'ideogram', name: 'Ideogram' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro' },
];

const V2V_PROVIDERS = [
  { id: 'auto', name: 'Auto (Kling Object Replace)' },
  { id: 'kling-2.6', name: 'Kling 2.6 (Object Replace)' },
  { id: 'runway-gen4-aleph', name: 'Runway Gen-4 Aleph (V2V)' },
  { id: 'runway-4.5', name: 'Runway 4.5 (V2V)' },
];

const TOOLKIT_PROVIDER = [
  { id: 'auto', name: 'Qubic Image Toolkit' },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9', desc: 'Landscape' },
  { id: '9:16', label: '9:16', desc: 'Portrait' },
  { id: '1:1', label: '1:1', desc: 'Square' },
  { id: '4:3', label: '4:3', desc: 'Standard' },
];

const DURATIONS = [
  { value: 5, label: '5s' },
  { value: 6, label: '6s' },
  { value: 8, label: '8s' },
  { value: 10, label: '10s' },
];

const IMAGE_STYLES = [
  'Photorealistic',
  'Cinematic',
  '3D Illustration',
  'Watercolor',
  'Oil Painting',
  'Digital Art',
  'Anime',
  'Minimalist',
  'Neon/Cyberpunk',
  'Sketch',
];

const I2I_USE_CASES = [
  { id: 'style-transfer', name: 'Style Transfer', desc: 'Apply a new artistic style' },
  { id: 'background-generation', name: 'Background Swap', desc: 'Replace or modify the background' },
  { id: 'scene-integration', name: 'Scene Integration', desc: 'Blend into a new scene context' },
  { id: 'product-placement', name: 'Product Placement', desc: 'Place a product into a new setting' },
];

const SCALE_FACTORS = [
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];

interface ModeConfig {
  label: string;
  shortLabel: string;
  icon: any;
  description: string;
  category: ModeCategory;
  outputType: 'image' | 'video';
  needsPrompt: boolean;
  needsRefImage: boolean;
  needsRefVideo: boolean;
  needsReplacementImage: boolean;
}

const MODE_CONFIG: Record<GenerationMode, ModeConfig> = {
  't2i': { label: 'Text to Image', shortLabel: 'T2I', icon: Image, description: 'Generate an image from a text prompt', category: 'generate', outputType: 'image', needsPrompt: true, needsRefImage: false, needsRefVideo: false, needsReplacementImage: false },
  't2v': { label: 'Text to Video', shortLabel: 'T2V', icon: Video, description: 'Generate a video clip from a text prompt', category: 'generate', outputType: 'video', needsPrompt: true, needsRefImage: false, needsRefVideo: false, needsReplacementImage: false },
  'i2v': { label: 'Image to Video', shortLabel: 'I2V', icon: ImagePlus, description: 'Animate a reference image into video', category: 'generate', outputType: 'video', needsPrompt: true, needsRefImage: true, needsRefVideo: false, needsReplacementImage: false },
  'i2i': { label: 'Image to Image', shortLabel: 'I2I', icon: Layers, description: 'Transform an image with style transfer or edits', category: 'transform', outputType: 'image', needsPrompt: true, needsRefImage: true, needsRefVideo: false, needsReplacementImage: false },
  'v2v': { label: 'Video to Video', shortLabel: 'V2V', icon: Film, description: 'Transform video with Runway Aleph or Kling object replace', category: 'transform', outputType: 'video', needsPrompt: true, needsRefImage: false, needsRefVideo: true, needsReplacementImage: false },
  'character': { label: 'Character', shortLabel: 'Character', icon: Wand2, description: 'Generate a Disney/Pixar 3D character reference image', category: 'generate', outputType: 'image', needsPrompt: false, needsRefImage: false, needsRefVideo: false, needsReplacementImage: false },
  'character-performance': { label: 'Character Performance', shortLabel: 'Act Two', icon: User, description: 'Runway Act Two — animate a character from a reference video', category: 'transform', outputType: 'video', needsPrompt: false, needsRefImage: true, needsRefVideo: true, needsReplacementImage: false },
  'upscale-image': { label: 'Upscale Image', shortLabel: 'Upscale', icon: ArrowUpCircle, description: 'Enhance image resolution with AI upscaling', category: 'toolkit', outputType: 'image', needsPrompt: false, needsRefImage: true, needsRefVideo: false, needsReplacementImage: false },
  'upscale-video': { label: 'Upscale Video', shortLabel: 'Upscale', icon: ArrowUpCircle, description: 'Enhance video resolution with AI upscaling', category: 'toolkit', outputType: 'video', needsPrompt: false, needsRefImage: false, needsRefVideo: true, needsReplacementImage: false },
  'bg-remove-image': { label: 'Remove BG (Image)', shortLabel: 'BG Remove', icon: Scissors, description: 'Remove background from an image', category: 'toolkit', outputType: 'image', needsPrompt: false, needsRefImage: true, needsRefVideo: false, needsReplacementImage: false },
  'bg-remove-video': { label: 'Remove BG (Video)', shortLabel: 'BG Remove', icon: Scissors, description: 'Remove background from a video', category: 'toolkit', outputType: 'video', needsPrompt: false, needsRefImage: false, needsRefVideo: true, needsReplacementImage: false },
};

const CATEGORY_MODES: Record<ModeCategory, GenerationMode[]> = {
  generate: ['t2i', 't2v', 'i2v', 'character'],
  transform: ['i2i', 'v2v', 'character-performance'],
  toolkit: ['upscale-image', 'upscale-video', 'bg-remove-image', 'bg-remove-video'],
};

const CATEGORY_LABELS: Record<ModeCategory, string> = {
  generate: 'Generate',
  transform: 'Transform',
  toolkit: 'Toolkit',
};

function isRunwayV2V(provider: string) {
  return provider.startsWith('runway');
}

export function AssetCreatorDialog({ open, onOpenChange, onJobStarted }: AssetCreatorDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<GenerationMode>('t2v');
  const [category, setCategory] = useState<ModeCategory>('generate');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [style, setStyle] = useState('Photorealistic');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [imageFidelity, setImageFidelity] = useState(0.85);
  const [strength, setStrength] = useState(0.35);
  const [useCase, setUseCase] = useState('style-transfer');
  const [scaleFactor, setScaleFactor] = useState(2);
  const [bodyControl, setBodyControl] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [replacementImageUrl, setReplacementImageUrl] = useState('');
  const [replacementImagePreview, setReplacementImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);

  const [charName, setCharName] = useState('');
  const [charRole, setCharRole] = useState('');
  const [charPhysicalDescription, setCharPhysicalDescription] = useState('');
  const [charWardrobe, setCharWardrobe] = useState('');
  const [charPersonality, setCharPersonality] = useState('');
  const [charGeneratedImageUrl, setCharGeneratedImageUrl] = useState<string | null>(null);
  const [charReferencePhotoUrl, setCharReferencePhotoUrl] = useState<string | null>(null);
  const [charReferencePhotoPreview, setCharReferencePhotoPreview] = useState<string | null>(null);
  const [isUploadingCharPhoto, setIsUploadingCharPhoto] = useState(false);
  const charPhotoInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [charSavedToLibrary, setCharSavedToLibrary] = useState(false);
  const [showCharPreview, setShowCharPreview] = useState(false);

  const cfg = MODE_CONFIG[mode];

  const needsReplacementForV2V = mode === 'v2v' && !isRunwayV2V(provider);

  const getProviders = () => {
    if (mode === 'v2v') return V2V_PROVIDERS;
    if (cfg.category === 'toolkit') return TOOLKIT_PROVIDER;
    if (mode === 'character-performance') return [{ id: 'runway-act-two', name: 'Runway Act Two' }];
    if (cfg.outputType === 'image') return IMAGE_PROVIDERS;
    return VIDEO_PROVIDERS;
  };

  const uploadFile = async (
    file: File,
    setUrl: (url: string) => void,
    setPreview: ((url: string | null) => void) | null,
    setLoading: (v: boolean) => void,
    label: string,
  ) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/videos/uploads', { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (data.url) {
        setUrl(data.url);
        setPreview?.(data.url);
        toast({ title: `${label} uploaded` });
      }
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCharPhotoUpload = async (file: File) => {
    setIsUploadingCharPhoto(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      setCharReferencePhotoPreview(previewUrl);
      
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/videos/uploads', { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (data.url) {
        setCharReferencePhotoUrl(data.url);
        toast({ title: 'Photo uploaded', description: 'Reference photo will guide the character generation.' });
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err: any) {
      toast({ title: 'Photo upload failed', description: err.message, variant: 'destructive' });
      setCharReferencePhotoPreview(null);
      setCharReferencePhotoUrl(null);
    } finally {
      setIsUploadingCharPhoto(false);
    }
  };

  const handleRemoveCharPhoto = () => {
    setCharReferencePhotoUrl(null);
    setCharReferencePhotoPreview(null);
    if (charPhotoInputRef.current) charPhotoInputRef.current.value = '';
  };

  const handleGenerateCharacter = async () => {
    if (!charName.trim()) {
      toast({ title: 'Character name is required', variant: 'destructive' });
      return;
    }
    if (!charPhysicalDescription.trim()) {
      toast({ title: 'Physical description is required', variant: 'destructive' });
      return;
    }

    setIsGeneratingCharacter(true);
    setCharGeneratedImageUrl(null);
    setCharSavedToLibrary(false);
    try {
      const res = await apiRequest('POST', '/api/universal-video/generate-character-reference', {
        name: charName.trim(),
        role: charRole.trim(),
        physicalDescription: charPhysicalDescription.trim(),
        wardrobe: charWardrobe.trim(),
        personalityNotes: charPersonality.trim(),
        referencePhotoUrl: charReferencePhotoUrl || undefined,
      });
      const data = await res.json();
      if (data.success && data.referenceImageUrl) {
        setCharGeneratedImageUrl(data.referenceImageUrl);
        setShowCharPreview(true);
        toast({ title: 'Character generated', description: `Review "${charName}" before saving.` });
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (err: any) {
      toast({ title: 'Character generation failed', description: err.message || 'Could not generate character.', variant: 'destructive' });
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const handleApproveCharacter = async () => {
    if (!charGeneratedImageUrl || !charName.trim()) return;
    setIsSavingCharacter(true);
    try {
      await apiRequest('POST', '/api/universal-video/character-library', {
        name: charName.trim(),
        role: charRole.trim(),
        physicalDescription: charPhysicalDescription.trim(),
        wardrobe: charWardrobe.trim(),
        personalityNotes: charPersonality.trim(),
        referenceImageUrl: charGeneratedImageUrl,
      });
      await apiRequest('POST', '/api/asset-library/save-character', {
        name: charName.trim(),
        referenceImageUrl: charGeneratedImageUrl,
        role: charRole.trim(),
        physicalDescription: charPhysicalDescription.trim(),
      });
      setCharSavedToLibrary(true);
      setShowCharPreview(false);
      queryClient.invalidateQueries({ queryKey: ['/api/universal-video/character-library'] });
      queryClient.invalidateQueries({ queryKey: ['/api/asset-library'] });
      toast({ title: 'Character saved', description: `"${charName}" has been saved to your character library.` });
    } catch {
      toast({ title: 'Save failed', description: 'Could not save character. Try again.', variant: 'destructive' });
    } finally {
      setIsSavingCharacter(false);
    }
  };

  const handleSaveCharacterToLibrary = async () => {
    if (!charGeneratedImageUrl || !charName.trim()) return;

    setIsSavingCharacter(true);
    try {
      await apiRequest('POST', '/api/universal-video/character-library', {
        name: charName.trim(),
        role: charRole.trim(),
        physicalDescription: charPhysicalDescription.trim(),
        wardrobe: charWardrobe.trim(),
        personalityNotes: charPersonality.trim(),
        referenceImageUrl: charGeneratedImageUrl,
      });

      await apiRequest('POST', '/api/asset-library/save-character', {
        name: charName.trim(),
        referenceImageUrl: charGeneratedImageUrl,
        role: charRole.trim(),
        physicalDescription: charPhysicalDescription.trim(),
      });

      setCharSavedToLibrary(true);
      toast({ title: 'Saved to library', description: `"${charName}" has been saved to your character library.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || 'Could not save character.', variant: 'destructive' });
    } finally {
      setIsSavingCharacter(false);
    }
  };

  const handleSubmit = async () => {
    if (cfg.needsPrompt && !prompt.trim()) {
      toast({ title: 'Prompt required', variant: 'destructive' });
      return;
    }

    if (cfg.needsRefImage && !referenceImageUrl) {
      toast({ title: 'Reference image required', variant: 'destructive' });
      return;
    }

    if (cfg.needsRefVideo && !referenceVideoUrl) {
      toast({ title: 'Reference video required', variant: 'destructive' });
      return;
    }

    if (needsReplacementForV2V && !replacementImageUrl) {
      toast({ title: 'Replacement image required', description: 'Kling V2V requires a replacement image for object insertion.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const body: any = {
        mode,
        prompt: prompt.trim() || undefined,
        provider: provider || 'auto',
        aspectRatio,
      };

      if (cfg.outputType === 'video') body.duration = duration;
      if (mode === 't2i') body.style = style;
      if (cfg.needsRefImage) body.referenceImageUrl = referenceImageUrl;
      if (cfg.needsRefVideo) body.referenceVideoUrl = referenceVideoUrl;
      if (needsReplacementForV2V) body.referenceImageUrl = replacementImageUrl;
      if ((mode === 'i2v' || mode === 't2v') && negativePrompt.trim()) {
        body.negativePrompt = negativePrompt.trim();
      }
      if (mode === 'i2v') {
        body.imageFidelity = imageFidelity;
      }
      if (mode === 'i2i') {
        body.strength = strength;
        body.useCase = useCase;
      }
      if (mode === 'upscale-image' || mode === 'upscale-video') {
        body.scaleFactor = scaleFactor;
      }
      if (mode === 'character-performance') {
        body.bodyControl = bodyControl;
      }

      const res = await apiRequest('POST', '/api/asset-library/generate', body);
      const data = await res.json();

      toast({
        title: 'Generation started',
        description: `Your ${cfg.label.toLowerCase()} is being processed.`,
      });

      onJobStarted?.(data.jobId);
      onOpenChange(false);
      setPrompt('');
      setNegativePrompt('');
      setImageFidelity(0.85);
      setReferenceImageUrl('');
      setReferenceImagePreview(null);
      setReferenceVideoUrl('');
      setReplacementImageUrl('');
      setReplacementImagePreview(null);
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message || 'Could not start.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    (!cfg.needsPrompt || prompt.trim()) &&
    (!cfg.needsRefImage || referenceImageUrl) &&
    (!cfg.needsRefVideo || referenceVideoUrl) &&
    (!needsReplacementForV2V || replacementImageUrl);

  const promptPlaceholders: Partial<Record<GenerationMode, string>> = {
    t2i: 'Describe the image you want to create...',
    t2v: 'Describe the video scene you want to generate...',
    i2v: 'Describe how you want the image to be animated...',
    i2i: 'Describe the transformation you want to apply...',
    v2v: 'Describe the changes or object replacement for the video...',
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setShowCharPreview(false); setCharGeneratedImageUrl(null); setCharSavedToLibrary(false); } onOpenChange(v); }}>
      {showCharPreview && charGeneratedImageUrl ? (
        <DialogContent className="sm:max-w-2xl bg-gray-950 border-gray-800 text-white p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-purple-400" />
              {charName || 'Character Preview'}
            </DialogTitle>
            <p className="text-sm text-gray-400 mt-1">
              Review the generated character. Save if you're happy, or regenerate for a new version.
            </p>
          </div>
          <div className="px-4 pb-2">
            <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-black flex items-center justify-center" style={{ maxHeight: '60vh' }}>
              <img
                src={charGeneratedImageUrl}
                alt={charName}
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>
          </div>
          <div className="p-4 border-t border-gray-800 flex gap-3">
            <Button
              onClick={handleApproveCharacter}
              disabled={isSavingCharacter}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isSavingCharacter ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save Character
            </Button>
            <Button
              onClick={() => {
                setShowCharPreview(false);
                setCharGeneratedImageUrl(null);
                handleGenerateCharacter();
              }}
              disabled={isGeneratingCharacter}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              {isGeneratingCharacter ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
            <Button
              onClick={() => { setShowCharPreview(false); setCharGeneratedImageUrl(null); }}
              variant="ghost"
              className="text-gray-400 hover:text-white"
            >
              Back
            </Button>
          </div>
        </DialogContent>
      ) : (
      <DialogContent className="sm:max-w-[680px] bg-gray-950 border-gray-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Create Asset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex gap-1 mb-3">
              {(Object.keys(CATEGORY_LABELS) as ModeCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    setMode(CATEGORY_MODES[cat][0]);
                    setProvider('auto');
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    category === cat
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-300'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <div className={`grid gap-1.5 ${CATEGORY_MODES[category].length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {CATEGORY_MODES[category].map((m) => {
                const config = MODE_CONFIG[m];
                const Icon = config.icon;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setProvider('auto');
                    }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${
                      mode === m
                        ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                        : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium leading-tight text-center">{config.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{cfg.description}</p>
          </div>

          {cfg.needsPrompt && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="prompt" className="text-sm text-gray-400">Prompt</Label>
                {(mode === 't2i' || mode === 't2v' || mode === 'i2v') && (
                  <AssetSuzzieChat
                    mode={mode}
                    provider={provider}
                    prompt={prompt}
                    hasReferenceImage={!!referenceImageUrl}
                    aspectRatio={aspectRatio}
                    duration={duration}
                    style={style}
                    validProviderIds={getProviders().map(p => p.id)}
                    onApplyPrompt={setPrompt}
                    onApplyProvider={setProvider}
                    onApplyNegativePrompt={setNegativePrompt}
                    onApplyCfgScale={(val) => setImageFidelity(val)}
                  />
                )}
              </div>
              <Textarea
                id="prompt"
                placeholder={promptPlaceholders[mode] || 'Describe what you want...'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 min-h-[80px] resize-none"
                maxLength={2000}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-gray-600">{prompt.length}/2000</span>
              </div>
            </div>
          )}

          {cfg.needsRefImage && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">
                {mode === 'character-performance' ? 'Character Image' :
                 mode === 'i2i' ? 'Source Image' :
                 mode === 'upscale-image' || mode === 'bg-remove-image' ? 'Input Image' :
                 'Reference Image'}
              </Label>
              {referenceImagePreview ? (
                <div className="relative rounded-lg overflow-hidden border border-gray-700 w-40 h-24">
                  <img src={referenceImagePreview} alt="Reference" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setReferenceImageUrl(''); setReferenceImagePreview(null); }}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-black"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste image URL..."
                    value={referenceImageUrl}
                    onChange={(e) => { setReferenceImageUrl(e.target.value); if (e.target.value) setReferenceImagePreview(e.target.value); }}
                    className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 flex-1"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingRef}
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    {isUploadingRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setReferenceImageUrl, setReferenceImagePreview, setIsUploadingRef, 'Image'); }}
                  />
                </div>
              )}
            </div>
          )}

          {cfg.needsRefVideo && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">
                {mode === 'character-performance' ? 'Reference Performance Video' :
                 mode === 'upscale-video' || mode === 'bg-remove-video' ? 'Input Video' :
                 'Source Video'}
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste video URL..."
                  value={referenceVideoUrl}
                  onChange={(e) => setReferenceVideoUrl(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 flex-1"
                />
                <Button
                  variant="outline" size="sm"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isUploadingVideo}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  {isUploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setReferenceVideoUrl, null, setIsUploadingVideo, 'Video'); }}
                />
              </div>
              {referenceVideoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-green-600 text-green-400">Video loaded</Badge>
                  <button onClick={() => setReferenceVideoUrl('')} className="text-[10px] text-gray-500 hover:text-red-400">Remove</button>
                </div>
              )}
            </div>
          )}

          {needsReplacementForV2V && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Replacement Image (product/object to insert)</Label>
              {replacementImagePreview ? (
                <div className="relative rounded-lg overflow-hidden border border-gray-700 w-40 h-24">
                  <img src={replacementImagePreview} alt="Replacement" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setReplacementImageUrl(''); setReplacementImagePreview(null); }}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-black"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste replacement image URL..."
                    value={replacementImageUrl}
                    onChange={(e) => { setReplacementImageUrl(e.target.value); if (e.target.value) setReplacementImagePreview(e.target.value); }}
                    className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 flex-1"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => replacementInputRef.current?.click()}
                    disabled={isUploadingReplacement}
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    {isUploadingReplacement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  <input ref={replacementInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setReplacementImageUrl, setReplacementImagePreview, setIsUploadingReplacement, 'Replacement image'); }}
                  />
                </div>
              )}
              <p className="text-[10px] text-gray-500 mt-1">Only needed for Kling object replacement. Runway V2V uses prompt-based transformation.</p>
            </div>
          )}

          {mode === 'i2i' && (
            <>
              <div>
                <Label className="text-sm text-gray-400 mb-1.5 block">Transformation Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {I2I_USE_CASES.map((uc) => (
                    <button
                      key={uc.id}
                      onClick={() => setUseCase(uc.id)}
                      className={`text-left p-2.5 rounded-lg border transition-all ${
                        useCase === uc.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                      }`}
                    >
                      <span className={`text-xs font-medium ${useCase === uc.id ? 'text-purple-300' : 'text-gray-300'}`}>{uc.name}</span>
                      <p className="text-[10px] text-gray-500 mt-0.5">{uc.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm text-gray-400 mb-1.5 block">
                  Transformation Strength: {Math.round(strength * 100)}%
                </Label>
                <Slider
                  value={[strength]}
                  onValueChange={([v]) => setStrength(v)}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  className="py-2"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Subtle (preserve original)</span>
                  <span>Strong (more creative)</span>
                </div>
              </div>
            </>
          )}

          {(mode === 'upscale-image' || mode === 'upscale-video') && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Scale Factor</Label>
              <div className="flex gap-2">
                {SCALE_FACTORS.map((sf) => (
                  <button
                    key={sf.value}
                    onClick={() => setScaleFactor(sf.value)}
                    className={`px-6 py-2 rounded text-sm font-medium border transition-all ${
                      scaleFactor === sf.value
                        ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                        : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'character' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 flex-1">
                  <Wand2 className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-blue-300">Art style: Disney/Pixar 3D CGI (auto-applied)</span>
                </div>
                <div className="ml-2 flex-shrink-0">
                  <AssetSuzzieChat
                    mode="character"
                    provider="auto"
                    prompt={charPhysicalDescription}
                    hasReferenceImage={!!charReferencePhotoUrl}
                    aspectRatio="1:1"
                    duration={0}
                    style="Disney/Pixar 3D"
                    validProviderIds={[]}
                    onApplyPrompt={setCharPhysicalDescription}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Reference Photo (optional)</Label>
                <p className="text-[11px] text-gray-500 mb-2">Upload a photo as visual reference to help you describe the character accurately</p>
                <input
                  ref={charPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCharPhotoUpload(file);
                  }}
                />
                {charReferencePhotoPreview ? (
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0">
                      <img src={charReferencePhotoPreview} alt="Reference" className="w-full h-full object-cover" />
                      {isUploadingCharPhoto && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-green-400 truncate">
                        {charReferencePhotoUrl ? 'Photo uploaded — will guide generation' : 'Uploading...'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveCharPhoto}
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => charPhotoInputRef.current?.click()}
                    className="w-full border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-purple-500 h-10"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Reference Photo
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Name *</Label>
                <Input
                  placeholder="e.g. Dr. Sarah Chen"
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Role / Title</Label>
                <Input
                  placeholder="e.g. Lead Scientist, CEO, Farmer"
                  value={charRole}
                  onChange={(e) => setCharRole(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Physical Description *</Label>
                <Textarea
                  placeholder="e.g. Mid-30s woman with dark brown hair in a neat bun, warm brown eyes, fair skin, athletic build..."
                  value={charPhysicalDescription}
                  onChange={(e) => setCharPhysicalDescription(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 min-h-[60px] resize-none"
                  maxLength={500}
                />
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Wardrobe</Label>
                <Input
                  placeholder="e.g. White lab coat over blue button-down shirt"
                  value={charWardrobe}
                  onChange={(e) => setCharWardrobe(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1 block">Personality / Expression Notes</Label>
                <Input
                  placeholder="e.g. Confident smile, warm and approachable demeanor"
                  value={charPersonality}
                  onChange={(e) => setCharPersonality(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              {charGeneratedImageUrl && (
                <div className="space-y-2">
                  <Label className="text-sm text-gray-400 block">Generated Reference</Label>
                  <div className="relative rounded-lg overflow-hidden border border-gray-700 w-48 h-48 mx-auto">
                    <img src={charGeneratedImageUrl} alt={charName} className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerateCharacter}
                  disabled={isGeneratingCharacter || !charName.trim() || !charPhysicalDescription.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isGeneratingCharacter ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Character
                    </>
                  )}
                </Button>

                {charGeneratedImageUrl && !charSavedToLibrary && (
                  <Button
                    onClick={handleSaveCharacterToLibrary}
                    disabled={isSavingCharacter}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSavingCharacter ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save to Library
                  </Button>
                )}

                {charSavedToLibrary && (
                  <Button disabled className="bg-green-800 text-green-300 cursor-default">
                    <Check className="h-4 w-4 mr-1" />
                    Saved
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === 'character-performance' && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-700 bg-gray-900">
              <div>
                <Label className="text-sm text-gray-300">Body Control</Label>
                <p className="text-[10px] text-gray-500">Enable full body motion transfer (not just face)</p>
              </div>
              <Switch
                checked={bodyControl}
                onCheckedChange={setBodyControl}
              />
            </div>
          )}

          {cfg.category !== 'toolkit' && mode !== 'character-performance' && mode !== 'character' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-400 mb-1.5 block">Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {getProviders().map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-white hover:bg-gray-800">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-gray-400 mb-1.5 block">Aspect Ratio</Label>
                <div className="flex gap-1.5">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => setAspectRatio(ar.id)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-all ${
                        aspectRatio === ar.id
                          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                          : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600'
                      }`}
                      title={ar.desc}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {cfg.outputType === 'video' && cfg.category !== 'toolkit' && mode !== 'character-performance' && mode !== 'character' && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Duration</Label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={`px-4 py-1.5 rounded text-sm font-medium border transition-all ${
                      duration === d.value
                        ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                        : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(mode === 'i2v' || mode === 't2v') && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">
                Negative Prompt <span className="text-gray-600 font-normal">(optional)</span>
              </Label>
              <Textarea
                placeholder="e.g. text distortion, label warping, bottle deformation, blurry, shaking, fast movement, people"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 min-h-[48px] resize-none text-xs"
                maxLength={500}
              />
              <p className="text-[10px] text-gray-500 mt-1">Tell the AI what to avoid. Suzzie can suggest these for you.</p>
            </div>
          )}

          {mode === 'i2v' && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">
                Image Fidelity: {Math.round(imageFidelity * 100)}%
              </Label>
              <Slider
                value={[imageFidelity]}
                onValueChange={([v]) => setImageFidelity(v)}
                min={0.1}
                max={1.0}
                step={0.05}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Creative freedom</span>
                <span>Lock source geometry</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {imageFidelity >= 0.8
                  ? 'High fidelity — preserves product shape, labels, and geometry from the source image.'
                  : imageFidelity >= 0.5
                    ? 'Balanced — some creative freedom while maintaining general composition.'
                    : 'Creative — allows significant reinterpretation of the source image.'}
              </p>
            </div>
          )}

          {mode === 't2i' && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {IMAGE_STYLES.map((s) => (
                    <SelectItem key={s} value={s} className="text-white hover:bg-gray-800">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode !== 'character' && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canSubmit}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {cfg.category === 'toolkit' ? `Process ${cfg.label}` : `Generate ${cfg.label}`}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
      )}
    </Dialog>
  );
}
