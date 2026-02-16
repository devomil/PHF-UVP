import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export interface EndCardSettings {
  enabled: boolean;
  useDefaults: boolean;
  duration: number;
  logoAnimation: 'scale-bounce' | 'fade' | 'slide-up' | 'none';
  taglineText: string;
  taglineAnimation: 'typewriter' | 'fade' | 'slide-up';
  contactWebsite: string;
  contactPhone: string;
  contactEmail: string;
  ambientEffect: 'particles' | 'bokeh' | 'none';
  ambientIntensity: number;
}

export const DEFAULT_END_CARD_SETTINGS: EndCardSettings = {
  enabled: true,
  useDefaults: true,
  duration: 5,
  logoAnimation: 'scale-bounce',
  taglineText: 'Rooted in Nature, Grown with Care',
  taglineAnimation: 'typewriter',
  contactWebsite: 'PineHillFarm.com',
  contactPhone: '',
  contactEmail: '',
  ambientEffect: 'bokeh',
  ambientIntensity: 40,
};

interface EndCardSettingsPanelProps {
  settings: EndCardSettings;
  onSettingsChange: (settings: EndCardSettings) => void;
}

export const EndCardSettingsPanel: React.FC<EndCardSettingsPanelProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = <K extends keyof EndCardSettings>(key: K, value: EndCardSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    if (key !== 'useDefaults' && key !== 'enabled') {
      newSettings.useDefaults = false;
    }
    onSettingsChange(newSettings);
  };

  const handleResetToDefaults = () => {
    onSettingsChange({ ...DEFAULT_END_CARD_SETTINGS, enabled: settings.enabled });
  };

  return (
    <TooltipProvider>
      <Card className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              End Card
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
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-amber-50 rounded-lg border border-green-100">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700">
                  Professional Pine Hill Farm end card with animated logo reveal, tagline, and ambient effects.
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
                  <p>Only modify these if you have specific requirements. The defaults are professionally designed for broadcast quality.</p>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Duration (seconds)</Label>
                    <Slider
                      value={[settings.duration]}
                      onValueChange={([value]) => handleChange('duration', value)}
                      min={3}
                      max={8}
                      step={0.5}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500">{settings.duration}s</span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Logo Animation</Label>
                    <Select
                      value={settings.logoAnimation}
                      onValueChange={(value) => handleChange('logoAnimation', value as EndCardSettings['logoAnimation'])}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scale-bounce">Scale & Bounce</SelectItem>
                        <SelectItem value="fade">Fade In</SelectItem>
                        <SelectItem value="slide-up">Slide Up</SelectItem>
                        <SelectItem value="none">No Animation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Tagline</Label>
                  <Input
                    value={settings.taglineText}
                    onChange={(e) => handleChange('taglineText', e.target.value)}
                    placeholder="Your tagline..."
                    className="h-8 text-sm"
                  />
                  <Select
                    value={settings.taglineAnimation}
                    onValueChange={(value) => handleChange('taglineAnimation', value as EndCardSettings['taglineAnimation'])}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Animation style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="typewriter">Typewriter Effect</SelectItem>
                      <SelectItem value="fade">Fade In</SelectItem>
                      <SelectItem value="slide-up">Slide Up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Contact Information</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={settings.contactWebsite}
                      onChange={(e) => handleChange('contactWebsite', e.target.value)}
                      placeholder="Website"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={settings.contactPhone}
                      onChange={(e) => handleChange('contactPhone', e.target.value)}
                      placeholder="Phone"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={settings.contactEmail}
                      onChange={(e) => handleChange('contactEmail', e.target.value)}
                      placeholder="Email"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Ambient Effect</Label>
                    <Select
                      value={settings.ambientEffect}
                      onValueChange={(value) => handleChange('ambientEffect', value as EndCardSettings['ambientEffect'])}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bokeh">Bokeh (Soft Lights)</SelectItem>
                        <SelectItem value="particles">Floating Particles</SelectItem>
                        <SelectItem value="none">No Effect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {settings.ambientEffect !== 'none' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Effect Intensity</Label>
                      <Slider
                        value={[settings.ambientIntensity]}
                        onValueChange={([value]) => handleChange('ambientIntensity', value)}
                        min={10}
                        max={80}
                        step={5}
                        className="w-full"
                      />
                      <span className="text-xs text-gray-500">{settings.ambientIntensity}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
};

export default EndCardSettingsPanel;
