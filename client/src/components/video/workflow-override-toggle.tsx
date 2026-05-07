import { useState } from 'react';
import { Loader2, Sparkles, Package } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface WorkflowOverrideCompactProps {
  sceneId: string;
  useBrandAssets: boolean;
  onToggle: (sceneId: string, useBrandAssets: boolean) => void | Promise<void>;
  disabled?: boolean;
}

export function WorkflowOverrideCompact({
  sceneId,
  useBrandAssets,
  onToggle,
  disabled = false,
}: WorkflowOverrideCompactProps) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    setSaving(true);
    try {
      await onToggle(sceneId, next);
    } finally {
      setSaving(false);
    }
  }

  const ModeIcon = useBrandAssets ? Package : Sparkles;
  const modeLabel = useBrandAssets ? 'Brand' : 'AI';
  const modeDescription = useBrandAssets
    ? 'Animate uploaded product photos (I2V).'
    : 'Generate visuals from scratch (T2V).';

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"
      data-testid={`workflow-override-compact-${sceneId}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <ModeIcon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <Label className="text-sm font-medium flex items-center gap-2">
            {modeLabel} mode
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
          </Label>
          <p className="text-xs text-muted-foreground truncate">
            {modeDescription}
          </p>
        </div>
      </div>
      <Switch
        checked={useBrandAssets}
        disabled={disabled || saving}
        onCheckedChange={handleChange}
        aria-label="Use brand assets for this scene"
        data-testid={`workflow-override-switch-${sceneId}`}
      />
    </div>
  );
}
