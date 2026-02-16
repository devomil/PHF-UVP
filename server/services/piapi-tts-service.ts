/**
 * PiAPI Text-to-Speech Service using F5-TTS
 * 
 * F5-TTS is a zero-shot voice cloning API that requires:
 * - gen_text: The text to convert to speech
 * - ref_audio: URL of reference audio for voice cloning
 * - ref_text: Transcription of the reference audio
 */

const PIAPI_BASE_URL = 'https://api.piapi.ai/api/v1/task';

// Homer's voice reference - a warm, professional male voice sample
// Using a publicly available sample for consistent voice
const HOMER_VOICE_REF_AUDIO = 'https://cdn.themetavoice.xyz/speakers/bria.mp3';
const HOMER_VOICE_REF_TEXT = 'I have a warm and friendly voice, speaking clearly and professionally.';

interface PiAPITaskResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    model: string;
    task_type: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    output?: {
      audio_url?: string;
      audio?: string;
    };
    error?: {
      message: string;
    };
  };
}

interface TTSResult {
  success: boolean;
  audioUrl?: string;
  audioBase64?: string;
  error?: string;
}

class PiAPITTSService {
  private apiKey: string | null = null;
  private initialized = false;

  constructor() {
    this.refreshApiKey();
  }

  private refreshApiKey(): void {
    const key = process.env.PIAPI_API_KEY || null;
    if (key !== this.apiKey) {
      this.apiKey = key;
      if (this.apiKey) {
        console.log('[PiAPI TTS] Service initialized with API key');
      } else {
        console.warn('[PiAPI TTS] PIAPI_API_KEY not configured');
      }
    }
    this.initialized = true;
  }

  isAvailable(): boolean {
    this.refreshApiKey();
    return this.apiKey !== null;
  }

  async generateSpeech(text: string): Promise<TTSResult> {
    this.refreshApiKey();
    
    if (!this.apiKey) {
      console.error('[PiAPI TTS] API key not configured after refresh');
      return { success: false, error: 'PiAPI API key not configured' };
    }
    
    console.log('[PiAPI TTS] API key available:', this.apiKey.substring(0, 8) + '...');

    console.log('[PiAPI TTS] Starting TTS generation');
    console.log('[PiAPI TTS] Text length:', text.length);
    console.log('[PiAPI TTS] Text preview:', text.substring(0, 100) + '...');
    console.log('[PiAPI TTS] Using ref audio:', HOMER_VOICE_REF_AUDIO);

    try {
      const requestBody = {
        model: 'Qubico/tts',
        task_type: 'zero-shot',
        input: {
          gen_text: text,
          ref_audio: HOMER_VOICE_REF_AUDIO,
          ref_text: HOMER_VOICE_REF_TEXT,
        },
        config: {
          service_mode: 'public',
        },
      };
      
      console.log('[PiAPI TTS] Request body:', JSON.stringify(requestBody, null, 2));
      
      // Create the TTS task
      const createResponse = await fetch(PIAPI_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('[PiAPI TTS] Create task failed:', createResponse.status, errorText);
        return { success: false, error: `API error: ${createResponse.status}` };
      }

      const createResult: PiAPITaskResponse = await createResponse.json();
      console.log('[PiAPI TTS] Task created:', createResult.data?.task_id);

      if (!createResult.data?.task_id) {
        return { success: false, error: 'No task ID returned' };
      }

      // Poll for completion
      const result = await this.pollForCompletion(createResult.data.task_id);
      return result;

    } catch (error: any) {
      console.error('[PiAPI TTS] Error generating speech:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  private async pollForCompletion(taskId: string, maxAttempts: number = 30, intervalMs: number = 1000): Promise<TTSResult> {
    console.log('[PiAPI TTS] Polling for task completion:', taskId);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const statusResponse = await fetch(`${PIAPI_BASE_URL}/${taskId}`, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey!,
          },
        });

        if (!statusResponse.ok) {
          console.error('[PiAPI TTS] Status check failed:', statusResponse.status);
          await this.sleep(intervalMs);
          continue;
        }

        const statusResult: PiAPITaskResponse = await statusResponse.json();
        const status = statusResult.data?.status;

        console.log(`[PiAPI TTS] Poll attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);

        if (status === 'completed') {
          const output = statusResult.data?.output;
          
          if (output?.audio_url) {
            // Fetch the audio and convert to base64
            const audioBase64 = await this.fetchAudioAsBase64(output.audio_url);
            if (audioBase64) {
              console.log('[PiAPI TTS] Audio generated successfully');
              return { 
                success: true, 
                audioUrl: output.audio_url,
                audioBase64: `data:audio/mpeg;base64,${audioBase64}`,
              };
            }
          }
          
          console.error('[PiAPI TTS] No audio in completed task');
          return { success: false, error: 'No audio in response' };
        }

        if (status === 'failed') {
          const errorMsg = statusResult.data?.error?.message || 'Task failed';
          console.error('[PiAPI TTS] Task failed:', errorMsg);
          return { success: false, error: errorMsg };
        }

        // Still processing, wait and retry
        await this.sleep(intervalMs);

      } catch (error: any) {
        console.error('[PiAPI TTS] Poll error:', error);
        await this.sleep(intervalMs);
      }
    }

    console.error('[PiAPI TTS] Timeout waiting for task completion');
    return { success: false, error: 'Timeout waiting for audio generation' };
  }

  private async fetchAudioAsBase64(audioUrl: string): Promise<string | null> {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        console.error('[PiAPI TTS] Failed to fetch audio:', response.status);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      console.log('[PiAPI TTS] Audio fetched, size:', arrayBuffer.byteLength, 'bytes');
      return base64;
    } catch (error) {
      console.error('[PiAPI TTS] Error fetching audio:', error);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const piapiTTSService = new PiAPITTSService();
