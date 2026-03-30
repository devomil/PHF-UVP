import { Router, Request, Response } from "express";
import { socialPublishingService } from "./social-publishing-service";
import { isAuthenticated } from "../auth";

const VALID_PLATFORMS = ["twitter", "facebook", "instagram", "tiktok", "linkedin", "youtube", "pinterest", "threads"];
const VALID_STATUSES = ["draft", "scheduled", "publishing", "published", "failed"];
const VALID_TONES = ["professional", "casual", "humorous", "inspirational"];

function parsePostId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) || id <= 0 ? null : id;
}

function validatePlatforms(platforms: unknown): string[] | null {
  if (!Array.isArray(platforms) || platforms.length === 0) return null;
  const valid = platforms.filter((p) => typeof p === "string" && VALID_PLATFORMS.includes(p));
  return valid.length > 0 ? valid : null;
}

const router = Router();

router.get("/status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const configured = socialPublishingService.isConfigured();
    res.json({ configured });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.post("/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await socialPublishingService.createUserProfile(
      user.id,
      user.email
    );
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Create profile error:", error.message);
    res.status(500).json({ error: "Failed to create social profile" });
  }
});

router.get("/connect-url", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await socialPublishingService.getConnectUrl(user.id);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Connect URL error:", error.message);
    res.status(500).json({ error: "Failed to generate connect URL" });
  }
});

router.get("/accounts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const accounts = await socialPublishingService.getConnectedAccounts(user.id);
    res.json({ accounts });
  } catch (error: any) {
    console.error("[SocialRoutes] Get accounts error:", error.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.get("/posts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const status = req.query.status as string | undefined;
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }
    const posts = await socialPublishingService.getUserPosts(user.id, status);
    res.json({ posts });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

router.post("/posts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { caption, platforms, mediaUrls, scheduledFor, title, hashtags, projectId } = req.body;

    if (!caption || typeof caption !== "string" || caption.length > 5000) {
      return res.status(400).json({ error: "Caption is required (max 5000 characters)" });
    }

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    let parsedScheduledFor: Date | undefined;
    if (scheduledFor) {
      parsedScheduledFor = new Date(scheduledFor);
      if (isNaN(parsedScheduledFor.getTime())) {
        return res.status(400).json({ error: "Invalid scheduled date" });
      }
      if (parsedScheduledFor <= new Date()) {
        return res.status(400).json({ error: "Scheduled date must be in the future" });
      }
    }

    const validHashtags = Array.isArray(hashtags)
      ? hashtags.filter((h: unknown) => typeof h === "string").slice(0, 30)
      : undefined;

    const validMediaUrls = Array.isArray(mediaUrls)
      ? mediaUrls.filter((u: unknown) => typeof u === "string" && u.startsWith("http")).slice(0, 10)
      : undefined;

    const result = await socialPublishingService.createPost(user.id, {
      caption,
      platforms: validPlatforms,
      mediaUrls: validMediaUrls,
      scheduledFor: parsedScheduledFor,
      title: typeof title === "string" ? title.substring(0, 500) : undefined,
      hashtags: validHashtags,
      projectId: typeof projectId === "string" ? projectId : undefined,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Create post error:", error.message);
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.put("/posts/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const postId = parsePostId(req.params.postId);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const { caption, hashtags, platforms, scheduledFor, title, mediaUrls } = req.body;
    const updates: any = {};

    if (caption !== undefined) {
      if (typeof caption !== "string" || caption.length > 5000) {
        return res.status(400).json({ error: "Invalid caption" });
      }
      updates.caption = caption;
    }
    if (hashtags !== undefined) {
      updates.hashtags = Array.isArray(hashtags)
        ? hashtags.filter((h: unknown) => typeof h === "string").slice(0, 30)
        : [];
    }
    if (platforms !== undefined) {
      const validPlatforms = validatePlatforms(platforms);
      if (!validPlatforms) {
        return res.status(400).json({ error: "Invalid platforms" });
      }
      updates.platforms = validPlatforms;
    }
    if (scheduledFor !== undefined) {
      if (scheduledFor === null) {
        updates.scheduledFor = null;
      } else {
        const d = new Date(scheduledFor);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: "Invalid scheduled date" });
        }
        updates.scheduledFor = d;
      }
    }
    if (title !== undefined) {
      updates.title = typeof title === "string" ? title.substring(0, 500) : null;
    }
    if (mediaUrls !== undefined) {
      updates.mediaUrls = Array.isArray(mediaUrls)
        ? mediaUrls.filter((u: unknown) => typeof u === "string" && u.startsWith("http")).slice(0, 10)
        : [];
    }

    const updated = await socialPublishingService.updatePost(
      user.id,
      postId,
      updates
    );
    res.json(updated);
  } catch (error: any) {
    const status = error.message === "Post not found" ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.delete("/posts/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const postId = parsePostId(req.params.postId);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    await socialPublishingService.deletePost(user.id, postId);
    res.json({ success: true });
  } catch (error: any) {
    const status = error.message === "Post not found" ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.post("/posts/:postId/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const postId = parsePostId(req.params.postId);
    if (!postId) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    const result = await socialPublishingService.publishNow(user.id, postId);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Publish error:", error.message);
    res.status(500).json({ error: "Failed to publish post" });
  }
});

router.post("/generate-captions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, platforms, tone, topic } = req.body;

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    if (!topic || typeof topic !== "string" || topic.length > 500) {
      return res.status(400).json({ error: "Topic is required (max 500 characters)" });
    }

    const validTone = typeof tone === "string" && VALID_TONES.includes(tone) ? tone : "professional";

    const result = await socialPublishingService.generateCaptions(
      typeof projectId === "string" ? projectId : undefined,
      validPlatforms,
      validTone,
      topic
    );
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Generate captions error:", error.message);
    res.status(500).json({ error: "Failed to generate captions" });
  }
});

router.get("/optimal-times", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const rawPlatforms = (req.query.platforms as string)?.split(",") || [];
    const validPlatforms = rawPlatforms.filter((p) => VALID_PLATFORMS.includes(p));
    if (!validPlatforms.length) {
      return res.status(400).json({ error: "At least one valid platform query parameter required" });
    }
    const times = await socialPublishingService.getOptimalTimes(validPlatforms);
    res.json({ times });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch optimal times" });
  }
});

export default router;
