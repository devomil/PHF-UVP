import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Upload,
  Trash2,
  RefreshCw,
  Music,
  Image,
  FileText,
  CloudUpload,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  HardDrive,
  Volume2,
  Award,
  Layers,
  Type,
  Film,
  Info,
  FolderOpen,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface S3File {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  url: string;
  contentType: string;
}

interface AssetCategory {
  prefix: string;
  label: string;
  accept: string;
}

type CategoryKey = 'sfx' | 'music' | 'logos' | 'badges' | 'overlays' | 'end-cards' | 'intro-backgrounds' | 'fonts';

const CATEGORY_ICONS: Record<CategoryKey, typeof Music> = {
  'sfx': Volume2,
  'music': Music,
  'logos': Image,
  'badges': Award,
  'overlays': Layers,
  'end-cards': Film,
  'intro-backgrounds': Film,
  'fonts': Type,
};

const EXPECTED_FILES: Record<CategoryKey, { name: string; description: string; required: boolean }[]> = {
  'sfx': [
    { name: 'whoosh-soft.mp3', description: 'Soft transition whoosh (fade, film-burn)', required: true },
    { name: 'whoosh-medium.mp3', description: 'Medium transition (slide, wipe)', required: false },
    { name: 'whoosh-dramatic.mp3', description: 'Heavy transition (zoom, whip-pan)', required: false },
    { name: 'rise-swell.mp3', description: 'Rising build-up before key moments', required: true },
    { name: 'rise-tension.mp3', description: 'Tension build-up effect', required: false },
    { name: 'logo-impact.mp3', description: 'Sound when logo appears on screen', required: true },
    { name: 'impact-deep.mp3', description: 'Deep impact hit for emphasis', required: false },
    { name: 'impact-soft.mp3', description: 'Soft impact accent', required: false },
    { name: 'room-tone-warm.mp3', description: 'Warm ambient background loop', required: true },
    { name: 'room-tone-nature.mp3', description: 'Nature ambient background loop', required: true },
    { name: 'ambient-nature.mp3', description: 'Nature ambience track', required: false },
    { name: 'ambient-wellness.mp3', description: 'Calm/wellness ambience', required: false },
    { name: 'ambient-energy.mp3', description: 'Energetic ambient layer', required: false },
  ],
  'music': [
    { name: 'background-upbeat.mp3', description: 'Upbeat background track for energetic scenes', required: true },
    { name: 'background-calm.mp3', description: 'Calm background music for professional tone', required: true },
    { name: 'intro-theme.mp3', description: 'Opening theme music for video intros', required: true },
    { name: 'outro-theme.mp3', description: 'Closing theme music for video outros', required: true },
    { name: 'background-corporate.mp3', description: 'Corporate/business style background', required: false },
    { name: 'background-cinematic.mp3', description: 'Cinematic/dramatic background score', required: false },
    { name: 'background-playful.mp3', description: 'Fun/playful background music', required: false },
    { name: 'transition-sting.mp3', description: 'Short musical sting between sections', required: false },
  ],
  'logos': [
    { name: 'primary.png', description: 'Main brand logo (transparent background)', required: true },
    { name: 'primary-dark.png', description: 'Logo variant for dark backgrounds', required: true },
    { name: 'primary-light.png', description: 'Logo variant for light backgrounds', required: true },
    { name: 'icon.png', description: 'Square icon/mark only (no text)', required: true },
    { name: 'wordmark.png', description: 'Text-only logo version', required: false },
    { name: 'watermark.png', description: 'Semi-transparent watermark version', required: false },
    { name: 'animated-logo.webp', description: 'Animated logo (WebP/APNG)', required: false },
  ],
  'badges': [
    { name: 'award-badge.png', description: 'Primary award or recognition badge', required: false },
    { name: 'certified-badge.png', description: 'Certification/compliance badge', required: false },
    { name: 'best-seller.png', description: 'Best seller or top-rated badge', required: false },
    { name: 'verified-badge.png', description: 'Verified/authenticated badge', required: false },
    { name: 'quality-seal.png', description: 'Quality assurance seal', required: false },
    { name: 'partner-badge.png', description: 'Partnership or affiliation badge', required: false },
  ],
  'overlays': [
    { name: 'watermark.png', description: 'Brand watermark overlay (semi-transparent)', required: true },
    { name: 'lower-third.png', description: 'Lower third title bar template', required: true },
    { name: 'frame-border.png', description: 'Decorative frame border overlay', required: false },
    { name: 'corner-logo.png', description: 'Corner-positioned logo overlay', required: false },
    { name: 'subscribe-cta.png', description: 'Subscribe/follow call-to-action overlay', required: false },
    { name: 'social-bar.png', description: 'Social media handles bar overlay', required: false },
  ],
  'end-cards': [
    { name: 'background-default.png', description: 'Default end card background (1920x1080)', required: true },
    { name: 'background-dark.png', description: 'Dark variant end card background', required: false },
    { name: 'background-branded.png', description: 'Branded end card with logo placement', required: false },
    { name: 'cta-subscribe.png', description: 'Subscribe button overlay for end card', required: false },
    { name: 'cta-visit-website.png', description: 'Visit website button overlay', required: false },
    { name: 'social-icons.png', description: 'Social media icons strip for end card', required: false },
  ],
  'intro-backgrounds': [
    { name: 'nature-landscape.jpg', description: 'Nature landscape intro background (1920x1080)', required: false },
    { name: 'abstract-dark.jpg', description: 'Dark abstract intro background', required: false },
    { name: 'cinematic-blur.jpg', description: 'Cinematic bokeh/blur background', required: false },
    { name: 'farm-scenery.jpg', description: 'Farm/countryside scenery background', required: false },
    { name: 'gradient-warm.jpg', description: 'Warm gradient background', required: false },
    { name: 'gradient-cool.jpg', description: 'Cool gradient background', required: false },
  ],
  'fonts': [
    { name: 'heading.ttf', description: 'Primary heading/title font', required: true },
    { name: 'body.ttf', description: 'Body text font', required: true },
    { name: 'accent.ttf', description: 'Accent/decorative font for callouts', required: false },
    { name: 'mono.ttf', description: 'Monospace font for code/data displays', required: false },
    { name: 'script.ttf', description: 'Script/handwriting style font', required: false },
  ],
};

