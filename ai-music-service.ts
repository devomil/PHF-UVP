import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getMusicStyleForVisual, buildMusicPrompt as buildVisualStyleMusicPrompt } from '@shared/visual-style-config';

export interface MusicGenerationOptions {
  duration: number;
  mood: 'uplifting' | 'calm' | 'dramatic' | 'inspirational' | 'energetic' | 'emotional';
  style: 'wellness' | 'corporate' | 'cinematic' | 'ambient' | 'acoustic';
  tempo?: 'slow' | 'medium' | 'fast';
  instruments?: string[];
  customPrompt?: string;
}

export interface VisualStyleMusicOptions {
  visualStyle: string;
  moodModifier?: string;
  durationSeconds: number;
  provider?: string;
}

export interface GeneratedMusic {
  url: string;
  s3Url: string;
  duration: number;
  mood: string;
  style: string;
  cost: number;
}

const WELLNESS_MUSIC_PROMPTS: Record<string, Record<string, string>> = {
  uplifting: {
    wellness: 'Uplifting wellness music, gentle piano, soft strings, hopeful melody, spa-like atmosphere, positive energy, no vocals',
    corporate: 'Uplifting corporate background music, inspiring, professional, gentle build, no vocals',
    cinematic: 'Uplifting cinematic score, emotional crescendo, inspiring strings, heroic undertones, no vocals',
    ambient: 'Uplifting ambient soundscape, ethereal pads, positive vibes, serene atmosphere, no vocals',
    acoustic: 'Uplifting acoustic guitar melody, gentle strumming, positive feel, intimate, no vocals',
  },
  calm: {
    wellness: 'Calm peaceful wellness music, ambient pads, gentle nature sounds, meditation style, relaxing, no vocals',
    ambient: 'Calm ambient soundscape, ethereal tones, peaceful atmosphere, zen-like, no vocals',
    acoustic: 'Calm acoustic guitar melody, gentle fingerpicking, peaceful, intimate, no vocals',
    corporate: 'Calm corporate background music, peaceful, professional, subtle, no vocals',
    cinematic: 'Calm cinematic music, gentle piano, peaceful strings, atmospheric, no vocals',
  },
  dramatic: {
    wellness: 'Dramatic wellness transformation music, building intensity, emotional piano, inspiring strings, no vocals',
    cinematic: 'Dramatic cinematic music, tension building, orchestral, powerful resolution, no vocals',
    corporate: 'Dramatic corporate music, impactful, professional, building crescendo, no vocals',
    ambient: 'Dramatic ambient soundscape, evolving textures, building intensity, no vocals',
    acoustic: 'Dramatic acoustic arrangement, intense fingerpicking, emotional build, no vocals',
  },
  inspirational: {
    wellness: 'Inspirational wellness journey music, hopeful piano melody, gentle strings, empowering feel, no vocals',
    corporate: 'Inspirational corporate music, motivational, professional, uplifting crescendo, no vocals',
    cinematic: 'Inspirational cinematic score, heroic theme, orchestral beauty, triumphant, no vocals',
    ambient: 'Inspirational ambient soundscape, hopeful tones, uplifting atmosphere, no vocals',
    acoustic: 'Inspirational acoustic music, heartfelt guitar, hopeful melody, no vocals',
  },
  emotional: {
    wellness: 'Emotional wellness music, touching piano melody, heartfelt strings, journey of healing, no vocals',
    cinematic: 'Emotional cinematic score, moving melody, orchestral depth, bittersweet beauty, no vocals',
    corporate: 'Emotional corporate music, touching, professional, heartfelt undertones, no vocals',
    ambient: 'Emotional ambient soundscape, deep pads, moving atmosphere, no vocals',
    acoustic: 'Emotional acoustic music, soulful guitar, touching melody, intimate, no vocals',
  },
  energetic: {
    wellness: 'Energetic wellness music, positive vibes, upbeat tempo, motivational, healthy lifestyle, no vocals',
    corporate: 'Energetic corporate music, dynamic, professional energy, driving rhythm, no vocals',
    cinematic: 'Energetic cinematic music, action-oriented, driving percussion, exciting, no vocals',
    ambient: 'Energetic ambient music, pulsing rhythms, dynamic textures, no vocals',
    acoustic: 'Energetic acoustic music, upbeat strumming, lively rhythm, no vocals',
  },
};

class AIMusicService {
  private s3Client: S3Client;
  private bucket = process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || 'remotionlambda-useast2-1vc2l6a56o';
  private region = process.env.REMOTION_AWS_REGION || 'us-east-2';
  private apiKey = process.env.PIAPI_API_KEY || '';
  private baseUrl = 'https://api.piapi.ai/api/v1';

