/**
 * suzzie-provider-guides.ts
 *
 * Deep, provider-specific prompting knowledge for Suzzie.
 * Each guide teaches Suzzie the exact vocabulary, syntax, and strategy
 * that produces best results for a given AI video provider.
 *
 * Guides are keyed by provider family so the same guide covers
 * all variants of a model (e.g. kling-2.5, kling-2.6, kling-2.6-pro).
 * Provider-specific overrides are merged on top.
 */

export interface ProviderPromptGuide {
  family: string;
  displayLabel: string;
  imageRefSyntax: string;
  promptPhilosophy: string;
  motionVocabulary: string[];
  powerKeywords: string[];
  avoidPhrases: string[];
  i2vTips: string;
  multiImageTips?: string;
  nativeAudioTips?: string;
  examplePrompts: Array<{ label: string; prompt: string }>;
  uniqueTrait: string;
}

const GUIDES: ProviderPromptGuide[] = [
  // ─── Kling Family ────────────────────────────────────────────────────────
  {
    family: 'kling',
    displayLabel: 'Kling AI (all versions)',
    imageRefSyntax: '@image_N (e.g. @image_1, @image_2, @image_3)',
    promptPhilosophy:
      'Kling responds best to explicit, choreographed camera movements paired with ' +
      'cinematic quality anchors. Describe what the CAMERA does (not just the subject) ' +
      'with named moves and precise speed adjectives. Short, punchy motion sentences ' +
      'outperform dense walls of text. Always anchor the frame with a stability statement ' +
      'when the subject must stay locked (products, faces).',
    motionVocabulary: [
      'slow push-in',
      'gentle dolly forward',
      'smooth orbital arc from left to right',
      'crane up',
      'crane down',
      'slow pan',
      'rack focus toward',
      'handheld drift',
      'parallax drift',
      'soft zoom bloom',
      'glacial dolly',
      'steady track right',
    ],
    powerKeywords: [
      'cinematic',
      'photorealistic',
      '4K',
      'natural color grade',
      'shallow depth of field',
      'bokeh',
      'golden hour',
      'soft studio lighting',
      'cinematic color grade',
      'warm natural light',
      'sharp and stable',
      'smooth motion',
    ],
    avoidPhrases: [
      'explode', 'blast', 'shatter', 'glitch', 'teleport',
      'fast cut', 'strobe', 'chaotic', 'rapid fire', 'hyper speed',
      'text reads', 'caption says', 'title appears',
      'pixelated', 'low quality', 'blurry',
    ],
    i2vTips:
      'Kling I2V animates FROM the reference image. Never re-describe the subject — ' +
      'the model already sees it. Describe: (1) one named camera move, (2) how the ' +
      'ENVIRONMENT changes around the subject, (3) atmospheric motion (particles, light ' +
      'sweep, wind), (4) a stability anchor ("subject remains perfectly sharp and stable ' +
      'throughout"). For products with labels, add "no label distortion or warping" or ' +
      'bump cfg_scale to 0.85–0.95.',
    multiImageTips:
      'CRITICAL — Kling uses @image_N syntax WITH underscore. Use @image_1 for the first ' +
      'reference (usually your source/anchor frame or main product), @image_2 for a ' +
      'secondary subject or character, @image_3 for a third element. ' +
      'Examples:\n' +
      '• "use @image_1 as the opening frame. A woman (@image_2) walks into the scene from ' +
      'the left, warm studio lighting, slow push-in."\n' +
      '• "@image_1 is the main product. @image_2 is the character — she reaches toward ' +
      '@image_1, smiling. Camera holds steady, golden hour light."\n' +
      '• "The hallway (@image_1) frames the doorway — through it, @image_2 room is ' +
      'revealed as the camera slowly dollies forward."\n' +
      'Always tell the model what ROLE each image plays (anchor frame, character, ' +
      'environment, end frame) rather than just listing @image_N tags.',
    examplePrompts: [
      {
        label: 'Product I2V (stable anchor)',
        prompt:
          'The supplement bottle stands centered on a sun-dappled marble surface. Camera ' +
          'executes a slow push-in toward the label. Warm golden light sweeps across from ' +
          'the right, catching the bottle\'s gloss. Soft bokeh particles drift upward in ' +
          'the background. The bottle remains perfectly sharp and stable throughout. ' +
          'Cinematic shallow depth of field, warm natural color grade, 4K.',
      },
      {
        label: 'Character scene (multi-image)',
        prompt:
          'Use @image_1 as the opening frame — the hallway environment. @image_2 is the ' +
          'character who enters from the left door, walking toward camera with a confident ' +
          'stride. Warm interior light from above. Camera holds steady with a very slight ' +
          'slow push-in. Cinematic 16:9, natural color grade.',
      },
      {
        label: 'Nature b-roll',
        prompt:
          'Dense forest floor at golden hour. Camera executes a glacial dolly forward ' +
          'through layers of fern and tall grass. Shafts of amber light pierce the canopy, ' +
          'casting long moving shadows. Floating pollen motes drift lazily through the beams. ' +
          'Shallow depth of field, cinematic color grade, 4K.',
      },
    ],
    uniqueTrait:
      'Kling excels at human subjects with natural facial expressions and smooth motion. ' +
      'Its I2V mode is particularly strong for product animations — use cfg_scale 0.85–0.95 ' +
      'to lock labels, or 0.5–0.7 for natural character motion. Multi-image support uses ' +
      '@image_N (underscore) syntax, with up to 4 images.',
  },

  // ─── Kling 2.6 / 2.6-Pro — Native Audio override ────────────────────────
  {
    family: 'kling-native-audio',
    displayLabel: 'Kling 2.6 / Kling 2.6 Pro (native audio)',
    imageRefSyntax: '@image_N (e.g. @image_1, @image_2)',
    promptPhilosophy:
      'Kling 2.6 generates synchronized audio alongside the video — ambient sound, ' +
      'dialogue, and SFX are all fair game. Describe SOUND as naturally as you describe ' +
      'visuals. Audio descriptions at the END of the prompt work best. Wrap sound in ' +
      'parenthetical or explicit tags: "ambient sound: soft rain on windows", ' +
      '"dialogue: [character] says \'...\'". For silent scenes, add "no dialogue, ' +
      'ambient only" to prevent unwanted speech.',
    motionVocabulary: [
      'slow push-in', 'gentle dolly', 'orbital sweep', 'crane up', 'rack focus',
      'soft zoom', 'handheld drift', 'steady track',
    ],
    powerKeywords: [
      'cinematic', '4K', 'bokeh', 'golden hour', 'natural color grade',
      'ambient sound', 'soft ambient', 'SFX', 'dialogue', 'lip-sync',
    ],
    avoidPhrases: [
      'no audio', 'mute', 'silent', 'add music later',
      'text reads', 'caption says', 'on-screen text',
    ],
    i2vTips:
      'Same as Kling I2V rules, with the addition: after the visual direction, append ' +
      'an audio description. Example: "Visual: slow push-in toward the bottle. Camera ' +
      'holds steady. Warm light sweeps. Bottle stable and sharp. 4K. | Audio: gentle ' +
      'ambient café sounds, soft background chatter, no dialogue."',
    multiImageTips:
      'Uses @image_N (with underscore). Same multi-image rules as the base Kling guide. ' +
      'When using multi-image + native audio, describe the visual scene first and add ' +
      'the audio descriptor last.',
    nativeAudioTips:
      'NATIVE AUDIO MODE — this provider generates audio synchronized with the video.\n\n' +
      'Audio prompt patterns that work well:\n' +
      '• Ambient: "ambient sound: soft rain on a window pane, distant traffic"\n' +
      '• Dialogue: "dialogue: she says \'Welcome to our studio\' in a warm, confident tone"\n' +
      '• SFX: "sound effect: the bottle cap pops open with a crisp click"\n' +
      '• Music hint: "background: soft jazz piano, no vocals"\n' +
      '• Silent visual: "no dialogue, ambient only: gentle wind through leaves"\n\n' +
      'Add audio descriptions at the END of the visual direction, separated by a pipe ' +
      'or new line. Do not mix audio and visual instructions in the same sentence.',
    examplePrompts: [
      {
        label: 'Character with dialogue',
        prompt:
          'A confident woman in a blazer sits at a modern desk, looking directly at camera. ' +
          'Soft key light from the left, warm fill from the right. Shallow depth of field, ' +
          'blurred bookcase background. Camera holds steady, slight push-in. Cinematic 16:9. ' +
          '| Audio: she says "Our product changed everything" in a warm, assured tone, ' +
          'soft ambient office sounds in the background.',
      },
      {
        label: 'Product reveal with SFX',
        prompt:
          '@image_1 is the product. Slow push-in toward the label, warm golden light. ' +
          'Environment materializes around it — dark marble surface, soft steam wisps. ' +
          'Product remains sharp and stable. 4K cinematic color grade. ' +
          '| Audio: soft ambient hum, then a crisp "click" as the cap is revealed.',
      },
    ],
    uniqueTrait:
      'Kling 2.6 is the only Kling model with native audio generation. Include audio ' +
      'descriptions to leverage this fully — ambient, SFX, and dialogue are all supported ' +
      'in a single generation pass.',
  },

  // ─── Seedance 2 Family ───────────────────────────────────────────────────
  {
    family: 'seedance',
    displayLabel: 'Seedance 2 (all variants)',
    imageRefSyntax: '@imageN (e.g. @image1, @image2) — NO underscore',
    promptPhilosophy:
      'Seedance 2 excels at multi-image morphing transitions and general cinematic scenes. ' +
      'For single-image I2V, describe the motion arc cleanly. For multi-image, describe ' +
      'the TRANSFORMATION — what morphs from image1 into image2, how the transition feels. ' +
      'Seedance reads spatial/temporal language well: "over the first two seconds ... then ' +
      'by the end of the clip ..." is a valid structure.',
    motionVocabulary: [
      'morphs into', 'transforms into', 'dissolves into', 'blends toward',
      'slow push-in', 'camera drifts right', 'orbits around',
      'transitions through', 'fades into', 'cross-dissolves to',
    ],
    powerKeywords: [
      '1080p', 'cinematic', 'smooth transition', 'seamless morph',
      'natural color grade', 'photorealistic', 'shallow depth of field',
      'sharp', 'stable', '4K quality',
    ],
    avoidPhrases: [
      'underscore in @image tags', '@image_1', '@image_2',
      'text reads', 'caption shows', 'on-screen title',
      'fast cut', 'strobing', 'chaotic motion',
    ],
    i2vTips:
      'Seedance I2V: describe what changes AROUND and FROM the anchor image. ' +
      'Keep a stability statement for products/subjects. Temporal language works ' +
      'well: "The bottle anchors the center frame as the environment builds around it..."',
    multiImageTips:
      'CRITICAL — Seedance uses @imageN (NO underscore). @image1 is the first image, ' +
      '@image2 is the second.\n\n' +
      'Morphing pattern examples:\n' +
      '• "@image1 transforms into @image2 with a smooth liquid dissolve, slow and cinematic"\n' +
      '• "Camera opens on @image1 — the product from the front. Smooth orbital right pan ' +
      'reveals @image2 — the product\'s side profile. Seamless transition, stable anchor."\n' +
      '• "@image1 is the establishing shot of the room. @image2 is the hero product — it ' +
      'materializes in the center as the camera slowly pushes in. Warm golden light."\n\n' +
      'Always describe the RELATIONSHIP and TRANSITION between images, not just list them.',
    examplePrompts: [
      {
        label: 'Image morph transition',
        prompt:
          '@image1 morphs smoothly into @image2 over the duration of the clip. ' +
          'The transition flows like watercolor paint bleeding through wet canvas — ' +
          'slow, organic, dreamlike. Colors blend gradually, shapes soften then ' +
          'resolve into the second image. Cinematic color grade, 1080p.',
      },
      {
        label: 'Product reveal with character',
        prompt:
          '@image1 is the product bottle, anchored center frame. @image2 is the character ' +
          'who enters from the right, reaching toward the product with a smile. ' +
          'Camera holds a steady medium shot, soft push-in. Warm studio lighting, ' +
          'shallow depth of field. Product remains sharp and stable throughout. 1080p, ' +
          'natural color grade.',
      },
    ],
    uniqueTrait:
      'Seedance 2 produces 1080p output with up to 15 seconds duration — the longest in ' +
      'the budget/standard tier. Its morphing transitions between @image1 and @image2 are ' +
      'a standout feature. Note: @imageN syntax has NO underscore (unlike Kling\'s @image_N).',
  },

  // ─── Runway Family ───────────────────────────────────────────────────────
  {
    family: 'runway',
    displayLabel: 'Runway (Gen-3, Gen-4, 4.5, Aleph)',
    imageRefSyntax: 'First Frame (I2V) — no @imageN syntax. Upload a reference image to use as the starting frame.',
    promptPhilosophy:
      'Runway is the industry standard for cinematic storytelling. It responds to ' +
      'film-production vocabulary: shot type, lens, camera movement, lighting setup, and ' +
      'mood descriptor. Think "cinematographer\'s shot note" — what would you write on a ' +
      'film slate? Runway handles complex multi-subject scenes and dramatic lighting ' +
      'transitions exceptionally well. Be specific about camera moves and their speed.',
    motionVocabulary: [
      'tracking shot', 'dolly push-in', 'dolly pull-out', 'crane up', 'crane down',
      'dutch angle tilt', 'whip pan', 'slow motion', 'steadicam follow',
      'drone rising shot', 'arc around subject', 'extreme close-up rack focus',
      'subtle parallax drift', 'handheld with natural sway',
    ],
    powerKeywords: [
      'cinematic', 'anamorphic lens flares', 'shallow depth of field',
      'dramatic lighting', 'chiaroscuro', 'Rembrandt lighting', 'golden hour',
      'blue hour', 'practical lights', 'film grain', '4K', 'IMAX quality',
      'photorealistic', 'hyper-detailed', 'shot on RED camera',
    ],
    avoidPhrases: [
      'text appears on screen', 'caption reads', 'title shows',
      '@image_1', '@image1', '@image2',
      'cartoon', 'anime', 'video game graphics',
    ],
    i2vTips:
      'Runway I2V uses the first frame image as a literal starting frame. The AI then ' +
      'animates forward from that image. Describe what happens AFTER that first frame: ' +
      'camera moves, lighting shifts, subject actions, atmospheric changes. Think of the ' +
      'reference image as "frame 1" — your prompt describes "frames 2 through the end."',
    examplePrompts: [
      {
        label: 'Cinematic product hero shot',
        prompt:
          'A sleek supplement bottle sits on a dark marble surface. Camera begins in ' +
          'extreme close-up on the label, then executes a slow dolly pull-out to reveal ' +
          'the full bottle in a dimly lit studio. Dramatic Rembrandt lighting from the ' +
          'upper left casts deep shadows on the right side. Anamorphic lens flares catch ' +
          'the bottle\'s edge. Shot on RED camera, 4K, cinematic color grade.',
      },
      {
        label: 'Emotional character scene',
        prompt:
          'A mid-30s woman in a crisp white lab coat sits at a research desk, looking ' +
          'toward the camera with a quiet confidence. Steadicam begins in medium shot, ' +
          'slowly pushing in to close-up on her face. Warm practical light from a desk ' +
          'lamp on her right, cool ambient fill from the left. Shallow depth of field, ' +
          'soft bokeh behind her. Cinematic color grade, 4K.',
      },
    ],
    uniqueTrait:
      'Runway produces the most cinematically precise motion of any provider. Gen-4 and ' +
      '4.5 are particularly strong for subject-consistent scenes with dramatic lighting. ' +
      'Act Two specializes in character performance and facial expression control. ' +
      'Aleph 2.0 enables frame-based video editing — edit one reference frame and the ' +
      'whole clip transforms.',
  },

  // ─── Veo Family (Google) ─────────────────────────────────────────────────
  {
    family: 'veo',
    displayLabel: 'Veo 2 / Veo 3.1 (Google DeepMind)',
    imageRefSyntax: 'First Frame (I2V) — no @imageN multi-image syntax.',
    promptPhilosophy:
      'Veo is Google DeepMind\'s flagship model — it rewards EXTREMELY detailed, ' +
      'layered scene descriptions. Include every visual element: foreground, midground, ' +
      'background, lighting, atmosphere, and camera. Veo 3.1 supports native audio — ' +
      'include sound descriptions for immersive results. Write prompts as if describing ' +
      'a film scene to a production designer, not just a camera operator.',
    motionVocabulary: [
      'slow push-in', 'sweeping crane shot', 'drone rising over', 'orbit around',
      'tracking alongside', 'steady handheld follow', 'glacial zoom', 'dolly glide',
      'tilt up', 'tilt down', 'lateral track',
    ],
    powerKeywords: [
      '4K ultra-HD', 'photorealistic', 'cinematic', 'Google DeepMind quality',
      'physically accurate', 'advanced physics', 'natural lighting simulation',
      'volumetric light', 'ray-traced shadows', 'film grain', 'anamorphic',
      'deep focus', 'atmospheric haze',
    ],
    avoidPhrases: [
      'on-screen text', 'caption reads', 'title appears',
      '@image1', '@image_1',
      'cartoon', 'animated style',
      'low quality', 'draft',
    ],
    i2vTips:
      'Veo I2V treats the reference image as an anchor. Describe motion in layers: ' +
      '(1) camera movement with speed, (2) foreground elements that animate, ' +
      '(3) background activity, (4) lighting changes over time. For Veo 3.1, ' +
      'always add an audio descriptor at the end for native sound generation.',
    nativeAudioTips:
      'VEO 3.1 NATIVE AUDIO — include ambient sound, environmental audio, and dialogue ' +
      'descriptions directly in your prompt:\n' +
      '• "the soft crackle of a fireplace fills the room"\n' +
      '• "distant ocean waves, seagulls, the smell of salt air" (descriptive immersion)\n' +
      '• "she speaks: \'This is the moment everything changed\'"\n' +
      '• "ambient laboratory hum, ventilation, soft beeps from equipment"\n' +
      'Sound descriptors work best at the end of the prompt, separated by a period or comma.',
    examplePrompts: [
      {
        label: 'Landscape cinematic (Veo 3.1)',
        prompt:
          'A volcanic island at twilight. The camera begins in a sweeping drone shot ' +
          'above a black sand beach, then dips down to skim the surface of glowing lava ' +
          'meeting the Pacific. Volumetric steam billows as lava contacts seawater, ' +
          'catching the last amber rays of the setting sun. In the foreground, a single ' +
          'tide pool reflects the fiery sky. Physically accurate fluid dynamics. ' +
          '4K ultra-HD, cinematic color grade. | Audio: hissing steam, the low rumble ' +
          'of the ocean, distant geological crackling.',
      },
      {
        label: 'Branded scene with audio (Veo 3.1)',
        prompt:
          'A modern pharmaceutical laboratory bathed in cool blue LED light. A researcher ' +
          'in a white lab coat examines a holographic molecular display. Camera executes ' +
          'a slow lateral track from right to left, revealing the full lab. Advanced ' +
          'physics simulation for the holographic particles. Cinematic depth of field, ' +
          'volumetric light shafts, 4K. | Audio: ambient lab hum, soft computer beeps, ' +
          'the researcher murmurs data notes.',
      },
    ],
    uniqueTrait:
      'Veo 3.1 is the only provider with true physics simulation — fluid dynamics, ' +
      'realistic particle behavior, and accurate light interactions. Its native audio ' +
      'generation is unmatched for immersive environmental soundscapes. Use it for ' +
      'hero content where physical accuracy and production value are paramount.',
  },

  // ─── Wan Family (Alibaba) ────────────────────────────────────────────────
  {
    family: 'wan',
    displayLabel: 'Wan 2.1 / Wan 2.6 (Alibaba)',
    imageRefSyntax: 'First Frame (I2V) — no @imageN syntax. Limited to 5 seconds.',
    promptPhilosophy:
      'Wan is Alibaba\'s model — it responds well to atmospheric, environment-rich ' +
      'descriptions and text-in-video content. Unique advantage: Wan can render readable ' +
      'text WITHIN the video (not an overlay — actual AI-rendered text in the scene). ' +
      'For environments and conceptual content, describe the setting richly. ' +
      'Keep prompts under 80 words — Wan performs better with focused direction. ' +
      'Max duration is 5 seconds — design for one clean motion arc.',
    motionVocabulary: [
      'slow zoom', 'gentle pan', 'steady push-in', 'soft drift right', 'tilt up',
      'reveal shot', 'static hold', 'subtle camera sway',
    ],
    powerKeywords: [
      'cinematic', 'atmospheric', 'rich detail', 'nature', 'landscape',
      'text rendering', 'readable text', 'branded', 'clean composition',
      'natural lighting', 'warm tone', '4K',
    ],
    avoidPhrases: [
      'complex multi-subject scenes', 'fast action', 'rapid motion',
      'multiple people interacting', 'very long duration',
      '@image1', '@image_1',
    ],
    i2vTips:
      'Wan I2V is brief (5s) — design the prompt for ONE motion beat. Anchor the subject, ' +
      'describe one camera move, add simple atmospheric motion (light shift, gentle breeze). ' +
      'Do not try to pack multiple transitions into 5 seconds.',
    examplePrompts: [
      {
        label: 'Text-in-video branded scene',
        prompt:
          'A clean white product box on a minimal marble surface. Large, elegant serif ' +
          'text on the box reads "NATURA". Camera holds static, soft push-in. ' +
          'Warm natural daylight from the left, soft shadows. The text on the box ' +
          'remains crisp and readable. Minimal, premium aesthetic. 4K.',
      },
      {
        label: 'Nature environment',
        prompt:
          'A misty mountain valley at dawn. Camera executes a slow upward tilt from ' +
          'the fog-covered valley floor to reveal snow-capped peaks catching first light. ' +
          'Golden rays pierce through the mist layer. Pine trees sway in a gentle breeze ' +
          'in the foreground. Cinematic, atmospheric, warm color grade.',
      },
    ],
    uniqueTrait:
      'Wan is the only AI video model that can render readable text WITHIN the video frame ' +
      '(not as a post-processing overlay). If your scene needs on-screen text as part of ' +
      'the AI-generated footage (product labels, branded text, signage), Wan is the right ' +
      'choice. Keep prompts focused and under 5 seconds of action.',
  },

  // ─── Luma Dream Machine ───────────────────────────────────────────────────
  {
    family: 'luma',
    displayLabel: 'Luma Dream Machine',
    imageRefSyntax: 'First Frame or Last Frame (I2V) — no @imageN syntax. 5 second max.',
    promptPhilosophy:
      'Luma specializes in smooth, 3D-quality object reveals and product animations. ' +
      'Think "product commercial with a premium reveal motion." Luma handles orbital ' +
      'fly-arounds, slow reveals, and clean object-focused animations exceptionally well. ' +
      'Less ideal for human subjects — it tends to produce slightly artificial-looking ' +
      'people. Keep prompts clean and movement-focused: what does the camera DO around ' +
      'the product?',
    motionVocabulary: [
      'smooth 90-degree orbit from front-right', '360-degree fly-around',
      'smooth pull-out reveal', 'gentle push toward', 'elegant upward reveal',
      'slow floating', 'clean transition', 'smooth 3D arc',
      'macro zoom into label', 'slow reveal from darkness',
    ],
    powerKeywords: [
      'product reveal', '3D quality', 'smooth motion', 'clean background',
      'studio lighting', 'premium aesthetic', 'sharp detail', 'commercial quality',
      'brand color', 'soft shadow', 'glossy surface', '4K',
    ],
    avoidPhrases: [
      'people', 'person', 'human', 'face', 'character dialogue',
      'fast motion', 'complex environment', '@image1', '@image_1',
    ],
    i2vTips:
      'Luma I2V uses the reference image as the FIRST frame (or last frame). ' +
      'Describe the camera motion that orbits/reveals the product from that starting position. ' +
      'Focus: camera movement + lighting enhancement. Avoid describing the product itself ' +
      '(Luma already sees it in the image). Add: "product remains sharp and geometrically ' +
      'stable throughout."',
    examplePrompts: [
      {
        label: 'Product orbital reveal',
        prompt:
          'Camera begins at the front of the product, then executes a smooth 90-degree ' +
          'orbital arc sweeping from front-left to front-right, revealing all angles of ' +
          'the packaging. Studio lighting with a warm key light from the upper right and ' +
          'cool fill from the left. The product floats on a pure white surface. ' +
          'Product remains geometrically sharp and stable throughout. Premium 4K quality.',
      },
      {
        label: 'Product reveal from darkness',
        prompt:
          'Product emerges from darkness as a warm spot light blooms in from the upper ' +
          'right, revealing the label in detail. Camera holds static as light slowly ' +
          'illuminates the full product. Soft shadows on a black marble surface. ' +
          'Subtle lens flare catches the glossy cap. Clean, premium commercial look, 4K.',
      },
    ],
    uniqueTrait:
      'Luma Dream Machine produces the smoothest 3D orbital product motions of any ' +
      'provider. Its "last frame" I2V capability is unique — you can define both where ' +
      'the scene starts AND ends, making it ideal for seamless loop animations.',
  },

  // ─── Hailuo / MiniMax ────────────────────────────────────────────────────
  {
    family: 'hailuo',
    displayLabel: 'Hailuo MiniMax',
    imageRefSyntax: 'First Frame (I2V) — no @imageN syntax. 6 second max.',
    promptPhilosophy:
      'Hailuo is a budget-tier workhorse best used for b-roll, nature scenes, and ' +
      'ambient establishing shots. Keep prompts simple, concrete, and direct. ' +
      'It struggles with complex multi-subject scenes or intricate camera choreography. ' +
      'Short, clean descriptions of ONE motion and ONE environment yield the best results. ' +
      'Do not over-prompt — Hailuo responds better to simple direction than elaborate scenes.',
    motionVocabulary: [
      'slow pan', 'gentle push', 'static hold', 'subtle drift',
      'slow zoom', 'steady shot', 'reveal',
    ],
    powerKeywords: [
      'nature', 'landscape', 'b-roll', 'atmospheric', 'ambient', 'cinematic',
      'golden hour', 'natural light', 'establishing shot', 'wide shot',
    ],
    avoidPhrases: [
      'complex dialogue', 'multiple characters interacting', 'intricate motion',
      'text on screen', '@image1', '@image_1',
      'premium', 'ultra-detailed', 'hyper-realistic',
    ],
    i2vTips:
      'Hailuo I2V: keep it simple. One motion, one atmospheric addition. ' +
      '"Subject holds center. Camera slowly pushes in. Warm light. Soft bokeh." ' +
      'That level of simplicity outperforms complex prompts for this model.',
    examplePrompts: [
      {
        label: 'Nature b-roll',
        prompt:
          'Sunlit wheat field at golden hour. Camera holds steady, gently panning left ' +
          'as a breeze passes through the grain, creating rolling waves across the field. ' +
          'Warm amber light. Soft natural color grade.',
      },
      {
        label: 'Establishing shot',
        prompt:
          'Modern city skyline at blue hour. Camera slowly cranes up from street level ' +
          'to reveal the full cityscape. Building lights reflect on a wet street below. ' +
          'Atmospheric haze, cinematic wide shot.',
      },
    ],
    uniqueTrait:
      'Hailuo is the most cost-efficient option for high-volume b-roll generation. ' +
      'When you need 10+ ambient clips quickly, Hailuo delivers reliable, usable footage ' +
      'at the lowest cost per second.',
  },

  // ─── Pika ─────────────────────────────────────────────────────────────────
  {
    family: 'pika',
    displayLabel: 'Pika',
    imageRefSyntax: 'First Frame (I2V) — no @imageN syntax. 5 second max.',
    promptPhilosophy:
      'Pika is built for creative, stylized, and artistic content. It interprets prompts ' +
      'expressively rather than literally — use bold, evocative language. Pika responds ' +
      'well to mood descriptors, color palette direction, and aesthetic references. ' +
      'It is less photorealistic than Runway or Kling but more stylistically expressive. ' +
      'Think: "art direction brief" rather than "cinematographer\'s note."',
    motionVocabulary: [
      'dynamic sweep', 'energetic zoom', 'dramatic reveal', 'bold transition',
      'expressive motion', 'artistic drift', 'creative pan', 'flowing movement',
    ],
    powerKeywords: [
      'bold color palette', 'vivid', 'stylized', 'artistic', 'expressive',
      'high contrast', 'saturated colors', 'dynamic', 'creative direction',
      'mood board', 'visual poetry', 'vibrant',
    ],
    avoidPhrases: [
      'photorealistic', 'neutral color grade', 'documentary style',
      '@image1', '@image_1', 'text on screen',
    ],
    i2vTips:
      'Pika I2V adds expressive motion to stylized images. Describe the MOOD of the ' +
      'animation as much as the mechanics: "the scene comes alive with a dream-like ' +
      'floating sensation" or "dramatic light pulses through the scene with energy."',
    examplePrompts: [
      {
        label: 'Stylized brand animation',
        prompt:
          'Bold, saturated colors burst across the scene as the camera sweeps dramatically ' +
          'from left to right. The brand color palette (deep purple and gold) pulsates with ' +
          'energy. Abstract geometric shapes orbit the central product in slow arcs. ' +
          'Vivid, high-contrast, artistic direction. 5 seconds of pure visual impact.',
      },
    ],
    uniqueTrait:
      'Pika excels at creative, non-photorealistic content. If you need a stylized, ' +
      'bold, or artistic video that prioritizes visual expression over realism, Pika ' +
      'is often the right choice. Its effects engine can create unique visual moments ' +
      'that photorealistic models cannot.',
  },

  // ─── Sora Family (OpenAI) ────────────────────────────────────────────────
  {
    family: 'sora',
    displayLabel: 'Sora 2 / Sora 2 Pro (OpenAI)',
    imageRefSyntax: 'First Frame (I2V) — no @imageN syntax.',
    promptPhilosophy:
      'Sora has the strongest natural language understanding of any video model. ' +
      'It responds to long, narrative-style descriptions — almost like writing a ' +
      'scene from a screenplay. Include context, character motivation, environment detail, ' +
      'AND camera direction. Sora can handle complex multi-element scenes and maintain ' +
      'visual consistency over longer clips. Do not abbreviate — give it rich context.',
    motionVocabulary: [
      'the camera follows', 'we see', 'the scene opens on', 'cutting to',
      'slowly revealing', 'panning across', 'pushing toward', 'pulling back',
      'circling around', 'hovering above',
    ],
    powerKeywords: [
      'cinematic quality', 'consistent', 'detailed', 'photorealistic', '4K',
      'narrative', 'storytelling', 'immersive', 'coherent', 'film-quality',
    ],
    avoidPhrases: [
      '@image1', '@image_1', 'on-screen text', 'caption',
      'very fast', 'chaotic', 'unpredictable',
    ],
    i2vTips:
      'Sora I2V: treat the reference image as "scene establishment." Write the prompt ' +
      'as if narrating what happens next in a film. Include the scene context, what ' +
      'the subject does, and how the environment responds. Sora handles complex scene ' +
      'continuation better than most models.',
    examplePrompts: [
      {
        label: 'Narrative scene',
        prompt:
          'In a sun-drenched coastal town, a woman in a flowing white dress walks along ' +
          'a narrow cobblestone street. The camera tracks alongside her at a medium distance, ' +
          'maintaining a gentle parallax relationship with the buildings behind her. ' +
          'Morning light rakes across the terracotta facades from the east. Flowering vines ' +
          'cascade from wrought-iron balconies. The scene has the quality of a memory — ' +
          'warm, slightly hazy, deeply atmospheric. Cinematic color grade, shallow depth ' +
          'of field, shot on 35mm.',
      },
    ],
    uniqueTrait:
      'Sora\'s natural language comprehension is best-in-class. Write longer, ' +
      'narrative-style prompts for best results — detailed context and story beats ' +
      'produce more coherent and intentional output than terse prompts.',
  },
];