const CATEGORY_FILE_HINTS: Record<CategoryKey, { examples: string[]; hint: string; formatTip: string }> = {
  'sfx': { examples: [], hint: 'Select a required filename from the list above, or type a custom name', formatTip: 'MP3 is recommended for smaller file sizes. WAV for highest quality.' },
  'music': { examples: ['background-upbeat.mp3', 'intro-theme.mp3', 'outro-calm.mp3'], hint: 'Select a target filename below, then pick your audio file', formatTip: 'MP3 (128-320kbps) recommended. Keep files under 10MB for faster rendering.' },
  'logos': { examples: ['primary.png', 'dark.png', 'light.png', 'icon.png', 'wordmark.svg'], hint: 'Select a target filename below, then pick your image file', formatTip: 'PNG with transparent background is best for video overlays. SVG is ideal for perfect scaling at any resolution. Minimum 800px wide recommended.' },
  'badges': { examples: ['organic-certified.png', 'award-2024.png', 'best-seller.png'], hint: 'Select a target filename below, then pick your image file', formatTip: 'PNG with transparent background recommended so badges layer cleanly over video. Minimum 400px wide.' },
  'overlays': { examples: ['watermark.png', 'lower-third.png', 'frame-border.png'], hint: 'Select a target filename below, then pick your image file', formatTip: 'PNG with transparency required for overlays. Match your video resolution (1920x1080 for HD) for best results.' },
  'end-cards': { examples: ['background-default.png', 'background-seasonal.jpg', 'cta-subscribe.png'], hint: 'Select a target filename below, then pick your image file', formatTip: 'PNG or JPG at 1920x1080 recommended. Use PNG for elements with transparency.' },
  'intro-backgrounds': { examples: ['nature-landscape.jpg', 'cinematic-blur.jpg', 'farm-scenery.jpg'], hint: 'Select a target filename below, then pick your image file', formatTip: 'JPG or PNG at 1920x1080 recommended. Multiple backgrounds enable random selection for video variety.' },
  'fonts': { examples: ['heading.ttf', 'body.otf', 'accent.woff2'], hint: 'Select a target filename below, then pick your font file', formatTip: 'TTF or OTF formats work best for video rendering. WOFF/WOFF2 are web-only and may not render in videos.' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function AudioPreview({ fileKey, name }: { fileKey: string; name: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = useCallback(async () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/admin/s3-assets/preview-url?key=${encodeURIComponent(fileKey)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to get preview URL');
        const data = await res.json();
        audioRef.current.src = data.url;
        audioRef.current.load();
      } catch {
        setError(true);
        setLoading(false);
        return;
      }
    }

    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [playing, fileKey]);

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError(true); setLoading(false); }}
        onCanPlayThrough={() => setLoading(false)}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        disabled={loading}
        className={`h-8 w-8 p-0 ${error ? 'text-red-400' : ''}`}
        title={error ? 'Could not play - file may be a silent placeholder' : 'Play audio'}
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <span className="text-sm truncate max-w-[200px]">{name}</span>
      {error && <span className="text-xs text-red-400">(silent/placeholder)</span>}
    </div>
  );
}

