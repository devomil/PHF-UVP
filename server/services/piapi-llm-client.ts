import Anthropic from "@anthropic-ai/sdk";

const PIAPI_LLM_ENDPOINT = "https://api.piapi.ai/v1/chat/completions";

// Defaults — override via PIAPI_LLM_MODEL / ANTHROPIC_LLM_MODEL env vars so a
// broken model id can be fixed without a code deploy.
const DEFAULT_PIAPI_MODEL = "claude-sonnet-4-6";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

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
  timeoutMs?: number;
  preferDirect?: boolean;
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
  private piapiModel: string;
  private anthropicModel: string;

  constructor() {
    this.piapiKey = process.env.PIAPI_API_KEY || null;
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || null;

    // Centralised model config — env vars let ops correct a bad model id at runtime
    this.piapiModel = process.env.PIAPI_LLM_MODEL || DEFAULT_PIAPI_MODEL;
    this.anthropicModel = process.env.ANTHROPIC_LLM_MODEL || DEFAULT_ANTHROPIC_MODEL;

    if (this.anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: this.anthropicKey });
    }

    const primary = this.piapiKey ? `PiAPI (${this.piapiModel})` : "none";
    const fallback = this.anthropicKey ? `Anthropic direct (${this.anthropicModel})` : "none";
    console.log(`[LLMClient] Primary: ${primary} | Fallback: ${fallback}`);

    // Non-blocking startup check: catch a misconfigured fallback model before it
    // silently no-ops inside a fail-open helper at generation time.
    if (this.anthropic && this.anthropicKey) {
      void this.validateAnthropicModel();
    }
  }

  isAvailable(): boolean {
    return !!(this.piapiKey || this.anthropicKey);
  }

  async createChatCompletion(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    if (!this.isAvailable()) {
      throw new Error("No LLM API configured — set PIAPI_API_KEY or ANTHROPIC_API_KEY");
    }

    if (options.preferDirect && this.anthropic) {
      console.log(`[LLMClient] Using Anthropic direct (preferDirect=true, maxTokens=${options.maxTokens})`);
      return await this.callAnthropic(options);
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

  private async validateAnthropicModel(): Promise<void> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": this.anthropicKey!,
          "anthropic-version": "2023-06-01",
        },
      });

      if (!response.ok) {
        console.warn(`[LLMClient] Anthropic model validation: HTTP ${response.status} — cannot verify "${this.anthropicModel}".`);
        return;
      }

      const data = await response.json();
      const available: string[] = (data.data || []).map((m: any) => m.id as string);

      if (!available.includes(this.anthropicModel)) {
        const sonnetOptions = available.filter((id) => id.toLowerCase().includes("sonnet")).join(", ");
        console.error(
          `[LLMClient] ⚠️  ANTHROPIC_LLM_MODEL "${this.anthropicModel}" is NOT accessible with this key. ` +
          `The Anthropic fallback will 404 at generation time. ` +
          `Available Sonnet models: ${sonnetOptions || "(none found)"}. ` +
          `Set ANTHROPIC_LLM_MODEL env var to a valid id to fix without a code deploy.`
        );
      } else {
        console.log(`[LLMClient] Anthropic fallback model "${this.anthropicModel}" verified ✓`);
      }
    } catch (err: any) {
      console.warn(`[LLMClient] Anthropic model validation skipped (${err?.message || err})`);
    }
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
      model: this.piapiModel,
      messages,
      max_tokens: options.maxTokens,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 60000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

      console.log(`[LLMClient] PiAPI success (${this.piapiModel}), tokens: ${data.usage?.total_tokens || "?"}`);
      return { text, provider: "piapi", model: this.piapiModel };
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
      model: this.anthropicModel,
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected Anthropic response type");
    }

    console.log(`[LLMClient] Anthropic fallback success (${this.anthropicModel})`);
    return { text: content.text, provider: "anthropic", model: this.anthropicModel };
  }
}

export const llmClient = new PiAPILLMClient();
