// Phase 20D (Task #126): per-scene Seedance 2 native-audio toggle.
//
// Renders a themed switch + an actionable conflict warning when the
// scene also has a non-empty narration (TTS voiceover). The warning
// surfaces a "Mute voiceover" affordance that opens a themed
// AlertDialog (no native window.confirm — lint:dialogs forbids it)
// and, when confirmed, clears `scene.narration`. The toggle itself
// is disabled with a tooltip when the resolved provider isn't a
// Seedance 2 variant, because no other model honors the flag.

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

const SEEDANCE_2_PROVIDERS = new Set(["seedance-2.0", "seedance-2.0-fast"]);

interface Props {
  provider: string | undefined;
  value: boolean;
  hasVoiceover: boolean;
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
  onChange,
  onMuteVoiceover,
  disabled,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [muting, setMuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSeedance2 = provider ? SEEDANCE_2_PROVIDERS.has(provider) : false;
  const effectivelyDisabled = disabled || !isSeedance2;
  const showWarning = isSeedance2 && value && hasVoiceover;

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

  const switchEl = (
    <Switch
      checked={value}
      disabled={effectivelyDisabled || saving}
      onCheckedChange={handleToggle}
      data-testid="scene-native-audio-switch"
      aria-label="Enable native Seedance 2 audio"
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
              <TooltipContent side="top">
                {provider
                  ? `Native audio is only supported on Seedance 2 (current model: ${provider}).`
                  : "Native audio requires a Seedance 2 video model."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          switchEl
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {isSeedance2
          ? "When on, Seedance 2 generates ambient audio inside the clip itself."
          : "Switch to a Seedance 2 model to generate native scene audio."}
      </p>

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
              Mixing your TTS narration with Seedance ambient audio almost
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
              This clears the narration for this scene only. The Seedance 2
              clip will play with its own generated audio. You can paste the
              narration back at any time.
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
