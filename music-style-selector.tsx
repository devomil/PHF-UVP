import { Music, Volume2, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { getVisualStyleConfig, getMusicStyleForVisual } from '@shared/visual-style-config';

export type MusicProvider = 'auto' | 'udio' | 'diffrhythm' | 'suno' | 'ace-step' | 'kling-sound';

interface MusicStyleSelectorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  visualStyle: string;
  customMood?: string;
  onMoodChange?: (mood: string) => void;
  musicProvider?: MusicProvider;
  onProviderChange?: (provider: MusicProvider) => void;
}

const MOOD_MODIFIERS = [
  { id: 'default', label: 'Auto', description: 'Match visual style' },
  { id: 'uplifting', label: 'Uplifting', description: 'More hopeful, positive' },
  { id: 'calm', label: 'Calm', description: 'More relaxed, peaceful' },
  { id: 'intense', label: 'Intense', description: 'More dramatic, powerful' },
  { id: 'playful', label: 'Playful', description: 'More fun, lighthearted' },
];

const MUSIC_PROVIDERS = [
  { id: 'auto' as MusicProvider, name: 'Auto', description: 'Best for style', cost: 'Varies' },
  { id: 'udio' as MusicProvider, name: 'Udio', description: 'Professional-grade, versatile', cost: '$0.05' },
  { id: 'suno' as MusicProvider, name: 'Suno V5', description: 'Adaptive, structured songs', cost: 'Variable' },
  { id: 'diffrhythm' as MusicProvider, name: 'DiffRhythm', description: 'Full songs with vocals, fast', cost: '$0.02' },
  { id: 'kling-sound' as MusicProvider, name: 'Kling Sound', description: 'Sound effects & ambient', cost: '$0.07' },
];

export function MusicStyleSelector({
  enabled,
  onEnabledChange,
  visualStyle,
  customMood,
  onMoodChange,
  musicProvider = 'auto',
  onProviderChange,
}: MusicStyleSelectorProps) {
  const styleConfig = getVisualStyleConfig(visualStyle);
  const musicStyle = getMusicStyleForVisual(visualStyle);
  const currentMood = customMood || 'default';
  const currentProvider = MUSIC_PROVIDERS.find(p => p.id === musicProvider) || MUSIC_PROVIDERS[0];
  const displayProvider = musicProvider === 'auto' ? musicStyle.preferredProvider : musicProvider;

  return (
    <div className="space-y-3" data-testid="music-style-selector">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">Background Music</span>
        </div>
        <Switch 
          checked={enabled} 
          onCheckedChange={onEnabledChange}
          data-testid="switch-music-enabled"
        />
      </div>

      {enabled && (
        <div className="pl-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Volume2 className="h-3 w-3" />
            <span data-testid="text-music-auto-match">
              Auto-matched to <strong>"{styleConfig.name}"</strong> style:{' '}
              <span className="text-primary">{musicStyle.genre}</span>
            </span>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-2 block">Mood Adjustment</label>
            <div className="flex flex-wrap gap-2">
              {MOOD_MODIFIERS.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => onMoodChange?.(mood.id)}
                  title={mood.description}
                  className={`
                    px-3 py-1.5 rounded-full text-xs transition-all
                    ${currentMood === mood.id
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                  `}
                  data-testid={`button-mood-${mood.id}`}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-2 block flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Music Generator
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {MUSIC_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => onProviderChange?.(provider.id)}
                  className={`
                    p-2 rounded-lg text-left transition-all border
                    ${musicProvider === provider.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-gray-200 hover:border-gray-300 bg-white'}
                  `}
                  data-testid={`button-provider-${provider.id}`}
                >
                  <p className="text-xs font-medium">{provider.name}</p>
                  <p className="text-[10px] text-gray-500">{provider.description}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{provider.cost}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-xs" data-testid="music-preview-info">
            <p className="font-medium text-gray-700">Music Preview:</p>
            <p className="text-gray-500 mt-1">
              {musicStyle.genre} • {musicStyle.tempo} tempo • {musicStyle.energy} energy
              {currentMood !== 'default' && ` • ${currentMood} mood`}
            </p>
            <p className="text-gray-400 mt-1">
              Generated by {displayProvider} via PiAPI
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MusicStyleSelector;
