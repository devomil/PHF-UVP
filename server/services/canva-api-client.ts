import { canvaAuthService } from './canva-auth-service';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

export interface CanvaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface CanvaUploadJob {
  id: string;
  status: 'in_progress' | 'success' | 'failed';
  error?: {
    code: 'file_too_big' | 'import_failed' | 'fetch_failed';
    message: string;
  };
  asset?: CanvaAsset;
}

export interface CanvaDirectUploadJob {
  job: CanvaUploadJob;
  upload_url?: string;
  upload_url_expiry?: number;
}

export interface CanvaUrlUploadResponse {
  job: CanvaUploadJob;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[CanvaAPI] Rate limited (429), waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
    }

    if (response.status >= 500 && attempt < retries) {
      const waitMs = RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[CanvaAPI] Server error ${response.status}, retrying in ${waitMs}ms (${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}

export class CanvaApiClient {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private async headers(): Promise<HeadersInit> {
    const token = await canvaAuthService.getValidAccessToken(this.userId);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async createDirectUploadJob(params: {
    name: string;
    mimeType: string;
    fileSize: number;
  }): Promise<CanvaDirectUploadJob> {
    const response = await fetchWithRetry(`${CANVA_API_BASE}/assets`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        name: params.name,
        content_type: params.mimeType,
        size: params.fileSize,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva createDirectUploadJob failed ${response.status}: ${err}`);
    }

    return response.json() as Promise<CanvaDirectUploadJob>;
  }

  async getDirectUploadJob(jobId: string): Promise<CanvaUploadJob> {
    const response = await fetchWithRetry(`${CANVA_API_BASE}/assets/${jobId}`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva getDirectUploadJob failed ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.job as CanvaUploadJob;
  }

  async createUrlUploadJob(params: {
    name: string;
    url: string;
  }): Promise<CanvaUrlUploadResponse> {
    const response = await fetchWithRetry(`${CANVA_API_BASE}/url-asset-uploads`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        name: params.name,
        url: params.url,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva createUrlUploadJob failed ${response.status}: ${err}`);
    }

    return response.json() as Promise<CanvaUrlUploadResponse>;
  }

  async getUrlUploadJob(jobId: string): Promise<CanvaUploadJob> {
    const response = await fetchWithRetry(`${CANVA_API_BASE}/url-asset-uploads/${jobId}`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Canva getUrlUploadJob failed ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.job as CanvaUploadJob;
  }

  async updateAsset(assetId: string, params: {
    name?: string;
    tags?: string[];
  }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.tags) body.tags = params.tags;

    const response = await fetchWithRetry(`${CANVA_API_BASE}/assets/${assetId}`, {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`[CanvaAPI] updateAsset failed for ${assetId}: ${response.status}`);
    }
  }
}
