import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image, Info } from "lucide-react";
import { getVideoProviders, getImageProviders, COST_TIER_LABELS } from "@shared/provider-catalog";
import type { ProviderCatalogEntry } from "@shared/provider-catalog";
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
  const [qualityTier, setQualityTier] = useState("premium");

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
      qualityTier,
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

function CustomScriptForm({ onBack, onSubmit, isLoading }: { onBack: () => void; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [numScenes, setNumScenes] = useState("5");
  const [duration, setDuration] = useState("60");
  const [platform, setPlatform] = useState("YouTube");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [visualStyle, setVisualStyle] = useState("Professional");
  const [voiceStyle, setVoiceStyle] = useState("Professional");
  const [mediaMode, setMediaMode] = useState("video");

  useEffect(() => {
    setAspectRatio(platformAspectMap[platform] || "16:9");
  }, [platform]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      mode: "custom-script",
      title,
      script,
      numScenes: parseInt(numScenes),
      duration: parseInt(duration),
      platform,
      aspectRatio,
      visualStyle,
      voiceStyle,
      mediaMode,
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
          <Label style={{ color: "var(--text-secondary)" }}>Script</Label>
          <Textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Write or paste your script here..." rows={8} className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Number of Scenes</Label>
            <Input type="number" value={numScenes} onChange={(e) => setNumScenes(e.target.value)} min="1" max="50" className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }} />
          </div>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label style={{ color: "var(--text-secondary)" }}>Visual Style</Label>
            <Select value={visualStyle} onValueChange={setVisualStyle}>
              <SelectTrigger className="mt-1.5" style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--text-primary)" }}><SelectValue /></SelectTrigger>
              <SelectContent style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
                {["Professional", "Cinematic", "Minimal", "Bold", "Playful"].map((s) => (
                  <SelectItem key={s} value={s} style={{ color: "var(--text-primary)" }}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

function ProviderSelector({ outputType, provider, onProviderChange }: { outputType: "video" | "image"; provider: string; onProviderChange: (v: string) => void }) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const providers = outputType === "video" ? getVideoProviders() : getImageProviders();

  const families = Array.from(new Set(providers.map(p => p.family)));

  const filteredProviders = searchQuery
    ? providers.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.family.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : providers;

  const selectedProvider = providers.find(p => p.id === provider);

  return (
    <div>
      <Label style={{ color: "var(--text-secondary)" }}>Provider</Label>
      <div className="mt-1.5 space-y-2">
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
          style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--input-border)" }}
          onClick={() => setExpandedProvider(expandedProvider ? null : "open")}
        >
          <div className="flex items-center gap-2 min-w-0">
            {provider === "auto" ? (
              <span style={{ color: "var(--text-primary)" }}>Auto-select (recommended)</span>
            ) : selectedProvider ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{selectedProvider.name}</span>
                {selectedProvider.highlight && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 whitespace-nowrap">{selectedProvider.highlight}</span>
                )}
                <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{selectedProvider.capabilities.join(" · ")}</span>
              </div>
            ) : (
              <span style={{ color: "var(--text-primary)" }}>{provider}</span>
            )}
          </div>
          <svg className={`w-4 h-4 transition-transform ${expandedProvider ? "rotate-180" : ""}`} style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>

        {expandedProvider && (
          <div className="border rounded-lg overflow-hidden" style={{ backgroundColor: "var(--menu-bg)", borderColor: "var(--border-medium)" }}>
            <div className="p-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <input
                type="text"
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded text-sm bg-transparent outline-none"
                style={{ color: "var(--text-primary)" }}
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3"
                style={{
                  backgroundColor: provider === "auto" ? "var(--surface-active)" : "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => { onProviderChange("auto"); setExpandedProvider(null); setSearchQuery(""); }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-active)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = provider === "auto" ? "var(--surface-active)" : "transparent")}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Auto-select</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">Recommended</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Intelligently picks the best provider based on your prompt, duration, and aspect ratio
                  </p>
                </div>
              </button>

              {families.map(family => {
                const familyProviders = filteredProviders.filter(p => p.family === family);
                if (familyProviders.length === 0) return null;
                return (
                  <div key={family}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
                      {family}
                    </div>
                    {familyProviders.map(p => {
                      const costInfo = COST_TIER_LABELS[p.costTier];
                      return (
                        <button
                          type="button"
                          key={p.id}
                          className="w-full text-left px-3 py-2.5 transition-colors flex items-start gap-3"
                          style={{
                            backgroundColor: provider === p.id ? "var(--surface-active)" : "transparent",
                            color: "var(--text-primary)",
                          }}
                          onClick={() => { onProviderChange(p.id); setExpandedProvider(null); setSearchQuery(""); }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-active)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = provider === p.id ? "var(--surface-active)" : "transparent")}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--surface)" }}>
                            {p.type === "video" ? <Video className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <Image className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{p.name}</span>
                              {p.highlight && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 whitespace-nowrap">{p.highlight}</span>
                              )}
                              <span className="text-[10px] font-medium ml-auto" style={{ color: costInfo.color }}>{costInfo.label}</span>
                            </div>
                            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                              {p.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {p.capabilities.map(cap => (
                                <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>{cap}</span>
                              ))}
                              {p.maxDuration > 0 && (
                                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Up to {p.maxDuration}s</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
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

        <ProviderSelector outputType={outputType} provider={provider} onProviderChange={setProvider} />

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
