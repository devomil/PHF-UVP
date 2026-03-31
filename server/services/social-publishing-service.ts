import { db } from "../db";
import { users, scheduledPosts, universalVideoProjects, mediaAssets } from "../../shared/schema";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { llmClient } from "./piapi-llm-client";
import { brandBibleService } from "./brand-bible-service";
import { getTrendingHooks } from "./trend-intelligence-service";

interface ProjectProgress {
  outputUrl?: string;
  renderOutputUrl?: string;
  [key: string]: unknown;
}

interface ProjectConcept {
  description?: string;
  [key: string]: unknown;
}

interface ProjectAssets {
  productMediaUrl?: string;
  [key: string]: unknown;
}

const AYRSHARE_API_BASE = "https://api.ayrshare.com/api";
const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY || "";

const SUPPORTED_PLATFORMS = [
  "twitter", "facebook", "instagram", "tiktok",
  "linkedin", "youtube", "pinterest", "threads",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

type ScheduledPost = typeof scheduledPosts.$inferSelect;

interface PostStatusResult extends ScheduledPost {
  liveStatus?: Record<string, unknown>;
}

interface AyrshareProfileResponse {
  status: string;
  profileKey: string;
  title?: string;
  refId?: string;
}

interface AyrsharePostResponse {
  id: string;
  status: string;
  postIds?: Array<{ platform: string; postId: string; postUrl?: string }>;
  errors?: Array<{ platform: string; message: string }>;
}

interface ConnectedAccount {
  platform: string;
  connected: boolean;
  username?: string;
  profileUrl?: string;
  profileImageUrl?: string;
}

interface ContentReadyItem {
  id: string;
  type: "project" | "asset";
  title: string;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  duration?: number;
  publishStatus: "unpublished" | "scheduled" | "published";
  createdAt: string;
}

const PLATFORM_INTERVALS: Record<string, number> = {
  tiktok: 48,
  instagram: 24,
  youtube: 72,
  facebook: 12,
  twitter: 4,
  linkedin: 24,
  pinterest: 8,
  threads: 12,
};

class SocialPublishingService {
  private getHeaders(profileKey?: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
    };
    if (profileKey) {
      headers["Profile-Key"] = profileKey;
    }
    return headers;
  }

  isConfigured(): boolean {
    return !!AYRSHARE_API_KEY;
  }

  async createUserProfile(
    userId: string,
    email: string
  ): Promise<{ success: boolean }> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    if (existingUser?.ayrshareProfileKey) {
      return { success: true };
    }

    const refId = `neuralcut_${userId}`;
    const response = await fetch(`${AYRSHARE_API_BASE}/profiles/profile`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ title: email, refId }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.log(`[SocialPublishing] Sub-profile creation not available (403). Using primary profile for user ${userId}`);
        try {
          await db
            .update(users)
            .set({ ayrshareProfileKey: "primary", updatedAt: new Date() })
            .where(eq(users.id, userId));
        } catch (dbError: any) {
          console.error(`[SocialPublishing] DB write failed setting primary profile: ${dbError.message}`);
        }
        return { success: true };
      }
      throw new Error(`Failed to create social profile (${response.status})`);
    }

    const data = (await response.json()) as AyrshareProfileResponse;
    const profileKey = data.profileKey;

    if (!profileKey) {
      throw new Error("Social profile creation failed - no key returned");
    }

    try {
      await db
        .update(users)
        .set({ ayrshareProfileKey: profileKey, updatedAt: new Date() })
        .where(eq(users.id, userId));
      console.log(`[SocialPublishing] Stored profile for user ${userId}`);
    } catch (dbError: any) {
      console.error(
        `[SocialPublishing] CRITICAL_RECOVERY: DB write failed for user ${userId} profile. profileKey=${profileKey} — Save this key for manual recovery. Error: ${dbError.message}`
      );
      throw new Error("Profile created but failed to save. Please contact support.");
    }

    return { success: true };
  }

  async ensureProfile(userId: string, email?: string): Promise<void> {
    if (!this.isConfigured()) return;
    const [user] = await db
      .select({ ayrshareProfileKey: users.ayrshareProfileKey, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.ayrshareProfileKey) return;
    try {
      await this.createUserProfile(userId, email || user?.email || "");
    } catch (e: any) {
      console.warn(`[SocialPublishing] Auto-provision skipped: ${e.message}`);
    }
  }

  async getConnectUrl(userId: string): Promise<{ url: string }> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) {
      throw new Error("No social profile found. Please set up your profile first.");
    }

    if (this.isPrimaryProfile(profileKey)) {
      const response = await fetch(`${AYRSHARE_API_BASE}/profiles/generateJWT`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          domain: process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://neuralcut.ai",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`[SocialPublishing] Primary JWT failed (${response.status}): ${body}`);
        throw new Error(`Failed to generate connect URL (${response.status})`);
      }

      const data = await response.json();
      return { url: data.url || data.link };
    }

    const response = await fetch(`${AYRSHARE_API_BASE}/profiles/generateJWT`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        profileKey,
        domain: process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : "https://neuralcut.ai",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate connect URL (${response.status})`);
    }

    const data = await response.json();
    return { url: data.url || data.link };
  }

  async getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
    if (!this.isConfigured()) return [];

    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) return [];

    try {
      const headers = this.isPrimaryProfile(profileKey)
        ? this.getHeaders()
        : this.getHeaders(profileKey);
      const response = await fetch(`${AYRSHARE_API_BASE}/profiles`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        console.warn(`[SocialPublishing] Failed to fetch accounts: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const accounts: ConnectedAccount[] = [];

      const socialProfiles = data.socialProfiles || {};
      for (const platform of SUPPORTED_PLATFORMS) {
        const isActive = data.activeSocialAccounts?.some(
          (a: string) => a.toLowerCase() === platform
        );
        if (isActive) {
          const profile = socialProfiles[platform] || {};
          accounts.push({
            platform,
            connected: true,
            username: profile.username || profile.screenName || profile.name || undefined,
            profileUrl: profile.profileUrl || profile.url || undefined,
            profileImageUrl: profile.profileImageUrl || profile.avatarUrl || profile.picture || undefined,
          });
        }
      }

      return accounts;
    } catch (error: any) {
      console.error(`[SocialPublishing] Error fetching accounts: ${error.message}`);
      return [];
    }
  }

  async disconnectAccount(userId: string, platform: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) {
      throw new Error("No social profile found");
    }

    const headers = this.isPrimaryProfile(profileKey)
      ? this.getHeaders()
      : this.getHeaders(profileKey);
    const response = await fetch(`${AYRSHARE_API_BASE}/profiles/social/${platform}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect ${platform}`);
    }
  }

  async getContentReady(userId: string): Promise<ContentReadyItem[]> {
    const items: ContentReadyItem[] = [];

    try {
      const projects = await db
        .select()
        .from(universalVideoProjects)
        .where(and(
          eq(universalVideoProjects.ownerId, userId),
          or(
            eq(universalVideoProjects.status, "completed"),
            eq(universalVideoProjects.status, "rendered")
          )
        ))
        .orderBy(desc(universalVideoProjects.createdAt));

      for (const project of projects) {
        const progress = (project.progress ?? {}) as ProjectProgress;
        const outputUrl = progress.outputUrl || progress.renderOutputUrl;
        if (!outputUrl) continue;

        const existingPost = await db
          .select({ id: scheduledPosts.id, status: scheduledPosts.status })
          .from(scheduledPosts)
          .where(
            and(
              eq(scheduledPosts.userId, userId),
              eq(scheduledPosts.projectId, project.projectId)
            )
          )
          .limit(1);

        items.push({
          id: project.projectId,
          type: "project",
          title: project.title || "Untitled Project",
          mediaUrl: outputUrl,
          mediaType: "video",
          thumbnailUrl: this.extractThumbnail(project),
          publishStatus: existingPost.length > 0
            ? (existingPost[0].status === "published" ? "published" : "scheduled")
            : "unpublished",
          createdAt: project.createdAt?.toISOString() || new Date().toISOString(),
        });
      }

      const assets = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.source, "generated"), eq(mediaAssets.uploadedBy, userId)))
        .orderBy(desc(mediaAssets.createdAt));

      for (const asset of assets) {
        if (!asset.url) continue;
        const isVideo = asset.type === "video" || asset.mimeType?.startsWith("video/");
        const isImage = asset.type === "image" || asset.mimeType?.startsWith("image/");
        if (!isVideo && !isImage) continue;

        const existingAssetPost = await db
          .select({ id: scheduledPosts.id, status: scheduledPosts.status })
          .from(scheduledPosts)
          .where(
            and(
              eq(scheduledPosts.userId, userId),
              eq(scheduledPosts.assetId, asset.id)
            )
          )
          .limit(1);

        items.push({
          id: String(asset.id),
          type: "asset",
          title: asset.name,
          mediaUrl: asset.url,
          mediaType: isVideo ? "video" : "image",
          thumbnailUrl: asset.thumbnailUrl || undefined,
          duration: asset.duration || undefined,
          publishStatus: existingAssetPost.length > 0
            ? (existingAssetPost[0].status === "published" ? "published" : "scheduled")
            : "unpublished",
          createdAt: asset.createdAt?.toISOString() || new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error(`[SocialPublishing] Content ready error: ${error.message}`);
    }

    return items;
  }

  async createScheduledPost(
    userId: string,
    post: {
      projectId?: string;
      assetId?: number;
      mediaUrl?: string;
      mediaType?: string;
      thumbnailUrl?: string;
      captions: Record<string, string>;
      hashtags: Record<string, string[]>;
      platforms: string[];
      scheduledFor?: Date;
      title?: string;
    }
  ): Promise<{ postId: number; ayrsharePostId?: string }> {
    const wantsSchedule = !!post.scheduledFor;
    const canScheduleExternally = wantsSchedule && this.isConfigured();

    const [dbPost] = await db
      .insert(scheduledPosts)
      .values({
        userId,
        projectId: post.projectId || null,
        assetId: post.assetId || null,
        mediaUrl: post.mediaUrl || null,
        mediaType: post.mediaType || null,
        thumbnailUrl: post.thumbnailUrl || null,
        title: post.title || null,
        captions: post.captions as Record<string, string>,
        hashtags: post.hashtags as Record<string, string[]>,
        platforms: post.platforms,
        status: "draft",
        scheduledFor: post.scheduledFor || null,
      })
      .returning();

    if (canScheduleExternally) {
      try {
        const primaryCaption = Object.values(post.captions)[0] || "";
        const allHashtags = Object.values(post.hashtags).flat();
        const captionWithHashtags = allHashtags.length
          ? `${primaryCaption}\n\n${allHashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}`
          : primaryCaption;

        const ayrshareResult = await this.publishToAyrshare(
          userId,
          captionWithHashtags,
          post.platforms,
          post.mediaUrl ? [post.mediaUrl] : undefined,
          post.scheduledFor
        );

        await db
          .update(scheduledPosts)
          .set({
            status: "scheduled",
            ayrsharePostId: ayrshareResult.id,
            platformPostIds: ayrshareResult.postIds as Array<{ platform: string; postId: string; postUrl?: string }>,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, dbPost.id));

        return { postId: dbPost.id, ayrsharePostId: ayrshareResult.id };
      } catch (error: any) {
        await db
          .update(scheduledPosts)
          .set({
            status: "failed",
            failureReason: error.message,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, dbPost.id));
        throw error;
      }
    }

    return { postId: dbPost.id };
  }

  async publishNow(userId: string, postId: number): Promise<{ ayrsharePostId: string }> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const [post] = await db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId)));

    if (!post) throw new Error("Post not found");

    await db
      .update(scheduledPosts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    try {
      const captions = (post.captions as Record<string, string>) || {};
      const primaryCaption = Object.values(captions)[0] || "";
      const hashtags = (post.hashtags as Record<string, string[]>) || {};
      const allHashtags = Object.values(hashtags).flat();
      const captionWithHashtags = allHashtags.length
        ? `${primaryCaption}\n\n${allHashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}`
        : primaryCaption;

      const result = await this.publishToAyrshare(
        userId,
        captionWithHashtags,
        post.platforms,
        post.mediaUrl ? [post.mediaUrl] : undefined
      );

      await db
        .update(scheduledPosts)
        .set({
          status: "published",
          publishedAt: new Date(),
          ayrsharePostId: result.id,
          platformPostIds: result.postIds as Array<{ platform: string; postId: string; postUrl?: string }>,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));

      return { ayrsharePostId: result.id };
    } catch (error: any) {
      await db
        .update(scheduledPosts)
        .set({
          status: "failed",
          failureReason: error.message,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));
      throw error;
    }
  }

  async getPostStatus(userId: string, postId: number): Promise<PostStatusResult> {
    const [post] = await db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId)));

    if (!post) throw new Error("Post not found");

    if (post.ayrsharePostId && this.isConfigured()) {
      try {
        const profileKey = await this.getProfileKey(userId);
        if (profileKey) {
          const headers = this.isPrimaryProfile(profileKey)
            ? this.getHeaders()
            : this.getHeaders(profileKey);
          const response = await fetch(`${AYRSHARE_API_BASE}/post/${post.ayrsharePostId}`, {
            headers,
          });
          if (response.ok) {
            const statusData = await response.json();
            return { ...post, liveStatus: statusData };
          }
        }
      } catch (error: any) {
        console.warn(`[SocialPublishing] Status check failed: ${error.message}`);
      }
    }

    return post;
  }

  async getUserPosts(userId: string, status?: string): Promise<ScheduledPost[]> {
    if (status) {
      return await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.userId, userId), eq(scheduledPosts.status, status)))
        .orderBy(desc(scheduledPosts.createdAt));
    }
    return await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.userId, userId))
      .orderBy(desc(scheduledPosts.createdAt));
  }

  async updatePost(
    userId: string,
    postId: number,
    updates: {
      captions?: Record<string, string>;
      hashtags?: Record<string, string[]>;
      platforms?: string[];
      scheduledFor?: Date | null;
      title?: string;
      mediaUrl?: string;
      mediaType?: string;
      thumbnailUrl?: string;
    }
  ): Promise<ScheduledPost> {
    const [existing] = await db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId)));

    if (!existing) throw new Error("Post not found");
    if (existing.status === "published" || existing.status === "publishing") {
      throw new Error("Cannot edit a published or publishing post");
    }

    const setValues: Partial<typeof scheduledPosts.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
    if (updates.captions !== undefined) setValues.captions = updates.captions;
    if (updates.hashtags !== undefined) setValues.hashtags = updates.hashtags;
    if (updates.platforms !== undefined) setValues.platforms = updates.platforms;
    if (updates.scheduledFor !== undefined) setValues.scheduledFor = updates.scheduledFor;
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.mediaUrl !== undefined) setValues.mediaUrl = updates.mediaUrl;
    if (updates.mediaType !== undefined) setValues.mediaType = updates.mediaType;
    if (updates.thumbnailUrl !== undefined) setValues.thumbnailUrl = updates.thumbnailUrl;

    const [updated] = await db
      .update(scheduledPosts)
      .set(setValues)
      .where(eq(scheduledPosts.id, postId))
      .returning();

    return updated;
  }

  async deletePost(userId: string, postId: number): Promise<void> {
    const [existing] = await db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId)));

    if (!existing) throw new Error("Post not found");
    if (existing.status === "publishing") {
      throw new Error("Cannot delete a post that is currently publishing");
    }

    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId));
  }

  async bulkSchedule(
    userId: string,
    items: Array<{ contentId: string; contentType: "project" | "asset" }>,
    platforms: string[],
    startDate: Date,
    intervalStrategy: "recommended" | "daily" | "custom",
    customIntervalHours?: number
  ): Promise<{ posts: Array<{ postId: number; scheduledFor: string }> }> {
    const results: Array<{ postId: number; scheduledFor: string }> = [];
    let currentTime = new Date(startDate);

    const maxIntervalHours = platforms.reduce((max, p) => {
      const interval = PLATFORM_INTERVALS[p] || 24;
      return Math.max(max, interval);
    }, 24);

    const intervalHours = intervalStrategy === "custom" && customIntervalHours
      ? customIntervalHours
      : intervalStrategy === "daily"
      ? 24
      : maxIntervalHours;

    for (const item of items) {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      let thumbnailUrl: string | undefined;
      let title: string | undefined;

      if (item.contentType === "project") {
        const [project] = await db
          .select()
          .from(universalVideoProjects)
          .where(and(eq(universalVideoProjects.projectId, item.contentId), eq(universalVideoProjects.ownerId, userId)));
        if (project) {
          const progress = (project.progress ?? {}) as ProjectProgress;
          mediaUrl = progress?.outputUrl || progress?.renderOutputUrl;
          mediaType = "video";
          thumbnailUrl = this.extractThumbnail(project);
          title = project.title || undefined;
        }
      } else {
        const assetId = parseInt(item.contentId, 10);
        if (!isNaN(assetId)) {
          const [asset] = await db
            .select()
            .from(mediaAssets)
            .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.uploadedBy, userId)));
          if (asset) {
            mediaUrl = asset.url;
            mediaType = asset.type;
            thumbnailUrl = asset.thumbnailUrl || undefined;
            title = asset.name;
          }
        }
      }

      if (!mediaUrl) continue;

      const defaultCaption = title || "Check out our latest content!";
      const captions: Record<string, string> = {};
      for (const p of platforms) captions[p] = defaultCaption;

      const result = await this.createScheduledPost(userId, {
        projectId: item.contentType === "project" ? item.contentId : undefined,
        assetId: item.contentType === "asset" ? parseInt(item.contentId, 10) : undefined,
        mediaUrl,
        mediaType,
        thumbnailUrl,
        captions,
        hashtags: {},
        platforms,
        scheduledFor: new Date(currentTime),
        title,
      });

      results.push({
        postId: result.postId,
        scheduledFor: currentTime.toISOString(),
      });

      currentTime = new Date(currentTime.getTime() + intervalHours * 60 * 60 * 1000);
    }

    return { posts: results };
  }

  async handleWebhook(body: Record<string, unknown>): Promise<void> {
    try {
      const postId = body.id as string | undefined;
      const status = body.status as string | undefined;

      if (!postId) return;

      const [post] = await db
        .select()
        .from(scheduledPosts)
        .where(eq(scheduledPosts.ayrsharePostId, postId));

      if (!post) {
        console.warn(`[SocialPublishing] Webhook: post ${postId} not found`);
        return;
      }

      const webhookUpdate: Partial<typeof scheduledPosts.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };

      if (status === "success" || status === "published") {
        webhookUpdate.status = "published";
        webhookUpdate.publishedAt = new Date();
      } else if (status === "error" || status === "failed") {
        webhookUpdate.status = "failed";
        webhookUpdate.failureReason = (body.error as string) || (body.message as string) || "Publishing failed";
      }

      if (body.postIds) {
        webhookUpdate.platformPostIds = body.postIds as Array<{ platform: string; postId: string; postUrl?: string }>;
      }

      await db
        .update(scheduledPosts)
        .set(webhookUpdate)
        .where(eq(scheduledPosts.id, post.id));

      console.log(`[SocialPublishing] Webhook updated post ${post.id} -> ${webhookUpdate.status || "updated"}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[SocialPublishing] Webhook error: ${msg}`);
    }
  }

  async generateCaptions(
    userId: string,
    projectId: string | undefined,
    assetId: number | undefined,
    platforms: string[],
    tone: string,
    topic: string | undefined
  ): Promise<{
    captions: Array<{
      platform: string;
      caption: string;
      hashtags: string[];
      characterCount: number;
      characterLimit: number;
    }>;
    byPlatform: Record<string, { caption: string; hashtags: string[]; characterCount: number; characterLimit: number }>;
  }> {
    const platformLimits: Record<string, number> = {
      twitter: 280,
      facebook: 63206,
      instagram: 2200,
      tiktok: 2200,
      linkedin: 3000,
      youtube: 5000,
      pinterest: 500,
      threads: 500,
    };

    let brandContext = "";
    let trendContext = "";
    let contentContext = "";
    let industry = "general";
    let contentNiche = topic || "general";

    try {
      const bible = await brandBibleService.getBrandBible();
      brandContext = `Brand: ${bible.brandName}. Industry: ${bible.industry || "general"}. Tagline: ${bible.tagline || "none"}. Tone: professional, trustworthy. Colors: ${bible.colors.primary}/${bible.colors.secondary}.`;
      industry = bible.industry || "general";
      contentNiche = topic || bible.industry || "general";
    } catch (e: any) {
      console.warn(`[SocialPublishing] Brand context unavailable: ${e.message}`);
    }

    if (projectId) {
      try {
        const [project] = await db
          .select()
          .from(universalVideoProjects)
          .where(and(eq(universalVideoProjects.projectId, projectId), eq(universalVideoProjects.ownerId, userId)));
        if (project) {
          contentContext = `Content: Video project "${project.title || "Untitled"}".`;
          if (project.concept) {
            const concept = project.concept as ProjectConcept;
            contentContext += ` Concept: ${concept.description || JSON.stringify(project.concept).substring(0, 200)}.`;
          }
          if (!topic) contentNiche = project.title || industry;
        }
      } catch (e: any) {
        console.warn(`[SocialPublishing] Project context unavailable: ${e.message}`);
      }
    } else if (assetId) {
      try {
        const [asset] = await db
          .select()
          .from(mediaAssets)
          .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.uploadedBy, userId)));
        if (asset) {
          contentContext = `Content: ${asset.type} asset "${asset.name}". Type: ${asset.mimeType || asset.type}.`;
          if (asset.description) contentContext += ` Description: ${asset.description}.`;
          if (!topic) contentNiche = asset.name || industry;
        }
      } catch (e: any) {
        console.warn(`[SocialPublishing] Asset context unavailable: ${e.message}`);
      }
    }

    try {
      const trends = await getTrendingHooks(industry, contentNiche, "general audience");
      if (trends.hooks?.length) {
        const topHooks = trends.hooks.slice(0, 3).map((h: { hook?: string }) => h.hook || String(h)).join("; ");
        trendContext = `Current trending hooks: ${topHooks}.`;
      }
      if (trends.hashtags?.length) {
        trendContext += ` Trending hashtags: ${trends.hashtags.slice(0, 5).join(", ")}.`;
      }
    } catch (e: any) {
      console.warn(`[SocialPublishing] Trend context unavailable: ${e.message}`);
    }

    const effectiveTopic = topic || contentNiche || "our latest content";

    const buildResponse = (captionsArr: Array<{ platform: string; caption: string; hashtags: string[]; characterCount: number; characterLimit: number }>) => {
      const byPlatform: Record<string, { caption: string; hashtags: string[]; characterCount: number; characterLimit: number }> = {};
      for (const c of captionsArr) {
        byPlatform[c.platform] = { caption: c.caption, hashtags: c.hashtags, characterCount: c.characterCount, characterLimit: c.characterLimit };
      }
      return { captions: captionsArr, byPlatform };
    };

    if (!llmClient.isAvailable()) {
      return buildResponse(platforms.map((p) => {
        const caption = `Check out our latest ${effectiveTopic}!`;
        return {
          platform: p,
          caption,
          hashtags: ["viral", "trending", effectiveTopic.replace(/\s+/g, "")],
          characterCount: caption.length,
          characterLimit: platformLimits[p] || 5000,
        };
      }));
    }

    const systemPrompt = `You are a social media expert. Generate engaging captions optimized for each platform. ${brandContext} Return ONLY valid JSON.`;
    const userPrompt = `Generate social media captions for: ${platforms.join(", ")}

Topic: ${effectiveTopic}
Tone: ${tone}
${contentContext ? `Content details: ${contentContext}` : ""}
${trendContext ? `Trending context: ${trendContext}` : ""}
${brandContext ? `Brand context: ${brandContext}` : ""}

Return JSON:
{
  "captions": [
    {
      "platform": "platform_name",
      "caption": "platform-optimized caption text",
      "hashtags": ["hashtag1", "hashtag2"]
    }
  ]
}

Platform character limits: ${platforms.map(p => `${p}: ${platformLimits[p] || 5000}`).join(", ")}

Rules:
- Twitter/X: max 280 chars, concise and punchy
- Instagram: story-driven, emoji-friendly, up to 10 hashtags
- TikTok: casual, trend-aware, 3-5 hashtags
- LinkedIn: professional, value-focused, 3-5 hashtags
- Facebook: conversational, question-based, 2-3 hashtags
- YouTube: SEO-optimized description, 5-10 hashtags
- Pinterest: descriptive, keyword-rich, 5 hashtags
- Threads: casual, conversational, 3 hashtags`;

    try {
      const result = await llmClient.createChatCompletion({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1500,
        temperature: 0.8,
      });

      const cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return buildResponse((parsed.captions || []).map((c: { platform: string; caption?: string; hashtags?: string[] }) => ({
        platform: c.platform,
        caption: c.caption || "",
        hashtags: c.hashtags || [],
        characterCount: (c.caption || "").length,
        characterLimit: platformLimits[c.platform] || 5000,
      })));
    } catch (error: any) {
      console.error(`[SocialPublishing] Caption generation failed: ${error.message}`);
      return buildResponse(platforms.map((p) => {
        const caption = `${effectiveTopic} - ${tone}`;
        return {
          platform: p,
          caption,
          hashtags: [effectiveTopic.replace(/\s+/g, "")],
          characterCount: caption.length,
          characterLimit: platformLimits[p] || 5000,
        };
      }));
    }
  }

  async getOptimalTimes(
    platforms: string[]
  ): Promise<Array<{
    platform: string;
    times: string[];
    timezone: string;
    recommendedFrequency: string;
  }>> {
    const baseOptimalTimes: Record<string, { times: string[]; frequency: string }> = {
      twitter: { times: ["9:00 AM", "12:00 PM", "5:00 PM"], frequency: "3-5 times per day" },
      facebook: { times: ["9:00 AM", "1:00 PM", "4:00 PM"], frequency: "1-2 times per day" },
      instagram: { times: ["11:00 AM", "2:00 PM", "7:00 PM"], frequency: "1-2 times per day" },
      tiktok: { times: ["7:00 AM", "12:00 PM", "7:00 PM"], frequency: "1-3 times per day" },
      linkedin: { times: ["8:00 AM", "12:00 PM", "5:00 PM"], frequency: "1 time per day" },
      youtube: { times: ["2:00 PM", "4:00 PM", "6:00 PM"], frequency: "2-3 times per week" },
      pinterest: { times: ["8:00 PM", "9:00 PM", "11:00 PM"], frequency: "3-5 times per day" },
      threads: { times: ["10:00 AM", "1:00 PM", "6:00 PM"], frequency: "1-2 times per day" },
    };

    if (llmClient.isAvailable()) {
      try {
        let brandIndustry = "general";
        let trendInsight = "";
        try {
          const bible = await brandBibleService.getBrandBible();
          brandIndustry = bible.industry || "general";
        } catch (e) {}

        try {
          const trends = await getTrendingHooks(brandIndustry, brandIndustry, "general audience");
          if (trends.hooks?.length) {
            trendInsight = `Current trending topics in ${brandIndustry}: ${trends.hooks.slice(0, 3).map((h: { hook?: string }) => h.hook || String(h)).join("; ")}. Consider timing posts to align with peak engagement for trending content.`;
          }
        } catch (e) {}

        const result = await llmClient.createChatCompletion({
          systemPrompt: "You are a social media timing expert. Return ONLY valid JSON.",
          messages: [{
            role: "user",
            content: `Recommend 3 best posting times this week for these platforms: ${platforms.join(", ")}. Industry: ${brandIndustry}.${trendInsight ? ` ${trendInsight}` : ""} Include recommended posting frequency per platform.

Return JSON:
{
  "platforms": [
    {
      "platform": "name",
      "times": ["HH:MM AM/PM", "HH:MM AM/PM", "HH:MM AM/PM"],
      "frequency": "X times per day/week"
    }
  ]
}`,
          }],
          maxTokens: 800,
          temperature: 0.5,
        });

        const cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.platforms?.length) {
          return parsed.platforms.map((p: { platform: string; times?: string[]; frequency?: string }) => ({
            platform: p.platform,
            times: p.times || baseOptimalTimes[p.platform]?.times || ["10:00 AM", "2:00 PM", "6:00 PM"],
            timezone: "America/New_York",
            recommendedFrequency: p.frequency || baseOptimalTimes[p.platform]?.frequency || "1 time per day",
          }));
        }
      } catch (error: any) {
        console.warn(`[SocialPublishing] AI optimal times failed: ${error.message}`);
      }
    }

    return platforms.map((p) => ({
      platform: p,
      times: baseOptimalTimes[p]?.times || ["10:00 AM", "2:00 PM", "6:00 PM"],
      timezone: "America/New_York",
      recommendedFrequency: baseOptimalTimes[p]?.frequency || "1 time per day",
    }));
  }

  private async getProfileKey(userId: string): Promise<string | null> {
    const [user] = await db
      .select({ ayrshareProfileKey: users.ayrshareProfileKey })
      .from(users)
      .where(eq(users.id, userId));
    return user?.ayrshareProfileKey || null;
  }

  private isPrimaryProfile(profileKey: string | null): boolean {
    return profileKey === "primary";
  }

  private async publishToAyrshare(
    userId: string,
    caption: string,
    platforms: string[],
    mediaUrls?: string[],
    scheduledDate?: Date
  ): Promise<AyrsharePostResponse> {
    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) throw new Error("No social profile configured");

    const postBody: Record<string, unknown> = { post: caption, platforms };
    if (mediaUrls?.length) postBody.mediaUrls = mediaUrls;
    if (scheduledDate) postBody.scheduleDate = scheduledDate.toISOString();

    const headers = this.isPrimaryProfile(profileKey)
      ? this.getHeaders()
      : this.getHeaders(profileKey);
    const response = await fetch(`${AYRSHARE_API_BASE}/post`, {
      method: "POST",
      headers,
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`Ayrshare post failed (${response.status})`);
    }

    return (await response.json()) as AyrsharePostResponse;
  }

  private extractThumbnail(project: { scenes?: unknown; assets?: unknown }): string | undefined {
    try {
      const scenes = project.scenes;
      if (Array.isArray(scenes)) {
        for (const scene of scenes as Array<{ thumbnailUrl?: string; imageUrl?: string }>) {
          if (scene.thumbnailUrl) return scene.thumbnailUrl;
          if (scene.imageUrl) return scene.imageUrl;
        }
      }
      const assets = (project.assets ?? {}) as ProjectAssets;
      if (assets.productMediaUrl) return assets.productMediaUrl;
    } catch (e) {}
    return undefined;
  }
}

export const socialPublishingService = new SocialPublishingService();
