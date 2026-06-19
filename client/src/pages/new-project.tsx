import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image, Info, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, GripVertical, Palette, Users, UserCheck, Upload, X, ImagePlus, Film, Loader2, AlertCircle, FileUp, BookOpen, TrendingUp, CheckCircle2, FolderOpen, Target, ShieldCheck, Megaphone, CalendarCheck, Share2, ShoppingBag, RefreshCw, Presentation, Images } from "lucide-react";
import { ProviderCatalogSelector } from "@/components/video/provider-catalog-selector";
import { CharacterProfilesPanel } from "@/components/video/character-profiles-panel";
import { AssetSuzzieChat } from "@/components/video/AssetSuzzieChat";
import { getAvailableStyles } from "@shared/visual-style-config";
import { getAllVisualArtPresets, isStylizedPreset, type VisualArtPreset } from "@shared/config/visual-art-presets";
import { VIDEO_PROVIDERS as SHARED_VIDEO_PROVIDERS, getMultiImageSupport } from "@shared/provider-config";
import { providerSupportsMultiImage, getDropdownVideoProviders, getDropdownImageProviders, getDropdownI2IProviders, getDropdownV2VProviders } from "@shared/provider-catalog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  isQCProviderSectionVisible,
  isQCAmberBannerVisible,
  wouldQCHandleSubmitBlock,
  isQCGenerateButtonDisabled,
} from "@/utils/v2v-gating";
import { getAllProjectTypes, getProjectType, CONTENT_STRUCTURES, LONG_STORY_DEFAULT_ART_PRESET_IDS, getAllProjectPurposes } from "@shared/config/project-types";
import { DECK_AUDIENCES, DEFAULT_DECK_AUDIENCE_ID, getDeckAudience } from "@shared/config/deck-audiences";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCost } from "@/components/credits/credit-cost";
import { useGenerationErrorHandler } from "@/hooks/use-generation-error-handler";

type Mode = null | "ai-script" | "custom-script" | "quick-create" | "studio-polish" | "deck-to-video";

