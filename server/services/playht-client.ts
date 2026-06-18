/**
 * Play.ht Text-to-Speech and Voice Cloning Client (V2 API)
 *
 * Required env vars:
 *   PLAYHT_API_KEY  — Bearer token from play.ht → API Access
 *   PLAYHT_USER_ID  — Account User ID from the same page
 *
 * Docs: https://docs.play.ht/reference/api-getting-started
 */

const PLAYHT_BASE_URL = 'https://api.play.ht/api/v2';

const PLAYHT_DEFAULT_VOICE = 'larry';

export interface PlayHTTTSOptions {
  text: string;
  voice?: string;
  outputFormat?: 'mp3' | 'wav' | 'ogg' | 'flac' | 'mulaw';
  quality?: 'draft' | 'low' | 'medium' | 'high' | 'premium';
  speed?: number;
  temperature?: number;
}

export interface PlayHTTTSResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

export interface PlayHTCloneVoiceResult {
  success: boolean;
  voiceId?: string;
  error?: string;
}

class PlayHTClient {
  private apiKey: string | null = null;
  private userId: string | null = null;

  private refresh(): void {
    this.apiKey = process.env.PLAYHT_API_KEY || null;
    this.userId = process.env.PLAYHT_USER_ID || null;
  }

  isAvailable(): boolean {
    this.refresh();
    return !!(this.apiKey && this.userId);
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-User-Id': this.userId!,
    };
  }

  /**
   * Generate speech from text using the Play.ht V2 TTS endpoint.
   * The API streams SSE events; we read the full body and extract the
   * final audio URL from the last `data:` line that contains a `url` field.
   */
  async generateSpeech(options: PlayHTTTSOptions): Promise<PlayHTTTSResult> {
    this.refresh();
    if (!this.isAvailable()) {
      return { success: false, error: 'PLAYHT_API_KEY or PLAYHT_USER_ID not configured' };
    }

    const {
      text,
      voice = PLAYHT_DEFAULT_VOICE,
      outputFormat = 'mp3',
      quality = 'premium',
      speed = 1,
      temperature,
    } = options;

    const body: Record<string, unknown> = {
      text,
      voice,
      output_format: outputFormat,
      quality,
      speed,
    };
    if (temperature !== undefined) {
      body.temperature = temperature;
    }

    try {
      console.log(`[Play.ht] Generating TTS — voice: ${voice}, text length: ${text.length}`);

      const response = await fetch(`${PLAYHT_BASE_URL}/tts`, {
        method: 'POST',
        headers: {
          ...this.authHeaders(),
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Play.ht] TTS request failed:', response.status, errText);
        return {
          success: false,
          error: `Play.ht API error ${response.status}: ${errText.substring(0, 200)}`,
        };
      }

      const audioUrl = await this.extractAudioUrlFromSSE(response);
      if (!audioUrl) {
        return { success: false, error: 'No audio URL found in Play.ht SSE response' };
      }

      console.log(`[Play.ht] TTS complete — url: ${audioUrl.substring(0, 80)}…`);
      return { success: true, audioUrl };
    } catch (error: any) {
      console.error('[Play.ht] TTS error:', error);
      return { success: false, error: error.message || 'Unknown Play.ht error' };
    }
  }

  /**
   * Read the SSE body and return the last audio URL seen in any `data:` event.
   * Play.ht sends incremental events ending with a `stage: "complete"` event
   * that carries the permanent CDN URL.
   */
  private async extractAudioUrlFromSSE(response: Response): Promise<string | null> {
    const rawText = await response.text();
    let audioUrl: string | null = null;

    for (const line of rawText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const event = JSON.parse(json);
        if (event.url) {
          audioUrl = event.url;
        }
      } catch {
        // non-JSON data line — skip
      }
    }

    return audioUrl;
  }

  /**
   * Clone a voice by uploading a reference audio sample from a URL.
   * Returns the Play.ht voice ID that can be passed to generateSpeech().
   */
  async cloneVoice(name: string, referenceAudioUrl: string): Promise<PlayHTCloneVoiceResult> {
    this.refresh();
    if (!this.isAvailable()) {
      return { success: false, error: 'Play.ht not configured' };
    }

    try {
      console.log(`[Play.ht] Cloning voice "${name}" from: ${referenceAudioUrl.substring(0, 80)}`);

      const audioResponse = await fetch(referenceAudioUrl);
      if (!audioResponse.ok) {
        return {
          success: false,
          error: `Failed to fetch reference audio (${audioResponse.status})`,
        };
      }
      const audioBuffer = await audioResponse.arrayBuffer();
      const mimeType = audioResponse.headers.get('content-type') || 'audio/mpeg';
      const extension = mimeType.includes('wav') ? 'wav' : 'mp3';

      const formData = new FormData();
      formData.append(
        'sample_file',
        new Blob([audioBuffer], { type: mimeType }),
        `reference.${extension}`,
      );
      formData.append('voice_name', name);

      const response = await fetch(`${PLAYHT_BASE_URL}/clone-voices`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[Play.ht] Clone voice error:', response.status, errText);
        return { success: false, error: `Clone error ${response.status}: ${errText.substring(0, 200)}` };
      }

      const result = await response.json();
      const voiceId: string | undefined =
        result.id ?? result.voice_id ?? result.voice?.id;

      if (!voiceId) {
        console.error('[Play.ht] No voice ID in clone response:', JSON.stringify(result));
        return { success: false, error: 'No voice ID returned from Play.ht' };
      }

      console.log(`[Play.ht] Voice cloned successfully — id: ${voiceId}`);
      return { success: true, voiceId };
    } catch (error: any) {
      console.error('[Play.ht] Clone error:', error);
      return { success: false, error: error.message || 'Unknown clone error' };
    }
  }

  /**
   * List voices that have been cloned for this account.
   */
  async listClonedVoices(): Promise<{
    success: boolean;
    voices?: Array<{ id: string; name: string }>;
    error?: string;
  }> {
    this.refresh();
    if (!this.isAvailable()) {
      return { success: false, error: 'Play.ht not configured' };
    }

    try {
      const response = await fetch(`${PLAYHT_BASE_URL}/clone-voices`, {
        headers: {
          ...this.authHeaders(),
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return { success: false, error: `Play.ht API error: ${response.status}` };
      }

      const data = await response.json();
      const raw: any[] = Array.isArray(data) ? data : data.voices ?? [];
      const voices = raw.map((v) => ({
        id: v.id ?? v.voice_id ?? '',
        name: v.name ?? v.voice_name ?? v.id ?? '',
      }));

      return { success: true, voices };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Resolve a voiceId for Play.ht TTS dispatch.
   *
   * Supports two forms:
   *   1. A bare Play.ht voice ID (e.g. "larry", "s3://…") — returned as-is.
   *   2. A `@voiceN` reference (e.g. "@voice1", "@voice2") — mapped to the Nth
   *      cloned voice on the account (1-indexed by order returned from the API).
   *      Throws an explicit error when the index is out of range or the clone list
   *      cannot be fetched, rather than silently falling through to an incorrect voice.
   *
   * Returns `undefined` (i.e. use the provider default) when `voiceId` is falsy.
   */
  async resolveVoiceId(voiceId: string | undefined): Promise<string | undefined> {
    if (!voiceId) return undefined;

    const match = voiceId.match(/^@voice(\d+)$/i);
    if (!match) {
      return voiceId;
    }

    const index = parseInt(match[1], 10);
    const listResult = await this.listClonedVoices();
    if (!listResult.success || !listResult.voices) {
      throw new Error(
        `Play.ht cloned-voice lookup failed while resolving "${voiceId}": ${listResult.error || 'unknown error'}`,
      );
    }

    const voice = listResult.voices[index - 1];
    if (!voice) {
      throw new Error(
        `Play.ht cloned-voice "${voiceId}" out of range — account has ${listResult.voices.length} cloned voice(s)`,
      );
    }

    console.log(`[Play.ht] Resolved "${voiceId}" → "${voice.id}" (${voice.name})`);
    return voice.id;
  }
}

export const playHTClient = new PlayHTClient();
