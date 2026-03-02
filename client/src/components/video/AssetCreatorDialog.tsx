import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';

type GenerationMode = 't2i' | 't2v' | 'i2v';

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

const MODE_CONFIG: Record<GenerationMode, { label: string; icon: any; description: string }> = {
  t2i: { label: 'Text to Image', icon: Image, description: 'Generate an image from a text prompt' },
  t2v: { label: 'Text to Video', icon: Video, description: 'Generate a video clip from a text prompt' },
  i2v: { label: 'Image to Video', icon: ImagePlus, description: 'Animate a reference image into video' },
};

export function AssetCreatorDialog({ open, onOpenChange, onJobStarted }: AssetCreatorDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<GenerationMode>('t2v');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [style, setStyle] = useState('Photorealistic');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  const providers = mode === 't2i' ? IMAGE_PROVIDERS : VIDEO_PROVIDERS;

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingRef(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/videos/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        setReferenceImageUrl(data.url);
        setReferenceImagePreview(data.url);
        toast({ title: 'Image uploaded', description: 'Reference image ready for animation.' });
      }
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Could not upload reference image.', variant: 'destructive' });
    } finally {
      setIsUploadingRef(false);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', description: 'Please enter a description for your asset.', variant: 'destructive' });
      return;
    }

    if (mode === 'i2v' && !referenceImageUrl) {
      toast({ title: 'Reference image required', description: 'Please upload or paste a reference image URL for Image to Video.', variant: 'destructive' });
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

      if (mode !== 't2i') {
        body.duration = duration;
      }

      if (mode === 't2i') {
        body.style = style;
      }

      if (mode === 'i2v') {
        body.referenceImageUrl = referenceImageUrl;
      }

      const res = await apiRequest('POST', '/api/asset-library/generate', body);
      const data = await res.json();

      toast({
        title: 'Generation started',
        description: `Your ${MODE_CONFIG[mode].label.toLowerCase()} is being created. It will appear in the library when ready.`,
      });

      onJobStarted?.(data.jobId);
      onOpenChange(false);

      setPrompt('');
      setReferenceImageUrl('');
      setReferenceImagePreview(null);
    } catch (err: any) {
      toast({
        title: 'Generation failed',
        description: err.message || 'Could not start generation.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Create Asset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-sm text-gray-400 mb-2 block">Generation Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MODE_CONFIG) as GenerationMode[]).map((m) => {
                const config = MODE_CONFIG[m];
                const Icon = config.icon;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setProvider('auto');
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                      mode === m
                        ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                        : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{MODE_CONFIG[mode].description}</p>
          </div>

          <div>
            <Label htmlFor="prompt" className="text-sm text-gray-400 mb-1.5 block">
              Prompt
            </Label>
            <Textarea
              id="prompt"
              placeholder={
                mode === 't2i'
                  ? 'Describe the image you want to create...'
                  : mode === 't2v'
                    ? 'Describe the video scene you want to generate...'
                    : 'Describe how you want the image to be animated...'
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 min-h-[80px] resize-none"
              maxLength={2000}
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-gray-600">{prompt.length}/2000</span>
            </div>
          </div>

          {mode === 'i2v' && (
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Reference Image</Label>
              {referenceImagePreview ? (
                <div className="relative rounded-lg overflow-hidden border border-gray-700 w-40 h-24">
                  <img src={referenceImagePreview} alt="Reference" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      setReferenceImageUrl('');
                      setReferenceImagePreview(null);
                    }}
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
                    onChange={(e) => {
                      setReferenceImageUrl(e.target.value);
                      if (e.target.value) setReferenceImagePreview(e.target.value);
                    }}
                    className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingRef}
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    {isUploadingRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReferenceUpload}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-400 mb-1.5 block">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {providers.map((p) => (
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

          {mode !== 't2i' && (
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
            disabled={isSubmitting || !prompt.trim() || (mode === 'i2v' && !referenceImageUrl)}
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
