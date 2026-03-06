import Anthropic from "@anthropic-ai/sdk";

const PIAPI_LLM_ENDPOINT = "https://api.piapi.ai/v1/chat/completions";
const PIAPI_MODEL = "claude-opus-4-6";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export interface LLMImageContent {
  type: "image";
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64Data: string;
}

export interface LLMTextContent {
  type: "text";
  text: string;
}

export type LLMMessageContent = LLMTextContent | LLMImageContent;

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMMessageContent[];
}

export interface LLMCompletionOptions {
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens: number;
  temperature?: number;
}

export interface LLMCompletionResult {
  text: string;
  provider: "piapi" | "anthropic";
  model: string;
}

class PiAPILLMClient {
  private anthropic: Anthropic | null = null;
  private piapiKey: string | null = null;
  private anthropicKey: string | null = null;

  constructor() {
    this.piapiKey = process.env.PIAPI_API_KEY || null;
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || null;

    if (this.anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: this.anthropicKey });
    }

    const primary = this.piapiKey ? "PiAPI (claude-opus-4-6)" : "none";
    const fallback = this.anthropicKey ? "Anthropic direct (claude-sonnet-4)" : "none";
    console.log(`[LLMClient] Primary: ${primary} | Fallback: ${fallback}`);
  }

  isAvailable(): boolean {
    return !!(this.piapiKey || this.anthropicKey);
  }

  async createChatCompletion(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    if (!this.isAvailable()) {
      throw new Error("No LLM API configured — set PIAPI_API_KEY or ANTHROPIC_API_KEY");
    }

    if (this.piapiKey) {
      try {
        const result = await this.callPiAPI(options);
        return result;
      } catch (error: any) {
        const errMsg = error.message || String(error);
        console.warn(`[LLMClient] PiAPI failed (${errMsg}), falling back to Anthropic...`);

        if (this.anthropic) {
          return await this.callAnthropic(options);
        }
        throw new Error(`PiAPI LLM failed and no Anthropic fallback available: ${errMsg}`);
      }
    }

    if (this.anthropic) {
      return await this.callAnthropic(options);
    }

    throw new Error("No LLM provider available");
  }

  private async callPiAPI(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const messages: any[] = [
      { role: "system", content: options.systemPrompt },
    ];

    for (const msg of options.messages) {
      if (typeof msg.content === "string") {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const contentParts: any[] = [];
        for (const part of msg.content) {
          if (part.type === "text") {
            contentParts.push({ type: "text", text: part.text });
          } else if (part.type === "image") {
            contentParts.push({
              type: "image_url",
              image_url: {
                url: `data:${part.mediaType};base64,${part.base64Data}`,
              },
            });
          }
        }
        messages.push({ role: msg.role, content: contentParts });
      }
    }

    const body = {
      model: PIAPI_MODEL,
      messages,
      max_tokens: options.maxTokens,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(PIAPI_LLM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.piapiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown");
        throw new Error(`PiAPI LLM HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("PiAPI LLM returned empty response");
      }

      console.log(`[LLMClient] PiAPI success (${PIAPI_MODEL}), tokens: ${data.usage?.total_tokens || "?"}`);
      return { text, provider: "piapi", model: PIAPI_MODEL };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callAnthropic(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }

    const messages: any[] = [];

    for (const msg of options.messages) {
      if (typeof msg.content === "string") {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const contentParts: any[] = [];
        for (const part of msg.content) {
          if (part.type === "text") {
            contentParts.push({ type: "text", text: part.text });
          } else if (part.type === "image") {
            contentParts.push({
              type: "image",
              source: {
                type: "base64",
                media_type: part.mediaType,
                data: part.base64Data,
              },
            });
          }
        }
        messages.push({ role: msg.role, content: contentParts });
      }
    }

    const response = await this.anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected Anthropic response type");
    }

    console.log(`[LLMClient] Anthropic fallback success (${ANTHROPIC_MODEL})`);
    return { text: content.text, provider: "anthropic", model: ANTHROPIC_MODEL };
  }
}

export const llmClient = new PiAPILLMClient();
