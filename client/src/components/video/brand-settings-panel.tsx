import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Palette, Check, AlertCircle, Edit2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BrandLogo {
  id: number;
  name: string;
  url: string;
  thumbnailUrl: string;
}

interface BrandPreview {
  brandName: string;
  tagline?: string;
  website?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  logos: {
    main: BrandLogo | null;
    watermark: BrandLogo | null;
    intro: BrandLogo | null;
    outro: BrandLogo | null;
  };
  callToAction: {
    text: string;
    subtext?: string;
    url: string;
  };
  hasMinimumAssets: boolean;
}

export interface BrandSettings {
  includeIntroLogo: boolean;
  includeWatermark: boolean;
  includeCTAOutro: boolean;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkOpacity: number;
  selectedIntroLogoId?: number;
  selectedWatermarkId?: number;
  ctaText?: string;
  ctaSubtext?: string;
}

interface BrandSettingsPanelProps {
  settings: BrandSettings;
  onSettingsChange: (settings: BrandSettings) => void;
  defaultExpanded?: boolean;
}

const defaultSettings: BrandSettings = {
  includeIntroLogo: true,
  includeWatermark: true,
  includeCTAOutro: true,
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.7,
};

const BRAND_COLORS = [
  { hex: '#5e637a', name: 'Slate Blue' },
  { hex: '#607e66', name: 'Sage Green' },
  { hex: '#5b7c99', name: 'Steel Blue' },
  { hex: '#8c93ad', name: 'Lavender Gray' },
  { hex: '#a9a9a9', name: 'Silver' },
  { hex: '#6c97ab', name: 'Teal' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#f8f8f3', name: 'Cream' },
  { hex: '#2d5a27', name: 'Forest Green' },
  { hex: '#c9a227', name: 'Gold' },
  { hex: '#f5f0e8', name: 'Warm Beige' },
];

export const BrandSettingsPanel: React.FC<BrandSettingsPanelProps> = ({
  settings = defaultSettings,
  onSettingsChange,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditingCta, setIsEditingCta] = useState(false);
  const [ctaTextEdit, setCtaTextEdit] = useState('');
  const [ctaSubtextEdit, setCtaSubtextEdit] = useState('');

  const { data: brandPreview, isLoading, error } = useQuery<BrandPreview>({
    queryKey: ['brand-preview'],
    queryFn: async () => {
      const response = await fetch('/api/brand-bible/preview');
      if (!response.ok) throw new Error('Failed to load brand preview');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleToggle = (key: keyof BrandSettings) => {
    onSettingsChange({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleStartEditCta = () => {
    setCtaTextEdit(settings.ctaText || brandPreview?.callToAction.text || '');
    setCtaSubtextEdit(settings.ctaSubtext || brandPreview?.callToAction.url || '');
    setIsEditingCta(true);
  };

  const handleSaveCta = () => {
    onSettingsChange({
      ...settings,
      ctaText: ctaTextEdit,
      ctaSubtext: ctaSubtextEdit,
    });
    setIsEditingCta(false);
  };

  const handleCancelCtaEdit = () => {
    setIsEditingCta(false);
  };

  const getDisplayCta = () => {
    return {
      text: settings.ctaText || brandPreview?.callToAction.text || 'Start Your Wellness Journey Today',
      subtext: settings.ctaSubtext || brandPreview?.callToAction.url || 'PineHillFarm.com',
    };
  };

  if (isLoading) {
    return (
      <Card className="mb-4" data-testid="card-brand-settings-loading">
        <CardHeader className="py-3 cursor-pointer">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Brand Settings
            </CardTitle>
            <Skeleton className="h-4 w-4" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (error || !brandPreview) {
    return (
      <Card className="mb-4 border-yellow-200 bg-yellow-50" data-testid="card-brand-settings-error">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              Brand Settings
            </CardTitle>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Unable to load brand assets. Videos will generate without branding.
          </p>
        </CardHeader>
      </Card>
    );
  }

  if (!brandPreview.hasMinimumAssets) {
    return (
      <Card className="mb-4 border-orange-200 bg-orange-50" data-testid="card-brand-settings-no-assets">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              Brand Settings
            </CardTitle>
          </div>
          <p className="text-xs text-orange-700 mt-1">
            No brand assets uploaded. Go to <a href="/assets" className="underline">Assets → Brand Media</a> to add logos.
          </p>
        </CardHeader>
      </Card>
    );
  }

  const displayCta = getDisplayCta();

  return (
    <TooltipProvider>
      <Card className="mb-4" data-testid="card-brand-settings">
        <CardHeader 
          className="py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid="button-toggle-brand-settings"
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Brand Settings
              <span className="text-xs font-normal text-gray-500">
                ({brandPreview.brandName})
              </span>
            </CardTitle>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 pb-4">
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm" data-testid="text-brand-name">{brandPreview.brandName}</p>
                {brandPreview.tagline && (
                  <p className="text-xs text-gray-500">{brandPreview.tagline}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Logo and watermark placement is now managed per-scene via "Matched Brand Assets" in the scene editor.
              </p>

              {/* CTA Outro */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={handleStartEditCta}
                    className="relative h-12 w-12 bg-gray-100 rounded flex items-center justify-center text-xs font-medium hover:bg-gray-200 transition-colors group"
                    style={{ backgroundColor: brandPreview.colors.primary || '#2d5a27', color: '#ffffff' }}
                    data-testid="button-edit-cta"
                  >
                    CTA
                    <div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Edit2 className="h-4 w-4 text-white" />
                    </div>
                  </button>
                  <div className="flex-1">
                    {isEditingCta ? (
                      <div className="space-y-2">
                        <Input
                          value={ctaTextEdit}
                          onChange={(e) => setCtaTextEdit(e.target.value)}
                          placeholder="CTA headline text"
                          className="h-8 text-sm"
                          data-testid="input-cta-text"
                        />
                        <Input
                          value={ctaSubtextEdit}
                          onChange={(e) => setCtaSubtextEdit(e.target.value)}
                          placeholder="Website or subtext"
                          className="h-8 text-sm"
                          data-testid="input-cta-subtext"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveCta} data-testid="button-save-cta">
                            <Check className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelCtaEdit} data-testid="button-cancel-cta">
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium">CTA Outro</p>
                        <p className="text-xs text-gray-500">
                          "{displayCta.text}" + {displayCta.subtext}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {!isEditingCta && (
                  <Switch
                    checked={settings.includeCTAOutro}
                    onCheckedChange={() => handleToggle('includeCTAOutro')}
                    data-testid="switch-cta-outro"
                  />
                )}
              </div>
            </div>

            {/* Brand Color Palette */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Brand Color Palette</p>
              <div className="flex flex-wrap gap-1">
                {BRAND_COLORS.map((color) => (
                  <Tooltip key={color.hex}>
                    <TooltipTrigger>
                      <div 
                        className="w-6 h-6 rounded-full border border-gray-200 cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: color.hex }}
                        data-testid={`color-swatch-${color.name.toLowerCase().replace(' ', '-')}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{color.name}</p>
                      <p className="text-xs opacity-75">{color.hex}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4 text-center">
              Intro, Watermark, CTA will be added to your video.
            </p>
          </CardContent>
        )}
      </Card>
    </TooltipProvider>
  );
};

export default BrandSettingsPanel;
