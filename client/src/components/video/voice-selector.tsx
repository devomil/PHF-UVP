import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Pause, Check, Volume2, Mic, ChevronDown, ChevronUp } from "lucide-react";
import { VoiceCloneManager } from "./voice-clone-manager";

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: {
    accent?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
}

interface ClonedVoice {
  id: number;
  name: string;
  providerVoiceId: string | null;
  status: string;
}

interface VoiceSelectorProps {
  selectedVoiceId: string | undefined;
  onSelect: (voiceId: string, voiceName: string) => void;
}

const RECOMMENDED_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', reason: 'Warm & calm - ideal for wellness' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', reason: 'Soft & friendly' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', reason: 'Warm British accent' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', reason: 'Deep & trustworthy male' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', reason: 'Calm & professional male' },
];

export function VoiceSelector({ selectedVoiceId, onSelect }: VoiceSelectorProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showCloneManager, setShowCloneManager] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: voicesData, isLoading } = useQuery<{ success: boolean; voices: Voice[] }>({
    queryKey: ['/api/universal-video/voices'],
  });

  const { data: clonedData } = useQuery<{ success: boolean; voices: ClonedVoice[] }>({
    queryKey: ['/api/voice-cloning'],
    refetchInterval: (query) => {
      const voices = query.state.data?.voices ?? [];
      return voices.some((v) => v.status === "pending") ? 4000 : false;
    },
  });

  const voices = voicesData?.voices || [];
  const clonedVoices = clonedData?.voices || [];

  const playPreview = (voice: Voice) => {
    if (!voice.preview_url) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }

    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingVoiceId(voice.voice_id);

    audio.onended = () => {
      setPlayingVoiceId(null);
      audioRef.current = null;
    };

    audio.onerror = () => {
      setPlayingVoiceId(null);
      audioRef.current = null;
    };

    audio.play().catch(() => {
      setPlayingVoiceId(null);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground" data-testid="voice-selector-loading">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading voices...
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="voice-selector">
      <Label className="flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Voiceover Voice
      </Label>

      {clonedVoices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Mic className="w-3 h-3" /> My Cloned Voices:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {clonedVoices.map((cv) => {
              const isReady = cv.status === "ready";
              const voiceId = `cloned:${cv.id}`;
              const isSelected = selectedVoiceId === voiceId;
              const statusLabel =
                cv.status === "pending" ? "Processing…" :
                cv.status === "failed" ? "Failed" :
                null;
              return (
                <div
                  key={cv.id}
                  data-testid={`cloned-voice-option-${cv.id}`}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    !isReady
                      ? "border-border opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "border-primary bg-primary/5 cursor-pointer"
                      : "border-border hover:border-primary/50 cursor-pointer"
                  }`}
                  onClick={() => isReady && onSelect(voiceId, cv.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{cv.name}</span>
                      {isSelected && isReady && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                    {statusLabel ? (
                      <p className="text-xs text-muted-foreground">{statusLabel}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Your cloned voice</p>
                    )}
                  </div>
                  <Badge
                    variant={cv.status === "failed" ? "destructive" : "secondary"}
                    className="text-[10px] ml-2 shrink-0"
                  >
                    {cv.status === "ready" ? "cloned" : cv.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Recommended for Health & Wellness:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {RECOMMENDED_VOICES.map((rec) => {
            const voice = voices.find(v => v.voice_id === rec.id);
            const isSelected = selectedVoiceId === rec.id;
            const isPlaying = playingVoiceId === rec.id;
            
            return (
              <div
                key={rec.id}
                data-testid={`voice-option-${rec.id}`}
                className={`
                  flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors
                  ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                `}
                onClick={() => onSelect(rec.id, rec.name)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{rec.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.reason}</p>
                </div>
                {voice?.preview_url && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    data-testid={`play-voice-${rec.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playPreview(voice);
                    }}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <details className="group">
        <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground" data-testid="show-all-voices">
          Show all {voices.length} voices...
        </summary>
        <ScrollArea className="h-48 mt-2 rounded-lg border p-2">
          <div className="space-y-1">
            {voices.map((voice) => {
              const isSelected = selectedVoiceId === voice.voice_id;
              const isPlaying = playingVoiceId === voice.voice_id;
              
              return (
                <div
                  key={voice.voice_id}
                  data-testid={`voice-all-${voice.voice_id}`}
                  className={`
                    flex items-center justify-between p-2 rounded cursor-pointer transition-colors
                    ${isSelected ? 'bg-primary/10' : 'hover:bg-muted'}
                  `}
                  onClick={() => onSelect(voice.voice_id, voice.name)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{voice.name}</span>
                    {voice.labels.gender && (
                      <Badge variant="outline" className="text-xs">
                        {voice.labels.gender}
                      </Badge>
                    )}
                    {voice.labels.accent && (
                      <Badge variant="outline" className="text-xs">
                        {voice.labels.accent}
                      </Badge>
                    )}
                    {isSelected && <Check className="w-3 h-3 text-primary" />}
                  </div>
                  {voice.preview_url && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        playPreview(voice);
                      }}
                    >
                      {isPlaying ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </details>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowCloneManager((v) => !v)}
          data-testid="toggle-voice-clone-manager"
        >
          <span className="flex items-center gap-1.5">
            <Mic className="w-4 h-4" />
            Clone your own voice
          </span>
          {showCloneManager ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showCloneManager && (
          <div className="mt-3">
            <VoiceCloneManager
              selectedVoiceId={selectedVoiceId}
              onSelectVoice={onSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}