// Deck-to-Video draft persistence.
//
// Deck analysis is a long (~30-50s) request. In the dev preview, the Vite HMR
// websocket can briefly drop during it; on reconnect Vite force-reloads the page,
// which would wipe the in-memory deck workflow (selected mode + completed
// analysis) and dump the user back to the workflow picker — the "refreshes back
// to home" the user reported. We persist the *completed* analysis to
// sessionStorage so any reload restores the user to their results. The raw
// uploaded File can't be persisted, but it isn't needed once analysis is done —
// project creation is built entirely from the analysis payload.
const DECK_DRAFT_KEY = "np:deck-draft";
function readDeckDraft(): any | null {
  try {
    return JSON.parse(sessionStorage.getItem(DECK_DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}
function clearDeckDraft() {
  try {
    sessionStorage.removeItem(DECK_DRAFT_KEY);
  } catch {
    /* sessionStorage unavailable (private mode / SSR) — non-fatal */
  }
}

const DEFAULT_ALLOWED_TYPES: readonly ('video' | 'image')[] = ['image'] as const;

function AssetLibraryPicker({ onSelect, allowedTypes }: { onSelect: (asset: any) => void; allowedTypes?: ('video' | 'image')[] }) {
  const types = allowedTypes || DEFAULT_ALLOWED_TYPES;
  const typesKey = types.join(',');
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
          const filteredAssets = items.filter((a: any) => {
            const url = a.url || a.assetUrl || a.outputUrl || '';
            const type = a.mediaType || a.contentType || a.assetType || '';
            const isImage = type.startsWith('image') || type === 'image' || /\.(jpg|jpeg|png|webp)$/i.test(url);
            const isVideo = type.startsWith('video') || type === 'video' || /\.(mp4|mov|avi|mkv|webm)$/i.test(url);
            return (types.includes('image') && isImage) || (types.includes('video') && isVideo);
          });
          setAssets(filteredAssets);
        }
      } catch {
        setAssets([]);
      }
      setLoading(false);
    }
    fetchAssets();
  }, [tab, typesKey]);

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
    {
      id: "studio-polish" as const,
      icon: Film,
      title: "Studio Polish",
      description: "Upload your existing videos or images and apply professional finishing — intros, outros, captions, voiceover, music, and cinematic treatments",
      bestFor: "Manufacturer videos, raw footage, brand content, multi-clip productions",
      gradient: "from-amber-500/20 to-yellow-600/5",
      border: "hover:border-amber-500/50",
      glow: "hover:shadow-amber-500/10",
      iconColor: "text-amber-400",
    },
    {
      id: "deck-to-video" as const,
      icon: Presentation,
      title: "Deck to Video",
      description: "Upload a PDF pitch or concept deck and we'll analyze its message and visuals to auto-draft a brand-consistent marketing video",
      bestFor: "Pitch decks, concept decks, sales one-pagers, marketing slides",
      gradient: "from-pink-500/20 to-rose-600/5",
      border: "hover:border-pink-500/50",
      glow: "hover:shadow-pink-500/10",
      iconColor: "text-pink-400",
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Create New Project</h1>
      <p className="mb-8" style={{ color: "var(--text-secondary)" }}>Choose how you want to create your video or image</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
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
  const [productVisualDescription, setProductVisualDescription] = useState("");

  const PRODUCT_NOUNS = /\b(collagen|peptides?|supplements?|serums?|cream|lotion|powder|capsules?|tablets?|pills?|drops?|shampoo|conditioner|skincare|moisturizer|cleanser|toner|sunscreen|vitamins?|protein|gummies|tinctures?|oils?|balm|spray|gel|stick|bottle|jar|tube|sachet|stick\s+pack|pouch|formula|complex|blend|stack|product)\b/i;
  const productDetectedInDescription = PRODUCT_NOUNS.test(description || "");
  const PRODUCT_ASSET_TYPES = new Set(["product", "product-image", "product-photo", "product-media", "package", "packaging"]);
  const productMediaFileIsImage = !!productMediaFile && productMediaFile.type?.startsWith("image/");
  const libraryAssetIsProduct = !!selectedLibraryAsset && (
    PRODUCT_ASSET_TYPES.has((selectedLibraryAsset.assetType || selectedLibraryAsset.type || "").toString().toLowerCase()) ||
    selectedLibraryAsset.category === "product"
  );
  const hasUsableProductReference = productMediaFileIsImage || libraryAssetIsProduct;
  const needsProductGrounding =
    productDetectedInDescription &&
    !hasUsableProductReference &&
    productVisualDescription.trim().length < 10;

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
      productVisualDescription: productVisualDescription.trim() || undefined,
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

        {(productDetectedInDescription || productMediaFile || selectedLibraryAsset) && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>
              How does the product physically look?
              {needsProductGrounding && <span className="text-amber-400 ml-1">*</span>}
            </Label>
            <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
              Color, container shape, size — what the AI should depict literally. {needsProductGrounding ? "Required because no product photo is uploaded." : "Optional but improves accuracy."}
            </p>
            <Textarea
              value={productVisualDescription}
              onChange={(e) => setProductVisualDescription(e.target.value)}
              placeholder="e.g., White matte stick pack with a teal stripe, single-serve sachet about the size of a sugar packet"
              rows={2}
              className="mt-1"
              style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}
              data-testid="textarea-product-visual-description"
            />
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
              const iconMap: Record<string, typeof Target> = {
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
          {needsProductGrounding && (
            <p className="text-xs text-amber-300/90 mt-2" data-testid="text-product-grounding-warning">
              Your description mentions a product. Either upload a product photo or describe what it physically looks like (color, container, label) below so the AI can render the actual item.
            </p>
          )}
          <Button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" disabled={isLoading || isUploadingMedia || !title || needsProductGrounding} title={needsProductGrounding ? "Add a product photo or visual description first" : undefined} data-testid="button-generate-script">
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

type QuickCreateMode = 't2i' | 't2v' | 'i2i' | 'i2v' | 'v2v';

const QC_MODE_CONFIG: Record<QuickCreateMode, { label: string; shortLabel: string; icon: any; description: string; outputType: 'image' | 'video'; needsRefImage: boolean; needsRefVideo: boolean }> = {
  't2i': { label: 'Text to Image', shortLabel: 'T2I', icon: Image, description: 'Generate an image from text', outputType: 'image', needsRefImage: false, needsRefVideo: false },
  't2v': { label: 'Text to Video', shortLabel: 'T2V', icon: Video, description: 'Generate a video from text', outputType: 'video', needsRefImage: false, needsRefVideo: false },
  'i2i': { label: 'Image to Image', shortLabel: 'I2I', icon: RefreshCw, description: 'Transform a reference image', outputType: 'image', needsRefImage: true, needsRefVideo: false },
  'i2v': { label: 'Image to Video', shortLabel: 'I2V', icon: ImagePlus, description: 'Animate a reference image', outputType: 'video', needsRefImage: true, needsRefVideo: false },
  'v2v': { label: 'Video to Video', shortLabel: 'V2V', icon: Film, description: 'Transform an existing video', outputType: 'video', needsRefImage: false, needsRefVideo: true },
};

// QC_VIDEO_PROVIDERS is computed dynamically inside the component by calling
// getDropdownVideoProviders(genMode) so providers are filtered to the current
// mode (e.g. omni-human-1.5 is i2v-only and should not appear in t2v mode).
// The module-level constant has been intentionally removed.

interface UploadedFile {
  fileId: string;
  s3Url: string;
  thumbnailUrl: string | null;
  duration: number;
  fileType: 'video' | 'image';
  fileName: string;
  fileSize: number;
}

function StudioPolishForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [qualityTier, setQualityTier] = useState("premium");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const MAX_FILE_SIZE = 500 * 1024 * 1024;
  const MAX_DURATION_SEC = 600;
  const ACCEPTED_TYPES = '.mp4,.mov,.avi,.mkv,.webm,.jpg,.jpeg,.png,.webp';
  const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${file.name} exceeds 500MB limit`, variant: "destructive" });
        continue;
      }

      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isVideo = VIDEO_EXTENSIONS.includes(ext);

      if (isVideo) {
        try {
          const duration = await getVideoDuration(file);
          if (duration > MAX_DURATION_SEC) {
            toast({ title: "Video too long", description: `${file.name} is ${Math.ceil(duration / 60)} minutes. Maximum is 10 minutes per clip.`, variant: "destructive" });
            continue;
          }
        } catch {}
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('aspectRatio', aspectRatio);

        const res = await fetch('/api/studio-polish/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          toast({ title: "Upload failed", description: err.error || 'Upload failed', variant: "destructive" });
          continue;
        }

        const data = await res.json();
        setUploadedFiles(prev => [...prev, data]);
        toast({ title: "Uploaded", description: file.name });
      } catch (err: any) {
        toast({ title: "Upload error", description: err.message || 'Upload failed', variant: "destructive" });
      }
      setUploading(false);
    }
  }

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => reject(new Error('Could not read video'));
      video.src = URL.createObjectURL(file);
    });
  }

  function removeFile(index: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }

  function moveFile(index: number, direction: 'up' | 'down') {
    setUploadedFiles(prev => {
      const next = [...prev];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  }

  function handleSubmit() {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a project title", variant: "destructive" });
      return;
    }
    if (uploadedFiles.length === 0) {
      toast({ title: "No files", description: "Please upload at least one video or image", variant: "destructive" });
      return;
    }
    onSubmit({
      mode: "studio-polish",
      title,
      notes,
      platform,
      aspectRatio,
      qualityTier,
      uploadedFiles: uploadedFiles.map(f => ({
        fileId: f.fileId,
        s3Url: f.s3Url,
        thumbnailUrl: f.thumbnailUrl,
        duration: f.duration,
        fileType: f.fileType,
        fileName: f.fileName,
        fileSize: f.fileSize,
      })),
    });
  }

  const totalDuration = uploadedFiles.reduce((sum, f) => sum + f.duration, 0);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 mb-6 text-sm transition-colors" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft className="w-4 h-4" /> Back to project types
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-600/5 flex items-center justify-center">
          <Film className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Studio Polish</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Upload and enhance your existing media</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-amber-500/20 text-amber-400' : ''}`}
              style={step < s ? { backgroundColor: "var(--surface-elevated)", color: "var(--text-muted)" } : {}}>
              {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            <span className="text-xs hidden sm:inline" style={{ color: step >= s ? "var(--text-primary)" : "var(--text-muted)" }}>
              {s === 1 ? 'Setup' : s === 2 ? 'Upload' : 'Review'}
            </span>
            {s < 3 && <div className="w-8 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--text-primary)" }}>Project Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label style={{ color: "var(--text-secondary)" }}>Project Title *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. BioScan Manufacturer Feature"
                style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <Label style={{ color: "var(--text-secondary)" }}>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Internal reference notes..."
                rows={3}
                style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label style={{ color: "var(--text-secondary)" }}>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="instagram-reels">Instagram Reels</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="website">LinkedIn / Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ color: "var(--text-secondary)" }}>Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ color: "var(--text-secondary)" }}>Quality</Label>
                <Select value={qualityTier} onValueChange={setQualityTier}>
                  <SelectTrigger style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-medium)", color: "var(--text-primary)" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="ultra">Ultra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => { if (!title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; } setStep(2); }} className="bg-amber-600 hover:bg-amber-700 text-white">
                Next: Upload Media
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--text-primary)" }}>Upload Media</CardTitle>
            <CardDescription style={{ color: "var(--text-secondary)" }}>
              Add your videos and images. Each file becomes one scene. Drag to reorder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? 'border-amber-400 bg-amber-500/5' : ''}`}
              style={!dragOver ? { borderColor: "var(--border-medium)" } : {}}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
              />
              <FileUp className="w-10 h-10 mx-auto mb-3 text-amber-400" />
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {uploading ? 'Uploading & normalizing...' : 'Drop files here or click to browse'}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                MP4, MOV, AVI, MKV, WebM, JPG, PNG, WEBP · Max 500MB / 10 min per file
              </p>
              {uploading && <Loader2 className="w-5 h-5 animate-spin mx-auto mt-3 text-amber-400" />}
            </div>

            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setShowAssetPicker(!showAssetPicker)}
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
                <FolderOpen className="w-4 h-4 mr-2" /> Select from Asset Library
              </Button>
            </div>

            {showAssetPicker && (
              <AssetLibraryPicker
                allowedTypes={['video', 'image']}
                onSelect={async (asset: any) => {
                  const url = asset.url || asset.assetUrl || asset.outputUrl || '';
                  const type = asset.mediaType || asset.contentType || asset.assetType || '';
                  const isVideo = type.startsWith('video') || /\.(mp4|mov|avi|mkv|webm)$/i.test(url);
                  const assetDuration = asset.duration && asset.duration > 0 ? asset.duration : null;
                  try {
                    const valRes = await fetch('/api/studio-polish/validate-asset', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        s3Url: url,
                        fileType: isVideo ? 'video' : 'image',
                        duration: assetDuration,
                      }),
                    });
                    if (!valRes.ok) {
                      const err = await valRes.json().catch(() => ({ error: 'Validation failed' }));
                      toast({ title: "Cannot add asset", description: err.error || 'Validation failed', variant: "destructive" });
                      return;
                    }
                    const valData = await valRes.json();
                    setUploadedFiles(prev => [...prev, {
                      fileId: asset.id || crypto.randomUUID(),
                      s3Url: url,
                      thumbnailUrl: asset.thumbnailUrl || url,
                      duration: valData.duration,
                      fileType: isVideo ? 'video' : 'image',
                      fileName: asset.name || asset.originalFilename || 'Asset',
                      fileSize: asset.fileSize || 0,
                    }]);
                    setShowAssetPicker(false);
                    toast({ title: "Added", description: asset.name || 'Asset added' });
                  } catch {
                    toast({ title: "Error", description: "Failed to validate asset", variant: "destructive" });
                  }
                }}
              />
            )}

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} · {formatDuration(totalDuration)} total
                  </span>
                </div>
                {uploadedFiles.map((file, idx) => (
                  <div key={file.fileId} className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-subtle)" }}>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => moveFile(idx, 'up')} disabled={idx === 0} className="disabled:opacity-30"><ChevronUp className="w-3 h-3" style={{ color: "var(--text-muted)" }} /></button>
                      <button onClick={() => moveFile(idx, 'down')} disabled={idx === uploadedFiles.length - 1} className="disabled:opacity-30"><ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} /></button>
                    </div>
                    <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--surface)" }}>
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {file.fileType === 'video' ? <Video className="w-4 h-4 text-amber-400" /> : <Image className="w-4 h-4 text-amber-400" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{file.fileName}</p>
                      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: file.fileType === 'video' ? 'rgb(251, 191, 36)' : 'rgb(168, 162, 158)', color: file.fileType === 'video' ? 'rgb(251, 191, 36)' : 'rgb(168, 162, 158)' }}>
                          {file.fileType === 'video' ? 'Video' : 'Image'}
                        </Badge>
                        <span>{formatDuration(file.duration)}</span>
                        <span>{formatFileSize(file.fileSize)}</span>
                      </div>
                    </div>
                    <button onClick={() => removeFile(idx)} className="p-1 rounded hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
                Back
              </Button>
              <Button onClick={() => { if (uploadedFiles.length === 0) { toast({ title: "No files", description: "Upload at least one file", variant: "destructive" }); return; } setStep(3); }}
                className="bg-amber-600 hover:bg-amber-700 text-white" disabled={uploading}>
                Next: Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--text-primary)" }}>Review & Create</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span style={{ color: "var(--text-muted)" }}>Title</span>
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>{title}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Platform</span>
                <p className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>{platform}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Aspect Ratio</span>
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>{aspectRatio}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Quality</span>
                <p className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>{qualityTier}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {uploadedFiles.length} scene{uploadedFiles.length > 1 ? 's' : ''} · {formatDuration(totalDuration)} total duration
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {uploadedFiles.map((f, i) => (
                  <Badge key={f.fileId} variant="outline" className="text-xs" style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
                    {i + 1}. {f.fileName.length > 20 ? f.fileName.substring(0, 20) + '...' : f.fileName}
                  </Badge>
                ))}
              </div>
            </div>
            {notes && (
              <div>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Notes</span>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{notes}</p>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
                Back
              </Button>
              <Button onClick={handleSubmit} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating...</> : 'Create Project'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// QC_IMAGE_PROVIDERS is derived from IMAGE_PROVIDER_CATALOG (showInDropdown:
// true entries) so new image providers only need a one-line catalog change.
const QC_IMAGE_PROVIDERS = getDropdownImageProviders();

// QC_I2I_PROVIDERS is derived from IMAGE_PROVIDER_CATALOG (showInI2IDropdown:
// true entries) so new I2I providers only need a one-line catalog change.
const QC_I2I_PROVIDERS = getDropdownI2IProviders();

// QC_V2V_PROVIDERS is derived from VIDEO_PROVIDER_CATALOG (showInV2VDropdown:
// true entries) so new V2V providers only need a one-line catalog change.
const QC_V2V_PROVIDERS = getDropdownV2VProviders();

export function QuickCreateForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [genMode, setGenMode] = useState<QuickCreateMode>('t2v');
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [duration, setDuration] = useState("6");
  const [imageStyle, setImageStyle] = useState("Photorealistic");
  const [imageFidelity, setImageFidelity] = useState(0.85);
  const [suzzieSuggestedFidelity, setSuzzieSuggestedFidelity] = useState<number | null>(null);
  const [artPresetId, setArtPresetId] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [provider, setProvider] = useState("auto");
  const [suzzieProviderRationale, setSuzzieProviderRationale] = useState<string | undefined>(undefined);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const [referenceImageUrl, setReferenceImageUrl] = useState("");
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [i2iTransformType, setI2iTransformType] = useState<string>("scene-integration");
  const [i2iStrength, setI2iStrength] = useState(0.65);
  const [audioUrl, setAudioUrl] = useState("");
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const refImageSectionRef = useRef<HTMLDivElement>(null);
  const refVideoSectionRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const additionalRefInputRef = useRef<HTMLInputElement>(null);
  const [additionalRefImages, setAdditionalRefImages] = useState<Array<{ url: string; preview: string }>>([]);
  const [isUploadingAdditionalRef, setIsUploadingAdditionalRef] = useState(false);

  const allPresets = getAllVisualArtPresets();
  const cfg = QC_MODE_CONFIG[genMode];
  const outputType = cfg.outputType;
  const i2vMultiImageSupport = genMode === 'i2v'
    ? (SHARED_VIDEO_PROVIDERS[provider]?.multiImageSupport ?? null)
    : null;

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
    if (genMode === 'i2i') return QC_I2I_PROVIDERS;
    return getDropdownVideoProviders(genMode as 't2v' | 'i2v');
  };
  const validProviderIds = getProviders().map(p => p.id);

  useEffect(() => {
    const newValidIds = (() => {
      if (genMode === 'v2v') return QC_V2V_PROVIDERS.map(p => p.id);
      if (genMode === 't2i') return QC_IMAGE_PROVIDERS.map(p => p.id);
      if (genMode === 'i2i') return QC_I2I_PROVIDERS.map(p => p.id);
      return getDropdownVideoProviders(genMode as 't2v' | 'i2v').map(p => p.id);
    })();
    if (provider !== "auto" && !newValidIds.includes(provider)) {
      setProvider("auto");
    }
    setAdditionalRefImages([]);
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
      const msg = `Please upload a reference image for ${genMode === 'i2i' ? 'I2I' : 'I2V'} mode.`;
      setValidationError(msg);
      toast({ title: "Reference image required", description: msg, variant: "destructive" });
      refImageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (wouldQCHandleSubmitBlock(genMode, referenceVideoUrl)) {
      const msg = "Please upload a reference video for V2V mode.";
      setValidationError(msg);
      toast({ title: "Reference video required", description: msg, variant: "destructive" });
      refVideoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (genMode === 'i2v' && provider === 'omni-human-1.5' && !audioUrl) {
      const msg = "OmniHuman 1.5 requires a speech audio clip for lip-sync.";
      setValidationError(msg);
      toast({ title: "Audio required", description: msg, variant: "destructive" });
      return;
    }
    const payload: any = {
      mode: "quick-create",
      generationMode: genMode,
      outputType,
      projectName: projectName.trim() || undefined,
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
      i2iTransformType: genMode === "i2i" ? i2iTransformType : undefined,
      i2iStrength: genMode === "i2i" ? i2iStrength : undefined,
      audioUrl: (genMode === 'i2v' && provider === 'omni-human-1.5' && audioUrl) ? audioUrl : undefined,
      referenceImages: (genMode === 'i2v' && additionalRefImages.length > 0)
        ? additionalRefImages.map(i => i.url)
        : undefined,
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
          <Label htmlFor="qc-project-name" style={{ color: "var(--text-secondary)" }}>
            Project Name <span style={{ color: "var(--text-tertiary)" }}>(Optional)</span>
          </Label>
          <input
            id="qc-project-name"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value.slice(0, 120))}
            placeholder="e.g. Spring launch teaser"
            maxLength={120}
            data-testid="input-quick-create-project-name"
            className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-transparent outline-none text-sm focus:border-purple-500 transition-colors"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Helps you tell quick-create projects apart in the dashboard. Leave blank to auto-name by date.
          </p>
        </div>

        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Generation Mode</Label>
          <div className="grid grid-cols-5 gap-2 mt-1.5">
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

        {genMode === 'i2v' && i2vMultiImageSupport && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>
              Additional Reference Images{' '}
              <span className="font-normal text-xs ml-1" style={{ color: "var(--text-tertiary)" }}>
                ({additionalRefImages.length}/{i2vMultiImageSupport.maxImages - 1})
              </span>
            </Label>
            <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-tertiary)" }}>
              Upload extra images to reference as @image2, @image3, etc. in your prompt.
            </p>
            {additionalRefImages.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {additionalRefImages.map((img, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border w-16 h-16" style={{ borderColor: "var(--border-medium)" }}>
                    <img src={img.preview} alt={`Ref ${idx + 2}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(img.preview);
                        setAdditionalRefImages(prev => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-red-600"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {additionalRefImages.length < (i2vMultiImageSupport.maxImages - 1) && (
              <>
                <button
                  type="button"
                  onClick={() => additionalRefInputRef.current?.click()}
                  disabled={isUploadingAdditionalRef}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs transition-all hover:border-purple-500/50"
                  style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                >
                  {isUploadingAdditionalRef ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                  {isUploadingAdditionalRef ? "Uploading…" : "Add Image"}
                </button>
                <input
                  ref={additionalRefInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const preview = URL.createObjectURL(file);
                      setIsUploadingAdditionalRef(true);
                      const formData = new FormData();
                      formData.append('file', file);
                      fetch('/api/videos/uploads', { method: 'POST', body: formData, credentials: 'include' })
                        .then(res => { if (!res.ok) throw new Error('Upload failed'); return res.json(); })
                        .then(data => {
                          if (data.url) {
                            setAdditionalRefImages(prev => [...prev, { url: data.url, preview }]);
                          } else {
                            URL.revokeObjectURL(preview);
                            toast({ title: 'Upload failed', description: 'No URL returned', variant: 'destructive' });
                          }
                        })
                        .catch(() => {
                          URL.revokeObjectURL(preview);
                          toast({ title: 'Upload failed', description: 'Could not upload image', variant: 'destructive' });
                        })
                        .finally(() => setIsUploadingAdditionalRef(false));
                    }
                    if (additionalRefInputRef.current) additionalRefInputRef.current.value = '';
                  }}
                />
              </>
            )}
          </div>
        )}

        {genMode === 'i2v' && provider === 'omni-human-1.5' && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Speech Audio * <span className="text-xs font-normal text-violet-400">(required for OmniHuman)</span></Label>
            <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-tertiary)" }}>Upload a speech audio clip — the portrait will lip-sync to it.</p>
            <div className="mt-1.5 space-y-2">
              {audioUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ backgroundColor: "var(--surface)", borderColor: "rgb(139,92,246,0.4)" }}>
                  <svg className="w-4 h-4 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                  <audio controls src={audioUrl} className="h-7 flex-1" style={{ maxWidth: '260px' }} />
                  <button type="button" onClick={() => { setAudioUrl(""); if (audioInputRef.current) audioInputRef.current.value = ""; }} className="text-red-400 hover:text-red-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isUploadingAudio}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed transition-all hover:border-violet-500/50"
                  style={{ borderColor: "rgba(139,92,246,0.4)", color: "var(--text-secondary)" }}
                >
                  {isUploadingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploadingAudio ? "Uploading..." : "Upload Speech Audio"}
                </button>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setValidationError(null);
                    uploadFile(file, setAudioUrl, null, setIsUploadingAudio, "Audio");
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
              onApplyProvider={(prov, rationale) => { setProvider(prov); setSuzzieProviderRationale(rationale); }}
              onApplyNegativePrompt={setNegativePrompt}
              onApplyCfgScale={(val) => { setImageFidelity(val); setSuzzieSuggestedFidelity(val); }}
            />
          </div>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={genMode === 'i2i' ? "Describe the transformation you want (e.g. 'Place this person in a modern office holding a laptop' or 'Show this product on a marble countertop with warm lighting')..." : "Describe the video clip or image you want to create..."} rows={4} required className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
          {genMode === 'i2v' && i2vMultiImageSupport && (
            <p className="mt-1.5 text-[11px] px-2 py-1.5 rounded" style={{ backgroundColor: "rgba(139,92,246,0.08)", color: "var(--text-secondary)", borderLeft: "2px solid rgba(139,92,246,0.4)" }}>
              {i2vMultiImageSupport.hint}
            </p>
          )}
        </div>

        {(genMode === 't2v' || genMode === 'i2v' || genMode === 'v2v' || genMode === 'i2i') && (
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

        {genMode === 'i2i' && (
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Transformation Type</Label>
            <Select value={i2iTransformType} onValueChange={setI2iTransformType}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                <SelectItem value="scene-integration" style={{ color: "var(--text-primary)" }}>Scene Integration — Place subject in a new environment</SelectItem>
                <SelectItem value="background-generation" style={{ color: "var(--text-primary)" }}>Background Swap — Change the background only</SelectItem>
                <SelectItem value="style-transfer" style={{ color: "var(--text-primary)" }}>Style Transfer — Apply a new artistic style</SelectItem>
                <SelectItem value="product-placement" style={{ color: "var(--text-primary)" }}>Product Placement — Create marketing visuals</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {i2iTransformType === 'scene-integration' && "Place your subject (person/product) into a completely new scene or environment."}
              {i2iTransformType === 'background-generation' && "Keep the subject intact and replace only the background."}
              {i2iTransformType === 'style-transfer' && "Transform the image into a different artistic style while preserving the composition."}
              {i2iTransformType === 'product-placement' && "Create polished marketing visuals featuring your product."}
            </p>
          </div>
        )}

        {genMode === 'i2i' && (
          <div>
            <div className="flex items-center justify-between">
              <Label style={{ color: "var(--text-secondary)" }}>Transformation Strength</Label>
              <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{Math.round(i2iStrength * 100)}%</span>
            </div>
            <Slider
              value={[i2iStrength]}
              onValueChange={([v]) => setI2iStrength(v)}
              min={0.1}
              max={1.0}
              step={0.05}
              className="mt-2"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Subtle changes</span>
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Full transformation</span>
            </div>
          </div>
        )}

        {genMode === 'i2v' && (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label style={{ color: "var(--text-secondary)" }}>Image Fidelity</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 cursor-help" style={{ color: "var(--text-tertiary)" }} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-left space-y-1.5 p-3">
                      <p className="font-medium text-xs">CFG Scale (Image Fidelity)</p>
                      <p className="text-xs opacity-90">Controls how closely the video follows the reference image. Higher = product label stays sharper. Lower = more creative movement.</p>
                      <div className="text-[10px] opacity-75 space-y-0.5 pt-0.5 border-t border-white/20">
                        <p>🏷️ Product / label scenes: 85–95%</p>
                        <p>👤 Character identity: 60–75%</p>
                        <p>🎨 Creative / abstract: 40–60%</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{Math.round(imageFidelity * 100)}%</span>
            </div>
            <div className="relative mt-2">
              <Slider
                value={[imageFidelity]}
                onValueChange={([v]) => setImageFidelity(v)}
                min={0.1}
                max={1.0}
                step={0.05}
              />
              {suzzieSuggestedFidelity !== null && (
                <div
                  className="absolute top-full pointer-events-none flex flex-col items-center"
                  style={{ left: `${((suzzieSuggestedFidelity - 0.1) / 0.9) * 100}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="w-px h-2 bg-cyan-400/60" />
                  <span className={`text-[9px] font-semibold whitespace-nowrap transition-colors ${Math.abs(imageFidelity - suzzieSuggestedFidelity) < 0.026 ? 'text-cyan-400' : 'text-cyan-600/60'}`}>
                    Suzzie ✦
                  </span>
                </div>
              )}
            </div>
            <div className={`flex justify-between ${suzzieSuggestedFidelity !== null ? 'mt-5' : 'mt-1'}`}>
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
                {[
                  { v: "4", label: "4s" }, { v: "5", label: "5s" }, { v: "6", label: "6s" },
                  { v: "8", label: "8s" }, { v: "10", label: "10s" }, { v: "15", label: "15s" },
                  { v: "20", label: "20s" }, { v: "30", label: "30s" }, { v: "60", label: "1 min" },
                ].map(({ v, label }) => (
                  <SelectItem key={v} value={v} style={{ color: "var(--text-primary)" }}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>Longer durations require a compatible provider (Seedance 2 → 15s, Motion Control → 30s, Kling Avatar → 1 min). Output is capped at the provider's max.</p>
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

        {isQCProviderSectionVisible(genMode, referenceVideoUrl) && <div>
          <Label style={{ color: "var(--text-secondary)" }}>Provider</Label>
          <Select value={provider} onValueChange={(val) => { setProvider(val); setSuzzieProviderRationale(undefined); setAdditionalRefImages([]); }}>
            <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}>
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{getProviders().find(p => p.id === provider)?.name ?? 'Select provider'}</span>
                {suzzieProviderRationale && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full cursor-default bg-green-500/15 text-green-300 border border-green-500/30 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                          Why?
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-left" side="bottom">
                        <p className="text-xs font-semibold mb-0.5 text-green-300">Suzzie's reasoning</p>
                        <p className="text-xs">{suzzieProviderRationale}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {providerSupportsMultiImage(provider) && (() => {
                  const support = getMultiImageSupport(provider);
                  const hint = support?.hint ?? "Supports multiple image references via @image_N syntax in your prompt.";
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap cursor-default">
                            <Images className="w-3 h-3" />
                            Multi-image
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-left" side="bottom">
                          {hint}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </span>
            </SelectTrigger>
            <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
              {getProviders().map((p) => (
                <SelectItem key={p.id} value={p.id} className="py-2" style={{ color: "var(--text-primary)" }}>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{p.name}</span>
                      {providerSupportsMultiImage(p.id) && (() => {
                        const support = getMultiImageSupport(p.id);
                        const hint = support?.hint ?? "Supports multiple image references via @image_N syntax in your prompt.";
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span data-testid={`provider-multi-image-badge-${p.id}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 whitespace-nowrap cursor-default">
                                  <Images className="w-3 h-3" />
                                  Multi-image
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-left" side="right">
                                {hint}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>
                    {(p as any).description && (
                      <div className="text-[11px] mt-0.5 leading-tight opacity-60">{(p as any).description}</div>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}

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

        {isQCAmberBannerVisible(genMode, referenceVideoUrl) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Film className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-300">Upload a reference video above to enable generation.</span>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" disabled={isLoading || isQCGenerateButtonDisabled(genMode, prompt, referenceVideoUrl, isUploadingVideo)}>
            {isLoading ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function DeckToVideoForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const { toast } = useToast();
  const { handle: handleGenerationError } = useGenerationErrorHandler();
  // Rehydrate from a persisted draft (set after a successful analysis) so an
  // unexpected reload returns the user to their results instead of the picker.
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(() => readDeckDraft()?.analysis ?? null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(() => readDeckDraft()?.title ?? "");
  const [projectTypeId, setProjectTypeId] = useState(() => readDeckDraft()?.projectTypeId ?? "youtube-ad");
  const [audience, setAudience] = useState<string>(() => readDeckDraft()?.audience ?? DEFAULT_DECK_AUDIENCE_ID);
  const [analyzedAudience, setAnalyzedAudience] = useState<string | null>(() => readDeckDraft()?.analyzedAudience ?? null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist the completed analysis (and the user's choices) so a reload can
  // restore it; clear the draft whenever there's no analysis to recover.
  useEffect(() => {
    try {
      if (analysis) {
        sessionStorage.setItem(
          DECK_DRAFT_KEY,
          JSON.stringify({ analysis, title, projectTypeId, audience, analyzedAudience }),
        );
      } else {
        sessionStorage.removeItem(DECK_DRAFT_KEY);
      }
    } catch {
      /* sessionStorage unavailable / quota — non-fatal, drop the safety net */
    }
  }, [analysis, title, projectTypeId, audience, analyzedAudience]);

  const projectTypes = getAllProjectTypes().filter((pt: any) => pt.id !== "long-story");

  const analyzeFile = async (f: File) => {
    if (f.type !== "application/pdf") {
      toast({ title: "PDF required", description: "Please upload a PDF deck.", variant: "destructive" });
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Decks must be under 50MB.", variant: "destructive" });
      return;
    }
    // Re-analyze (audience changed) keeps the existing, already-paid-for results
    // visible while it runs and restores them if it fails — LLM transient errors
    // are common here, and we don't want to discard a successful prior analysis.
    const isReanalyze = !!analysis;
    setFile(f);
    if (!isReanalyze) setAnalysis(null);
    setError(null);
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("audience", audience);
      formData.append("file", f);
      const res = await fetch("/api/deck-to-video/analyze", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        // Surface 402/403 envelopes (insufficient credits / plan) through the
        // shared top-up / upgrade flow instead of a generic error toast.
        const handled = await handleGenerationError(res, "Analysis failed");
        if (!handled) {
          let msg = "We couldn't analyze this deck. Please try again.";
          try {
            const data = await res.clone().json();
            if (data.error) msg = data.error;
          } catch {}
          toast({ title: "Analysis failed", description: msg, variant: "destructive" });
          // On a first analysis, keep a persistent banner so the failure stays
          // visible after the toast dismisses. On a re-analyze the prior results
          // remain on screen, so the toast alone is enough.
          if (!isReanalyze) setError(msg);
        }
        if (!isReanalyze) setFile(null);
        return;
      }
      const data = await res.json();
      setAnalysis(data.analysis);
      setAnalyzedAudience(audience);
      setProjectTypeId(getDeckAudience(audience).defaultFormat);
      setTitle(data.analysis?.suggestedTitle || f.name.replace(/\.pdf$/i, ""));
    } catch (err: any) {
      const msg = err?.message || "Something went wrong while analyzing your deck.";
      toast({ title: "Analysis failed", description: msg, variant: "destructive" });
      if (!isReanalyze) {
        setError(msg);
        setFile(null);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setAnalyzedAudience(null);
    setError(null);
    setTitle("");
  };

  const audienceChanged = !!analysis && analyzedAudience !== null && audience !== analyzedAudience;

  const handleConfirm = () => {
    if (!analysis) return;
    const ptConfig = getProjectType(projectTypeId);
    const usableImages = (analysis.images || []).filter((i: any) => i.usable && i.url);
    onSubmit({
      mode: "ai-script",
      title: title || analysis.suggestedTitle || "Deck Video",
      description: analysis.brief || analysis.coreMessage || "",
      targetAudience: analysis.targetAudience || undefined,
      duration: ptConfig?.defaultDuration || 60,
      platform: ptConfig?.platform || "YouTube",
      aspectRatio: ptConfig?.aspectRatio || "16:9",
      qualityTier: ptConfig?.qualityTier || "premium",
      artPresetId: "auto",
      projectType: projectTypeId,
      deck: {
        images: usableImages,
        coreMessage: analysis.coreMessage,
        theme: analysis.theme,
        suggestedDurationSec: analysis.suggestedDurationSec,
      },
    });
  };

  const usableImages = (analysis?.images || []).filter((i: any) => i.usable && i.url);
  const excludedImages = (analysis?.images || []).filter((i: any) => !i.usable);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Presentation className="w-6 h-6 text-pink-400" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Deck to Video</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label style={{ color: "var(--text-secondary)" }}>Audience / Intent</Label>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>
            Who is this video for? This steers which slides we keep and the script's tone and length.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Audience / Intent">
            {DECK_AUDIENCES.map((a) => {
              const selected = audience === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAudience(a.id)}
                  className="text-left rounded-lg p-3 transition-all"
                  style={{
                    backgroundColor: selected ? "rgba(139,92,246,0.12)" : "var(--surface)",
                    border: selected ? "1px solid rgb(139,92,246)" : "1px solid var(--border-subtle)",
                  }}
                  data-testid={`audience-${a.id}`}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{a.description}</p>
                </button>
              );
            })}
          </div>
          {audienceChanged && (
            <div className="flex items-center justify-between gap-3 mt-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Audience changed — re-analyze to update the kept slides and script direction (uses credits again).
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={analyzing || !file}
                onClick={() => file && analyzeFile(file)}
                style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                data-testid="button-deck-reanalyze"
              >
                {analyzing ? "Re-analyzing…" : "Re-analyze"}
              </Button>
            </div>
          )}
        </div>

        {!analysis && (
          <div className="space-y-1.5">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Analyzing a deck costs credits. Here's what it'll cost before you upload:
            </p>
            <CreditCost provider="deck-analysis" showDetail />
          </div>
        )}

        {!analysis && error && !analyzing && (
          <div
            className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)" }}
            data-testid="error-deck-analyze"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Analysis failed</p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Drop your deck again below to retry.</p>
            </div>
          </div>
        )}

        {!analysis && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => !analyzing && fileInputRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !analyzing) fileInputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (analyzing) return;
              const f = e.dataTransfer.files?.[0];
              if (f) analyzeFile(f);
            }}
            className="rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all"
            style={{
              borderColor: dragOver ? "rgb(244 114 182)" : "var(--border-medium)",
              backgroundColor: dragOver ? "rgba(244,114,182,0.06)" : "var(--surface)",
            }}
            data-testid="dropzone-deck"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f); e.target.value = ""; }}
              data-testid="input-deck-file"
            />
            {analyzing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-pink-400 animate-spin" />
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>Analyzing your deck…</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Reading text and visuals — this can take a minute or two for large decks.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-600/5 flex items-center justify-center">
                  <FileUp className="w-7 h-7 text-pink-400" />
                </div>
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>Drop your PDF deck here, or click to browse</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Pitch decks, concept decks, sales slides · PDF up to 50MB</p>
              </div>
            )}
          </div>
        )}

        {analysis && (
          <>
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{file?.name}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={reset} style={{ color: "var(--text-muted)" }} data-testid="button-deck-reset">
                <X className="w-4 h-4 mr-1" /> Replace
              </Button>
            </div>

            <Card style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <CardContent className="pt-5 space-y-4">
                {analysis.coreMessage && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Core message</p>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }} data-testid="text-deck-coremessage">{analysis.coreMessage}</p>
                  </div>
                )}
                {analysis.theme && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Theme</p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{analysis.theme}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                    Usable images ({usableImages.length})
                  </p>
                  {usableImages.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {usableImages.map((img: any) => (
                        <div key={img.id} className="relative group rounded-lg overflow-hidden aspect-video" style={{ border: "1px solid var(--border-subtle)" }} title={img.label}>
                          <img src={img.url} alt={img.label || `Page ${img.pageNumber}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No strong images found — your video will use AI-generated visuals.</p>
                  )}
                  {analysis.excludedCount > 0 && (
                    <details className="mt-2 group">
                      <summary className="text-xs cursor-pointer list-none flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                        {analysis.excludedCount} page{analysis.excludedCount === 1 ? "" : "s"} left out of the video — tap to see why
                      </summary>
                      <p className="text-xs mt-1.5 mb-1" style={{ color: "var(--text-muted)" }}>
                        For a <span style={{ color: "var(--text-secondary)" }}>{getDeckAudience(analyzedAudience || audience).label.toLowerCase()}</span> video we kept the slides that carry the story and left out covers, agendas, dividers, legal, and contact pages. If something important is missing, switch the audience above and re-analyze.
                      </p>
                      <ul className="mt-1 space-y-1">
                        {excludedImages.map((img: any) => (
                          <li key={img.id} className="text-xs flex gap-2" style={{ color: "var(--text-muted)" }}>
                            <span className="flex-shrink-0 font-medium" style={{ color: "var(--text-secondary)" }}>p.{img.pageNumber}</span>
                            <span className="min-w-0">
                              {img.label ? <span style={{ color: "var(--text-secondary)" }}>{img.label}</span> : null}
                              {img.label && img.reason ? " — " : ""}
                              {img.reason || (!img.label ? "Excluded" : "")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </CardContent>
            </Card>

            <div>
              <Label style={{ color: "var(--text-secondary)" }}>Project Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter project title" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} data-testid="input-deck-title" />
            </div>

            <div>
              <Label style={{ color: "var(--text-secondary)" }}>Video Format</Label>
              <Select value={projectTypeId} onValueChange={setProjectTypeId}>
                <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} data-testid="select-deck-projecttype"><SelectValue placeholder="Choose a format" /></SelectTrigger>
                <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                  {projectTypes.map((pt: any) => (
                    <SelectItem key={pt.id} value={pt.id} style={{ color: "var(--text-primary)" }}>
                      {pt.label}{pt.subtitle ? ` · ${pt.subtitle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-300" />
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                We'll draft a ~{analysis.suggestedDurationSec || 30}s {getDeckAudience(analyzedAudience || audience).label.toLowerCase()} video using the AI script engine, anchoring your deck's images to matching scenes. Generation uses AI credits based on your selected providers.
              </p>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack} style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {analysis && (
            <Button type="button" onClick={handleConfirm} className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500" disabled={isLoading || !title} data-testid="button-deck-create">
              {isLoading ? "Creating…" : "Create Video Project"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewProject() {
  // Resume an interrupted Deck-to-Video flow after an unexpected reload: if a
  // completed analysis draft was persisted, drop the user straight back into it.
  const [mode, setMode] = useState<Mode>(() => (readDeckDraft() ? "deck-to-video" : null));
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects/create", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      clearDeckDraft();
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
      {mode === "studio-polish" && <StudioPolishForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
      {mode === "deck-to-video" && <DeckToVideoForm onBack={() => { clearDeckDraft(); setMode(null); }} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
    </div>
  );
}
