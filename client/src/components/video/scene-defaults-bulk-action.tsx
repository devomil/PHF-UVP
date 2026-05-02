// Project-header "Scene defaults" bulk action: pushes a duration preset
// and/or a native-audio default to a configurable subset of scenes via
// a single PUT. The scope picker (Task #128) keeps it from clobbering
// scenes the user has already tuned.

import { useEffect, useMemo, useState } from "react";
import { Sliders, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { formatUsd, getCostPerSecond } from "./scene-cost";

const DURATION_PRESETS = [5, 8, 12] as const;

type MinimalScene = {
  id: string;
  order?: number;
  type?: string;
  duration?: number;
  generateNativeAudio?: boolean;
};

type Scope = "all" | "untouched" | "selected";

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

// Pick the most common value in `values` (the modal/mode). On ties we
// just take the first one we saw — good enough for "what looks like
// the project's default for this field".
function modeOf<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

// Short, human label for a scene in the picker. We only have the
// minimal fields, so prefer order+id-suffix and fall back to the id.
function sceneLabel(s: MinimalScene, index: number): string {
  const num =
    typeof s.order === "number" && Number.isFinite(s.order)
      ? s.order + 1
      : index + 1;
  const idTail = s.id.length > 14 ? `…${s.id.slice(-10)}` : s.id;
  return `Scene ${num} (${idTail})`;
}

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

  const [scope, setScope] = useState<Scope>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset whenever the popup opens.
  useEffect(() => {
    if (open) {
      setDuration(null);
      setSetAudio(false);
      setAudioValue(false);
      setScope("all");
      setSelectedIds(new Set());
    }
  }, [open]);

  const sceneCount = scenes.length;

  // Task #127: live render-cost preview. Uses the project's preferred
  // provider as a stand-in for the per-scene provider (scenes don't
  // carry their own provider in the data model — they inherit the
  // project's). The preview is hidden when we don't have a known cost
  // rate for that provider so we never invent a number.
  const ratePerSecond = useMemo(
    () => getCostPerSecond(projectPreferredProvider),
    [projectPreferredProvider],
  );
  const currentTotalSeconds = useMemo(
    () => scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    [scenes],
  );
  const newTotalSeconds =
    duration !== null ? sceneCount * duration : currentTotalSeconds;
  const currentTotalCost =
    ratePerSecond !== undefined ? currentTotalSeconds * ratePerSecond : null;
  const newTotalCost =
    ratePerSecond !== undefined ? newTotalSeconds * ratePerSecond : null;

  const audioWillBeIgnored = useMemo(
    () =>
      setAudio &&
      audioValue &&
      !!projectPreferredProvider &&
      !SEEDANCE_2.has(projectPreferredProvider),
    [setAudio, audioValue, projectPreferredProvider],
  );

  const nothingSelected = duration === null && !setAudio;

  // Modal/most-common values for the fields we're about to change.
  // These define what counts as an "untouched" scene — i.e. one whose
  // current value still matches the project's prevailing default.
  const modalDuration = useMemo(
    () =>
      modeOf(
        scenes
          .map((s) => s.duration)
          .filter((d): d is number => typeof d === "number"),
      ),
    [scenes],
  );
  const modalAudio = useMemo(
    () =>
      modeOf(
        scenes
          .map((s) => s.generateNativeAudio)
          .filter((v): v is boolean => typeof v === "boolean"),
      ),
    [scenes],
  );

  // For "untouched", a scene qualifies only if every field we're about
  // to mutate currently matches the project's modal value. If a field
  // isn't being changed we don't constrain on it.
  const untouchedIds = useMemo(() => {
    if (nothingSelected) return [] as string[];
    return scenes
      .filter((s) => {
        if (duration !== null) {
          if (modalDuration === undefined) return false;
          if (s.duration !== modalDuration) return false;
        }
        if (setAudio) {
          // Treat undefined-audio as the project's modal value when
          // modalAudio itself is undefined; otherwise it must match.
          if (modalAudio === undefined) {
            if (s.generateNativeAudio !== undefined) return false;
          } else if ((s.generateNativeAudio ?? modalAudio) !== modalAudio) {
            return false;
          }
        }
        return true;
      })
      .map((s) => s.id);
  }, [scenes, duration, setAudio, modalDuration, modalAudio, nothingSelected]);

  const targetIds = useMemo<string[]>(() => {
    if (scope === "all") return scenes.map((s) => s.id);
    if (scope === "untouched") return untouchedIds;
    // "selected": preserve project order
    return scenes.map((s) => s.id).filter((id) => selectedIds.has(id));
  }, [scope, scenes, untouchedIds, selectedIds]);

  const targetCount = targetIds.length;

  // Human-readable summary of the chosen mutations, shown in the
  // confirm dialog so the user always sees exactly what's about to
  // change before they hit "Apply".
  const summaryItems: string[] = [];
  if (duration !== null) {
    summaryItems.push(`set duration to ${duration}s`);
  }
  if (setAudio) {
    summaryItems.push(`turn native audio ${audioValue ? "on" : "off"}`);
  }
  const scopeLabel =
    scope === "all"
      ? "all scenes"
      : scope === "untouched"
      ? "untouched scenes"
      : "the selected scenes";
  const summaryLine =
    summaryItems.length === 0
      ? "No changes selected."
      : `This will ${summaryItems.join(" and ")} on ${scopeLabel} (${targetCount} of ${sceneCount}).`;

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(scenes.map((s) => s.id)));
  }

  function clearSelected() {
    setSelectedIds(new Set());
  }

  const applyDisabled = nothingSelected || targetCount === 0 || saving;

  async function applyDefaults() {
    if (applyDisabled) return;
    setSaving(true);
    try {
      const targetSet = new Set(targetIds);
      // Send only the scenes we actually want to mutate. The server
      // (Task #128) merges by id and leaves all other scenes untouched.
      const updatedScenes = scenes
        .filter((s) => targetSet.has(s.id))
        .map((s) => {
          const next: MinimalScene = { ...s };
          if (duration !== null) next.duration = duration;
          if (setAudio) next.generateNativeAudio = audioValue;
          return next;
        });
      await apiRequest(
        "PUT",
        `/api/universal-video/projects/${projectId}/scenes`,
        { scenes: updatedScenes },
      );
      toast({
        title: "Scene defaults applied",
        description:
          duration !== null && setAudio
            ? `${targetCount} of ${sceneCount} scenes set to ${duration}s with audio ${audioValue ? "on" : "off"}.`
            : duration !== null
            ? `${targetCount} of ${sceneCount} scenes set to ${duration}s.`
            : `Native audio ${audioValue ? "enabled" : "disabled"} on ${targetCount} of ${sceneCount} scenes.`,
      });
      setConfirmOpen(false);
      setOpen(false);
      onUpdated?.();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to apply scene defaults",
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
            Apply duration and audio defaults to a chosen subset of the{" "}
            {sceneCount} scenes in this project. You can still override
            per-scene in the editor.
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
                ? "Tap a preset to set scene duration."
                : `Targeted scenes will be set to ${duration} seconds.`}
            </p>
            {duration !== null &&
              newTotalCost !== null &&
              currentTotalCost !== null && (
                <div
                  className="flex items-center justify-between text-xs text-muted-foreground"
                  data-testid="scene-defaults-cost-preview"
                >
                  <span>
                    {sceneCount} {sceneCount === 1 ? "scene" : "scenes"} ·
                    current ~{formatUsd(currentTotalCost)}
                  </span>
                  <span className="tabular-nums font-medium">
                    New project total: ~{formatUsd(newTotalCost)}
                  </span>
                </div>
              )}
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
                  Native audio will be {audioValue ? "on" : "off"} for the
                  targeted scenes
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

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <Label className="text-sm font-medium">Apply to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as Scope)}
              data-testid="scene-defaults-scope"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="all"
                  id="scene-defaults-scope-all"
                  data-testid="scene-defaults-scope-all"
                />
                <Label
                  htmlFor="scene-defaults-scope-all"
                  className="text-sm font-normal"
                >
                  All scenes ({sceneCount})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="untouched"
                  id="scene-defaults-scope-untouched"
                  data-testid="scene-defaults-scope-untouched"
                  disabled={nothingSelected}
                />
                <Label
                  htmlFor="scene-defaults-scope-untouched"
                  className="text-sm font-normal"
                >
                  Scenes I haven't touched yet
                  {!nothingSelected && (
                    <span
                      className="ml-1 text-xs text-muted-foreground"
                      data-testid="scene-defaults-scope-untouched-count"
                    >
                      ({untouchedIds.length})
                    </span>
                  )}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="selected"
                  id="scene-defaults-scope-selected"
                  data-testid="scene-defaults-scope-selected"
                />
                <Label
                  htmlFor="scene-defaults-scope-selected"
                  className="text-sm font-normal"
                >
                  Selected scenes ({selectedIds.size})
                </Label>
              </div>
            </RadioGroup>

            {scope === "untouched" && !nothingSelected && (
              <p className="text-xs text-muted-foreground pl-6">
                Matches scenes still on the project's current default
                {duration !== null && modalDuration !== undefined
                  ? ` duration (${modalDuration}s)`
                  : ""}
                {duration !== null && setAudio ? " and " : ""}
                {setAudio && modalAudio !== undefined
                  ? `audio (${modalAudio ? "on" : "off"})`
                  : ""}
                .
              </p>
            )}

            {scope === "selected" && (
              <div
                className="space-y-2 pl-6"
                data-testid="scene-defaults-picker"
              >
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={selectAllVisible}
                    data-testid="scene-defaults-picker-select-all"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={clearSelected}
                    data-testid="scene-defaults-picker-clear"
                  >
                    Clear
                  </button>
                </div>
                <ScrollArea className="h-40 rounded border border-border/60 p-2">
                  <div className="space-y-1.5">
                    {scenes.map((s, i) => {
                      const checked = selectedIds.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                          data-testid={`scene-defaults-picker-row-${s.id}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              toggleSelected(s.id, v === true)
                            }
                            data-testid={`scene-defaults-picker-checkbox-${s.id}`}
                          />
                          <span className="truncate">{sceneLabel(s, i)}</span>
                          {typeof s.duration === "number" && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {s.duration}s
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
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
            disabled={applyDisabled}
            data-testid="scene-defaults-apply-button"
          >
            Apply to {targetCount} of {sceneCount}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid="scene-defaults-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="scene-defaults-confirm-title">
                Apply to {targetCount} of {sceneCount} scenes?
              </AlertDialogTitle>
              <AlertDialogDescription data-testid="scene-defaults-confirm-summary">
                {summaryLine} This overwrites the current per-scene values
                for those scenes only — every other scene is left as-is.
                You can still tweak any scene afterwards in its editor.
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
