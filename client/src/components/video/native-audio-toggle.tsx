// Per-scene native-audio toggle. Disabled with a tooltip when the
// resolved provider doesn't advertise `supportsNativeAudio` in the
// shared provider catalog (Task #136 — single source of truth).
//
// Per-provider mode gates layered on top of the catalog flag:
//   • Seedance 2 (T2V or I2V) — always supported.
//   • Veo (any variant) — supported in both T2V and I2V (Task #139).
//     The piapi Veo T2V and I2V branches both forward
//     `generateNativeAudio` to `generate_audio` on the wire.
//
// When the scene also has a voiceover, surfaces a "Mute voiceover"
// AlertDialog so the caller can clear the narration before the audio
// sources collide.

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Volume2, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { providerSupportsNativeAudio } from "@shared/provider-catalog";

interface Props {
  provider: string | undefined;
  value: boolean;
  hasVoiceover: boolean;
  // Task #139: Veo now supports native audio in both T2V and I2V modes,
  // matching Seedance 2. The toggle no longer requires an attached
  // image, so this prop is kept only for backwards compatibility with
  // existing call sites and is not used to gate the switch.
  hasImage?: boolean;
  onChange: (next: boolean) => void | Promise<void>;
  // Called when the user confirms muting the voiceover from the conflict
  // warning. Implementations should clear `scene.narration` (PATCH with
  // `narration: ""`).
  onMuteVoiceover?: () => void | Promise<void>;
  disabled?: boolean;
}

export function NativeAudioToggle({
  provider,
  value,
  hasVoiceover,
  hasImage: _hasImage = false,
  onChange,
  onMuteVoiceover,
  disabled,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [muting, setMuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Catalog says the provider supports audio at all (Task #136).
  // Task #139: Veo now supports native audio in both T2V and I2V, so
  // the catalog flag alone is sufficient — no extra image gate.
  const supportsNativeAudio = providerSupportsNativeAudio(provider);
  const effectivelyDisabled = disabled || !supportsNativeAudio;
  const showWarning = supportsNativeAudio && value && hasVoiceover;

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmMute() {
    if (!onMuteVoiceover) {
      setConfirmOpen(false);
      return;
    }
    setMuting(true);
    try {
      await onMuteVoiceover();
      setConfirmOpen(false);
    } finally {
      setMuting(false);
    }
  }

  // Tooltip copy explains why the toggle is locked.
  function disabledTooltip(): string {
    if (!provider) {
      return "Native audio requires a model that supports it.";
    }
    return `Native audio isn't supported on this model (current model: ${provider}).`;
  }

  function helperText(): string {
    if (supportsNativeAudio) {
      return "When on, the model generates ambient audio inside the clip itself.";
    }
    return "Switch to a model that supports native audio to enable this.";
  }

  const switchEl = (
    <Switch
      checked={value}
      disabled={effectivelyDisabled || saving}
      onCheckedChange={handleToggle}
      data-testid="scene-native-audio-switch"
      aria-label="Enable native scene audio"
    />
  );

  return (
    <div
      className="space-y-2 p-3 bg-muted/50 rounded-lg"
      data-testid="scene-native-audio-toggle"
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          Native scene audio
          {saving && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
        </Label>
        {effectivelyDisabled ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span keeps the disabled switch tooltip-able */}
                <span data-testid="scene-native-audio-disabled-wrap">{switchEl}</span>
              </TooltipTrigger>
              <TooltipContent side="top">{disabledTooltip()}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          switchEl
        )}
      </div>

      <p className="text-xs text-muted-foreground">{helperText()}</p>

      {showWarning && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="scene-native-audio-conflict"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1 text-xs">
            <p className="font-medium">
              Voiceover may clash with generated scene audio.
            </p>
            <p>
              Mixing your TTS narration with the model's ambient audio almost
              always sounds wrong. Consider muting the voiceover for this
              scene.
            </p>
            <button
              type="button"
              className="inline-flex items-center text-xs font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50"
              onClick={() => setConfirmOpen(true)}
              disabled={!onMuteVoiceover || muting}
              data-testid="scene-native-audio-mute-voiceover"
            >
              Mute voiceover for this scene
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="scene-native-audio-mute-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Mute voiceover for this scene?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the narration for this scene only. The clip will
              play with its own generated audio. You can paste the narration
              back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={muting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMute}
              disabled={muting}
              data-testid="scene-native-audio-mute-confirm-action"
            >
              {muting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Muting…
                </>
              ) : (
                "Mute voiceover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
