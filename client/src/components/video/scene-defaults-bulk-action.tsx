// Phase 20D (Task #126): project-header "Scene defaults" bulk action.
//
// Lets the user push a duration preset and/or a native-audio default
// to every scene in the project in a single PUT call. The flow is:
//
//   1. Click "Scene defaults" → opens a compact themed Dialog
//      (project doesn't ship Popover; Dialog is the closest themed
//      surface and avoids adding another dep).
//   2. Pick a duration preset and toggle "Native scene audio".
//   3. "Apply to all scenes" opens a themed AlertDialog confirmation
//      (lint:dialogs forbids window.confirm) showing the scene count.
//   4. On confirm, we issue exactly ONE PUT request to
//      `/api/universal-video/projects/${projectId}/scenes` with the
//      mutated `scenes` array.

import { useEffect, useMemo, useState } from "react";
import { Sliders, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DURATION_PRESETS = [5, 8, 12] as const;

interface MinimalScene {
  id: string;
  duration?: number;
  generateNativeAudio?: boolean;
  [k: string]: any;
}

interface Props {
  projectId: string;
  scenes: MinimalScene[];
  onUpdated?: () => void;
  // Optional: if the project already exposes a preferred provider, we
  // surface a warning when it isn't a Seedance 2 model (because no
  // other provider honors `generateNativeAudio`).
  projectPreferredProvider?: string;
}

const SEEDANCE_2 = new Set(["seedance-2.0", "seedance-2.0-fast"]);

export function SceneDefaultsBulkAction({
  projectId,
  scenes,
  onUpdated,
  projectPreferredProvider,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [duration, setDuration] = useState<number | null>(null);
  const [setAudio, setSetAudio] = useState(false);
  const [audioValue, setAudioValue] = useState(false);

  // Reset whenever the popup opens.
  useEffect(() => {
    if (open) {
      setDuration(null);
      setSetAudio(false);
      setAudioValue(false);
    }
  }, [open]);

  const sceneCount = scenes.length;
  const audioWillBeIgnored = useMemo(
    () =>
      setAudio &&
      audioValue &&
      !!projectPreferredProvider &&
      !SEEDANCE_2.has(projectPreferredProvider),
    [setAudio, audioValue, projectPreferredProvider],
  );

  const nothingSelected = duration === null && !setAudio;

  async function applyDefaults() {
    if (nothingSelected) return;
    setSaving(true);
    try {
      const updatedScenes = scenes.map((s) => {
        const next: MinimalScene = { ...s };
        if (duration !== null) next.duration = duration;
        if (setAudio) next.generateNativeAudio = audioValue;
        return next;
      });
      // Single PUT — endpoint replaces the entire scenes array
      // (server/services/universal-video-routes.ts:1395).
      await apiRequest(
        "PUT",
        `/api/universal-video/projects/${projectId}/scenes`,
        { scenes: updatedScenes },
      );
      toast({
        title: "Scene defaults applied",
        description:
          duration !== null && setAudio
            ? `${sceneCount} scenes set to ${duration}s with audio ${audioValue ? "on" : "off"}.`
            : duration !== null
            ? `${sceneCount} scenes set to ${duration}s.`
            : `Native audio ${audioValue ? "enabled" : "disabled"} on ${sceneCount} scenes.`,
      });
      setConfirmOpen(false);
      setOpen(false);
      onUpdated?.();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to apply scene defaults",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          data-testid="scene-defaults-bulk-trigger"
          disabled={sceneCount === 0}
        >
          <Sliders className="w-4 h-4" />
          Scene defaults
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        data-testid="scene-defaults-bulk-dialog"
      >
        <DialogHeader>
          <DialogTitle>Scene defaults</DialogTitle>
          <DialogDescription>
            Apply duration and audio defaults to all {sceneCount} scenes in
            this project. You can still override per-scene in the editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Duration preset</Label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((preset) => {
                const active = duration === preset;
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() =>
                      setDuration((prev) => (prev === preset ? null : preset))
                    }
                    data-testid={`scene-defaults-preset-${preset}`}
                    aria-pressed={active}
                  >
                    {preset}s
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {duration === null
                ? "Tap a preset to apply it to every scene."
                : `Every scene will be set to ${duration} seconds.`}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">
                Set native scene audio
              </Label>
              <Switch
                checked={setAudio}
                onCheckedChange={setSetAudio}
                data-testid="scene-defaults-audio-set-switch"
                aria-label="Apply native audio default"
              />
            </div>
            {setAudio && (
              <div className="flex items-center justify-between gap-3 pl-1">
                <Label className="text-xs text-muted-foreground">
                  Native audio is {audioValue ? "on" : "off"} for every scene
                </Label>
                <Switch
                  checked={audioValue}
                  onCheckedChange={setAudioValue}
                  data-testid="scene-defaults-audio-value-switch"
                  aria-label="Native audio default value"
                />
              </div>
            )}
            {audioWillBeIgnored && (
              <p
                className="text-xs text-amber-600 dark:text-amber-400"
                data-testid="scene-defaults-audio-warning"
              >
                Heads up: native audio is only honored by Seedance 2. Your
                current model is {projectPreferredProvider}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={nothingSelected || saving}
            data-testid="scene-defaults-apply-button"
          >
            Apply to all scenes
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid="scene-defaults-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Apply to {sceneCount} scenes?</AlertDialogTitle>
              <AlertDialogDescription>
                This overwrites the current per-scene values. You can still
                tweak any scene afterwards in its editor.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // AlertDialogAction auto-closes; we keep the parent
                  // dialog open until the request resolves so the
                  // user sees the saving spinner.
                  e.preventDefault();
                  void applyDefaults();
                }}
                disabled={saving}
                data-testid="scene-defaults-confirm-action"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : (
                  "Apply"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