  constructor() {
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    console.log('[AIMusic] Service initialized, API available:', this.isAvailable());
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic | null> {
    if (!this.isAvailable()) {
      console.warn('[AIMusic] PiAPI not configured');
      return null;
    }

    const startTime = Date.now();
    const prompt = options.customPrompt || this.buildMusicPrompt(options);
    
    console.log(`[AIMusic] Generating ${options.duration}s ${options.mood} ${options.style} music...`);
    console.log(`[AIMusic] Prompt: "${prompt.substring(0, 100)}..."`);

    try {
      const taskResponse = await this.createMusicTask(prompt, options.duration);
      
      if (!taskResponse.success || !taskResponse.taskId) {
        console.error('[AIMusic] Failed to create task:', taskResponse.error);
        return null;
      }

      console.log(`[AIMusic] Task created: ${taskResponse.taskId}`);

      const result = await this.pollForCompletion(taskResponse.taskId);
      
      if (!result.success || !result.audioUrl) {
        console.error('[AIMusic] Generation failed:', result.error);
        return null;
      }

      const s3Url = await this.uploadToS3(result.audioUrl);
      
      const generationTime = Date.now() - startTime;
      const cost = this.estimateCost(options.duration);

      console.log(`[AIMusic] Complete! Time: ${(generationTime / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}`);

      return {
        url: result.audioUrl,
        s3Url,
        duration: options.duration,
        mood: options.mood,
        style: options.style,
        cost,
      };

    } catch (error: any) {
      console.error('[AIMusic] Generation failed:', error.message);
      return null;
    }
  }

  /**
   * Generate music based on visual style (Phase 5B-R2)
   * Uses the visual style configuration to determine music genre, mood, tempo, and keywords
   */
  async generateMusicForVisualStyle(options: VisualStyleMusicOptions): Promise<GeneratedMusic | null> {
    if (!this.isAvailable()) {
      console.warn('[AIMusic] PiAPI not configured');
      return null;
    }

    const { visualStyle, moodModifier = 'default', durationSeconds, provider } = options;
    const startTime = Date.now();
    
    // Get music style from visual style config
    const musicStyle = getMusicStyleForVisual(visualStyle);
    
    // Build prompt using the new visual-style-aware function
    const prompt = buildVisualStyleMusicPrompt(visualStyle, durationSeconds, moodModifier);
    
    // Select provider based on style or explicit selection
    const selectedProvider = provider === 'auto' || !provider 
      ? musicStyle.preferredProvider 
      : provider;

    console.log(`[AIMusic] Generating for visual style "${visualStyle}" (${musicStyle.genre})`);
    console.log(`[AIMusic] Mood modifier: ${moodModifier}, Provider: ${selectedProvider}`);
    console.log(`[AIMusic] Prompt: "${prompt.substring(0, 150)}..."`);

    try {
      const taskResponse = await this.createMusicTask(prompt, durationSeconds);
      
      if (!taskResponse.success || !taskResponse.taskId) {
        console.error('[AIMusic] Failed to create task:', taskResponse.error);
        return null;
      }

      console.log(`[AIMusic] Task created: ${taskResponse.taskId}`);

      const result = await this.pollForCompletion(taskResponse.taskId);
      
      if (!result.success || !result.audioUrl) {
        console.error('[AIMusic] Generation failed:', result.error);
        return null;
      }

      const s3Url = await this.uploadToS3(result.audioUrl);
      
      const generationTime = Date.now() - startTime;
      const cost = this.estimateCost(durationSeconds);

      console.log(`[AIMusic] Complete! Time: ${(generationTime / 1000).toFixed(1)}s, Cost: $${cost.toFixed(3)}`);

      return {
        url: result.audioUrl,
        s3Url,
        duration: durationSeconds,
        mood: moodModifier,
        style: visualStyle,
        cost,
      };

    } catch (error: any) {
      console.error('[AIMusic] Generation failed:', error.message);
      return null;
    }
  }

  async generateMusicForVideo(
    videoDuration: number,
    scenes: Array<{ type: string; mood?: string; duration: number }>
  ): Promise<GeneratedMusic | null> {
    const overallMood = this.analyzeSceneMoods(scenes);
    const style = this.determineStyle(scenes);
    const tempo = this.determineTempo(scenes);

    console.log(`[AIMusic] Video analysis - Duration: ${videoDuration}s, Mood: ${overallMood}, Style: ${style}, Tempo: ${tempo}`);

    return this.generateMusic({
      duration: videoDuration + 3,
      mood: overallMood,
      style,
      tempo,
    });
  }

  private buildMusicPrompt(options: MusicGenerationOptions): string {
    const moodPrompts = WELLNESS_MUSIC_PROMPTS[options.mood];
    if (moodPrompts && moodPrompts[options.style]) {
      let prompt = moodPrompts[options.style];
      prompt += `, ${options.duration} seconds long`;
      
      if (options.tempo) {
        prompt += `, ${options.tempo} tempo`;
      }
      
      if (options.instruments && options.instruments.length > 0) {
        prompt += `, featuring ${options.instruments.join(', ')}`;
      }
      
      return prompt;
    }

    return `${options.mood} ${options.style} background music, ` +
           `${options.tempo || 'medium'} tempo, ` +
           `broadcast quality, ${options.duration} seconds, ` +
           `suitable for wellness and health content, no vocals`;
  }

  private async createMusicTask(
    prompt: string,
    duration: number
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/task`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'music-u',
          task_type: 'generate_music',
          input: {
            gpt_description_prompt: prompt,
            negative_tags: 'vocals, singing, voice',
            lyrics_type: 'instrumental',
            seed: -1,
          },
          config: {
            service_mode: 'public',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        return { success: false, error: 'No task ID in response' };
      }

      return { success: true, taskId };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async pollForCompletion(
    taskId: string
  ): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
    const maxAttempts = 120;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(pollInterval);

      try {
        const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
          headers: { 'X-API-Key': this.apiKey },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.data?.status || data.status;

        if (attempt % 6 === 0) {
          console.log(`[AIMusic] Status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);
        }

