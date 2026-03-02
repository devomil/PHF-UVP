import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
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
} from 'lucide-react';

type GenerationMode = 't2i' | 't2v' | 'i2v' | 'i2i' | 'v2v';

interface AssetCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobStarted?: (jobId: string) => void;
}

const VIDEO_PROVIDERS = [
  { id: 'auto', name: 'Auto (Best Match)' },
  { id: 'kling-2.6', name: 'Kling 2.6' },
  { id: 'kling-2.6-pro', name: 'Kling 2.6 Pro' },
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
];

const IMAGE_PROVIDERS = [
  { id: 'auto', name: 'Auto (Best Match)' },
  { id: 'flux-schnell', name: 'Flux Schnell' },
  { id: 'flux-dev', name: 'Flux Dev' },
  { id: 'ideogram', name: 'Ideogram' },
];

const V2V_PROVIDERS = [
  { id: 'auto', name: 'Auto (Kling V2V)' },
  { id: 'kling-2.6', name: 'Kling 2.6' },
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

const MODE_CONFIG: Record<GenerationMode, { label: string; shortLabel: string; icon: any; description: string; outputType: 'image' | 'video' }> = {
  t2i: { label: 'Text to Image', shortLabel: 'T2I', icon: Image, description: 'Generate an image from a text prompt', outputType: 'image' },
  t2v: { label: 'Text to Video', shortLabel: 'T2V', icon: Video, description: 'Generate a video clip from a text prompt', outputType: 'video' },
  i2v: { label: 'Image to Video', shortLabel: 'I2V', icon: ImagePlus, description: 'Animate a reference image into video', outputType: 'video' },
  i2i: { label: 'Image to Image', shortLabel: 'I2I', icon: Layers, description: 'Transform an image with style transfer or edits', outputType: 'image' },
  v2v: { label: 'Video to Video', shortLabel: 'V2V', icon: Film, description: 'Transform a video with object replacement or style changes', outputType: 'video' },
};

const MODE_ORDER: GenerationMode[] = ['t2i', 't2v', 'i2v', 'i2i', 'v2v'];

function needsReferenceImage(mode: GenerationMode): boolean {
  return mode === 'i2v' || mode === 'i2i';
}

function needsReferenceVideo(mode: GenerationMode): boolean {
  return mode === 'v2v';
}

function needsReplacementImage(mode: GenerationMode): boolean {
  return mode === 'v2v';
}

function outputsVideo(mode: GenerationMode): boolean {
  return mode === 't2v' || mode === 'i2v' || mode === 'v2v';
}

function outputsImage(mode: GenerationMode): boolean {
  return mode === 't2i' || mode === 'i2i';
}

export function AssetCreatorDialog({ open, onOpenChange, onJobStarted }: AssetCreatorDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<GenerationMode>('t2v');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [style, setStyle] = useState('Photorealistic');
  const [strength, setStrength] = useState(0.6);
  const [useCase, setUseCase] = useState('style-transfer');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [replacementImageUrl, setReplacementImageUrl] = useState('');
  const [replacementImagePreview, setReplacementImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);

  const getProviders = () => {
    if (outputsImage(mode)) return IMAGE_PROVIDERS;
    if (mode === 'v2v') return V2V_PROVIDERS;
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

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', description: 'Please enter a description.', variant: 'destructive' });
      return;
    }

    if (needsReferenceImage(mode) && !referenceImageUrl) {
      toast({ title: 'Reference image required', variant: 'destructive' });
      return;
    }

    if (needsReferenceVideo(mode) && !referenceVideoUrl) {
      toast({ title: 'Reference video required', variant: 'destructive' });
      return;
    }

    if (needsReplacementImage(mode) && !replacementImageUrl) {
      toast({ title: 'Replacement image required', description: 'Upload or paste the image of the object to insert.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const body: any = {
        mode,
        prompt: prompt.trim(),
        provider: provider || 'auto',
        aspectRatio,
      };

      if (outputsVideo(mode)) body.duration = duration;
      if (mode === 't2i') body.style = style;
      if (needsReferenceImage(mode)) body.referenceImageUrl = referenceImageUrl;
      if (needsReferenceVideo(mode)) body.referenceVideoUrl = referenceVideoUrl;
      if (needsReplacementImage(mode)) body.referenceImageUrl = replacementImageUrl;
      if (mode === 'i2i') {
        body.strength = strength;
        body.useCase = useCase;
      }

      const res = await apiRequest('POST', '/api/asset-library/generate', body);
      const data = await res.json();

      toast({
        title: 'Generation started',
        description: `Your ${MODE_CONFIG[mode].label.toLowerCase()} is being created.`,
      });

      onJobStarted?.(data.jobId);
      onOpenChange(false);
      setPrompt('');
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

  const canSubmit = prompt.trim() &&
    (!needsReferenceImage(mode) || referenceImageUrl) &&
    (!needsReferenceVideo(mode) || referenceVideoUrl) &&
    (!needsReplacementImage(mode) || replacementImageUrl);

  const promptPlaceholders: Record<GenerationMode, string> = {
    t2i: 'Describe the image you want to create...',
    t2v: 'Describe the video scene you want to generate...',
    i2v: 'Describe how you want the image to be animated...',
    i2i: 'Describe the transformation you want to apply...',
    v2v: 'Describe the changes or object replacement for the video...',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] bg-gray-950 border-gray-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Create Asset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-sm text-gray-400 mb-2 block">Generation Mode</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {MODE_ORDER.map((m) => {
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
            <p className="text-xs text-gray-500 mt-1.5">{MODE_CONFIG[mode].description}</p>
          </div>

          <div>
            <Label htmlFor="prompt" className="text-sm text-gray-400 mb-1.5 block">Prompt</Label>
            <Textarea
              id="prompt"
              placeholder={promptPlaceholders[mode]}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 min-h-[80px] resize-none"
              maxLength={2000}
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-gray-600">{prompt.length}/2000</span>
            </div>
          </div>

          {needsReferenceImage(mode) && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">
                {mode === 'i2i' ? 'Source Image' : 'Reference Image'}
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

          {needsReferenceVideo(mode) && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Source Video</Label>
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

          {needsReplacementImage(mode) && (
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

          {outputsVideo(mode) && (
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

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Generation...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate {MODE_CONFIG[mode].label}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
