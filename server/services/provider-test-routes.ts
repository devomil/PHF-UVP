import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { AI_VIDEO_PROVIDERS, IMAGE_PROVIDERS } from '../config/ai-video-providers';
import { piapiVideoService } from './piapi-video-service';

const router = Router();
const piApiService = piapiVideoService;

router.get('/providers', isAuthenticated, async (_req: Request, res: Response) => {
  try {
    const videoProviders = Object.entries(AI_VIDEO_PROVIDERS).map(([id, config]) => ({
      id,
      name: formatProviderName(id),
      category: 'video' as const,
      capabilities: config.capabilities,
      supportedAspectRatios: config.supportedAspectRatios,
      maxDuration: config.maxDuration,
      costPerSecond: config.costPerSecond,
    }));

    const imageProviders = Object.entries(IMAGE_PROVIDERS).map(([id, config]) => ({
      id,
      name: formatProviderName(id),
      category: 'image' as const,
      capabilities: {
        t2i: true,
        i2i: id !== 'dalle3',
      },
      supportedAspectRatios: ['1:1', '16:9', '9:16'],
      costPerImage: config.costPerImage,
    }));

    const uniqueVideoProviders = deduplicateProviders(videoProviders);

    res.json({
      success: true,
      video: uniqueVideoProviders,
      image: imageProviders,
      piApiAvailable: piApiService.isAvailable(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/generate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { provider, taskType, prompt, imageUrl, aspectRatio, duration, resolution, generateAudio } = req.body;

    if (!provider || !prompt) {
      return res.status(400).json({ success: false, error: 'Provider and prompt are required' });
    }

    if (!piApiService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'PiAPI service is not configured. Set PIAPI_API_KEY in environment.' });
    }

    const taskId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    if (taskType === 'i2v') {
      if (!imageUrl) {
        return res.status(400).json({ success: false, error: 'Image URL is required for I2V generation' });
      }

      const result = await piApiService.generateImageToVideo({
        imageUrl,
        prompt,
        duration: duration || 5,
        aspectRatio: aspectRatio || '16:9',
        model: provider,
        generateAudio: generateAudio || false,
      });

      return res.json({
        success: result.success,
        taskId,
        provider,
        taskType,
        prompt,
        result: result.success ? {
          url: result.s3Url || result.videoUrl,
          duration: result.duration,
          cost: result.cost,
        } : undefined,
        error: result.error,
        generationTimeMs: result.generationTimeMs,
      });
    }

    const result = await piApiService.generateVideo({
      prompt,
      duration: duration || 5,
      aspectRatio: aspectRatio || '16:9',
      model: provider,
    });

    return res.json({
      success: result.success,
      taskId,
      provider,
      taskType: 't2v',
      prompt,
      result: result.success ? {
        url: result.s3Url || result.videoUrl,
        duration: result.duration,
        cost: result.cost,
      } : undefined,
      error: result.error,
      generationTimeMs: result.generationTimeMs,
    });
  } catch (error: any) {
    console.error('[ProviderTest] Generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/task/:taskId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ success: false, error: 'Task ID required' });
    }

    if (typeof taskId === 'string' && taskId.startsWith('test-')) {
      return res.json({
        success: true,
        taskId,
        status: 'completed',
        message: 'Test tasks return results inline with the generate endpoint',
      });
    }

    if (!piApiService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'PiAPI service not configured' });
    }

    res.json({
      success: true,
      taskId,
      status: 'unknown',
      message: 'Direct PiAPI task polling not exposed in test routes',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function formatProviderName(id: string): string {
  const nameMap: Record<string, string> = {
    'omni-human': 'OmniHuman 1.5',
    'omni-human-1.5': 'OmniHuman 1.5',
    'kling': 'Kling 1.6',
    'kling-1.6': 'Kling 1.6',
    'kling-2.0': 'Kling 2.0',
    'kling-2.1': 'Kling 2.1',
    'kling-2.1-master': 'Kling 2.1 Master',
    'kling-2.5': 'Kling 2.5',
    'kling-2.5-turbo': 'Kling 2.5 Turbo',
    'kling-2.6': 'Kling 2.6',
    'kling-2.6-pro': 'Kling 2.6 Pro',
    'kling-2.6-motion-control': 'Kling 2.6 Motion Control',
    'kling-2.6-motion-control-pro': 'Kling 2.6 MC Pro',
    'kling-avatar': 'Kling Avatar',
    'kling-effects': 'Kling Effects',
    'luma': 'Luma',
    'luma-dream-machine': 'Luma Dream Machine',
    'runway': 'Runway Gen-3',
    'hailuo': 'Hailuo/Minimax',
    'hailuo-minimax': 'Hailuo Minimax',
    'seedance-1.0': 'Seedance 1.0',
    'pika': 'Pika Labs',
    'genmo': 'Genmo',
    'hunyuan': 'Hunyuan',
    'skyreels': 'SkyReels',
    'wan-2.1': 'Wan 2.1',
    'wan-2.6': 'Wan 2.6',
    'veo': 'Veo 3',
    'veo-2': 'Veo 2',
    'veo-3': 'Veo 3',
    'veo-3.1': 'Veo 3.1',
    'veo2': 'Veo 2',
    'veo3': 'Veo 3',
    'veo3.1': 'Veo 3.1',
    'flux': 'Flux',
    'flux-1-dev': 'Flux 1 Dev',
    'falai': 'Fal.ai',
    'stability': 'Stable Diffusion 3',
    'ideogram': 'Ideogram',
    'midjourney': 'Midjourney',
    'dalle3': 'DALL-E 3',
  };
  return nameMap[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function deduplicateProviders<T extends { id: string; name: string }>(providers: T[]): T[] {
  const seen = new Set<string>();
  return providers.filter(p => {
    const key = p.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default router;
