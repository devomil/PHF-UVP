import { Router, Request, Response } from "express";
import { socialPublishingService } from "./social-publishing-service";
import { isAuthenticated } from "../auth";

interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

interface PostUpdateFields {
  captions?: Record<string, string>;
  hashtags?: Record<string, string[]>;
  platforms?: string[];
  scheduledFor?: Date | null;
  title?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
}

function getAuthUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

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
    res.json({ configured: socialPublishingService.isConfigured() });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.post("/provision", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const result = await socialPublishingService.createUserProfile(user.id, user.email);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Provision error:", error.message);
    res.status(500).json({ error: "Failed to create social profile" });
  }
});

router.get("/accounts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    await socialPublishingService.ensureProfile(user.id, user.email);
    const accounts = await socialPublishingService.getConnectedAccounts(user.id);
    res.json({ accounts });
  } catch (error: any) {
    console.error("[SocialRoutes] Get accounts error:", error.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.post("/accounts/connect", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    await socialPublishingService.createUserProfile(user.id, user.email);
    const result = await socialPublishingService.getConnectUrl(user.id);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Connect URL error:", error.message);
    res.status(500).json({ error: "Failed to generate connect URL" });
  }
});

router.delete("/accounts/:platform", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { platform } = req.params;
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: "Invalid platform" });
    }
    await socialPublishingService.disconnectAccount(user.id, platform);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[SocialRoutes] Disconnect error:", error.message);
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

router.get("/content-ready", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const items = await socialPublishingService.getContentReady(user.id);
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

router.get("/posts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
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
    const user = getAuthUser(req);
    const { caption, captions, platforms, mediaUrl, mediaType, thumbnailUrl, scheduledFor, title, hashtags, projectId, assetId } = req.body;

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    let captionsObj: Record<string, string>;
    if (captions && typeof captions === "object") {
      captionsObj = captions;
    } else if (caption && typeof caption === "string") {
      captionsObj = {};
      for (const p of validPlatforms) captionsObj[p] = caption;
    } else {
      return res.status(400).json({ error: "Caption or captions object is required" });
    }

    let parsedScheduledFor: Date | undefined;
    if (scheduledFor) {
      parsedScheduledFor = new Date(scheduledFor);
      if (isNaN(parsedScheduledFor.getTime()) || parsedScheduledFor <= new Date()) {
        return res.status(400).json({ error: "Invalid or past scheduled date" });
      }
    }

    const hashtagsObj: Record<string, string[]> = {};
    if (Array.isArray(hashtags)) {
      for (const p of validPlatforms) hashtagsObj[p] = hashtags;
    } else if (typeof hashtags === "object" && hashtags) {
      Object.assign(hashtagsObj, hashtags);
    }

    const result = await socialPublishingService.createScheduledPost(user.id, {
      projectId: typeof projectId === "string" ? projectId : undefined,
      assetId: typeof assetId === "number" ? assetId : undefined,
      mediaUrl: typeof mediaUrl === "string" ? mediaUrl : undefined,
      mediaType: typeof mediaType === "string" ? mediaType : undefined,
      thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : undefined,
      captions: captionsObj,
      hashtags: hashtagsObj,
      platforms: validPlatforms,
      scheduledFor: parsedScheduledFor,
      title: typeof title === "string" ? title.substring(0, 500) : undefined,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Create post error:", error.message);
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.get("/posts/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });
    const post = await socialPublishingService.getPostStatus(user.id, postId);
    res.json(post);
  } catch (error: any) {
    res.status(error.message === "Post not found" ? 404 : 500).json({ error: error.message });
  }
});

router.put("/posts/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });

    const { captions, hashtags, platforms, scheduledFor, title, mediaUrl, mediaType, thumbnailUrl } = req.body;
    const updates: PostUpdateFields = {};

    if (captions !== undefined) updates.captions = captions;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (platforms !== undefined) {
      const valid = validatePlatforms(platforms);
      if (!valid) return res.status(400).json({ error: "Invalid platforms" });
      updates.platforms = valid;
    }
    if (scheduledFor !== undefined) {
      if (scheduledFor === null) {
        updates.scheduledFor = null;
      } else {
        const d = new Date(scheduledFor);
        if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid date" });
        updates.scheduledFor = d;
      }
    }
    if (title !== undefined) updates.title = typeof title === "string" ? title.substring(0, 500) : undefined;
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
    if (mediaType !== undefined) updates.mediaType = mediaType;
    if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl;

    const updated = await socialPublishingService.updatePost(user.id, postId, updates);
    res.json(updated);
  } catch (error: any) {
    res.status(error.message === "Post not found" ? 404 : 400).json({ error: error.message });
  }
});

router.delete("/posts/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });
    await socialPublishingService.deletePost(user.id, postId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message === "Post not found" ? 404 : 400).json({ error: error.message });
  }
});

router.post("/posts/:postId/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });
    const result = await socialPublishingService.publishNow(user.id, postId);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Publish error:", error.message);
    res.status(500).json({ error: error.message || "Failed to publish post" });
  }
});

