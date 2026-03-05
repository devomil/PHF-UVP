import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image, Info, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Palette } from "lucide-react";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { getAvailableStyles } from "@shared/visual-style-config";
import { getAllVisualArtPresets, type VisualArtPreset } from "@shared/config/visual-art-presets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [duration, setDuration] = useState("60");
  const [platform, setPlatform] = useState("YouTube");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [mediaMode, setMediaMode] = useState("video");
  const [videoGenerationMode, setVideoGenerationMode] = useState("auto");
  const [qualityTier, setQualityTier] = useState("premium");
  const [artPresetId, setArtPresetId] = useState("auto");

  useEffect(() => {
    setAspectRatio(platformAspectMap[platform] || "16:9");
  }, [platform]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      mode: "ai-script",
      title,
      description,
      targetAudience,
      duration: parseInt(duration),
      platform,
      aspectRatio,
      mediaMode,
      videoGenerationMode: mediaMode === "video" ? videoGenerationMode : undefined,
      qualityTier,
      artPresetId,
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

        <ArtStyleSelector value={artPresetId} onChange={setArtPresetId} />

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Target Audience</Label>
          <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g., Young professionals, Tech enthusiasts" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
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
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <Label style={{ color: "var(--text-secondary)" }}>Quality Tier</Label>
            <Select value={qualityTier} onValueChange={setQualityTier}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["ultra", "premium", "standard"].map((q) => (
                  <SelectItem key={q} value={q} style={{ color: "var(--text-primary)" }}>{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            {videoGenerationMode === "image-first-i2v" 
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

  useEffect(() => {
    setAspectRatio(platformAspectMap[platform] || "16:9");
  }, [platform]);

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
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            {videoGenerationMode === "image-first-i2v" 
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

function QuickCreateForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [outputType, setOutputType] = useState<"video" | "image">("video");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("6");
  const [imageStyle, setImageStyle] = useState("Photorealistic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [provider, setProvider] = useState("auto");
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  useEffect(() => {
    setProvider("auto");
  }, [outputType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      mode: "quick-create",
      outputType,
      prompt,
      duration: outputType === "video" ? parseInt(duration) : undefined,
      imageStyle: outputType === "image" ? imageStyle : undefined,
      aspectRatio,
      provider,
      saveToLibrary,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Zap className="w-6 h-6 text-cyan-400" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Quick Create</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Output Type</Label>
          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <Card className={`cursor-pointer transition-all duration-200 ${outputType === "video" ? "bg-purple-600/20 border-purple-500" : ""}`} style={outputType !== "video" ? { backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" } : {}} onClick={() => setOutputType("video")}>
              <CardContent className="flex items-center justify-center gap-2 p-4">
                <Video className={`w-5 h-5 ${outputType === "video" ? "text-purple-400" : ""}`} style={outputType !== "video" ? { color: "var(--text-secondary)" } : {}} />
                <span className={outputType === "video" ? "font-medium" : ""} style={{ color: outputType === "video" ? "var(--text-primary)" : "var(--text-secondary)" }}>{outputType === "video" ? "Video" : "Video"}</span>
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all duration-200 ${outputType === "image" ? "bg-purple-600/20 border-purple-500" : ""}`} style={outputType !== "image" ? { backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" } : {}} onClick={() => setOutputType("image")}>
              <CardContent className="flex items-center justify-center gap-2 p-4">
                <Image className={`w-5 h-5 ${outputType === "image" ? "text-purple-400" : ""}`} style={outputType !== "image" ? { color: "var(--text-secondary)" } : {}} />
                <span className={outputType === "image" ? "font-medium" : ""} style={{ color: outputType === "image" ? "var(--text-primary)" : "var(--text-secondary)" }}>{outputType === "image" ? "Image" : "Image"}</span>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Prompt *</Label>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the video clip or image you want to create..." rows={4} required className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        {outputType === "video" ? (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["4", "6", "8", "10"].map((d) => (
                  <SelectItem key={d} value={d} style={{ color: "var(--text-primary)" }}>{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Style</Label>
            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["Photorealistic", "Illustration", "3D Render", "Anime", "Abstract"].map((s) => (
                  <SelectItem key={s} value={s} style={{ color: "var(--text-primary)" }}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        <ProviderCatalogSelector outputType={outputType} provider={provider} onProviderChange={setProvider} />

        <div className="flex items-center gap-2">
          <input type="checkbox" id="saveToLibrary" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} className="rounded" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--input-bg)" }} />
          <Label htmlFor="saveToLibrary" className="cursor-pointer" style={{ color: "var(--text-secondary)" }}>Save to Asset Library</Label>
        </div>

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
