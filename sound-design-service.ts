// server/services/sound-design-service.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SOUND_PROVIDERS } from '@shared/provider-config';

export interface SoundEffect {
  type: 'whoosh' | 'transition' | 'impact' | 'sparkle' | 'ambient' | 'notification' | 'success';
  url: string;
  duration: number;
  volume: number;
}

export interface SceneSoundDesign {
  sceneId: string;
  transitionIn?: SoundEffect;
  transitionOut?: SoundEffect;
  ambience?: SoundEffect;
  emphasis?: SoundEffect[];
}

// Phase 7C: Enhanced sound design interfaces for UI display
export interface SceneSoundInfo {
  sceneIndex: number;
  ambient: {
    type: string;
    description: string;
  } | null;
  transition: {
    type: string;
    duration: number;
    description: string;
  } | null;
  accents: string[];
}

export interface ProjectSoundInfo {
  voiceover: {
    provider: string;
    voice: string;
    style: string;
    totalDuration: number;
  };
  music: {
    provider: string;
    style: string;
    mood: string;
    duration: number;
  };
  soundEffects: {
    provider: string;
    ambientCount: number;
    transitionCount: number;
    accentCount: number;
  };
  sceneDesigns: SceneSoundInfo[];
}

interface SoundGenerationOptions {
  type: 'sfx' | 'ambient';
  prompt: string;
  duration: number;
  mood?: string;
}

class SoundDesignService {
  private s3Client: S3Client | null = null;
  private bucket = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
  private region = process.env.REMOTION_AWS_REGION || 'us-east-2';
  private apiKey = process.env.PIAPI_API_KEY || '';
  private baseUrl = 'https://api.piapi.ai/api/v1';

  private soundPrompts = {
    whoosh: {
      soft: 'Soft whoosh sound effect, gentle air movement, subtle transition',
      medium: 'Medium whoosh sound effect, smooth transition, cinematic',
      dramatic: 'Dramatic whoosh sound effect, powerful air sweep, impactful',
    },
    transition: {
      fade: 'Gentle fade transition sound, soft tonal shift',
      reveal: 'Reveal sound effect, magical shimmer, unveiling',
      cut: 'Clean cut transition sound, subtle click',
    },
    ambient: {
      nature: 'Peaceful nature ambience, gentle breeze, birds distant, wellness spa atmosphere',
      wellness: 'Calm wellness spa ambient sound, soft tones, relaxing atmosphere',
      morning: 'Morning ambience, soft sunlight feeling, peaceful awakening',
      energy: 'Subtle energetic ambient tone, positive vibes, uplifting',
    },
    emphasis: {
      sparkle: 'Magical sparkle sound effect, twinkling, highlight moment',
      success: 'Success chime, achievement sound, positive confirmation',
      notification: 'Soft notification sound, gentle alert, attention',
    },
  };