        if (status === 'completed' || status === 'success' || status === 'SUCCESS') {
          const audioUrl = this.extractAudioUrl(data);
          
          if (audioUrl) {
            return { success: true, audioUrl };
          }
          return { success: false, error: 'No audio URL in response' };
        }

        if (status === 'failed' || status === 'error' || status === 'FAILED') {
          return { success: false, error: data.data?.error || 'Generation failed' };
        }

      } catch (error: any) {
        // Continue polling despite transient errors
      }
    }

    return { success: false, error: 'Generation timed out' };
  }

  private extractAudioUrl(data: any): string | null {
    const possiblePaths = [
      data.data?.output?.audio_url,
      data.data?.output?.audio,
      data.data?.output?.music_url,
      data.data?.audio_url,
      data.data?.result?.audio_url,
      data.output?.audio_url,
      data.audio_url,
    ];

    for (const path of possiblePaths) {
      if (path && typeof path === 'string' && path.startsWith('http')) {
        return path;
      }
    }

    if (Array.isArray(data.data?.output)) {
      const audio = data.data.output.find((o: any) => o.audio_url || o.url);
      return audio?.audio_url || audio?.url || null;
    }

    return null;
  }

  private async uploadToS3(audioUrl: string): Promise<string> {
    try {
      const response = await fetch(audioUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      const key = `music/udio/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'audio/mpeg',
        ACL: 'public-read',
      }));

      console.log(`[AIMusic] Uploaded to S3: ${key}`);
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    } catch (error: any) {
      console.warn('[AIMusic] S3 upload failed, using original URL:', error.message);
      return audioUrl;
    }
  }

  private analyzeSceneMoods(
    scenes: Array<{ type: string; mood?: string }>
  ): MusicGenerationOptions['mood'] {
    const moodCounts: Record<string, number> = {
      uplifting: 0,
      calm: 0,
      dramatic: 0,
      inspirational: 0,
      emotional: 0,
      energetic: 0,
    };

    for (const scene of scenes) {
      switch (scene.type) {
        case 'hook':
          moodCounts.dramatic += 1;
          moodCounts.emotional += 1;
          break;
        case 'testimonial':
        case 'story':
          moodCounts.emotional += 2;
          moodCounts.inspirational += 1;
          break;
        case 'benefit':
        case 'explanation':
          moodCounts.uplifting += 1;
          moodCounts.calm += 1;
          break;
        case 'cta':
          moodCounts.inspirational += 2;
          moodCounts.energetic += 1;
          break;
        case 'broll':
          moodCounts.calm += 1;
          break;
        case 'product':
          moodCounts.uplifting += 1;
          break;
        case 'hero':
          moodCounts.dramatic += 1;
          moodCounts.inspirational += 1;
          break;
      }

      if (scene.mood) {
        const moodMapping: Record<string, keyof typeof moodCounts> = {
          positive: 'uplifting',
          negative: 'emotional',
          neutral: 'calm',
          dramatic: 'dramatic',
          serious: 'emotional',
          hopeful: 'inspirational',
          excited: 'energetic',
        };
        const mappedMood = moodMapping[scene.mood];
        if (mappedMood) {
          moodCounts[mappedMood] += 1;
        }
      }
    }

    let maxMood: MusicGenerationOptions['mood'] = 'inspirational';
    let maxCount = 0;

    for (const [mood, count] of Object.entries(moodCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxMood = mood as MusicGenerationOptions['mood'];
      }
    }

    return maxMood;
  }

  private determineStyle(
    scenes: Array<{ type: string }>
  ): MusicGenerationOptions['style'] {
    return 'wellness';
  }

  private determineTempo(
    scenes: Array<{ duration: number }>
  ): MusicGenerationOptions['tempo'] {
    if (scenes.length === 0) return 'medium';
    
    const avgDuration = scenes.reduce((sum, s) => sum + s.duration, 0) / scenes.length;

    if (avgDuration < 10) return 'fast';
    if (avgDuration > 20) return 'slow';
    return 'medium';
  }

  private estimateCost(duration: number): number {
    return duration * 0.01;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const aiMusicService = new AIMusicService();