router.post("/bulk-schedule", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { items, platforms, startDate, intervalStrategy, customIntervalHours } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one content item is required" });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: "Maximum 50 items per bulk schedule" });
    }

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    const parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime()) || parsedStartDate <= new Date()) {
      return res.status(400).json({ error: "Start date must be valid and in the future" });
    }

    const validStrategy = ["recommended", "daily", "custom"].includes(intervalStrategy)
      ? intervalStrategy
      : "recommended";

    const result = await socialPublishingService.bulkSchedule(
      user.id,
      items.map((i: { contentId?: string; id?: string; contentType?: string }) => ({
        contentId: String(i.contentId || i.id),
        contentType: i.contentType === "asset" ? "asset" as const : "project" as const,
      })),
      validPlatforms,
      parsedStartDate,
      validStrategy,
      typeof customIntervalHours === "number" ? customIntervalHours : undefined
    );

    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Bulk schedule error:", error.message);
    res.status(500).json({ error: "Failed to bulk schedule" });
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const ayrshareApiKey = process.env.AYRSHARE_API_KEY;
    const signature = req.headers["x-ayrshare-signature"] as string | undefined;
    if (!ayrshareApiKey || !signature) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const crypto = await import("crypto");
    const rawBody = (req as RequestWithRawBody).rawBody;
    const bodyToVerify = rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSig = crypto
      .createHmac("sha256", ayrshareApiKey)
      .update(bodyToVerify)
      .digest("hex");
    if (signature.length !== expectedSig.length ||
        !crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSig, "utf8"))) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    await socialPublishingService.handleWebhook(req.body);
    res.json({ received: true });
  } catch (error: any) {
    console.error("[SocialRoutes] Webhook error:", error.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.post("/generate-captions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { projectId, assetId, platforms, tone, topic } = req.body;

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    const validTone = typeof tone === "string" && VALID_TONES.includes(tone) ? tone : "professional";

    const result = await socialPublishingService.generateCaptions(
      user.id,
      typeof projectId === "string" ? projectId : undefined,
      typeof assetId === "number" ? assetId : undefined,
      validPlatforms,
      validTone,
      typeof topic === "string" ? topic : undefined
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
      return res.status(400).json({ error: "At least one valid platform required" });
    }
    const times = await socialPublishingService.getOptimalTimes(validPlatforms);
    res.json({ times });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch optimal times" });
  }
});

router.get("/scheduled", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
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

router.post("/schedule", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { caption, captions, platforms, mediaUrl, mediaType, thumbnailUrl, scheduledFor, title, hashtags, projectId, assetId } = req.body;

    const validPlatforms = validatePlatforms(platforms);
    if (!validPlatforms) {
      return res.status(400).json({ error: "At least one valid platform is required" });
    }

    let captionsObj: Record<string, string>;
    if (captions && typeof captions === "object") {
      captionsObj = captions;
    } else if (caption && typeof caption === "string") {
      captionsObj = {};
      for (const p of validPlatforms) captionsObj[p] = caption;
    } else {
      return res.status(400).json({ error: "Caption or captions object is required" });
    }

    let parsedScheduledFor: Date | undefined;
    if (scheduledFor) {
      parsedScheduledFor = new Date(scheduledFor);
      if (isNaN(parsedScheduledFor.getTime()) || parsedScheduledFor <= new Date()) {
        return res.status(400).json({ error: "Invalid or past scheduled date" });
      }
    }

    const hashtagsObj: Record<string, string[]> = {};
    if (Array.isArray(hashtags)) {
      for (const p of validPlatforms) hashtagsObj[p] = hashtags;
    } else if (typeof hashtags === "object" && hashtags) {
      Object.assign(hashtagsObj, hashtags);
    }

    const result = await socialPublishingService.createScheduledPost(user.id, {
      projectId: typeof projectId === "string" ? projectId : undefined,
      assetId: typeof assetId === "number" ? assetId : undefined,
      mediaUrl: typeof mediaUrl === "string" ? mediaUrl : undefined,
      mediaType: typeof mediaType === "string" ? mediaType : undefined,
      thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : undefined,
      captions: captionsObj,
      hashtags: hashtagsObj,
      platforms: validPlatforms,
      scheduledFor: parsedScheduledFor,
      title: typeof title === "string" ? title.substring(0, 500) : undefined,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Schedule post error:", error.message);
    res.status(500).json({ error: "Failed to schedule post" });
  }
});

router.put("/scheduled/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });

    const { captions, hashtags, platforms, scheduledFor, title, mediaUrl, mediaType, thumbnailUrl } = req.body;
    const updates: PostUpdateFields = {};

    if (captions !== undefined) updates.captions = captions;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (platforms !== undefined) {
      const valid = validatePlatforms(platforms);
      if (!valid) return res.status(400).json({ error: "Invalid platforms" });
      updates.platforms = valid;
    }
    if (scheduledFor !== undefined) {
      if (scheduledFor === null) {
        updates.scheduledFor = null;
      } else {
        const d = new Date(scheduledFor);
        if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid date" });
        updates.scheduledFor = d;
      }
    }
    if (title !== undefined) updates.title = typeof title === "string" ? title.substring(0, 500) : undefined;
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
    if (mediaType !== undefined) updates.mediaType = mediaType;
    if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl;

    const updated = await socialPublishingService.updatePost(user.id, postId, updates);
    res.json(updated);
  } catch (error: any) {
    res.status(error.message === "Post not found" ? 404 : 400).json({ error: error.message });
  }
});

router.delete("/scheduled/:postId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const postId = parsePostId(req.params.postId);
    if (!postId) return res.status(400).json({ error: "Invalid post ID" });
    await socialPublishingService.deletePost(user.id, postId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message === "Post not found" ? 404 : 400).json({ error: error.message });
  }
});

router.post("/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { postId } = req.body;
    const id = typeof postId === "number" ? postId : parsePostId(String(postId));
    if (!id) return res.status(400).json({ error: "Invalid post ID" });
    const result = await socialPublishingService.publishNow(user.id, id);
    res.json(result);
  } catch (error: any) {
    console.error("[SocialRoutes] Publish error:", error.message);
    res.status(500).json({ error: error.message || "Failed to publish post" });
  }
});

export default router;