const GUIDE_MAP: Map<string, ProviderPromptGuide> = new Map();

function normalizeFamily(providerId: string): string {
  if (providerId.startsWith('kling-2.6') && providerId !== 'kling-2.6-motion-control' && providerId !== 'kling-2.6-motion-control-pro') {
    return 'kling-native-audio';
  }
  if (providerId.startsWith('kling')) return 'kling';
  if (providerId.startsWith('seedance')) return 'seedance';
  if (providerId.startsWith('runway')) return 'runway';
  if (providerId.startsWith('veo')) return 'veo';
  if (providerId.startsWith('wan')) return 'wan';
  if (providerId === 'luma' || providerId === 'luma-dream-machine') return 'luma';
  if (providerId.startsWith('hailuo')) return 'hailuo';
  if (providerId === 'pika') return 'pika';
  if (providerId.startsWith('sora')) return 'sora';
  return '';
}

for (const guide of GUIDES) {
  GUIDE_MAP.set(guide.family, guide);
}

export function getProviderGuide(providerId: string): ProviderPromptGuide | null {
  const family = normalizeFamily(providerId);
  return GUIDE_MAP.get(family) ?? null;
}

export function buildProviderSpecificGuidance(
  providerId: string,
  providerDisplayName: string,
  hasMultiImage: boolean,
  promptSyntax?: string | null,
): string {
  const guide = getProviderGuide(providerId);
  if (!guide) return '';

  const syntaxNote = promptSyntax
    ? `\n**Reference image syntax for this provider:** \`${promptSyntax.replace('N', '1')}\`, \`${promptSyntax.replace('N', '2')}\`, \`${promptSyntax.replace('N', '3')}\` (use EXACTLY this format — do not use underscores if the syntax has none, and do not omit underscores if the syntax includes them)`
    : '';

  const sections: string[] = [];

  sections.push(`## 🎬 Active Provider: ${providerDisplayName} — Deep Prompt Guide`);
  sections.push(`**Family:** ${guide.displayLabel}`);
  sections.push(syntaxNote);
  sections.push(`\n### Prompting Philosophy\n${guide.promptPhilosophy}`);
  sections.push(`\n### Motion Vocabulary (words this model responds well to)\n${guide.motionVocabulary.map(v => `• ${v}`).join('\n')}`);
  sections.push(`\n### Power Keywords (enhance output quality)\n${guide.powerKeywords.map(k => `• ${k}`).join('\n')}`);
  sections.push(`\n### Avoid These Phrases (degrade output for this model)\n${guide.avoidPhrases.map(p => `• "${p}"`).join('\n')}`);

  if (guide.i2vTips) {
    sections.push(`\n### I2V-Specific Tips for ${providerDisplayName}\n${guide.i2vTips}`);
  }

  if (hasMultiImage && guide.multiImageTips) {
    sections.push(`\n### Multi-Image Reference Tips (${guide.imageRefSyntax})\n${guide.multiImageTips}`);
  }

  if (guide.nativeAudioTips) {
    sections.push(`\n### Native Audio Tips\n${guide.nativeAudioTips}`);
  }

  sections.push(`\n### Example Prompts for ${providerDisplayName}`);
  for (const ex of guide.examplePrompts) {
    sections.push(`**${ex.label}:**\n> ${ex.prompt}`);
  }

  sections.push(`\n### What Makes ${providerDisplayName} Unique\n${guide.uniqueTrait}`);

  sections.push(
    `\n**CRITICAL RULE:** When writing prompts for ${providerDisplayName}, ALWAYS:` +
    `\n1. Use the exact image reference syntax (${guide.imageRefSyntax}) — do not deviate` +
    `\n2. Use motion vocabulary from the list above — this model responds to these specific terms` +
    `\n3. Avoid the listed phrases — they degrade quality for this specific provider` +
    `\n4. Apply the prompting philosophy above — this is the mental model for this provider`
  );

  return sections.join('\n');
}
