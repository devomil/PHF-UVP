import { Router, Request, Response } from 'express';
import { canvaAssetService } from './canva-asset-service';
import { canvaAuthService } from './canva-auth-service';
import { isAuthenticated } from '../auth';
import { db } from '../db';
import { universalVideoProjects, brandSettings } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export const canvaSyncRouter = Router();

canvaSyncRouter.get('/sync/status/:projectId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ error: 'Invalid project ID' });

    const connected = await canvaAuthService.isConnected(userId);
    if (!connected) {
      return res.json({ connected: false, status: 'not_connected' });
    }

    const { status, jobs } = await canvaAssetService.getProjectSyncStatus(projectId, userId);

    res.json({
      connected: true,
      status,
      totalAssets: jobs.length,
      successCount: jobs.filter(j => j.status === 'success').length,
      failedCount: jobs.filter(j => j.status === 'failed').length,
      assetIds: jobs
        .filter(j => j.canvaAssetId)
        .map(j => ({ id: j.canvaAssetId, type: j.assetType, label: j.assetLabel })),
      lastError: jobs.find(j => j.status === 'failed')?.errorMessage || null,
    });
  } catch (err: any) {
    console.error('[CanvaSync] Status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

canvaSyncRouter.post('/sync/:projectId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ error: 'Invalid project ID' });

    const connected = await canvaAuthService.isConnected(userId);
    if (!connected) {
      return res.status(400).json({ error: 'Canva account not connected. Go to Brand Settings to connect.' });
    }

    const [project] = await db
      .select()
      .from(universalVideoProjects)
      .where(and(
        eq(universalVideoProjects.projectId, projectId),
        eq(universalVideoProjects.ownerId, userId)
      ))
      .limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.outputUrl) return res.status(400).json({ error: 'Project has no rendered output yet' });

    const s3Key = extractS3KeyFromUrl(project.outputUrl);
    if (!s3Key) return res.status(400).json({ error: 'Cannot determine S3 key from output URL' });

    const brandTags = await getBrandTags(userId);

    canvaAssetService.syncRenderToCanva({
      userId,
      projectId,
      projectTitle: project.title ?? `Project ${projectId}`,
      renderS3Key: s3Key,
      brandTags,
    }).catch(err => console.error('[CanvaSync] Manual sync failed:', err.message));

    res.json({ success: true, message: 'Canva sync started' });
  } catch (err: any) {
    console.error('[CanvaSync] Sync trigger error:', err.message);
    res.status(500).json({ error: 'Failed to start Canva sync' });
  }
});

function extractS3KeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (hostname.includes('.s3.') && hostname.includes('.amazonaws.com')) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }

    if (hostname.endsWith('.s3.amazonaws.com')) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }

    if (hostname === 's3.amazonaws.com') {
      return decodeURIComponent(parsed.pathname.replace(/^\/[^/]+\//, ''));
    }

    if (parsed.pathname.startsWith('/renders/') || parsed.pathname.startsWith('/out/')) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }

    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    if (url.startsWith('renders/') || url.startsWith('out/')) {
      return url;
    }
    return null;
  }
}

async function getBrandTags(userId: string): Promise<string[]> {
  try {
    const [brand] = await db
      .select({ brandName: brandSettings.brandName, industry: brandSettings.industry })
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    const tags: string[] = ['neuralcut'];
    if (brand?.brandName) tags.push(brand.brandName.toLowerCase().replace(/\s+/g, '-'));
    if (brand?.industry) tags.push(brand.industry.toLowerCase().replace(/\s+/g, '-'));
    return tags;
  } catch {
    return ['neuralcut'];
  }
}