  constructor() {
    if (process.env.REMOTION_AWS_ACCESS_KEY_ID && process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
        },
      });
      console.log('[SoundDesign] S3 client configured for audio caching');
    } else {
      console.warn('[SoundDesign] S3 client not configured - audio will use original URLs');
    }
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async generateProjectSoundDesign(
    scenes: Array<{
      id: string;
      type: string;
      duration: number;
      mood?: string;
      isFirst?: boolean;
      isLast?: boolean;
    }>
  ): Promise<Map<string, SceneSoundDesign>> {
    const soundDesigns = new Map<string, SceneSoundDesign>();

    if (!this.isAvailable()) {
      console.warn('[SoundDesign] PiAPI not configured, skipping sound design');
      return soundDesigns;
    }

    console.log(`[SoundDesign] Generating sound design for ${scenes.length} scenes...`);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const isFirst = i === 0;
      const isLast = i === scenes.length - 1;

      const design = await this.generateSceneSoundDesign(scene, isFirst, isLast);
      soundDesigns.set(scene.id, design);

      console.log(`[SoundDesign] Scene ${i + 1}/${scenes.length} complete`);
    }

    return soundDesigns;
  }

  async generateSceneSoundDesign(
    scene: { id: string; type: string; duration: number; mood?: string },
    isFirst: boolean,
    isLast: boolean
  ): Promise<SceneSoundDesign> {
    const design: SceneSoundDesign = {
      sceneId: scene.id,
    };

    try {
      if (!isFirst) {
        design.transitionIn = await this.generateTransitionSound(scene.type, scene.mood, 'in');
      }

      if (!isLast) {
        design.transitionOut = await this.generateTransitionSound(scene.type, scene.mood, 'out');
      }

      if (this.shouldHaveAmbience(scene.type)) {
        design.ambience = await this.generateAmbientSound(scene.type, scene.mood, scene.duration);
      }

      if (scene.type === 'cta' || scene.type === 'product') {
        const emphasis = await this.generateEmphasisSound(scene.type);
        if (emphasis) {
          design.emphasis = [emphasis];
        }
      }

    } catch (error: any) {
      console.error(`[SoundDesign] Error generating sounds for scene ${scene.id}:`, error.message);
    }

    return design;
  }

  private async generateTransitionSound(
    sceneType: string,
    mood: string | undefined,
    direction: 'in' | 'out'
  ): Promise<SoundEffect | undefined> {
    let intensity: 'soft' | 'medium' | 'dramatic' = 'medium';
    
    if (sceneType === 'hook' || sceneType === 'cta') {
      intensity = 'dramatic';
    } else if (sceneType === 'explanation' || sceneType === 'broll') {
      intensity = 'soft';
    }

    const prompt = this.soundPrompts.whoosh[intensity];
    
    const result = await this.generateSound({
      type: 'sfx',
      prompt,
      duration: 0.8,
      mood,
    });

    if (result) {
      return {
        type: 'whoosh',
        url: result.url,
        duration: result.duration,
        volume: 0.6,
      };
    }

    console.warn(`[SoundDesign] Transition sound failed, using stock fallback`);
    return this.getStockTransitionSound(intensity);
  }

  private async generateAmbientSound(
    sceneType: string,
    mood: string | undefined,
    duration: number
  ): Promise<SoundEffect | undefined> {
    let ambientType: keyof typeof this.soundPrompts.ambient = 'wellness';
    
    if (sceneType === 'hook' && mood === 'negative') {
      ambientType = 'morning';
    } else if (sceneType === 'testimonial' || sceneType === 'story') {
      ambientType = 'wellness';
    } else if (sceneType === 'benefit' || sceneType === 'explanation') {
      ambientType = 'nature';
    } else if (sceneType === 'cta') {
      ambientType = 'energy';
    }

    const prompt = this.soundPrompts.ambient[ambientType];
    
    const result = await this.generateSound({
      type: 'ambient',
      prompt,
      duration: Math.min(duration, 30),
      mood,
    });

    if (result) {
      return {
        type: 'ambient',
        url: result.url,
        duration: result.duration,
        volume: 0.15,
      };
    }

    return undefined;
  }

  private async generateEmphasisSound(
    sceneType: string
  ): Promise<SoundEffect | undefined> {
    let emphasisType: keyof typeof this.soundPrompts.emphasis = 'sparkle';
    
    if (sceneType === 'cta') {
      emphasisType = 'success';
    } else if (sceneType === 'product') {
      emphasisType = 'sparkle';
    }

    const prompt = this.soundPrompts.emphasis[emphasisType];
    
    const result = await this.generateSound({
      type: 'sfx',
      prompt,
      duration: 1.5,
    });

    if (result) {
      return {
        type: emphasisType as SoundEffect['type'],
        url: result.url,
        duration: result.duration,
        volume: 0.6,
      };
    }

    return undefined;
  }

  private async generateSound(
    options: SoundGenerationOptions
  ): Promise<{ url: string; duration: number } | null> {
    try {
      console.log(`[SoundDesign] Generating ${options.type}: "${options.prompt.substring(0, 50)}..."`);

      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'kling-sound',
          task_type: 'text_to_audio',
          input: {
            prompt: options.prompt,
            duration: options.duration,
            style: options.mood || 'cinematic',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SoundDesign] API error: ${response.status} - ${errorText}`);
        return null;
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        console.error('[SoundDesign] No task ID in response');
        return null;
      }

      const result = await this.pollForCompletion(taskId);
      
      if (result.success && result.audioUrl) {
        const s3Url = await this.uploadToS3(result.audioUrl, options.type);
        return {
          url: s3Url,
          duration: options.duration,
        };
      }

      return null;

    } catch (error: any) {
      console.error(`[SoundDesign] Generation failed:`, error.message);
      return null;
    }
  }

  private async pollForCompletion(
    taskId: string
  ): Promise<{ success: boolean; audioUrl?: string }> {
    const maxAttempts = 60;
    const pollInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: { 'X-API-Key': this.apiKey },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.data?.status || data.status;

        if (status === 'completed' || status === 'success' || status === 'SUCCESS') {
          const audioUrl = data.data?.output?.audio_url || 
                          data.data?.output?.audio ||
                          data.data?.audio_url;
          
          if (audioUrl) {
            return { success: true, audioUrl };
          }
        }

        if (status === 'failed' || status === 'error') {
          return { success: false };
        }

      } catch (error) {
        // Continue polling
      }
    }

    return { success: false };
  }

  private async uploadToS3(audioUrl: string, type: string): Promise<string> {
    if (!this.s3Client) {
      return audioUrl;
    }

    try {
      const response = await fetch(audioUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      const key = `sound-design/${type}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'audio/mpeg',
        ACL: 'public-read',
      }));

      const s3Url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
      console.log(`[SoundDesign] Uploaded to S3: ${key}`);
      return s3Url;

    } catch (error: any) {
      console.warn(`[SoundDesign] S3 upload failed:`, error.message);
      return audioUrl;
    }
  }

  private shouldHaveAmbience(sceneType: string): boolean {
    const ambientScenes = ['hook', 'testimonial', 'story', 'benefit', 'cta'];
    return ambientScenes.includes(sceneType);
  }

  /**
   * Get stock transition sound from S3
   *
   * To enable stock sounds, upload the following files to your S3 bucket:
   * - stock-sounds/whoosh-soft.mp3
   * - stock-sounds/whoosh-medium.mp3
   * - stock-sounds/whoosh-dramatic.mp3
   *
   * You can use royalty-free sounds from sources like:
   * - freesound.org (CC0/CC-BY licensed)
   * - pixabay.com/sound-effects (Pixabay License)
   * - mixkit.co/free-sound-effects (free for commercial use)
   */
  getStockTransitionSound(intensity: 'soft' | 'medium' | 'dramatic'): SoundEffect | undefined {
    const stockSoundBaseUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/stock-sounds`;

    const stockSounds: Record<string, { url: string; volume: number; duration: number }> = {
      'soft': { url: `${stockSoundBaseUrl}/whoosh-soft.mp3`, volume: 0.4, duration: 0.5 },
      'medium': { url: `${stockSoundBaseUrl}/whoosh-medium.mp3`, volume: 0.5, duration: 0.6 },
      'dramatic': { url: `${stockSoundBaseUrl}/whoosh-dramatic.mp3`, volume: 0.6, duration: 0.8 },
    };

    const sound = stockSounds[intensity];
    if (!sound) {
      console.log(`[SoundDesign] Unknown intensity: ${intensity}`);
      return undefined;
    }

    console.log(`[SoundDesign] Using stock transition sound: ${intensity} -> ${sound.url}`);
    return {
      type: 'whoosh',
      url: sound.url,
      duration: sound.duration,
      volume: sound.volume,
    };
  }

  /**
   * Get stock ambient sound from S3
   *
   * To enable stock ambient sounds, upload the following files to your S3 bucket:
   * - stock-sounds/ambient-nature.mp3
   * - stock-sounds/ambient-wellness.mp3
   * - stock-sounds/ambient-energy.mp3
   */
  getStockAmbientSound(type: 'nature' | 'wellness' | 'energy'): SoundEffect | undefined {
    const stockSoundBaseUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/stock-sounds`;

    const stockSounds: Record<string, { url: string; volume: number }> = {
      'nature': { url: `${stockSoundBaseUrl}/ambient-nature.mp3`, volume: 0.1 },
      'wellness': { url: `${stockSoundBaseUrl}/ambient-wellness.mp3`, volume: 0.08 },
      'energy': { url: `${stockSoundBaseUrl}/ambient-energy.mp3`, volume: 0.12 },
    };

    const sound = stockSounds[type];
    if (!sound) {
      console.log(`[SoundDesign] Unknown ambient type: ${type}`);
      return undefined;
    }

    console.log(`[SoundDesign] Using stock ambient sound: ${type} -> ${sound.url}`);
    return {
      type: 'ambient',
      url: sound.url,
      duration: 30, // Ambient sounds typically loop
      volume: sound.volume,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // Phase 7C: Project Sound Info for UI Display
  // ============================================
  
  private readonly SFX_PROVIDER = SOUND_PROVIDERS.kling_sound;
  
  designProjectSoundInfo(
    scenes: Array<{
      sceneIndex: number;
      sceneType: string;
      narration: string;
      duration: number;
      visualDirection: string;
    }>,
    options: {
      musicEnabled: boolean;
      musicMood: string;
      voiceId: string;
    }
  ): ProjectSoundInfo {
    console.log(`[SoundDesign] Designing sound info for ${scenes.length} scenes`);
    console.log(`[SoundDesign] Using ${this.SFX_PROVIDER.displayName} for sound effects`);
    
    const sceneDesigns = scenes.map((scene, index) => 
      this.designSceneSoundInfo(scene, index, scenes.length)
    );
    
    const ambientCount = sceneDesigns.filter(s => s.ambient).length;
    const transitionCount = sceneDesigns.filter(s => s.transition).length;
    const accentCount = sceneDesigns.reduce((sum, s) => sum + s.accents.length, 0);
    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
    
    console.log(`[SoundDesign] Sound effects: ${ambientCount} ambient, ${transitionCount} transitions, ${accentCount} accents`);
    
    return {
      voiceover: {
        provider: SOUND_PROVIDERS.elevenlabs.displayName,
        voice: options.voiceId || 'Rachel',
        style: 'Warm & calm',
        totalDuration,
      },
      music: {
        provider: options.musicEnabled ? SOUND_PROVIDERS.udio.displayName : 'Disabled',
        style: 'corporate ambient',
        mood: options.musicMood || 'uplifting',
        duration: totalDuration,
      },
      soundEffects: {
        provider: this.SFX_PROVIDER.displayName,
        ambientCount,
        transitionCount,
        accentCount,
      },
      sceneDesigns,
    };
  }
  
  private designSceneSoundInfo(
    scene: {
      sceneIndex: number;
      sceneType: string;
      narration: string;
      duration: number;
      visualDirection: string;
    },
    index: number,
    totalScenes: number
  ): SceneSoundInfo {
    const design: SceneSoundInfo = {
      sceneIndex: scene.sceneIndex,
      ambient: null,
      transition: null,
      accents: [],
    };
    
    design.ambient = this.selectAmbientSoundInfo(scene.visualDirection, scene.sceneType);
    
    if (index < totalScenes - 1) {
      design.transition = this.selectTransitionSoundInfo(scene.sceneType);
    }
    
    design.accents = this.selectAccentSoundsInfo(scene.narration, scene.sceneType);
    
    return design;
  }
  
  private selectAmbientSoundInfo(
    visualDirection: string,
    sceneType: string
  ): { type: string; description: string } | null {
    const lower = visualDirection.toLowerCase();
    
    if (/kitchen|cooking|food|preparing/.test(lower)) {
      return { type: 'kitchen-ambient', description: 'Soft kitchen ambience, subtle cooking sounds' };
    }
    if (/garden|outdoor|nature|farm|field/.test(lower)) {
      return { type: 'nature-ambient', description: 'Birds chirping, gentle breeze, natural sounds' };
    }
    if (/spa|wellness|calm|peaceful|meditation/.test(lower)) {
      return { type: 'wellness-ambient', description: 'Soft ambient tones, subtle water sounds' };
    }
    if (/home|living|cozy|interior|room/.test(lower)) {
      return { type: 'home-ambient', description: 'Quiet home atmosphere, subtle room tone' };
    }
    
    return { type: 'room-tone', description: 'Clean, subtle background atmosphere' };
  }
  
  private selectTransitionSoundInfo(
    currentType: string
  ): { type: string; duration: number; description: string } {
    if (currentType === 'problem' || currentType === 'agitation') {
      return { type: 'hopeful-swell', duration: 0.8, description: 'Uplifting transition swell' };
    }
    if (currentType === 'hook') {
      return { type: 'soft-whoosh', duration: 0.5, description: 'Gentle attention transition' };
    }
    if (currentType === 'benefit' || currentType === 'solution') {
      return { type: 'energy-build', duration: 1.0, description: 'Building energy toward next scene' };
    }
    
    return { type: 'soft-dissolve', duration: 0.6, description: 'Smooth audio transition' };
  }
  
  private selectAccentSoundsInfo(narration: string, sceneType: string): string[] {
    const accents: string[] = [];
    const lower = narration.toLowerCase();
    
    if (/important|crucial|key|remember/.test(lower)) {
      accents.push('subtle-emphasis');
    }
    if (/strategy|tip|try this|here\'s/.test(lower)) {
      accents.push('soft-notification');
    }
    if (sceneType === 'benefit' || /success|result|transform/.test(lower)) {
      accents.push('positive-chime');
    }
    
    return accents;
  }
}

export const soundDesignService = new SoundDesignService();
