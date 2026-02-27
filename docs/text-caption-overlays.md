# Text Caption Overlays Plan

## Overview
Add synchronized text caption overlays that follow along with the narration, highlighting words as they're spoken. This is a high-engagement feature — social media videos with captions see significantly higher watch time and accessibility.

## Existing Infrastructure

### Text Overlay Components (already built)

1. **`EnhancedTextOverlay`** (`remotion/components/TextOverlay.tsx`)
   - Supports positions: `top`, `center`, `bottom`, `custom` (x/y percentage)
   - Animations: `fade`, `slide-up`, `slide-left`, `pop` (spring), `typewriter` (char-by-char)
   - Styled backgrounds with `backdropFilter: 'blur(4px)'` and gradients
   - Subtitle/caption types use "Lower Third" style with horizontal gradient

2. **`WordByWord`** (`remotion/components/motion-graphics/WordByWord.tsx`)
   - Splits text into individual words, animates each with `staggerFrames` delay
   - Entrance styles: `fade-up`, `pop`, `slide-left/right`
   - Currently uses relative stagger timing, not absolute word timestamps

3. **`CharacterAnimation`** (via `TextPresets.tsx`)
   - Character-level effects: `wave`, `reveal`, `typewriter`
   - Used for granular motion graphics text effects

4. **`IntelligentTextOverlay`** (`remotion/UniversalVideoComposition.tsx`)
   - AI-driven placement using anchors (`top-left`, `bottom-right`, `center`)
   - Automatic alignment transforms

### Current Limitations
- Block-level timing only (start time + duration for entire string)
- No word-level timestamp integration
- `WordByWord` uses relative stagger, not synced to actual speech timing
- No karaoke-style highlight effect

## Architecture: Word-Synced Captions

### Data Flow
```
TTS Generation → Word Timestamps → Scene Data → Remotion Composition → Caption Renderer
```

### Step 1: Word-Level Timestamp Acquisition

**Option A: ElevenLabs with-timestamps endpoint**
```typescript
const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
  method: 'POST',
  body: JSON.stringify({
    text: sceneNarration,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.7, similarity_boost: 0.75 }
  })
});
// Returns: { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }
```

**Option B: Whisper post-processing (works with any TTS)**
```typescript
const transcription = await openai.audio.transcriptions.create({
  file: audioBuffer,
  model: 'whisper-1',
  response_format: 'verbose_json',
  timestamp_granularities: ['word']
});
// Returns: { words: [{ word: "Hello", start: 0.0, end: 0.45 }, ...] }
```

### Step 2: Data Storage

```typescript
interface CaptionWord {
  word: string;
  start: number;  // seconds from scene start
  end: number;    // seconds from scene start
}

interface SceneCaptions {
  words: CaptionWord[];
  style: CaptionStyle;
  enabled: boolean;
}

// Added to Scene type in shared/video-types.ts
interface Scene {
  // ... existing fields
  captions?: SceneCaptions;
  voiceoverUrl?: string;
  voiceoverDuration?: number;
}
```

### Step 3: Remotion Caption Component