function ImagePreview({ fileKey, name }: { fileKey: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/s3-assets/preview-url?key=${encodeURIComponent(fileKey)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setSrc(data.url);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fileKey]);

  return (
    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--surface)" }}>
      {loading && <RefreshCw className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />}
      {error && <XCircle className="h-4 w-4 text-red-400" />}
      {src && !error && (
        <img src={src} alt={name} className="w-full h-full object-contain" onError={() => setError(true)} />
      )}
    </div>
  );
}

interface ValidationResult {
  name: string;
  size: number;
  valid: boolean;
  reason: string;
}

function FileRow({ file, category, onDelete, validation }: { file: S3File; category: CategoryKey; onDelete: (key: string) => void; validation?: ValidationResult }) {
  const isAudio = file.contentType.startsWith('audio/');
  const isImage = file.contentType.startsWith('image/');
  const isInvalid = validation && !validation.valid;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${isInvalid ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}`}
      style={isInvalid ? undefined : { borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isImage && <ImagePreview fileKey={file.key} name={file.name} />}
        {isAudio ? (
          <AudioPreview fileKey={file.key} name={file.name} />
        ) : (
          <span className="text-sm truncate">{file.name}</span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {validation && (
          isInvalid ? (
            <Badge variant="outline" className="text-red-600 border-red-300">
              <XCircle className="h-3 w-3 mr-1" />
              {validation.reason}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-green-600 border-green-300">
              <CheckCircle className="h-3 w-3 mr-1" />
              Valid
            </Badge>
          )
        )}
        <span className="text-xs w-16 text-right" style={{ color: "var(--text-secondary)" }}>{formatFileSize(file.size)}</span>
        <span className="text-xs w-32 text-right hidden md:block" style={{ color: "var(--text-muted)" }}>{formatDate(file.lastModified)}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={() => onDelete(file.key)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface PendingUpload {
  file: File;
  saveName: string;
}

function UploadDialog({
  open,
  onOpenChange,
  category,
  categoryData,
  existingFiles,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryKey;
  categoryData: AssetCategory | undefined;
  existingFiles: S3File[];
  onUpload: (uploads: PendingUpload[]) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [fileTarget, setFileTarget] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingNames = new Set(existingFiles.map(f => f.name));
  const prefix = categoryData?.prefix || '';
  const expectedFiles = EXPECTED_FILES[category] || [];
  const hasExpectedFiles = expectedFiles.length > 0;
  const hints = CATEGORY_FILE_HINTS[category];

  const getFileExtension = (filename: string) => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : '';
  };

  const pendingNames = new Set(pendingUploads.map(p => p.saveName.toLowerCase()));

  const isDuplicate = (name: string) => {
    const lower = name.toLowerCase();
    return existingNames.has(name) || pendingNames.has(lower);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);

    if (hasExpectedFiles) {
      setSelectedFiles([fileArr[0]]);
      if (!fileTarget) {
        const matchingExpected = expectedFiles.find(e => e.name === fileArr[0].name);
        if (matchingExpected) setFileTarget(matchingExpected.name);
      }
    } else {
      const newPending: PendingUpload[] = fileArr.map(f => {
        const ext = getFileExtension(f.name);
        const baseName = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
        return { file: f, saveName: `${baseName}${ext}` };
      });
      setPendingUploads(prev => [...prev, ...newPending]);
    }
  };

  const addFileUpload = () => {
    if (!fileTarget || selectedFiles.length === 0) return;
    const file = selectedFiles[0];
    const ext = getFileExtension(fileTarget) || getFileExtension(file.name);
    const finalName = fileTarget.includes('.') ? fileTarget : `${fileTarget}${ext}`;

    if (pendingUploads.some(p => p.saveName === finalName)) return;

    setPendingUploads(prev => [...prev, { file, saveName: finalName }]);
    setSelectedFiles([]);
    setFileTarget('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (index: number) => {
    setPendingUploads(prev => prev.filter((_, i) => i !== index));
  };

  const updateSaveName = (index: number, newName: string) => {
    setPendingUploads(prev => prev.map((p, i) => i === index ? { ...p, saveName: newName } : p));
  };

  const hasInvalidNames = pendingUploads.some(p => {
    const trimmed = p.saveName.trim();
    return !trimmed || trimmed === '.' || !trimmed.includes('.');
  });

  const hasDuplicatesInQueue = (() => {
    const seen = new Set<string>();
    for (const p of pendingUploads) {
      const lower = p.saveName.toLowerCase();
      if (seen.has(lower)) return true;
      seen.add(lower);
    }
    return false;
  })();

  const handleConfirmUpload = () => {
    if (pendingUploads.length === 0 || hasInvalidNames || hasDuplicatesInQueue) return;
    onUpload(pendingUploads);
    setPendingUploads([]);
    setSelectedFiles([]);
    setFileTarget('');
    onOpenChange(false);
  };

  const resetDialog = () => {
    setPendingUploads([]);
    setSelectedFiles([]);
    setFileTarget('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload to {categoryData?.label || category}
          </DialogTitle>
          <DialogDescription>
            Files will be saved to <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>{prefix}</code> on S3
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasExpectedFiles && (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">Required filenames for the video renderer</p>
                    <p>Select a target filename below, then pick your file. The renderer expects these exact names.</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-0.5">Recommended Format</p>
                    <p>{hints.formatTip}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                {expectedFiles.map(ef => {
                  const isUploaded = existingNames.has(ef.name);
                  const isPending = pendingUploads.some(p => p.saveName === ef.name);
                  return (
                    <div
                      key={ef.name}
                      className={`flex items-center justify-between p-2 rounded border text-sm cursor-pointer transition-colors ${
                        fileTarget === ef.name
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                          : isPending
                          ? 'border-green-300 bg-green-50 dark:bg-green-950/20'
                          : isUploaded
                          ? 'opacity-60'
                          : ''
                      }`}
                      style={
                        fileTarget === ef.name || isPending
                          ? undefined
                          : { borderColor: "var(--border-subtle)" }
                      }
                      onClick={() => !isPending && setFileTarget(ef.name)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>{ef.name}</code>
                        <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{ef.description}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ef.required && !isUploaded && !isPending && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5">Required</Badge>
                        )}
                        {isPending && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5">
                            <CheckCircle className="h-3 w-3 mr-0.5" /> Queued
                          </Badge>
                        )}
                        {isUploaded && !isPending && (
                          <Badge variant="outline" className="text-[10px] px-1.5" style={{ color: "var(--text-secondary)", borderColor: "var(--border-medium)" }}>Uploaded</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {fileTarget && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: "var(--surface)" }}>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                      Saving as: <code className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: "var(--surface)", color: "var(--text-primary)" }}>{prefix}{fileTarget}</code>
                      {existingNames.has(fileTarget) && <span className="text-amber-600 ml-2">(will replace existing)</span>}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={categoryData?.accept || '*'}
                      className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Select a file for this asset</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={addFileUpload}
                    disabled={selectedFiles.length === 0}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}

          {!hasExpectedFiles && (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">{hints.hint}</p>
                    <p>Examples: {hints.examples.join(', ')}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-0.5">Recommended Format</p>
                    <p>{hints.formatTip}</p>
                  </div>
                </div>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                style={{ borderColor: "var(--border-medium)" }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFilesSelected(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={categoryData?.accept || '*'}
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <Upload className="h-8 w-8 mx-auto" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm font-medium mt-2">Drag & drop files here, or click to browse</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Accepted: {categoryData?.accept || 'any'}</p>
              </div>
            </div>
          )}

          {pendingUploads.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Files to Upload ({pendingUploads.length})
              </Label>
              {pendingUploads.map((pu, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Original:</span>
                      <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{pu.file.name}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>({formatFileSize(pu.file.size)})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>{prefix}</span>
                      {hasExpectedFiles ? (
                        <code className="text-xs font-mono text-blue-600 dark:text-blue-400">{pu.saveName}</code>
                      ) : (
                        <Input
                          value={pu.saveName}
                          onChange={(e) => updateSaveName(idx, e.target.value)}
                          className={`h-7 text-xs font-mono flex-1 ${!pu.saveName.trim() || !pu.saveName.includes('.') ? 'border-red-400' : existingNames.has(pu.saveName) ? 'border-amber-400' : ''}`}
                          placeholder="filename.ext"
                        />
                      )}
                    </div>
                    {!pu.saveName.trim() && (
                      <span className="text-[10px] text-red-500">Filename is required</span>
                    )}
                    {pu.saveName.trim() && !pu.saveName.includes('.') && (
                      <span className="text-[10px] text-red-500">Include file extension (e.g., .png, .mp3)</span>
                    )}
                    {existingNames.has(pu.saveName) && (
                      <span className="text-[10px] text-amber-600">Will replace existing file</span>
                    )}
                    <div className="text-[10px] font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded inline-block">
                      S3: {prefix}{pu.saveName}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                    onClick={() => removePending(idx)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={() => { resetDialog(); onOpenChange(false); }}>Cancel</Button>
          <div className="flex items-center gap-2">
            {hasDuplicatesInQueue && (
              <span className="text-xs text-red-500">Duplicate filenames in queue</span>
            )}
            {hasInvalidNames && (
              <span className="text-xs text-red-500">Fix invalid filenames</span>
            )}
            <Button
              onClick={handleConfirmUpload}
              disabled={pendingUploads.length === 0 || hasInvalidNames || hasDuplicatesInQueue}
              className="gap-2"
            >
              <CloudUpload className="h-4 w-4" />
              Upload {pendingUploads.length} File{pendingUploads.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function S3AssetManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('sfx');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [validating, setValidating] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const categoriesQuery = useQuery<Record<CategoryKey, AssetCategory>>({
    queryKey: ['/api/admin/s3-assets/categories'],
    queryFn: async () => {
      const res = await fetch('/api/admin/s3-assets/categories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load categories');
      return res.json();
    },
  });

  const filesQuery = useQuery<S3File[]>({
    queryKey: ['/api/admin/s3-assets/list', activeCategory],
    queryFn: async () => {
      const res = await fetch(`/api/admin/s3-assets/list?category=${activeCategory}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load files');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest('POST', '/api/admin/s3-assets/delete', { key });
      return res.json();
    },
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/s3-assets/list', activeCategory] });
      toast({ title: 'File Deleted', description: `Removed ${key.split('/').pop()}` });
      setDeleteKey(null);
    },
    onError: (err: any) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleConfirmedUpload = useCallback(async (uploads: PendingUpload[]) => {
    if (uploads.length === 0) return;
    const category = categoriesQuery.data?.[activeCategory];
    if (!category) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadingFiles(uploads.map(u => u.saveName));

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uploads.length; i++) {
      const { file, saveName } = uploads[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', activeCategory);
        formData.append('fileName', saveName);

        const res = await fetch('/api/admin/s3-assets/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errData.error || `Upload failed: ${res.status}`);
        }
        successCount++;
      } catch (err: any) {
        console.error(`[S3Upload] Failed: ${saveName}`, err);
        failCount++;
      }
      setUploadProgress(Math.round(((i + 1) / uploads.length) * 100));
    }

    setUploading(false);
    setUploadingFiles([]);
    queryClient.invalidateQueries({ queryKey: ['/api/admin/s3-assets/list', activeCategory] });

    if (failCount === 0) {
      toast({ title: 'Upload Complete', description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded to ${category.label}` });
    } else {
      toast({ title: 'Upload Partially Failed', description: `${successCount} uploaded, ${failCount} failed`, variant: 'destructive' });
    }
  }, [activeCategory, categoriesQuery.data, queryClient, toast]);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const res = await apiRequest('POST', '/api/admin/s3-assets/validate', { category: activeCategory });
      const data = await res.json();
      const map: Record<string, ValidationResult> = {};
      for (const f of data.files) {
        map[f.name] = f;
      }
      setValidationResults(map);
      const invalidCount = data.files.filter((f: ValidationResult) => !f.valid).length;
      if (invalidCount === 0) {
        toast({ title: 'All Files Valid', description: `${data.fileCount} files passed validation` });
      } else {
        toast({ title: 'Validation Complete', description: `${invalidCount} of ${data.fileCount} files need replacement`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Validation Failed', description: err.message, variant: 'destructive' });
    }
    setValidating(false);
  }, [activeCategory, toast]);

  const categories = categoriesQuery.data || {} as Record<CategoryKey, AssetCategory>;
  const files = filesQuery.data || [];
  const currentCategory = (categories as Record<string, AssetCategory>)[activeCategory];
  const invalidCount = Object.values(validationResults).filter(v => !v.valid).length;
  const validCount = Object.values(validationResults).filter(v => v.valid).length;

  return (
    <Card style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              S3 Render Assets
            </CardTitle>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Manage files on AWS S3 used by the video rendering pipeline (sound effects, logos, badges, etc.)
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={validating || files.length === 0}
            >
              {validating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Validate Files
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { filesQuery.refetch(); setValidationResults({}); }}
              disabled={filesQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${filesQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeCategory} onValueChange={(v) => { setActiveCategory(v as CategoryKey); setValidationResults({}); }}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {(Object.entries(categories) as [CategoryKey, AssetCategory][]).map(([key, cat]) => {
              const Icon = CATEGORY_ICONS[key] || FileText;
              return (
                <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {cat.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(categories) as CategoryKey[]).map(key => (
            <TabsContent key={key} value={key} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary">{files.length} file{files.length !== 1 ? 's' : ''}</Badge>
                  {Object.keys(validationResults).length > 0 && validCount > 0 && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {validCount} valid
                    </Badge>
                  )}
                  {Object.keys(validationResults).length > 0 && invalidCount > 0 && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      <XCircle className="h-3 w-3 mr-1" />
                      {invalidCount} need replacement
                    </Badge>
                  )}
                </div>
                <Button onClick={() => setUploadDialogOpen(true)} className="gap-2" disabled={uploading}>
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
              </div>

              {uploading && (
                <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <CloudUpload className="h-5 w-5 text-blue-500 animate-pulse" />
                    <p className="text-sm font-medium">Uploading {uploadingFiles.length} file{uploadingFiles.length > 1 ? 's' : ''}...</p>
                  </div>
                  <Progress value={uploadProgress} className="max-w-md" />
                  <div className="text-xs space-y-0.5" style={{ color: "var(--text-secondary)" }}>
                    {uploadingFiles.map((name, i) => (
                      <div key={i} className="font-mono">{currentCategory?.prefix}{name}</div>
                    ))}
                  </div>
                </div>
              )}

              {filesQuery.isLoading ? (
                <div className="text-center py-8" style={{ color: "var(--text-secondary)" }}>Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No files in this category yet</p>
                  <p className="text-xs mt-1">Click "Upload Files" to add assets</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map(file => (
                    <FileRow
                      key={file.key}
                      file={file}
                      category={activeCategory}
                      onDelete={(k) => setDeleteKey(k)}
                      validation={validationResults[file.name]}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <UploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          category={activeCategory}
          categoryData={currentCategory}
          existingFiles={files}
          onUpload={handleConfirmedUpload}
        />

        <Dialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
          <DialogContent style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteKey?.split('/').pop()}</strong>? This cannot be undone and may affect video rendering if this file is currently in use.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteKey(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
