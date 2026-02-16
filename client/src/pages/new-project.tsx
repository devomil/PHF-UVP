import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, Zap, ArrowLeft, Video, Image } from "lucide-react";
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
      <h1 className="text-3xl font-bold mb-2">Create New Project</h1>
      <p className="text-gray-400 mb-8">Choose how you want to create your video or image</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <Card
              key={mode.id}
              className={`bg-white/[0.03] border border-white/[0.06] cursor-pointer transition-all duration-300 ${mode.border} ${mode.glow} hover:shadow-lg hover:-translate-y-1`}
              onClick={() => onSelect(mode.id)}
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${mode.gradient} flex items-center justify-center mb-3`}>
                  <Icon className={`w-6 h-6 ${mode.iconColor}`} />
                </div>
                <CardTitle className="text-white text-lg">{mode.title}</CardTitle>
                <CardDescription className="text-gray-400 mt-2">{mode.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="border-white/[0.08] text-gray-400 text-xs">
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
        <h2 className="text-2xl font-bold">AI-Generated Script</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label className="text-gray-300">Project Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter project title" className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        <div>
          <Label className="text-gray-300">Description / Brief</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you want your video to be about..." rows={4} className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        <div>
          <Label className="text-gray-300">Target Audience</Label>
          <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g., Young professionals, Tech enthusiasts" className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Target Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["15", "30", "60", "90", "120", "180"].map((d) => (
                  <SelectItem key={d} value={d} className="text-white">{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["YouTube", "TikTok", "Instagram Reels", "Instagram Post", "Facebook", "Website"].map((p) => (
                  <SelectItem key={p} value={p} className="text-white">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["16:9", "9:16", "1:1"].map((ar) => (
                  <SelectItem key={ar} value={ar} className="text-white">{ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Quality Tier</Label>
            <Select value={qualityTier} onValueChange={setQualityTier}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["ultra", "premium", "standard"].map((q) => (
                  <SelectItem key={q} value={q} className="text-white">{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-gray-300">Media Mode</Label>
          <div className="flex gap-3 mt-1.5">
            <Button type="button" variant={mediaMode === "video" ? "default" : "outline"} className={mediaMode === "video" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : "border-white/[0.08] text-gray-400"} onClick={() => setMediaMode("video")}>
              <Video className="w-4 h-4 mr-2" /> Video
            </Button>
            <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} className={mediaMode === "image" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : "border-white/[0.08] text-gray-400"} onClick={() => setMediaMode("image")}>
              <Image className="w-4 h-4 mr-2" /> Image-only
            </Button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" className="border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" onClick={onBack}>
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
        <h2 className="text-2xl font-bold">Custom Script</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label className="text-gray-300">Project Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter project title" className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        <div>
          <Label className="text-gray-300">Script</Label>
          <Textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Write or paste your script here..." rows={8} className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Number of Scenes</Label>
            <Input type="number" value={numScenes} onChange={(e) => setNumScenes(e.target.value)} min="1" max="50" className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
          </div>
          <div>
            <Label className="text-gray-300">Target Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["15", "30", "60", "90", "120", "180"].map((d) => (
                  <SelectItem key={d} value={d} className="text-white">{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["YouTube", "TikTok", "Instagram Reels", "Instagram Post", "Facebook", "Website"].map((p) => (
                  <SelectItem key={p} value={p} className="text-white">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["16:9", "9:16", "1:1"].map((ar) => (
                  <SelectItem key={ar} value={ar} className="text-white">{ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Visual Style</Label>
            <Select value={visualStyle} onValueChange={setVisualStyle}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["Professional", "Cinematic", "Minimal", "Bold", "Playful"].map((s) => (
                  <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Voice Style</Label>
            <Select value={voiceStyle} onValueChange={setVoiceStyle}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["Professional", "Conversational", "Energetic", "Calm", "Dramatic"].map((s) => (
                  <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-gray-300">Media Mode</Label>
          <div className="flex gap-3 mt-1.5">
            <Button type="button" variant={mediaMode === "video" ? "default" : "outline"} className={mediaMode === "video" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : "border-white/[0.08] text-gray-400"} onClick={() => setMediaMode("video")}>
              <Video className="w-4 h-4 mr-2" /> Video
            </Button>
            <Button type="button" variant={mediaMode === "image" ? "default" : "outline"} className={mediaMode === "image" ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500" : "border-white/[0.08] text-gray-400"} onClick={() => setMediaMode("image")}>
              <Image className="w-4 h-4 mr-2" /> Image-only
            </Button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" className="border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" onClick={onBack}>
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
        <h2 className="text-2xl font-bold">Quick Create</h2>
      </div>

      <div className="space-y-5">
        <div>
          <Label className="text-gray-300">Output Type</Label>
          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <Card className={`cursor-pointer transition-all duration-200 ${outputType === "video" ? "bg-purple-600/20 border-purple-500" : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]"}`} onClick={() => setOutputType("video")}>
              <CardContent className="flex items-center justify-center gap-2 p-4">
                <Video className={`w-5 h-5 ${outputType === "video" ? "text-purple-400" : "text-gray-400"}`} />
                <span className={outputType === "video" ? "text-white font-medium" : "text-gray-400"}>Video</span>
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all duration-200 ${outputType === "image" ? "bg-purple-600/20 border-purple-500" : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]"}`} onClick={() => setOutputType("image")}>
              <CardContent className="flex items-center justify-center gap-2 p-4">
                <Image className={`w-5 h-5 ${outputType === "image" ? "text-purple-400" : "text-gray-400"}`} />
                <span className={outputType === "image" ? "text-white font-medium" : "text-gray-400"}>Image</span>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <Label className="text-gray-300">Prompt *</Label>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the video clip or image you want to create..." rows={4} required className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white" />
        </div>

        {outputType === "video" ? (
          <div>
            <Label className="text-gray-300">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["4", "6", "8", "10"].map((d) => (
                  <SelectItem key={d} value={d} className="text-white">{d}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="text-gray-300">Style</Label>
            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["Photorealistic", "Illustration", "3D Render", "Anime", "Abstract"].map((s) => (
                  <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Aspect Ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {["16:9", "9:16", "1:1"].map((ar) => (
                  <SelectItem key={ar} value={ar} className="text-white">{ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="mt-1.5 bg-white/[0.03] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/[0.08]">
                {[{ value: "auto", label: "Auto-select" }, { value: "kling", label: "Kling" }, { value: "runwayml", label: "RunwayML" }, { value: "luma", label: "Luma" }, { value: "pika", label: "Pika" }, { value: "veo", label: "Veo" }].map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-white">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="saveToLibrary" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} className="rounded border-white/[0.08] bg-white/[0.03]" />
          <Label htmlFor="saveToLibrary" className="text-gray-300 cursor-pointer">Save to Asset Library</Label>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" className="border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" onClick={onBack}>
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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects/create", data);
      return res.json();
    },
    onSuccess: (data: any) => {
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
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 inline-flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {mode === null && <ModeSelection onSelect={setMode} />}
      {mode === "ai-script" && <AIScriptForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
      {mode === "custom-script" && <CustomScriptForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
      {mode === "quick-create" && <QuickCreateForm onBack={() => setMode(null)} onSubmit={handleSubmit} isLoading={createMutation.isPending} />}
    </div>
  );
}
