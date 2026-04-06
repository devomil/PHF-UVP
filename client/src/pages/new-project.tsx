import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image, Info, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Palette, Users, UserCheck, Upload, X, ImagePlus, Film, Loader2, AlertCircle, FileUp, BookOpen, TrendingUp, CheckCircle2, FolderOpen, Target, ShieldCheck, Megaphone, CalendarCheck, Share2, ShoppingBag } from "lucide-react";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { CharacterProfilesPanel } from "@/components/video/character-profiles-panel";
import { AssetSuzzieChat } from "@/components/video/AssetSuzzieChat";
import { getAvailableStyles } from "@shared/visual-style-config";
import { getAllVisualArtPresets, isStylizedPreset, type VisualArtPreset } from "@shared/config/visual-art-presets";
import { getAllProjectTypes, getProjectType, CONTENT_STRUCTURES, LONG_STORY_DEFAULT_ART_PRESET_IDS, getAllProjectPurposes } from "@shared/config/project-types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Mode = null | "ai-script" | "custom-script" | "quick-create";

function AssetLibraryPicker({ onSelect }: { onSelect: (asset: any) => void }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'brand' | 'library'>('brand');

  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      setAssets([]);
      try {
        const endpoint = tab === 'brand' ? '/api/brand-media-library' : '/api/asset-library';
        const res = await fetch(endpoint, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const items = tab === 'brand' ? (data.assets || []) : (Array.isArray(data) ? data : []);
          const imageAssets = items.filter((a: any) => {
            const url = a.url || a.assetUrl || a.outputUrl || '';
            const type = a.mediaType || a.contentType || a.assetType || '';
            return type.startsWith('image') || type === 'image' || url.match(/\.(jpg|jpeg|png|webp)$/i);
          });
          setAssets(imageAssets);
        }
      } catch {
        setAssets([]);
      }
      setLoading(false);
    }
    fetchAssets();
  }, [tab]);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}>
      <div className="flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          type="button"
          onClick={() => setTab('brand')}
          className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
          style={{
            color: tab === 'brand' ? "rgb(167, 139, 250)" : "var(--text-muted)",
            backgroundColor: tab === 'brand' ? "rgba(139, 92, 246, 0.1)" : "transparent",
            borderBottom: tab === 'brand' ? "2px solid rgb(139, 92, 246)" : "2px solid transparent",
          }}
        >
          Brand Media
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
          style={{
            color: tab === 'library' ? "rgb(167, 139, 250)" : "var(--text-muted)",
            backgroundColor: tab === 'library' ? "rgba(139, 92, 246, 0.1)" : "transparent",
            borderBottom: tab === 'library' ? "2px solid rgb(139, 92, 246)" : "2px solid transparent",
          }}
        >
          Asset Library
        </button>
      </div>
      <div className="p-2 max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1">
            <FolderOpen className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {tab === 'brand' ? 'No brand media assets yet' : 'No images in asset library'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {assets.map((asset: any) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect({
                  ...asset,
                  url: asset.url || asset.assetUrl || asset.outputUrl,
                  thumbnailUrl: asset.thumbnailUrl || asset.url || asset.assetUrl || asset.outputUrl,
                })}
                className="group relative rounded-lg overflow-hidden border transition-all hover:border-purple-400/50 hover:shadow-md"
                style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface)" }}
              >
                <div className="aspect-square">
                  <img
                    src={asset.thumbnailUrl || asset.url || asset.assetUrl || asset.outputUrl}
                    alt={asset.name || asset.prompt || 'Asset'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {asset.name || asset.prompt?.substring(0, 30) || 'Untitled'}
                  </p>
                  {(asset.description || asset.assetType) && (
                    <p className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
                      {asset.description?.substring(0, 40) || asset.assetType}
                    </p>
                  )}
                </div>
                <div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(139,92,246,0.9)", color: "white" }}>Select</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

function ArtStyleSelector({ value, onChange, multiSelect = false, selectedIds = [], onMultiChange }: { value: string; onChange: (id: string) => void; multiSelect?: boolean; selectedIds?: string[]; onMultiChange?: (ids: string[]) => void }) {
  const presets = getAllVisualArtPresets();
  const allSelected = multiSelect && selectedIds.length === presets.length;

  const handleClick = (id: string) => {
    if (!multiSelect || !onMultiChange) {
      onChange(id);
      return;
    }
    if (id === "auto") {
      onMultiChange([]);
      onChange("auto");
      return;
    }
    if (id === "all") {
      const allIds = presets.map(p => p.id);
      onMultiChange(allIds);
      onChange(allIds[0]);
      return;
    }
    const isSelected = selectedIds.includes(id);
    let next: string[];
    if (isSelected) {
      next = selectedIds.filter(s => s !== id);
    } else {
      next = [...selectedIds, id];
    }
    onMultiChange(next);
    onChange(next.length > 0 ? next[0] : "auto");
  };

  const isAutoActive = multiSelect ? selectedIds.length === 0 : value === "auto";
  const isPresetActive = (id: string) => multiSelect ? selectedIds.includes(id) : value === id;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Palette className="w-4 h-4 text-purple-400" />
        <Label style={{ color: "var(--text-secondary)" }}>Art Style</Label>
        {multiSelect && selectedIds.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(139,92,246,0.2)", color: "rgb(167,139,250)" }}>
            {allSelected ? "Smart Mix — All styles" : `${selectedIds.length} selected`}
          </span>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        {multiSelect ? "Select styles for AI to choose from — it will assign the best style per scene based on content" : "Choose a visual art direction that applies consistently across all scenes"}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
        {multiSelect && (
          <button
            type="button"
            onClick={() => handleClick("all")}
            className="flex-shrink-0 w-[140px] rounded-xl border-2 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              backgroundColor: allSelected ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
              borderColor: allSelected ? "rgb(139, 92, 246)" : "var(--border-subtle)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              className="w-full h-16 rounded-lg mb-2 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(168,85,247,0.4), rgba(59,130,246,0.3), rgba(236,72,153,0.3), rgba(34,197,94,0.3))",
                border: "1px solid rgba(139,92,246,0.3)",
              }}
            >
              <Sparkles className="w-5 h-5 text-purple-300" />
            </div>
            <span className="font-medium text-xs block" style={{ color: "var(--text-primary)" }}>Smart Mix</span>
            <span className="text-[10px] mt-0.5 block leading-snug" style={{ color: "var(--text-muted)" }}>
              AI picks the best style per scene
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleClick("auto")}
          className="flex-shrink-0 w-[140px] rounded-xl border-2 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={{
            backgroundColor: isAutoActive ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
            borderColor: isAutoActive ? "rgb(139, 92, 246)" : "var(--border-subtle)",
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
            {multiSelect ? "Single style — AI picks one" : "AI picks the best style for your content"}
          </span>
        </button>

        {presets.map((preset) => {
          const active = isPresetActive(preset.id);
          const atLimit = false;
          return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleClick(preset.id)}
            className={`flex-shrink-0 w-[140px] rounded-xl border-2 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${atLimit ? "opacity-40 cursor-not-allowed" : ""}`}
            disabled={atLimit}
            style={{
              backgroundColor: active ? "rgba(139, 92, 246, 0.15)" : "var(--surface)",
              borderColor: active ? "rgb(139, 92, 246)" : "var(--border-subtle)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="relative">
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
            {multiSelect && active && (
              <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgb(139,92,246)" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            </div>
            <span className="font-medium text-xs block truncate" style={{ color: "var(--text-primary)" }}>{preset.name}</span>
            <span className="text-[10px] mt-0.5 block leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {preset.description}
            </span>
          </button>
          );
        })}
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

interface TrendingHookChip {
  template: string;
  psychologicalDriver: string;
}

function AIScriptForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("hook") || "";
  });
  const [targetAudience, setTargetAudience] = useState("");
  const [projectTypeId, setProjectTypeId] = useState("youtube-ad");
  const [trendingHooks, setTrendingHooks] = useState<TrendingHookChip[]>([]);
  const [trendingIndustry, setTrendingIndustry] = useState("");
  const [trendingNiche, setTrendingNiche] = useState("");
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendsDismissed, setTrendsDismissed] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [imageAnalyzed, setImageAnalyzed] = useState(false);
  const [contentStructure, setContentStructure] = useState("explainer");
  const [mediaMode, setMediaMode] = useState("video");
  const [videoGenerationMode, setVideoGenerationMode] = useState("auto");
  const [artPresetId, setArtPresetId] = useState("auto");
  const [artPresetIds, setArtPresetIds] = useState<string[]>([]);
  const [artPresetUserOverride, setArtPresetUserOverride] = useState(false);
  const [characterConsistency, setCharacterConsistency] = useState(false);
  const [characters, setCharacters] = useState<any[]>([]);
  const [productMediaFile, setProductMediaFile] = useState<File | null>(null);
  const [productMediaPreview, setProductMediaPreview] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const productMediaInputRef = useRef<HTMLInputElement>(null);
  const [selectedLibraryAsset, setSelectedLibraryAsset] = useState<any | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [productName, setProductName] = useState("");
  const [productProblem, setProductProblem] = useState("");
  const [scriptTone, setScriptTone] = useState("educational");
  const [callToAction, setCallToAction] = useState("learn-more");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isExtractingDocument, setIsExtractingDocument] = useState(false);
  const [documentWordCount, setDocumentWordCount] = useState(0);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [projectPurpose, setProjectPurpose] = useState("");

  const allProjectTypes = getAllProjectTypes();
  const allPurposes = getAllProjectPurposes();

  const hasLockedCharacters = characters.some((c: any) => c.locked && c.referenceImageUrl);
  const showCharacterI2V = (artPresetId === '3d-illustration' || artPresetIds.includes('3d-illustration')) && hasLockedCharacters;

  useEffect(() => {
    if (videoGenerationMode === 'character-i2v' && !showCharacterI2V) {
      setVideoGenerationMode('auto');
    }
  }, [artPresetId, characters, showCharacterI2V, videoGenerationMode]);

  useEffect(() => {
    const anyStylized = artPresetIds.length > 0 ? artPresetIds.some(id => isStylizedPreset(id)) : isStylizedPreset(artPresetId);
    if (anyStylized) {
      setCharacterConsistency(true);
    }
  }, [artPresetId, artPresetIds]);

  useEffect(() => {
    if (artPresetUserOverride) return;
    if (projectTypeId === 'educational' && contentStructure) {
      const cs = CONTENT_STRUCTURES.find(s => s.id === contentStructure);
      if (cs) {
        if (cs.defaultArtPresetIds && cs.defaultArtPresetIds.length > 1) {
          setArtPresetId(cs.defaultArtPresetIds[0]);
          setArtPresetIds(cs.defaultArtPresetIds);
        } else {
          setArtPresetId(cs.defaultArtPreset);
          setArtPresetIds([]);
        }
      }
    } else if (projectTypeId === 'long-story') {
      setArtPresetId(LONG_STORY_DEFAULT_ART_PRESET_IDS[0]);
      setArtPresetIds(LONG_STORY_DEFAULT_ART_PRESET_IDS);
    } else {
      setArtPresetId('auto');
      setArtPresetIds([]);
    }
  }, [contentStructure, projectTypeId, artPresetUserOverride]);

  useEffect(() => {
    async function loadTrendingHooks() {
      try {
        setLoadingTrends(true);
        const brandRes = await fetch("/api/brand-settings", { credentials: "include" });
        const brandData = await brandRes.json();
        if (!brandData.industry || !brandData.trendAnalysisEnabled) return;
        setTrendingIndustry(brandData.industry);
        const trendRes = await fetch("/api/trend-intelligence/hooks", { credentials: "include" });
        const trendData = await trendRes.json();
        if (trendData.success && trendData.hooks?.length > 0) {
          setTrendingHooks(trendData.hooks.slice(0, 3).map((h: TrendingHookChip) => ({
            template: h.template,
            psychologicalDriver: h.psychologicalDriver,
          })));
          if (trendData.contentNiche) setTrendingNiche(trendData.contentNiche);
        }
      } catch {
      } finally {
        setLoadingTrends(false);
      }
    }
    loadTrendingHooks();
  }, []);

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

  const analyzeImageForHooks = async () => {
    if (!productMediaFile || !productMediaFile.type.startsWith("image/")) return;
    setAnalyzingImage(true);
    setTrendsDismissed(false);
    try {
      const formData = new FormData();
      formData.append("file", productMediaFile);
      const uploadRes = await fetch("/api/videos/uploads", { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.url;
      if (!imageUrl) throw new Error("Upload returned no URL");

      const res = await fetch("/api/trend-intelligence/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error("Analysis request failed");
      const data = await res.json();
      if (data.success && data.hooks?.length > 0) {
        setTrendingIndustry(data.industry || "your product");
        if (data.contentNiche) setTrendingNiche(data.contentNiche);
        setTrendingHooks(data.hooks.slice(0, 3).map((h: TrendingHookChip) => ({
          template: h.template,
          psychologicalDriver: h.psychologicalDriver,
        })));
        setImageAnalyzed(true);
        toast({ title: "Trending hooks found", description: `${data.hooks.length} hook suggestions based on your product image.` });
      } else {
        toast({ title: "No hooks found", description: "Try setting your industry in Brand Settings instead.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Analysis failed", description: "Could not analyze the image for trends.", variant: "destructive" });
    } finally {
      setAnalyzingImage(false);
    }
  };

  const removeProductMedia = () => {
    setProductMediaFile(null);
    setProductMediaPreview(null);
    setSelectedLibraryAsset(null);
    setImageAnalyzed(false);
    if (productMediaInputRef.current) {
      productMediaInputRef.current.value = '';
    }
  };

  const handleDocumentUpload = async (file: File) => {
    const allowedTypes = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload .txt, .pdf, or .docx files.", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Document files must be under 50MB.", variant: "destructive" });
      return;
    }
    setIsExtractingDocument(true);
    setDocumentFile(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/videos/upload-document', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to extract document text');
      }
      const data = await res.json();
      setDescription(data.text);
      setDocumentWordCount(data.wordCount);
      if (data.title && !title) {
        setTitle(data.title);
      }
      toast({ title: "Document imported", description: `Extracted ${data.wordCount.toLocaleString()} words from ${data.sourceFormat.toUpperCase()} file.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
      setDocumentFile(null);
    } finally {
      setIsExtractingDocument(false);
    }
  };

  const removeDocument = () => {
    setDocumentFile(null);
    setDescription('');
    setDocumentWordCount(0);
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  const isLongStory = projectTypeId === 'long-story';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let productMediaUrl: string | undefined;

    if (selectedLibraryAsset) {
      productMediaUrl = selectedLibraryAsset.url;
    } else if (productMediaFile) {
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
      artPresetIds: artPresetIds.length > 0 ? artPresetIds : undefined,
      characterConsistency,
      characters,
      productMediaUrl,
      projectType: projectTypeId,
      contentStructure: projectTypeId === 'educational' ? contentStructure : undefined,
      scriptPresets: (productMediaUrl || selectedLibraryAsset) ? {
        productName: productName || selectedLibraryAsset?.name || undefined,
        productProblem: productProblem || undefined,
        scriptTone,
        callToAction,
      } : undefined,
      projectPurpose: projectPurpose || undefined,
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

        {!isLongStory && !trendsDismissed && (loadingTrends || trendingHooks.length > 0) && (
          <div className="rounded-lg border p-4" style={{ backgroundColor: "rgba(139, 92, 246, 0.05)", borderColor: "rgba(139, 92, 246, 0.15)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <TrendingUp className="w-4 h-4 text-purple-400" />
                Trending hooks in <span className="text-purple-400">{trendingIndustry}</span> this week:
              </p>
              <button
                type="button"
                onClick={() => setTrendsDismissed(true)}
                className="text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Skip
              </button>
            </div>
            {loadingTrends ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 rounded-lg bg-purple-500/10 animate-pulse flex-1" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {trendingHooks.map((hook, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      setDescription(hook.template);
                      setTrendsDismissed(true);
                      try {
                        const res = await fetch("/api/trend-intelligence/derive-problem", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ hookTemplate: hook.template, contentNiche: trendingNiche }),
                        });
                        const data = await res.json();
                        if (data.success && data.problem) {
                          setProductProblem(data.problem);
                        }
                      } catch {}
                    }}
                    title={`Why it works: ${hook.psychologicalDriver}`}
                    className="text-sm px-3 py-2 rounded-lg border transition-all hover:border-purple-400/50 hover:bg-purple-500/10 text-left"
                    style={{ borderColor: "rgba(139, 92, 246, 0.2)", color: "var(--text-primary)" }}
                  >
                    {hook.template}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isLongStory ? (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>
              <BookOpen className="w-4 h-4 inline mr-1.5 text-purple-400" />
              Document / Long-Form Content
            </Label>
            <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
              Paste your article, blog post, or script below — or upload a document file. AI will break it into chapters.
            </p>
            <input
              ref={documentInputRef}
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentUpload(f); }}
              className="hidden"
            />
            {!documentFile && !description ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => documentInputRef.current?.click()}
                  disabled={isExtractingDocument}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors hover:border-purple-400/50"
                  style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}
                >
                  {isExtractingDocument ? (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
                      <span className="text-sm" style={{ color: "var(--text-muted)" }}>Extracting text...</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Upload Document</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>PDF, DOCX, or TXT (up to 50MB)</span>
                    </>
                  )}
                </button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: "var(--border-subtle)" }} /></div>
                  <div className="relative flex justify-center"><span className="px-3 text-xs" style={{ backgroundColor: "var(--surface)", color: "var(--text-muted)" }}>or paste text directly</span></div>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setDocumentWordCount(e.target.value.split(/\s+/).filter(Boolean).length); }}
                  placeholder="Paste your long-form content here (articles, blog posts, scripts, research papers...)"
                  rows={10}
                  className="mt-1.5"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(139, 92, 246, 0.1)" }}>
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {documentFile ? documentFile.name : 'Pasted content'}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {documentWordCount.toLocaleString()} words
                    </p>
                  </div>
                  <button type="button" onClick={removeDocument} className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors">
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setDocumentWordCount(e.target.value.split(/\s+/).filter(Boolean).length); }}
                  rows={8}
                  className="mt-1"
                  style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
                />
                {documentWordCount < 100 && description.trim() && (
                  <div className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", color: "rgb(245, 158, 11)" }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Short content — for best results, provide at least 200+ words
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Description / Brief</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you want your video to be about..." rows={4} className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
          </div>
        )}

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Product or Brand Media <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
            Upload a product photo or choose from your Asset Library — AI will analyze it to inform your script
          </p>
          <input
            ref={productMediaInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            onChange={handleProductMediaSelect}
            className="hidden"
          />
          {!productMediaFile && !selectedLibraryAsset ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => productMediaInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-6 transition-colors hover:border-purple-400/50"
                  style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}
                >
                  <Upload className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Upload File</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>JPG, PNG, MP4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(!showAssetPicker)}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 py-6 transition-colors hover:border-purple-400/50"
                  style={{
                    borderColor: showAssetPicker ? "rgb(139, 92, 246)" : "var(--border-medium)",
                    backgroundColor: showAssetPicker ? "rgba(139, 92, 246, 0.1)" : "var(--surface-elevated)",
                    borderStyle: "solid",
                  }}
                >
                  <ImagePlus className="w-6 h-6" style={{ color: showAssetPicker ? "rgb(167, 139, 250)" : "var(--text-muted)" }} />
                  <span className="text-xs font-medium" style={{ color: showAssetPicker ? "rgb(167, 139, 250)" : "var(--text-muted)" }}>Asset Library</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Brand media & assets</span>
                </button>
              </div>
              {showAssetPicker && <AssetLibraryPicker onSelect={(asset: any) => {
                setSelectedLibraryAsset(asset);
                setProductMediaPreview(asset.thumbnailUrl || asset.url);
                setProductMediaFile(null);
                setShowAssetPicker(false);
                if (asset.entityName || asset.name) {
                  setProductName(asset.entityName || asset.name);
                }
              }} />}
            </div>
          ) : selectedLibraryAsset ? (
            <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-medium)", backgroundColor: "var(--surface-elevated)" }}>
              <div className="flex items-center gap-3 p-3">
                <img src={selectedLibraryAsset.thumbnailUrl || selectedLibraryAsset.url} alt={selectedLibraryAsset.name} className="w-16 h-16 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{selectedLibraryAsset.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedLibraryAsset.description || selectedLibraryAsset.assetType || 'Brand asset'}</p>
                  {selectedLibraryAsset.matchKeywords?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {selectedLibraryAsset.matchKeywords.slice(0, 4).map((kw: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "rgb(167,139,250)" }}>#{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={removeProductMedia} className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
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
                  <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{productMediaFile!.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{(productMediaFile!.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button type="button" onClick={removeProductMedia} className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>
              {productMediaFile!.type.startsWith("image/") && !imageAnalyzed && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={analyzeImageForHooks}
                    disabled={analyzingImage}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(168, 85, 247, 0.15))",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      color: "#c4b5fd",
                    }}
                  >
                    {analyzingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing product for trending hooks...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4" />
                        Find Trending Hooks for This Product
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {(productMediaFile || selectedLibraryAsset) && (
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

        <ArtStyleSelector value={artPresetId} onChange={(id: string) => { setArtPresetId(id); setArtPresetUserOverride(true); }} multiSelect selectedIds={artPresetIds} onMultiChange={(ids) => { setArtPresetIds(ids); setArtPresetUserOverride(true); }} />

        {(artPresetId === '3d-illustration' || artPresetIds.includes('3d-illustration')) && (
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
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-400" />
            <Label style={{ color: "var(--text-secondary)" }}>Project Purpose</Label>
            {projectPurpose && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(139,92,246,0.2)", color: "rgb(167,139,250)" }}>
                Auto content tags enabled
              </span>
            )}
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Tell Suzzie what this video is for — she'll auto-assign the best content style per scene
          </p>
          <div className="grid grid-cols-2 gap-2">
            {allPurposes.map((pp) => {
              const iconMap: Record<string, any> = {
                'book-open': BookOpen,
                'shield': ShieldCheck,
                'megaphone': Megaphone,
                'calendar': CalendarCheck,
                'share': Share2,
                'shopping-bag': ShoppingBag,
              };
              const PIcon = iconMap[pp.icon] || Target;
              const active = projectPurpose === pp.id;
              return (
                <button
                  key={pp.id}
                  type="button"
                  onClick={() => setProjectPurpose(active ? "" : pp.id)}
                  className="text-left rounded-lg border-2 p-3 transition-all duration-200 hover:border-purple-400/50"
                  style={{
                    backgroundColor: active ? "rgba(139, 92, 246, 0.12)" : "var(--surface)",
                    borderColor: active ? "rgb(139, 92, 246)" : "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <PIcon className="w-3.5 h-3.5" style={{ color: active ? "rgb(167,139,250)" : "var(--text-muted)" }} />
                    <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{pp.label}</span>
                  </div>
                  <span className="text-[10px] block" style={{ color: "var(--text-muted)" }}>{pp.description}</span>
                </button>
              );
            })}
          </div>
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
