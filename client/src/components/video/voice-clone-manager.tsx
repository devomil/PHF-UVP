import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Mic, Trash2, CheckCircle, XCircle, Clock, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ClonedVoice {
  id: number;
  name: string;
  sampleUrl: string;
  provider: string;
  providerVoiceId: string | null;
  status: "pending" | "ready" | "failed";
  errorMessage: string | null;
  createdAt: string;
}

interface VoiceCloneManagerProps {
  onSelectVoice?: (voiceId: string, voiceName: string) => void;
  selectedVoiceId?: string;
}

export function VoiceCloneManager({ onSelectVoice, selectedVoiceId }: VoiceCloneManagerProps) {
  const [voiceName, setVoiceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ success: boolean; voices: ClonedVoice[] }>({
    queryKey: ["/api/voice-cloning"],
    refetchInterval: (query) => {
      const voices = query.state.data?.voices ?? [];
      return voices.some((v) => v.status === "pending") ? 4000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !voiceName.trim()) throw new Error("Name and file are required");
      const formData = new FormData();
      formData.append("name", voiceName.trim());
      formData.append("sample", selectedFile);
      const res = await fetch("/api/voice-cloning", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice-cloning"] });
      setVoiceName("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Voice sample uploaded", description: "Your cloned voice is being processed." });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/voice-cloning/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice-cloning"] });
      toast({ title: "Voice deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!voiceName) {
      setVoiceName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({ title: "No file selected", description: "Please choose a WAV or MP3 file.", variant: "destructive" });
      return;
    }
    if (!voiceName.trim()) {
      toast({ title: "Name required", description: "Give your cloned voice a name.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate();
  };

  const copyVoiceSyntax = (voice: ClonedVoice) => {
    const syntax = `@voice:cloned:${voice.id}`;
    navigator.clipboard.writeText(syntax).then(() => {
      toast({ title: "Copied", description: `${syntax} copied to clipboard` });
    });
  };

  const voices = data?.voices ?? [];

  return (
    <div className="space-y-5" data-testid="voice-clone-manager">
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mic className="w-4 h-4 text-primary" />
          Clone Your Voice
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a WAV or MP3 sample (≥ 10 s, clear speech, minimal background noise) to create a personal cloned voice.
        </p>

        <div className="space-y-2">
          <Label htmlFor="voice-name" className="text-xs">Voice name</Label>
          <Input
            id="voice-name"
            placeholder="e.g. My Voice"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            className="h-8 text-sm"
            data-testid="voice-clone-name-input"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Audio sample</Label>
          <div
            className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/50 px-3 py-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="voice-sample-dropzone"
          >
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {selectedFile ? selectedFile.name : "Click to choose WAV or MP3…"}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp3,.wav,.mp3"
            className="hidden"
            onChange={handleFileChange}
            data-testid="voice-sample-file-input"
          />
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={handleUpload}
          disabled={uploadMutation.isPending || !selectedFile || !voiceName.trim()}
          data-testid="voice-clone-upload-button"
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Processing…</>
          ) : (
            <><Upload className="w-3 h-3 mr-2" /> Upload & Clone</>
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading cloned voices…
        </div>
      )}

      {!isLoading && voices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Cloned Voices</p>
          <div className="space-y-2">
            {voices.map((voice) => {
              const isSelected = selectedVoiceId === `cloned:${voice.id}`;
              return (
                <div
                  key={voice.id}
                  data-testid={`cloned-voice-${voice.id}`}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-background/50"
                  } ${voice.status === "ready" && onSelectVoice ? "cursor-pointer hover:border-primary/50" : ""}`}
                  onClick={() => {
                    if (voice.status === "ready" && onSelectVoice) {
                      onSelectVoice(`cloned:${voice.id}`, voice.name);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{voice.name}</span>
                      <StatusBadge status={voice.status} />
                    </div>
                    {voice.status === "failed" && voice.errorMessage && (
                      <p className="text-xs text-destructive mt-0.5 truncate">{voice.errorMessage}</p>
                    )}
                    {voice.status === "ready" && voice.providerVoiceId && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                        ID: {voice.providerVoiceId}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {voice.status === "ready" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Copy @voice syntax"
                        data-testid={`copy-voice-syntax-${voice.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyVoiceSyntax(voice);
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete voice"
                      data-testid={`delete-voice-${voice.id}`}
                      disabled={deleteMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(voice.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && voices.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No cloned voices yet. Upload a sample above to get started.</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 bg-green-500/10 text-green-400 border-green-500/20">
        <CheckCircle className="w-2.5 h-2.5" /> Ready
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
        <Clock className="w-2.5 h-2.5" /> Processing
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/20">
      <XCircle className="w-2.5 h-2.5" /> Failed
    </Badge>
  );
}
