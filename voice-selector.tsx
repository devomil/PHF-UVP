import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Pause, Check, Volume2 } from "lucide-react";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: voicesData, isLoading } = useQuery<{ success: boolean; voices: Voice[] }>({
    queryKey: ['/api/universal-video/voices'],
  });

  const voices = voicesData?.voices || [];

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
    <div className="space-y-3" data-testid="voice-selector">
      <Label className="flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Voiceover Voice
      </Label>
      
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
    </div>
  );
}
