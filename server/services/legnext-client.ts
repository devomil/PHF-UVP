// Placeholder: LegNext client stub

interface LegNextGenerateOptions {
  prompt: string;
  model: string;
  mode: string;
  aspectRatio: string;
  stylize?: number;
}

interface LegNextGenerateResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

interface LegNextBalance {
  points: number;
  plan: string;
}

class LegNextClient {
  isConfigured(): boolean {
    return !!process.env.LEGNEXT_API_KEY;
  }

  async hasAvailableCredits(required: number): Promise<boolean> {
    return false;
  }

  async generateImage(options: LegNextGenerateOptions): Promise<LegNextGenerateResult> {
    return { success: false, error: 'LegNext client not implemented' };
  }

  async getBalance(): Promise<LegNextBalance> {
    return { points: 0, plan: 'none' };
  }
}

export const legNextClient = new LegNextClient();
