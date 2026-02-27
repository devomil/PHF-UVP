# Voice Quality Improvements Plan

## Problem Statement
The current voiceover system generates a single full-project audio track by concatenating all scene narrations into one string and sending it to ElevenLabs. This causes:
- **Pacing drift** — Long text blocks cause the TTS model to introduce unnatural pauses and speed changes
- **Narration misalignment** — Scene transitions don't line up with the corresponding narration
- **No granular control** — Can't adjust individual scene voiceover timing, speed, or retake a single scene

## Current Architecture
- **Primary TTS**: ElevenLabs (`eleven_multilingual_v2` model, "Rachel" voice)
- **Secondary TTS**: OpenAI TTS (`tts-1-hd` model, "Onyx" voice) via `server/services/openai-tts-service.ts`
- **Voice Cloning**: PiAPI F5-TTS via `server/services/piapi-tts-service.ts`
- **Flow**: All scene narrations joined → single TTS call → single audio file uploaded to S3 → passed as `voiceoverUrl` to Remotion
- **Audio ducking**: `voiceoverRanges` (frame-based) calculated in `universal-video-routes.ts` tells `DuckedMusic` component when to lower volume
- **Chunked renders**: voiceover stripped from chunks (`voiceoverUrl: null`), mixed post-concatenation via FFmpeg

## Proposed Solution: Per-Scene Voiceover Generation

### Phase 1: Per-Scene Audio Generation
Generate individual voiceover clips per scene instead of one monolithic track.

**Changes needed:**

1. **`server/services/universal-video-service.ts`**
   - Add `generateSceneVoiceover(sceneNarration, voiceSettings)` method
   - Upload each scene audio to S3 as `video-assets/voiceover_{projectId}_scene{index}.mp3`
   - Return per-scene URLs and actual audio durations (from the audio file metadata)

2. **`shared/video-types.ts`**
   - Extend `Scene` type with `voiceoverUrl?: string` and `voiceoverDuration?: number`
   - Extend `GeneratedAssets.voiceover.perScene` to include actual durations

3. **`server/services/universal-video-routes.ts`**
   - During render prep (around line 2490-2512), generate voiceover per-scene instead of full-project
   - Calculate precise `voiceoverRanges` from actual audio durations
   - Optionally adjust scene visual durations to match narration length (with padding)

4. **`remotion/UniversalVideoComposition.tsx`**
   - Support per-scene `<Audio>` components placed at each scene's start frame
   - Fall back to full-track `voiceoverUrl` if per-scene URLs aren't available

### Phase 2: Duration Alignment
Use actual TTS audio duration to drive scene timing instead of estimated durations.

**Flow:**
1. Generate per-scene voiceover → get actual audio duration (e.g., 12.3s)
2. Add configurable padding (e.g., 0.5s before, 1.0s after)
3. Set scene visual duration = audio duration + padding
4. Total video duration = sum of all scene durations + end card
5. Micro-scene durations auto-adjust proportionally within scene

**Benefits:**
- No narration drift — audio and visuals always aligned
- No awkward silence gaps between scenes
- Precise audio ducking based on actual voiceover presence

### Phase 3: TTS Provider Selection & Quality

**Provider comparison for production narration:**

| Provider | Pros | Cons | Best For |
|----------|------|------|----------|
| ElevenLabs | Expressive, natural, word timestamps | Pacing drift on long text, cost | Short-to-medium narration, captions |
| OpenAI TTS | Consistent pacing, natural | Less voice variety, no word timestamps | Reliable professional tone |
| Google Cloud TTS | Very consistent, multi-language | Less expressive | Corporate/informational |
| Amazon Polly Neural | Reliable timing, low cost | Less natural | High-volume production |

**Recommended approach:**
- Default to **OpenAI TTS** for per-scene generation (most consistent pacing)
- Offer **ElevenLabs** as premium option for expressive/emotional narration
- Support **voice cloning** via PiAPI F5-TTS for brand-specific voices
- Let users select provider per-project in the render configuration panel

**ElevenLabs tuning (if staying with ElevenLabs):**
- `stability`: 0.65-0.75 (higher = more consistent pacing)
- `similarity_boost`: 0.7-0.8
- `style`: 0.3-0.5 (moderate expressiveness)
- Add SSML breaks between sentences for natural pausing

### Phase 4: Word-Level Timestamps from TTS
Required for caption overlay support (see `docs/text-caption-overlays.md`).

**ElevenLabs approach:**
- Use the `/v1/text-to-speech/{voice_id}/with-timestamps` endpoint
- Returns word-level timing data: `{ word: "Hello", start: 0.0, end: 0.45 }`
- Store timestamps alongside each scene's voiceover

**OpenAI approach:**
- OpenAI TTS doesn't natively return word timestamps
- Post-process with **Whisper** transcription on the generated audio
- Whisper returns word-level timestamps from the audio itself

**Storage schema:**
```typescript
interface SceneVoiceover {
  url: string;
  duration: number;
  words: Array<{
    word: string;
    start: number; // seconds from scene start
    end: number;
  }>;
}
```

## Implementation Priority
1. Per-scene generation (fixes pacing issue immediately)
2. Duration alignment (eliminates narration drift)
3. Word-level timestamps (enables captions — see text-caption-overlays.md)
4. Provider selection UI (user choice in render config panel)

## Files to Modify
- `server/services/universal-video-service.ts` — TTS generation logic
- `server/services/universal-video-routes.ts` — Render prep, voiceover orchestration
- `shared/video-types.ts` — Scene voiceover data types
- `remotion/UniversalVideoComposition.tsx` — Per-scene audio rendering
- `remotion/components/audio/DuckedMusic.tsx` — Audio ducking from per-scene ranges
- `server/services/chunked-render-service.ts` — Per-scene audio in chunked renders
- `client/src/components/video/` — UI for voice selection and per-scene controls
