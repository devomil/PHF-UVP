import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image, Info, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Palette, Users, UserCheck, Upload, X, ImagePlus, Film, Loader2, AlertCircle } from "lucide-react";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { CharacterProfilesPanel } from "@/components/video/character-profiles-panel";
import { AssetSuzzieChat } from "@/components/video/AssetSuzzieChat";
import { getAvailableStyles } from "@shared/visual-style-config";
import { getAllVisualArtPresets, isStylizedPreset, type VisualArtPreset } from "@shared/config/visual-art-presets";
import { getAllProjectTypes, getProjectType, CONTENT_STRUCTURES } from "@shared/config/project-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Mode = null | "ai-script" | "custom-script" | "quick-create";

const platformAspectMap: Record<string, string> = {
  YouTube: "16:9",
  Facebook: "16:9",
  Website: "16:9",
  TikTok: "9:16",
  "Instagram Reels": "9:16",
  "Instagram Post": "1:1",
};

const ART_PRESET_IMAGES: Record<string, string> = {
  '3d-illustration': '/art-presets/3d-illustration.png',
  'cinematic-realism': '/art-presets/cinematic-realism.png',
  '2d-line-art': '/art-presets/2d-line-art.png',
  'collage': '/art-presets/collage.png',
  'claymation': '/art-presets/claymation.png',
  'neon-futuristic': '/art-presets/neon-futuristic.png',
  'watercolor': '/art-presets/watercolor.png',
  'minimalist-flat': '/art-presets/minimalist-flat.png',
  'scientific-medical': '/art-presets/scientific-medical.png',
};

function ArtStyleSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const presets = getAllVisualArtPresets();

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Palette className="w-4 h-4 text-purple-400" />
        <Label style={{ color: "var(--text-secondary)" }}>Art Style</Label>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Choose a visual art direction that applies consistently across all scenes
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
        <button
          type="button"
          onClick={() => onChange("auto")}
          className="flex-shrink-0 w-[140px] rounded-xl border-2 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={{
            backgroundColor: value === "auto" ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
            borderColor: value === "auto" ? "rgb(139, 92, 246)" : "var(--border-subtle)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            className="w-full h-16 rounded-lg mb-2 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3), rgba(168,85,247,0.3))",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <span className="font-medium text-xs block" style={{ color: "var(--text-primary)" }}>Auto</span>
          <span className="text-[10px] mt-0.5 block leading-snug" style={{ color: "var(--text-muted)" }}>
            AI picks the best style for your content
          </span>
        </button>

        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className="flex-shrink-0 w-[140px] rounded-xl border-2 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              backgroundColor: value === preset.id ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
              borderColor: value === preset.id ? "rgb(139, 92, 246)" : "var(--border-subtle)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              className="w-full h-16 rounded-lg mb-2 overflow-hidden"
              style={{
                border: `1px solid ${preset.thumbnailColors[0]}33`,
              }}
            >
              <img
                src={ART_PRESET_IMAGES[preset.id] || ''}
                alt={preset.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <span className="font-medium text-xs block truncate" style={{ color: "var(--text-primary)" }}>{preset.name}</span>
            <span className="text-[10px] mt-0.5 block leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {preset.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ModeSelection({ onSelect }: { onSelect: (mode: Mode) => void }) {
  const modes = [
    {
      id: "ai-script" as const,
      icon: Sparkles,
      title: "AI-Generated Script",
      description: "Describe your vision and let AI create a complete script with scenes, narration, and visual directions",
      bestFor: "Full productions, multi-scene videos, marketing campaigns",
      gradient: "from-purple-500/20 to-purple-600/5",
      border: "hover:border-purple-500/50",
      glow: "hover:shadow-purple-500/10",
      iconColor: "text-purple-400",
    },
    {
      id: "custom-script" as const,
      icon: FileText,
      title: "Custom Script",
      description: "Write your own script and break it into scenes with full control over every detail",
      bestFor: "Precise control, existing scripts, specific requirements",
      gradient: "from-blue-500/20 to-blue-600/5",
      border: "hover:border-blue-500/50",
      glow: "hover:shadow-blue-500/10",
      iconColor: "text-blue-400",
    },
    {
      id: "quick-create" as const,
      icon: Zap,
      title: "Quick Create",
      description: "Generate a single video clip or image instantly. Perfect for social media or adding to your asset library",
      bestFor: "Single clips, social posts, quick assets, images",
      gradient: "from-cyan-500/20 to-teal-600/5",
      border: "hover:border-cyan-500/50",
      glow: "hover:shadow-cyan-500/10",
      iconColor: "text-cyan-400",
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Create New Project</h1>
      <p className="mb-8" style={{ color: "var(--text-secondary)" }}>Choose how you want to create your video or image</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <Card
              key={mode.id}
              className={`cursor-pointer transition-all duration-300 ${mode.border} ${mode.glow} hover:shadow-lg hover:-translate-y-1`}
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
              onClick={() => onSelect(mode.id)}
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${mode.gradient} flex items-center justify-center mb-3`}>
                  <Icon className={`w-6 h-6 ${mode.iconColor}`} />
                </div>
                <CardTitle className="text-lg" style={{ color: "var(--text-primary)" }}>{mode.title}</CardTitle>
                <CardDescription className="mt-2" style={{ color: "var(--text-secondary)" }}>{mode.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="text-xs" style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
                  Best for: {mode.bestFor}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AIScriptForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [projectTypeId, setProjectTypeId] = useState("youtube-ad");
  const [contentStructure, setContentStructure] = useState("explainer");
  const [mediaMode, setMediaMode] = useState("video");
  const [videoGenerationMode, setVideoGenerationMode] = useState("auto");
  const [artPresetId, setArtPresetId] = useState("auto");
  const [artPresetUserOverride, setArtPresetUserOverride] = useState(false);
  const [characterConsistency, setCharacterConsistency] = useState(false);
  const [characters, setCharacters] = useState<any[]>([]);
  const [productMediaFile, setProductMediaFile] = useState<File | null>(null);
  const [productMediaPreview, setProductMediaPreview] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const productMediaInputRef = useRef<HTMLInputElement>(null);
  const [productName, setProductName] = useState("");
  const [productProblem, setProductProblem] = useState("");
  const [scriptTone, setScriptTone] = useState("educational");
  const [callToAction, setCallToAction] = useState("learn-more");

  const allProjectTypes = getAllProjectTypes();

  const hasLockedCharacters = characters.some((c: any) => c.locked && c.referenceImageUrl);
  const showCharacterI2V = artPresetId === '3d-illustration' && hasLockedCharacters;

  useEffect(() => {
    if (videoGenerationMode === 'character-i2v' && !showCharacterI2V) {
      setVideoGenerationMode('auto');
    }
  }, [artPresetId, characters, showCharacterI2V, videoGenerationMode]);

  useEffect(() => {
    if (isStylizedPreset(artPresetId)) {
      setCharacterConsistency(true);
    }
  }, [artPresetId]);

  useEffect(() => {
    if (projectTypeId === 'educational' && contentStructure && !artPresetUserOverride) {
      const cs = CONTENT_STRUCTURES.find(s => s.id === contentStructure);
      if (cs) {
        setArtPresetId(cs.defaultArtPreset);
      }
    }
  }, [contentStructure, projectTypeId, artPresetUserOverride]);

  const handleProductMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload JPG, PNG, WEBP, MP4, or MOV files.", variant: "destructive" });
      return;
    }

    if (file.type.startsWith('video/') && file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Video files must be under 100MB.", variant: "destructive" });
      return;
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > 60) {
          toast({ title: "Video too long", description: "Product videos must be 60 seconds or shorter.", variant: "destructive" });
          setProductMediaFile(null);
          setProductMediaPreview(null);
          return;
        }
        setProductMediaFile(file);
        setProductMediaPreview(null);
      };
      video.src = URL.createObjectURL(file);
      return;
    }

    setProductMediaFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setProductMediaPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setProductMediaPreview(null);
    }
  };

  const removeProductMedia = () => {
    setProductMediaFile(null);
    setProductMediaPreview(null);
    if (productMediaInputRef.current) {
      productMediaInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let productMediaUrl: string | undefined;

    if (productMediaFile) {
      setIsUploadingMedia(true);
      try {
        const formData = new FormData();
        formData.append('file', productMediaFile);
        formData.append('category', 'brand-media');
        const uploadRes = await fetch('/api/videos/uploads', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          productMediaUrl = uploadData.url;
        } else {
          toast({ title: "Media upload failed", description: "Your project will be created without product media.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Media upload failed", description: "Your project will be created without product media.", variant: "destructive" });
      } finally {
        setIsUploadingMedia(false);
      }
    }

    const ptConfig = getProjectType(projectTypeId);
    onSubmit({
      mode: "ai-script",
      title,
      description,
      targetAudience,
      duration: ptConfig?.defaultDuration || 60,
      platform: ptConfig?.platform || "YouTube",
      aspectRatio: ptConfig?.aspectRatio || "16:9",
      mediaMode,
      videoGenerationMode: mediaMode === "video" ? videoGenerationMode : undefined,
      qualityTier: ptConfig?.qualityTier || "premium",
      artPresetId,
      characterConsistency,
      characters,
      productMediaUrl,
      projectType: projectTypeId,
      contentStructure: projectTypeId === 'educational' ? contentStructure : undefined,
      scriptPresets: productMediaUrl ? {
        productName: productName || undefined,
        productProblem: productProblem || undefined,
        scriptTone,
        callToAction,
      } : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-purple-400" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>AI-Generated Script</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Project Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter project title" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Description / Brief</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you want your video to be about..." rows={4} className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Product or Brand Media <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
            Upload a product photo or brand asset — AI will analyze it to inform your script
          </p>
          <input
            ref={productMediaInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={handleProductMediaSelect}
            className="hidden"
          />
          {!productMediaFile ? (
            <button
              type="button"
              onClick={() => productMediaInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 transition-colors hover:border-purple-400/50"
              style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}
            >
              <ImagePlus className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Click to upload image or video</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>JPG, PNG, WEBP, MP4, MOV</span>
            </button>
          ) : (
            <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}>
              <div className="flex items-center gap-3 p-3">
                {productMediaPreview ? (
                  <img src={productMediaPreview} alt="Product media" className="w-16 h-16 rounded object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded flex items-center justify-center" style={{ backgroundColor: "var(--input-bg)" }}>
                    <Film className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{productMediaFile.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{(productMediaFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button type="button" onClick={removeProductMedia} className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          )}

          {productMediaFile && (
            <div className="mt-3 space-y-3 p-4 rounded-lg border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-elevated)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Help AI write a better script for your product</p>
              <div>
                <Label className="text-xs" style={{ color: "var(--text-secondary)" }}>Product Name</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g., GlowSerum Pro, FreshBrew Coffee" className="mt-1" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <Label className="text-xs" style={{ color: "var(--text-secondary)" }}>What problem does it solve?</Label>
                <Input value={productProblem} onChange={(e) => setProductProblem(e.target.value)} placeholder="e.g., Dry skin that won't go away, Boring morning coffee routine" className="mt-1" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs" style={{ color: "var(--text-secondary)" }}>Tone</Label>
                  <Select value={scriptTone} onValueChange={setScriptTone}>
                    <SelectTrigger className="mt-1" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                      {[
                        { value: "educational", label: "Educational" },
                        { value: "emotional", label: "Emotional" },
                        { value: "urgency", label: "Urgency" },
                        { value: "humor", label: "Humor" },
                        { value: "aspirational", label: "Aspirational" },
                      ].map((t) => (
                        <SelectItem key={t.value} value={t.value} style={{ color: "var(--text-primary)" }}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs" style={{ color: "var(--text-secondary)" }}>Call to Action</Label>
                  <Select value={callToAction} onValueChange={setCallToAction}>
                    <SelectTrigger className="mt-1" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                      {[
                        { value: "shop-now", label: "Shop Now" },
                        { value: "learn-more", label: "Learn More" },
                        { value: "follow-us", label: "Follow Us" },
                        { value: "book-consultation", label: "Book a Consultation" },
                      ].map((c) => (
                        <SelectItem key={c.value} value={c.value} style={{ color: "var(--text-primary)" }}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <ArtStyleSelector value={artPresetId} onChange={(id: string) => { setArtPresetId(id); setArtPresetUserOverride(true); }} />

        {artPresetId === '3d-illustration' && (
          <CharacterProfilesPanel
            characters={characters}
            onCharactersChange={setCharacters}
          />
        )}

        {mediaMode === "video" && (
          <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}>
            <input type="checkbox" id="charConsistency" checked={characterConsistency} onChange={(e) => setCharacterConsistency(e.target.checked)} className="mt-1 rounded" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--input-bg)" }} />
            <div>
              <Label htmlFor="charConsistency" className="cursor-pointer flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Users className="w-4 h-4 text-purple-400" />
                Character Consistency
              </Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Extract a reference frame from the first scene and use it as an I2V input for all subsequent scenes, keeping characters visually consistent
              </p>
            </div>
          </div>
        )}

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Target Audience</Label>
          <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g., Young professionals, Tech enthusiasts" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Project Type</Label>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>
            Choose a format — aspect ratio, duration, and quality are set automatically
          </p>
          <div className="grid grid-cols-2 gap-2">
            {allProjectTypes.map((pt) => (
              <button
                key={pt.id}
                type="button"
                onClick={() => { setProjectTypeId(pt.id); setArtPresetUserOverride(false); }}
                className="text-left rounded-lg border-2 p-3 transition-all duration-200 hover:border-purple-400/50"
                style={{
                  backgroundColor: projectTypeId === pt.id ? "rgba(139, 92, 246, 0.12)" : "var(--surface)",
                  borderColor: projectTypeId === pt.id ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                }}
              >
                <span className="font-medium text-sm block" style={{ color: "var(--text-primary)" }}>{pt.label}</span>
                <span className="text-[11px] block mt-0.5" style={{ color: "var(--text-muted)" }}>{pt.subtitle}</span>
              </button>
            ))}
          </div>
        </div>

        {projectTypeId === 'educational' && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Content Structure</Label>
            <Select value={contentStructure} onValueChange={setContentStructure}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {CONTENT_STRUCTURES.map((cs) => (
                  <SelectItem key={cs.id} value={cs.id} style={{ color: "var(--text-primary)" }}>{cs.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Media Mode</Label>
          <div className="flex gap-3 mt-1.5">
            <Button type="button" variant={mediaMode === "video" ? "default" : "outline"} className={mediaMode === "video" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""} style={mediaMode !== "video" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setMediaMode("video")}>
              <Video className="w-4 h-4 mr-2" /> Video
            </Button>
            <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} className={mediaMode === "image" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""} style={mediaMode !== "image" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setMediaMode("image")}>
              <Image className="w-4 h-4 mr-2" /> Image-only
            </Button>
          </div>
        </div>

        {mediaMode === "video" && (
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Video Generation Method</Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>How AI creates video for each scene</p>
          <div className="flex gap-3">
            <Button type="button" variant={videoGenerationMode === "direct-t2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "direct-t2v" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""}`} style={videoGenerationMode !== "direct-t2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("direct-t2v")}>
              Direct T2V (faster)
            </Button>
            <Button type="button" variant={videoGenerationMode === "image-first-i2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "image-first-i2v" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""}`} style={videoGenerationMode !== "image-first-i2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("image-first-i2v")}>
              Image then Video (more control)
            </Button>
            {showCharacterI2V && (
              <Button type="button" variant={videoGenerationMode === "character-i2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "character-i2v" ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500" : ""}`} style={videoGenerationMode !== "character-i2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("character-i2v")}>
                <UserCheck className="w-3 h-3 mr-1" /> Character I2V
              </Button>
            )}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            {videoGenerationMode === "character-i2v"
              ? "Uses locked character reference images as I2V inputs for matching scenes, ensuring character consistency across the video."
              : videoGenerationMode === "image-first-i2v" 
              ? "Generates an image first, then animates it into video. Slower but gives you a preview image to approve." 
              : "Creates video directly from your script using 13+ AI video providers. Faster and more cost-effective."}
          </p>
        </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" disabled={isLoading || isUploadingMedia || !title}>
            {isUploadingMedia ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading Media...</>) : isLoading ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface CustomScene {
  id: string;
  type: string;
  title: string;
  narration: string;
}

const SCENE_TYPES = [
  { value: "hook", label: "Opening / Hook", description: "Grabs attention and introduces the video" },
  { value: "intro", label: "Introduction", description: "Sets context and introduces the topic" },
  { value: "benefit", label: "Benefit / Point", description: "Highlights a key benefit or talking point" },
  { value: "feature", label: "Feature / Detail", description: "Showcases a specific feature or detail" },
  { value: "content", label: "Content", description: "General content or storytelling scene" },
  { value: "cta", label: "Call to Action", description: "Encourages the viewer to take action" },
  { value: "outro", label: "Closing / Outro", description: "Wraps up the video with a final message" },
];

function CustomScriptForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [title, setTitle] = useState("");
  const [scenes, setScenes] = useState<CustomScene[]>([
    { id: crypto.randomUUID(), type: "hook", title: "", narration: "" },
  ]);
  const [duration, setDuration] = useState("60");
  const [platform, setPlatform] = useState("YouTube");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [visualStyle, setVisualStyle] = useState("lifestyle");
  const [voiceStyle, setVoiceStyle] = useState("Professional");
  const [mediaMode, setMediaMode] = useState("video");
  const [videoGenerationMode, setVideoGenerationMode] = useState("auto");
  const [artPresetId, setArtPresetId] = useState("auto");
  const [characterConsistency, setCharacterConsistency] = useState(false);
  const [characters, setCharacters] = useState<any[]>([]);

  const hasLockedCharactersCustom = characters.some((c: any) => c.locked && c.referenceImageUrl);
  const showCharacterI2VCustom = artPresetId === '3d-illustration' && hasLockedCharactersCustom;

  useEffect(() => {
    if (videoGenerationMode === 'character-i2v' && !showCharacterI2VCustom) {
      setVideoGenerationMode('auto');
    }
  }, [artPresetId, characters, showCharacterI2VCustom, videoGenerationMode]);

  useEffect(() => {
    setAspectRatio(platformAspectMap[platform] || "16:9");
  }, [platform]);

  useEffect(() => {
    if (isStylizedPreset(artPresetId)) {
      setCharacterConsistency(true);
    }
  }, [artPresetId]);

  const addScene = (type?: string) => {
    const lastScene = scenes[scenes.length - 1];
    const nextType = type || (lastScene?.type === "hook" ? "benefit" : lastScene?.type === "benefit" ? "feature" : "content");
    setScenes([...scenes, { id: crypto.randomUUID(), type: nextType, title: "", narration: "" }]);
  };

  const removeScene = (id: string) => {
    if (scenes.length <= 1) return;
    setScenes(scenes.filter((s) => s.id !== id));
  };

  const updateScene = (id: string, field: keyof CustomScene, value: string) => {
    setScenes(scenes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const moveScene = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= scenes.length) return;
    const updated = [...scenes];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setScenes(updated);
  };

  const hasNarration = scenes.some((s) => s.narration.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalDuration = parseInt(duration);
    const sceneDuration = Math.round(totalDuration / scenes.length);
    onSubmit({
      mode: "custom-script",
      title,
      script: scenes.map((s) => s.narration).join("\n\n"),
      customScenes: scenes.map((s, i) => ({
        id: s.id,
        type: s.type,
        title: s.title || undefined,
        narration: s.narration,
        order: i,
        duration: sceneDuration,
      })),
      numScenes: scenes.length,
      duration: totalDuration,
      platform,
      aspectRatio,
      visualStyle,
      voiceStyle,
      mediaMode,
      videoGenerationMode: mediaMode === "video" ? videoGenerationMode : undefined,
      artPresetId,
      characterConsistency,
      characters,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Custom Script</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Project Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter project title" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <Label style={{ color: "var(--text-secondary)" }}>Scenes ({scenes.length})</Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Add scenes and enter the exact narration for each</p>
            </div>
          </div>

          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="rounded-lg border p-4 transition-all"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--surface-active)", color: "var(--text-secondary)" }}>
                    {index + 1}
                  </span>
                  <Select value={scene.type} onValueChange={(v) => updateScene(scene.id, "type", v)}>
                    <SelectTrigger className="flex-1 h-8 text-sm" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                      {SCENE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} style={{ color: "var(--text-primary)" }}>
                          <div className="flex flex-col">
                            <span>{t.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => moveScene(index, "up")} disabled={index === 0} className="p-1 rounded hover:bg-white/5 disabled:opacity-30 transition-opacity" title="Move up">
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    </button>
                    <button type="button" onClick={() => moveScene(index, "down")} disabled={index === scenes.length - 1} className="p-1 rounded hover:bg-white/5 disabled:opacity-30 transition-opacity" title="Move down">
                      <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    </button>
                    <button type="button" onClick={() => removeScene(scene.id)} disabled={scenes.length <= 1} className="p-1 rounded hover:bg-red-500/10 disabled:opacity-30 transition-all" title="Remove scene">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
                <Input
                  value={scene.title}
                  onChange={(e) => updateScene(scene.id, "title", e.target.value)}
                  placeholder="Scene title (optional)"
                  className="text-sm mb-2"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                />
                <Textarea
                  value={scene.narration}
                  onChange={(e) => updateScene(scene.id, "narration", e.target.value)}
                  placeholder={`Enter narration for ${SCENE_TYPES.find((t) => t.value === scene.type)?.label || "this scene"}...`}
                  rows={3}
                  className="text-sm"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addScene()}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed transition-all hover:border-purple-500/50 hover:bg-purple-500/5"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add Scene</span>
          </button>
        </div>

        <ArtStyleSelector value={artPresetId} onChange={setArtPresetId} />

        {artPresetId === '3d-illustration' && (
          <CharacterProfilesPanel
            characters={characters}
            onCharactersChange={setCharacters}
          />
        )}

        {mediaMode === "video" && (
          <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}>
            <input type="checkbox" id="charConsistencyCustom" checked={characterConsistency} onChange={(e) => setCharacterConsistency(e.target.checked)} className="mt-1 rounded" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--input-bg)" }} />
            <div>
              <Label htmlFor="charConsistencyCustom" className="cursor-pointer flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Users className="w-4 h-4 text-purple-400" />
                Character Consistency
              </Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Extract a reference frame from the first scene and use it as an I2V input for all subsequent scenes, keeping characters visually consistent
              </p>
            </div>
          </div>
        )}

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Target Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
              {["15", "30", "60", "90", "120", "180"].map((d) => (
                <SelectItem key={d} value={d} style={{ color: "var(--text-primary)" }}>{d}s</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["YouTube", "TikTok", "Instagram Reels", "Instagram Post", "Facebook", "Website"].map((p) => (
                  <SelectItem key={p} value={p} style={{ color: "var(--text-primary)" }}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["16:9", "9:16", "1:1"].map((ar) => (
                  <SelectItem key={ar} value={ar} style={{ color: "var(--text-primary)" }}>{ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Visual Style</Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>Style affects AI provider selection, prompt enhancement, and transitions</p>
          <div className="grid grid-cols-3 gap-2">
            {getAvailableStyles().map((s) => (
              <button
                key={s.id}
                type="button"
                className="text-left p-3 rounded-lg border-2 transition-all"
                style={{
                  backgroundColor: visualStyle === s.id ? "var(--surface-active)" : "var(--input-bg)",
                  borderColor: visualStyle === s.id ? "rgb(139, 92, 246)" : "var(--input-border)",
                }}
                onClick={() => setVisualStyle(s.id)}
              >
                <span className="font-medium text-sm block" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                <span className="text-[11px] mt-0.5 block leading-snug" style={{ color: "var(--text-muted)" }}>{s.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Voice Style</Label>
          <Select value={voiceStyle} onValueChange={setVoiceStyle}>
            <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
              {["Professional", "Conversational", "Energetic", "Calm", "Dramatic"].map((s) => (
                <SelectItem key={s} value={s} style={{ color: "var(--text-primary)" }}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Media Mode</Label>
          <div className="flex gap-3 mt-1.5">
            <Button type="button" variant={mediaMode === "video" ? "default" : "outline"} className={mediaMode === "video" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""} style={mediaMode !== "video" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setMediaMode("video")}>
              <Video className="w-4 h-4 mr-2" /> Video
            </Button>
            <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} className={mediaMode === "image" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""} style={mediaMode !== "image" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setMediaMode("image")}>
              <Image className="w-4 h-4 mr-2" /> Image-only
            </Button>
          </div>
        </div>

        {mediaMode === "video" && (
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Video Generation Method</Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>How AI creates video for each scene</p>
          <div className="flex gap-3">
            <Button type="button" variant={videoGenerationMode === "direct-t2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "direct-t2v" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""}`} style={videoGenerationMode !== "direct-t2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("direct-t2v")}>
              Direct T2V (faster)
            </Button>
            <Button type="button" variant={videoGenerationMode === "image-first-i2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "image-first-i2v" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : ""}`} style={videoGenerationMode !== "image-first-i2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("image-first-i2v")}>
              Image then Video (more control)
            </Button>
            {showCharacterI2VCustom && (
              <Button type="button" variant={videoGenerationMode === "character-i2v" ? "default" : "outline"} className={`text-xs ${videoGenerationMode === "character-i2v" ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500" : ""}`} style={videoGenerationMode !== "character-i2v" ? { borderColor: "var(--border-medium)", color: "var(--text-secondary)" } : {}} onClick={() => setVideoGenerationMode("character-i2v")}>
                <UserCheck className="w-3 h-3 mr-1" /> Character I2V
              </Button>
            )}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            {videoGenerationMode === "character-i2v"
              ? "Uses locked character reference images as I2V inputs for matching scenes, ensuring character consistency across the video."
              : videoGenerationMode === "image-first-i2v" 
              ? "Generates an image first, then animates it into video. Slower but gives you a preview image to approve." 
              : "Creates video directly from your script using 13+ AI video providers. Faster and more cost-effective."}
          </p>
        </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" disabled={isLoading || !title}>
            {isLoading ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </div>
    </form>
  );
}

type QuickCreateMode = 't2i' | 't2v' | 'i2v' | 'v2v';

const QC_MODE_CONFIG: Record<QuickCreateMode, { label: string; shortLabel: string; icon: any; description: string; outputType: 'image' | 'video'; needsRefImage: boolean; needsRefVideo: boolean }> = {
  't2i': { label: 'Text to Image', shortLabel: 'T2I', icon: Image, description: 'Generate an image from text', outputType: 'image', needsRefImage: false, needsRefVideo: false },
  't2v': { label: 'Text to Video', shortLabel: 'T2V', icon: Video, description: 'Generate a video from text', outputType: 'video', needsRefImage: false, needsRefVideo: false },
  'i2v': { label: 'Image to Video', shortLabel: 'I2V', icon: ImagePlus, description: 'Animate a reference image', outputType: 'video', needsRefImage: true, needsRefVideo: false },
  'v2v': { label: 'Video to Video', shortLabel: 'V2V', icon: Film, description: 'Transform an existing video', outputType: 'video', needsRefImage: false, needsRefVideo: true },
};

const QC_VIDEO_PROVIDERS = [
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

const QC_IMAGE_PROVIDERS = [
  { id: 'auto', name: 'Auto (Best Match)' },
  { id: 'flux', name: 'Flux Schnell' },
  { id: 'flux-1-dev', name: 'Flux Dev' },
  { id: 'ideogram', name: 'Ideogram' },
];

const QC_V2V_PROVIDERS = [
  { id: 'auto', name: 'Auto (Kling Object Replace)' },
  { id: 'kling-2.6', name: 'Kling 2.6 (Object Replace)' },
  { id: 'runway-gen4-aleph', name: 'Runway Gen-4 Aleph (V2V)' },
];

function QuickCreateForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [genMode, setGenMode] = useState<QuickCreateMode>('t2v');
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [duration, setDuration] = useState("6");
  const [imageStyle, setImageStyle] = useState("Photorealistic");
  const [imageFidelity, setImageFidelity] = useState(0.85);
  const [artPresetId, setArtPresetId] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [provider, setProvider] = useState("auto");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const refImageSectionRef = useRef<HTMLDivElement>(null);
  const refVideoSectionRef = useRef<HTMLDivElement>(null);

  const allPresets = getAllVisualArtPresets();
  const cfg = QC_MODE_CONFIG[genMode];
  const outputType = cfg.outputType;

  const showCharacterSelector = outputType === "video" && artPresetId === "3d-illustration" && genMode !== 'v2v';

  const characterLibraryQuery = useQuery({
    queryKey: ["character-library"],
    queryFn: async () => {
      const res = await fetch("/api/universal-video/character-library", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.characters || [];
    },
    enabled: showCharacterSelector,
    staleTime: 60000,
  });

  const characters: any[] = characterLibraryQuery.data || [];
  const selectedCharacter = characters.find((c: any) => String(c.id) === selectedCharacterId);

  const getProviders = () => {
    if (genMode === 'v2v') return QC_V2V_PROVIDERS;
    if (genMode === 't2i') return QC_IMAGE_PROVIDERS;
    return QC_VIDEO_PROVIDERS;
  };
  const validProviderIds = getProviders().map(p => p.id);

  useEffect(() => {
    const newValidIds = (() => {
      if (genMode === 'v2v') return QC_V2V_PROVIDERS.map(p => p.id);
      if (genMode === 't2i') return QC_IMAGE_PROVIDERS.map(p => p.id);
      return QC_VIDEO_PROVIDERS.map(p => p.id);
    })();
    if (provider !== "auto" && !newValidIds.includes(provider)) {
      setProvider("auto");
    }
    setValidationError(null);
  }, [genMode]);

  useEffect(() => {
    if (!showCharacterSelector) {
      setSelectedCharacterId(null);
    }
  }, [showCharacterSelector]);

  const uploadFile = async (file: File, setUrl: (u: string) => void, setPreview: ((u: string | null) => void) | null, setLoading: (v: boolean) => void, label: string) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/videos/uploads', { method: 'POST', body: formData, credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }
      const data = await res.json();
      if (data.url) {
        setUrl(data.url);
        setPreview?.(data.url);
        toast({ title: `${label} uploaded` });
      } else {
        throw new Error(data.error || 'No URL returned');
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Please try again.', variant: 'destructive' });
      setPreview?.(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (cfg.needsRefImage && !referenceImageUrl) {
      const msg = "Please upload a reference image for I2V mode.";
      setValidationError(msg);
      toast({ title: "Reference image required", description: msg, variant: "destructive" });
      refImageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (cfg.needsRefVideo && !referenceVideoUrl) {
      const msg = "Please upload a reference video for V2V mode.";
      setValidationError(msg);
      toast({ title: "Reference video required", description: msg, variant: "destructive" });
      refVideoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const payload: any = {
      mode: "quick-create",
      generationMode: genMode,
      outputType,
      prompt,
      negativePrompt: negativePrompt.trim() || undefined,
      duration: outputType === "video" ? parseInt(duration) : undefined,
      imageStyle: genMode === "t2i" ? imageStyle : undefined,
      artPresetId: artPresetId || undefined,
      aspectRatio,
      provider,
      saveToLibrary,
      sourceImageUrl: cfg.needsRefImage ? referenceImageUrl : undefined,
      referenceVideoUrl: cfg.needsRefVideo ? referenceVideoUrl : undefined,
      imageFidelity: genMode === "i2v" ? imageFidelity : undefined,
    };
    if (selectedCharacter && selectedCharacter.referenceImageUrl) {
      payload.characterReferenceUrl = selectedCharacter.referenceImageUrl;
      payload.characterName = selectedCharacter.name;
      payload.characterDescription = [
        selectedCharacter.physicalDescription,
        selectedCharacter.wardrobe ? `wearing ${selectedCharacter.wardrobe}` : '',
      ].filter(Boolean).join(', ');
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Zap className="w-6 h-6 text-cyan-400" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Quick Create</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Generation Mode</Label>
          <div className="grid grid-cols-4 gap-2 mt-1.5">
            {(Object.entries(QC_MODE_CONFIG) as [QuickCreateMode, typeof QC_MODE_CONFIG[QuickCreateMode]][]).map(([key, mc]) => {
              const Icon = mc.icon;
              const isActive = genMode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGenMode(key)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${isActive ? "bg-purple-600/20 border-purple-500" : "hover:border-gray-600"}`}
                  style={!isActive ? { backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" } : {}}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-purple-400" : ""}`} style={!isActive ? { color: "var(--text-secondary)" } : {}} />
                  <span className={`text-xs font-medium ${isActive ? "text-purple-300" : ""}`} style={!isActive ? { color: "var(--text-secondary)" } : {}}>{mc.shortLabel}</span>
                  <span className="text-[10px] text-center leading-tight" style={{ color: "var(--text-tertiary)" }}>{mc.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {cfg.needsRefImage && (
          <div ref={refImageSectionRef}>
            <Label style={{ color: "var(--text-secondary)" }}>Reference Image *</Label>
            <div className="mt-1.5">
              {referenceImagePreview ? (
                <div className="relative inline-block">
                  <img src={referenceImagePreview} alt="Reference" className="w-32 h-32 object-cover rounded-lg border" style={{ borderColor: "var(--border-medium)" }} />
                  <button
                    type="button"
                    onClick={() => { setReferenceImageUrl(""); setReferenceImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed transition-all hover:border-purple-500/50"
                  style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                >
                  {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploadingImage ? "Uploading..." : "Upload Reference Image"}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const preview = URL.createObjectURL(file);
                    setReferenceImagePreview(preview);
                    setValidationError(null);
                    uploadFile(file, setReferenceImageUrl, null, setIsUploadingImage, "Reference image");
                  }
                }}
              />
            </div>
          </div>
        )}

        {cfg.needsRefVideo && (
          <div ref={refVideoSectionRef}>
            <Label style={{ color: "var(--text-secondary)" }}>Reference Video *</Label>
            <div className="mt-1.5 space-y-2">
              {referenceVideoUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-medium)" }}>
                  <Film className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
                  <span className="text-xs truncate flex-1" style={{ color: "var(--text-primary)" }}>{referenceVideoUrl.split('/').pop()}</span>
                  <button type="button" onClick={() => { setReferenceVideoUrl(""); if (videoInputRef.current) videoInputRef.current.value = ""; }} className="text-red-400 hover:text-red-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isUploadingVideo}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed transition-all hover:border-purple-500/50"
                  style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                >
                  {isUploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploadingVideo ? "Uploading..." : "Upload Reference Video"}
                </button>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setValidationError(null);
                    uploadFile(file, setReferenceVideoUrl, null, setIsUploadingVideo, "Reference video");
                  }
                }}
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <Label style={{ color: "var(--text-secondary)" }}>Prompt *</Label>
            <AssetSuzzieChat
              mode={genMode}
              provider={provider}
              prompt={prompt}
              hasReferenceImage={!!referenceImageUrl}
              aspectRatio={aspectRatio}
              duration={parseInt(duration)}
              style={imageStyle}
              validProviderIds={validProviderIds}
              onApplyPrompt={setPrompt}
              onApplyProvider={setProvider}
              onApplyNegativePrompt={setNegativePrompt}
              onApplyCfgScale={setImageFidelity}
            />
          </div>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the video clip or image you want to create..." rows={4} required className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        {(genMode === 't2v' || genMode === 'i2v' || genMode === 'v2v') && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Negative Prompt (Optional)</Label>
            <Textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Describe what you DON'T want in the output (e.g. blurry, distorted, watermark)..."
              rows={2}
              className="mt-1.5"
              style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
            />
          </div>
        )}

        {genMode === 'i2v' && (
          <div>
            <div className="flex items-center justify-between">
              <Label style={{ color: "var(--text-secondary)" }}>Image Fidelity</Label>
              <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{Math.round(imageFidelity * 100)}%</span>
            </div>
            <Slider
              value={[imageFidelity]}
              onValueChange={([v]) => setImageFidelity(v)}
              min={0.1}
              max={1.0}
              step={0.05}
              className="mt-2"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Creative freedom</span>
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Lock source</span>
            </div>
          </div>
        )}

        {outputType === "video" && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["4", "5", "6", "8", "10"].map((d) => (
                  <SelectItem key={d} value={d} style={{ color: "var(--text-primary)" }}>{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {genMode === "t2i" && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Image Style</Label>
            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["Photorealistic", "Cinematic", "3D Illustration", "Watercolor", "Oil Painting", "Digital Art", "Anime", "Minimalist", "Neon/Cyberpunk", "Sketch"].map((s) => (
                  <SelectItem key={s} value={s} style={{ color: "var(--text-primary)" }}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-4 h-4 text-purple-400" />
            <Label style={{ color: "var(--text-secondary)" }}>Art Style (Optional)</Label>
          </div>
          <div className="flex gap-2.5 mt-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
            <button
              type="button"
              onClick={() => setArtPresetId("")}
              className="flex-shrink-0 w-[100px] rounded-xl border-2 p-2 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: !artPresetId ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                borderColor: !artPresetId ? "rgb(139, 92, 246)" : "var(--border-subtle)",
              }}
            >
              <div
                className="w-full h-14 rounded-lg mb-1.5 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(100,100,100,0.2), rgba(60,60,60,0.2))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </div>
              <span className="font-medium text-[11px] block text-center" style={{ color: "var(--text-primary)" }}>None</span>
            </button>
            {allPresets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => setArtPresetId(preset.id)}
                className="flex-shrink-0 w-[100px] rounded-xl border-2 p-2 transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  backgroundColor: artPresetId === preset.id ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
                  borderColor: artPresetId === preset.id ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                }}
              >
                <div
                  className="w-full h-14 rounded-lg mb-1.5 overflow-hidden"
                  style={{ border: `1px solid ${preset.thumbnailColors[0]}33` }}
                >
                  <img
                    src={ART_PRESET_IMAGES[preset.id] || ''}
                    alt={preset.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className="font-medium text-[11px] block text-center truncate" style={{ color: "var(--text-primary)" }}>{preset.name}</span>
              </button>
            ))}
          </div>
          {artPresetId && allPresets.find(p => p.id === artPresetId)?.globalStyleNotes && (
            <p className="text-xs mt-1 opacity-70" style={{ color: "var(--text-tertiary)" }}>{allPresets.find(p => p.id === artPresetId)?.globalStyleNotes}</p>
          )}
        </div>

        {showCharacterSelector && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Character Reference (Optional)
              </span>
            </Label>
            <p className="text-xs mt-1 mb-2" style={{ color: "var(--text-tertiary)" }}>
              Select a character from your library to maintain visual consistency
            </p>
            {characterLibraryQuery.isLoading ? (
              <div className="text-xs py-3 text-center" style={{ color: "var(--text-tertiary)" }}>Loading characters...</div>
            ) : characters.length === 0 ? (
              <div className="text-xs py-3 text-center rounded-lg border" style={{ color: "var(--text-tertiary)", borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}>
                No characters in your library. Create one in the Asset Library or Scene Editor first.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => setSelectedCharacterId(null)}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${!selectedCharacterId ? "bg-purple-600/20 border-purple-500 text-purple-300" : "border-transparent"}`}
                  style={selectedCharacterId ? { backgroundColor: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-subtle)" } : {}}
                >
                  None
                </button>
                {characters.map((char: any) => (
                  <button
                    type="button"
                    key={char.id}
                    onClick={() => setSelectedCharacterId(String(char.id))}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedCharacterId === String(char.id) ? "bg-purple-600/20 border-purple-500 text-purple-300" : "border-transparent"}`}
                    style={selectedCharacterId !== String(char.id) ? { backgroundColor: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-subtle)" } : {}}
                  >
                    {char.referenceImageUrl && (
                      <img src={char.referenceImageUrl} alt={char.name} className="w-6 h-6 rounded-full object-cover" />
                    )}
                    <span>{char.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedCharacter && (
              <div className="mt-2 p-3 rounded-lg border flex items-start gap-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                {selectedCharacter.referenceImageUrl && (
                  <img src={selectedCharacter.referenceImageUrl} alt={selectedCharacter.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{selectedCharacter.name}</div>
                  {selectedCharacter.role && <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{selectedCharacter.role}</div>}
                  {selectedCharacter.physicalDescription && (
                    <div className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{selectedCharacter.physicalDescription}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Aspect Ratio</Label>
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
              {["16:9", "9:16", "1:1"].map((ar) => (
                <SelectItem key={ar} value={ar} style={{ color: "var(--text-primary)" }}>{ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
              {getProviders().map((p) => (
                <SelectItem key={p.id} value={p.id} style={{ color: "var(--text-primary)" }}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="saveToLibrary" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} className="rounded" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--input-bg)" }} />
          <Label htmlFor="saveToLibrary" className="cursor-pointer" style={{ color: "var(--text-secondary)" }}>Save to Asset Library</Label>
        </div>

        {validationError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300">{validationError}</span>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" disabled={isLoading || !prompt}>
            {isLoading ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function NewProject() {
  const [mode, setMode] = useState<Mode>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects/create", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project created", description: "Your project has been created successfully." });
      setLocation(`/projects/${data.projectId}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (data: any) => {
    createMutation.mutate(data);
  };

  return (
    <div className="p-6 lg:p-8">
      <Link href="/dashboard" className="text-sm inline-flex items-center gap-1 mb-6" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {mode === null && <ModeSelection onSelect={setMode} />}
      {mode === "ai-script" && <AIScriptForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
      {mode === "custom-script" && <CustomScriptForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
      {mode === "quick-create" && <QuickCreateForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
    </div>
  );
}
