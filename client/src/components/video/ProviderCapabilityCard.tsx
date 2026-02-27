import { memo, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Info } from 'lucide-react';
import { VIDEO_PROVIDERS, type VideoProvider } from '@shared/provider-config';

const TIER_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  premium: { label: 'Premium', bg: 'rgba(251,191,36,0.15)', text: 'rgb(252,211,77)', border: 'rgba(251,191,36,0.3)' },
  standard: { label: 'Standard', bg: 'rgba(59,130,246,0.15)', text: 'rgb(147,197,253)', border: 'rgba(59,130,246,0.3)' },
  budget: { label: 'Budget', bg: 'rgba(34,197,94,0.15)', text: 'rgb(134,239,172)', border: 'rgba(34,197,94,0.3)' },
};

interface ProviderCapabilityCardProps {
  providerId: string;
  isSelected?: boolean;
  isRecommended?: boolean;
  recommendationReason?: string;
  compact?: boolean;
  darkMode?: boolean;
  onClick?: () => void;
}

export const ProviderCapabilityCard = memo(function ProviderCapabilityCard({
  providerId,
  isSelected = false,
  isRecommended = false,
  recommendationReason,
  compact = false,
  darkMode = false,
  onClick,
}: ProviderCapabilityCardProps) {
  const provider = VIDEO_PROVIDERS[providerId];
  if (!provider) return null;

  const tier = TIER_STYLES[provider.tier || 'standard'];
  const specialties = provider.specialties || [];
  const bestFor = provider.bestFor || [];

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-3 transition-all duration-150 ${onClick ? 'cursor-pointer' : ''} ${
        isSelected
          ? 'border-purple-500/50 bg-purple-500/10'
          : 'border-transparent hover:border-white/10 hover:bg-white/5'
      }`}
      style={{
        borderColor: isSelected ? 'rgba(124,58,237,0.5)' : undefined,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-medium text-sm"
              style={{ color: darkMode ? 'white' : 'var(--text-primary)' }}
            >
              {provider.displayName}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: tier.bg,
                color: tier.text,
                border: `1px solid ${tier.border}`,
              }}
            >
              {tier.label}
            </span>
            {isRecommended && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Sparkles className="w-2.5 h-2.5" /> Recommended
              </span>
            )}
          </div>

          {provider.description && (
            <p
              className="text-[11px] mt-0.5 leading-relaxed"
              style={{ color: darkMode ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)' }}
            >
              {provider.description}
            </p>
          )}

          {!compact && (
            <>
              {specialties.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {specialties.slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-1.5 py-0.5 rounded border"
                      style={{
                        borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'var(--border-subtle)',
                        color: darkMode ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {isRecommended && recommendationReason && (
            <p
              className="text-[10px] mt-1.5 flex items-start gap-1"
              style={{ color: 'rgb(192,132,252)' }}
            >
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {recommendationReason}
            </p>
          )}
        </div>

        <span
          className="text-[10px] font-mono flex-shrink-0"
          style={{ color: darkMode ? 'rgba(255,255,255,0.3)' : 'var(--text-muted)' }}
        >
          ${provider.costPerSecond}/s
        </span>
      </div>
    </div>
  );
});

interface ProviderCapabilitySelectorProps {
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  recommendedProvider?: string;
  recommendationReason?: string;
  darkMode?: boolean;
  compact?: boolean;
}

export const ProviderCapabilitySelector = memo(function ProviderCapabilitySelector({
  selectedProvider,
  onSelectProvider,
  recommendedProvider,
  recommendationReason,
  darkMode = false,
  compact = false,
}: ProviderCapabilitySelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedConfig = VIDEO_PROVIDERS[selectedProvider];
  const selectedTier = selectedConfig ? TIER_STYLES[selectedConfig.tier || 'standard'] : null;

  const providerGroups: Record<string, string[]> = {};
  const providerEntries = Object.entries(VIDEO_PROVIDERS);
  for (const [id, p] of providerEntries) {
    const family = p.family || 'Other';
    if (!providerGroups[family]) providerGroups[family] = [];
    providerGroups[family].push(id);
  }

  const mainProviderIds = [
    'auto',
    'kling-2.6', 'kling-2.6-pro', 'kling-2.6-motion-control-pro',
    'runway', 'runway-4.5', 'runway-gen4', 'runway-gen4-aleph', 'runway-act-two',
    'veo-3.1', 'sora-2',
    'luma', 'hailuo', 'wan-2.6', 'wan-2.1', 'hunyuan',
    'pika', 'seedance-1.0',
  ];

  const displayProviders = mainProviderIds.filter(id => id === 'auto' || VIDEO_PROVIDERS[id]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 text-xs rounded-lg border px-2.5 py-1.5 bg-transparent outline-none transition-colors"
        style={{
          borderColor: darkMode ? 'rgba(255,255,255,0.15)' : 'var(--border-subtle)',
          color: darkMode ? 'white' : 'var(--text-primary)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedProvider === 'auto' ? (
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Auto-select
            </span>
          ) : selectedConfig ? (
            <span className="flex items-center gap-1.5">
              {selectedConfig.displayName}
              {selectedTier && (
                <span
                  className="text-[9px] px-1 py-0.5 rounded-full"
                  style={{
                    backgroundColor: selectedTier.bg,
                    color: selectedTier.text,
                    border: `1px solid ${selectedTier.border}`,
                  }}
                >
                  {selectedTier.label}
                </span>
              )}
            </span>
          ) : (
            <span>{selectedProvider}</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 flex-shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
        )}
      </button>

      {isExpanded && (
        <div
          className="absolute z-50 mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border shadow-xl"
          style={{
            backgroundColor: darkMode ? '#1a1a2e' : 'var(--menu-bg, white)',
            borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'var(--border-medium)',
          }}
        >
          <div
            className="p-1.5 cursor-pointer rounded-lg mx-1 mt-1 transition-colors"
            style={{
              backgroundColor: selectedProvider === 'auto' ? 'rgba(124,58,237,0.15)' : 'transparent',
            }}
            onClick={() => { onSelectProvider('auto'); setIsExpanded(false); }}
            onMouseEnter={(e) => { if (selectedProvider !== 'auto') e.currentTarget.style.backgroundColor = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'; }}
            onMouseLeave={(e) => { if (selectedProvider !== 'auto') e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div className="flex items-center gap-2 px-1.5 py-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-sm font-medium" style={{ color: darkMode ? 'white' : 'var(--text-primary)' }}>
                Auto-select
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                Recommended
              </span>
            </div>
            <p className="text-[10px] px-1.5 pb-0.5" style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : 'var(--text-muted)' }}>
              AI picks the best provider based on scene content
            </p>
          </div>

          <div className="mx-2 my-1 border-t" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'var(--border-subtle)' }} />

          {displayProviders.filter(id => id !== 'auto').map((id) => (
            <div
              key={id}
              className="mx-1"
              onClick={() => { onSelectProvider(id); setIsExpanded(false); }}
            >
              <ProviderCapabilityCard
                providerId={id}
                isSelected={selectedProvider === id}
                isRecommended={recommendedProvider === id}
                recommendationReason={recommendedProvider === id ? recommendationReason : undefined}
                compact={compact}
                darkMode={darkMode}
                onClick={undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export function getProviderRecommendationText(providerId: string, sceneType?: string): string {
  const provider = VIDEO_PROVIDERS[providerId];
  if (!provider) return '';

  const sceneReasons: Record<string, Record<string, string>> = {
    hook: {
      'runway-4.5': 'Photorealistic cinematic for attention-grabbing openers',
      'runway-gen4-aleph': 'Dramatic visual effects for high-impact hooks',
      'veo-3.1': '4K cinematic with native audio for immersive openers',
      'kling-2.6': 'Character-driven hook with native audio support',
    },
    cta: {
      'runway-4.5': 'Premium visual quality to inspire action',
      'runway-gen4-aleph': 'Cinematic atmosphere for compelling call-to-action',
      'kling-2.6': 'Human-focused visuals with audio for persuasive CTAs',
    },
    feature: {
      'wan-2.6': 'Text rendering and conceptual visuals for feature explanations',
      'luma': 'Smooth product reveals for feature showcases',
      'kling-2.6': 'Character-consistent demonstrations',
    },
    testimonial: {
      'runway-act-two': 'Character performance with emotional expression',
      'kling-2.6': 'Natural human rendering with lip-sync audio',
    },
  };

  const sceneMatch = sceneType && sceneReasons[sceneType]?.[providerId];
  if (sceneMatch) return sceneMatch;

  if (provider.description) return provider.description;
  const bestForStr = (provider.bestFor || []).slice(0, 3).join(', ');
  return `Best for ${bestForStr}`;
}

export default ProviderCapabilityCard;