```typescript
// New component: remotion/components/captions/SyncedCaptions.tsx

interface SyncedCaptionsProps {
  words: CaptionWord[];
  style: CaptionStyle;
  fps: number;
}

const SyncedCaptions: React.FC<SyncedCaptionsProps> = ({ words, style, fps }) => {
  const frame = useCurrentFrame();
  const currentTime = frame / fps;

  // Group words into display lines (3-5 words per line)
  const lines = groupWordsIntoLines(words, style.wordsPerLine || 4);

  // Find current active line
  const activeLine = lines.find(line =>
    currentTime >= line.startTime && currentTime <= line.endTime
  );

  if (!activeLine) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', paddingBottom: style.bottomMargin }}>
      <div style={getCaptionContainerStyle(style)}>
        {activeLine.words.map((word, idx) => {
          const isActive = currentTime >= word.start && currentTime <= word.end;
          const isPast = currentTime > word.end;
          return (
            <span key={idx} style={getWordStyle(style, isActive, isPast)}>
              {word.word}{' '}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

## Caption Styles

### Style 1: Karaoke Highlight
Words highlight one at a time as they're spoken. Active word is a different color/scale.
- Active word: bold, accent color, slight scale-up (1.1x)
- Past words: white/light gray
- Future words: semi-transparent
- Background: semi-transparent dark pill behind text line
- **Best for**: Music videos, energetic content

### Style 2: CapCut / Modern Social
Bold, centered text that appears phrase-by-phrase (3-5 words at a time). Active word pops.
- Font: Bold sans-serif (Inter, Montserrat), large (48-64px)
- Active word: yellow/accent color with slight bounce animation
- Text shadow for readability
- Background: none (text shadow only) or subtle dark blur
- **Best for**: TikTok, Instagram Reels, YouTube Shorts

### Style 3: Hormozi / Bold Impact
Large, high-contrast words that appear one at a time with impact animations.
- Font: Extra-bold, uppercase, very large (72-96px)
- One key word at a time, centered
- Spring animation on entry (pop/scale)
- Color alternation for emphasis (white + accent)
- **Best for**: Motivational, sales, authority content

### Style 4: Broadcast / News Lower Third
Professional lower-third style caption bar with scrolling text.
- Positioned at bottom 15-20% of frame
- Dark gradient background bar
- Clean serif or sans-serif font (24-32px)
- Smooth fade transitions between lines
- **Best for**: Professional, corporate, documentary

### Style 5: Minimal Subtitle
Clean, simple subtitles for accessibility.
- White text, thin dark outline/shadow
- Bottom-center position
- Standard subtitle timing (line-by-line, not word-by-word)
- **Best for**: Accessibility compliance, clean aesthetic

### Style Configuration
```typescript
interface CaptionStyle {
  preset: 'karaoke' | 'capcut' | 'hormozi' | 'broadcast' | 'minimal';
  fontSize?: number;          // Override preset default
  fontFamily?: string;        // Override preset font
  primaryColor?: string;      // Main text color
  activeColor?: string;       // Highlighted word color
  backgroundColor?: string;   // Caption background
  position?: 'bottom' | 'center' | 'top';
  wordsPerLine?: number;      // Words shown at once (1 for hormozi, 3-5 for others)
  bottomMargin?: number;      // Pixels from bottom
  animation?: 'pop' | 'fade' | 'slide' | 'none';
}
```

## Integration with Remotion Composition

### In `UniversalVideoComposition.tsx`
```typescript
// Inside scene rendering, after other overlays
{scene.captions?.enabled && scene.captions.words.length > 0 && (
  <SyncedCaptions
    words={scene.captions.words}
    style={scene.captions.style}
    fps={fps}
  />
)}
```

### In Chunked Renders
Caption data is part of the scene object, so it automatically flows through chunked rendering without any special handling.

## User Interface

### Render Configuration Panel
Add a "Captions" section to the render config:
- Toggle: Enable/disable captions
- Style preset selector (karaoke, capcut, hormozi, broadcast, minimal)
- Font size slider
- Color pickers (primary, active/highlight)
- Position selector (bottom, center, top)
- Preview of selected style

### Per-Scene Caption Editor (future)
- View word-by-word timeline
- Edit/correct individual words
- Adjust timing manually
- Preview sync in real-time

## Implementation Priority
1. Word timestamp extraction (ElevenLabs or Whisper — depends on voice-quality-improvements.md Phase 4)
2. `SyncedCaptions` Remotion component with 2-3 preset styles
3. Render config UI for enabling captions and selecting style
4. Additional styles and customization options
5. Per-scene caption editor

## Dependencies
- Requires per-scene voiceover generation (see `docs/voice-quality-improvements.md` Phase 1)
- Requires word-level timestamps (see `docs/voice-quality-improvements.md` Phase 4)
- Both docs should be implemented together for maximum impact

## Files to Create/Modify
- **New**: `remotion/components/captions/SyncedCaptions.tsx` — Core caption renderer
- **New**: `shared/config/caption-styles.ts` — Style presets and types
- **Modify**: `shared/video-types.ts` — Add `captions` field to Scene type
- **Modify**: `remotion/UniversalVideoComposition.tsx` — Integrate caption rendering
- **Modify**: `server/services/universal-video-service.ts` — Word timestamp extraction
- **Modify**: `server/services/universal-video-routes.ts` — Caption data in render prep
- **Modify**: `client/src/components/video/RenderConfigPanel.tsx` — Caption UI controls
