import OpenAI from 'openai';

interface TTSResult {
  success: boolean;
  audioBase64?: string;
  error?: string;
  voice?: string;
}

class OpenAITTSService {
  private client: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('[OpenAI TTS] Service initialized');
    } else {
      console.warn('[OpenAI TTS] OPENAI_API_KEY not set - TTS unavailable');
    }
  }

  isAvailable(): boolean {
    if (!this.client && process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('[OpenAI TTS] Service initialized (lazy)');
    }
    return !!this.client;
  }

  /**
   * Prepare text for TTS - clean up formatting that doesn't translate to speech
   */
  private prepareTextForSpeech(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      // Convert currency for better pronunciation
      .replace(/\$(\d{1,3}),(\d{3}),(\d{3})/g, '$1$2$3 dollars')
      .replace(/\$(\d{1,3}),(\d{3})/g, '$1$2 dollars')
      .replace(/\$(\d+)\.(\d{2})/g, '$1 dollars and $2 cents')
      .replace(/\$(\d+)/g, '$1 dollars')
      // Improve number pronunciation
      .replace(/(\d+)%/g, '$1 percent')
      // Clean up bullet points for speech
      .replace(/^[-•]\s*/gm, '')
      .replace(/^\d+\.\s*/gm, '')
      // Limit length (OpenAI max is 4096)
      .substring(0, 4000);
  }

  async generateSpeech(text: string): Promise<TTSResult> {
    if (!this.client) {
      if (process.env.OPENAI_API_KEY) {
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } else {
        return { success: false, error: 'OpenAI TTS not configured' };
      }
    }

    const startTime = Date.now();
    const preparedText = this.prepareTextForSpeech(text);
    const voice = 'onyx'; // Deep, authoritative voice for executive assistant

    console.log(`[OpenAI TTS] Generating speech, ${preparedText.length} chars`);

    try {
      const mp3 = await this.client.audio.speech.create({
        model: 'tts-1-hd',
        voice: voice,
        input: preparedText,
        speed: 1.0,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      const base64Audio = buffer.toString('base64');
      
      const duration = Date.now() - startTime;
      console.log(`[OpenAI TTS] Generated in ${duration}ms, ${buffer.length} bytes`);

      return {
        success: true,
        audioBase64: `data:audio/mpeg;base64,${base64Audio}`,
        voice,
      };

    } catch (error: any) {
      console.error('[OpenAI TTS] Generation failed:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

export const openAITTSService = new OpenAITTSService();
