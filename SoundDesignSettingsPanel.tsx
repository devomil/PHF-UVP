import { useState } from 'react';
import { ChevronDown, ChevronUp, Volume2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export interface SoundDesignSettings {
  enabled: boolean;
  useDefaults: boolean;
  transitionSounds: boolean;
  impactSounds: boolean;
  ambientLayer: boolean;
  ambientType: 'warm' | 'nature' | 'none';
  masterVolume: number;
}

export const DEFAULT_SOUND_DESIGN_SETTINGS: SoundDesignSettings = {
  enabled: true,
  useDefaults: true,
  transitionSounds: true,
  impactSounds: true,
  ambientLayer: true,
  ambientType: 'nature',
  masterVolume: 1.0,
};

interface SoundDesignSettingsPanelProps {
  settings: SoundDesignSettings;
  onSettingsChange: (settings: SoundDesignSettings) => void;
}

export const SoundDesignSettingsPanel: React.FC<SoundDesignSettingsPanelProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = <K extends keyof SoundDesignSettings>(key: K, value: SoundDesignSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    if (key !== 'useDefaults' && key !== 'enabled') {
      newSettings.useDefaults = false;
    }
    onSettingsChange(newSettings);
  };

  const handleResetToDefaults = () => {
    onSettingsChange({ ...DEFAULT_SOUND_DESIGN_SETTINGS, enabled: settings.enabled });
  };

  return (
    <TooltipProvider>
      <Card className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-blue-500" />
              Sound Design
              {settings.useDefaults && (
                <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  Using optimized defaults
                </span>
              )}
            </CardTitle>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
          </div>
        </CardHeader>

        {settings.enabled && (
          <CardContent className="pt-0 pb-4 space-y-4">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-700">
                  Professional sound effects with transition whooshes, logo impacts, and nature ambience.
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAdvanced ? 'Hide' : 'Show'} advanced options
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Only modify these if you have specific requirements. The defaults are professionally mixed for broadcast quality.</p>
                </TooltipContent>
              </Tooltip>
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div className="flex justify-end">
                  <button
                    onClick={handleResetToDefaults}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Reset to optimized defaults
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Transition Sounds</Label>
                      <p className="text-xs text-gray-500">Whooshes and swooshes between scenes</p>
                    </div>
                    <Switch
                      checked={settings.transitionSounds}
                      onCheckedChange={(checked) => handleChange('transitionSounds', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Impact Sounds</Label>
                      <p className="text-xs text-gray-500">Logo reveals and emphasis moments</p>
                    </div>
                    <Switch
                      checked={settings.impactSounds}
                      onCheckedChange={(checked) => handleChange('impactSounds', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Ambient Layer</Label>
                      <p className="text-xs text-gray-500">Subtle background atmosphere</p>
                    </div>
                    <Switch
                      checked={settings.ambientLayer}
                      onCheckedChange={(checked) => handleChange('ambientLayer', checked)}
                    />
                  </div>
                </div>

                {settings.ambientLayer && (
                  <div className="space-y-2">
                    <Label className="text-xs">Ambient Style</Label>
                    <Select
                      value={settings.ambientType}
                      onValueChange={(value) => handleChange('ambientType', value as SoundDesignSettings['ambientType'])}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nature">Nature (Birds, breeze)</SelectItem>
                        <SelectItem value="warm">Warm (Soft room tone)</SelectItem>
                        <SelectItem value="none">No Ambient</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">Master Volume</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[settings.masterVolume * 100]}
                      onValueChange={([value]) => handleChange('masterVolume', value / 100)}
                      min={0}
                      max={150}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-500 w-12 text-right">{Math.round(settings.masterVolume * 100)}%</span>
                  </div>
                  <p className="text-xs text-gray-400">Affects all sound effects relative to music/voiceover</p>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
};

export default SoundDesignSettingsPanel;
