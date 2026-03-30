import { db } from "../db";
import { users, scheduledPosts } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { llmClient } from "./piapi-llm-client";

const AYRSHARE_API_BASE = "https://api.ayrshare.com/api";
const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY || "";

const SUPPORTED_PLATFORMS = [
  "twitter",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "pinterest",
  "threads",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

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
}

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
      body: JSON.stringify({
        title: email,
        refId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
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
      console.log(
        `[SocialPublishing] Stored profile for user ${userId}`
      );
    } catch (dbError: any) {
      console.error(
        `[SocialPublishing] CRITICAL: DB write failed for user ${userId} profile. Error: ${dbError.message}. Recovery key: ${profileKey.substring(0, 4)}****`
      );
      throw new Error(
        "Profile created but failed to save. Please contact support."
      );
    }

    return { success: true };
  }

  async getConnectUrl(
    userId: string
  ): Promise<{ url: string }> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) {
      throw new Error("No social profile found. Please set up your profile first.");
    }

    const response = await fetch(
      `${AYRSHARE_API_BASE}/profiles/generateJWT`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          profileKey,
          domain: process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://neuralcut.ai",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate connect URL (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return { url: data.url || data.link };
  }

  async getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) {
      return [];
    }

    try {
      const response = await fetch(`${AYRSHARE_API_BASE}/profiles`, {
        method: "GET",
        headers: this.getHeaders(profileKey),
      });

      if (!response.ok) {
        console.warn(`[SocialPublishing] Failed to fetch accounts: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const accounts: ConnectedAccount[] = [];

      for (const platform of SUPPORTED_PLATFORMS) {
        const platformData = data.activeSocialAccounts?.find(
          (a: any) => a.toLowerCase() === platform
        );
        if (platformData) {
          accounts.push({
            platform,
            connected: true,
          });
        }
      }

      return accounts;
    } catch (error: any) {
      console.error(`[SocialPublishing] Error fetching accounts: ${error.message}`);
      return [];
    }
  }

  async createPost(
    userId: string,
    post: {
      caption: string;
      platforms: string[];
      mediaUrls?: string[];
      scheduledFor?: Date;
      title?: string;
      hashtags?: string[];
      projectId?: string;
    }
  ): Promise<{ postId: number; ayrsharePostId?: string }> {
    const fullCaption = post.hashtags?.length
      ? `${post.caption}\n\n${post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`
      : post.caption;

    const wantsSchedule = !!post.scheduledFor;
    const canScheduleExternally = wantsSchedule && this.isConfigured();

    const [dbPost] = await db
      .insert(scheduledPosts)
      .values({
        userId,
        projectId: post.projectId || null,
        title: post.title || null,
        caption: fullCaption,
        hashtags: post.hashtags || [],
        mediaUrls: post.mediaUrls || [],
        platforms: post.platforms,
        status: "draft",
        scheduledFor: post.scheduledFor || null,
      })
      .returning();

    if (canScheduleExternally) {
      try {
        const ayrshareResult = await this.publishToAyrshare(
          userId,
          fullCaption,
          post.platforms,
          post.mediaUrls,
          post.scheduledFor
        );

        await db
          .update(scheduledPosts)
          .set({
            status: "scheduled",
            ayrsharePostId: ayrshareResult.id,
            ayrshareResponse: ayrshareResult as any,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, dbPost.id));

        return { postId: dbPost.id, ayrsharePostId: ayrshareResult.id };
      } catch (error: any) {
        await db
          .update(scheduledPosts)
          .set({
            status: "failed",
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, dbPost.id));
        throw error;
      }
    }

    return { postId: dbPost.id };
  }

  async publishNow(
    userId: string,
    postId: number
  ): Promise<{ ayrsharePostId: string }> {
    if (!this.isConfigured()) {
      throw new Error("Ayrshare API key not configured");
    }

    const [post] = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId))
      );

    if (!post) {
      throw new Error("Post not found");
    }

    await db
      .update(scheduledPosts)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    try {
      const result = await this.publishToAyrshare(
        userId,
        post.caption || "",
        post.platforms,
        post.mediaUrls || []
      );

      await db
        .update(scheduledPosts)
        .set({
          status: "published",
          publishedAt: new Date(),
          ayrsharePostId: result.id,
          ayrshareResponse: result as any,
          platformResults: result.postIds as any,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));

      return { ayrsharePostId: result.id };
    } catch (error: any) {
      await db
        .update(scheduledPosts)
        .set({
          status: "failed",
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));
      throw error;
    }
  }

  async getUserPosts(
    userId: string,
    status?: string
  ): Promise<any[]> {
    let query = db
      .select()
      .from(scheduledPosts)
      .where(
        status
          ? and(
              eq(scheduledPosts.userId, userId),
              eq(scheduledPosts.status, status)
            )
          : eq(scheduledPosts.userId, userId)
      )
      .orderBy(desc(scheduledPosts.createdAt));

    return await query;
  }

  async updatePost(
    userId: string,
    postId: number,
    updates: {
      caption?: string;
      hashtags?: string[];
      platforms?: string[];
      scheduledFor?: Date | null;
      title?: string;
      mediaUrls?: string[];
    }
  ): Promise<any> {
    const [existing] = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId))
      );

    if (!existing) {
      throw new Error("Post not found");
    }

    if (existing.status === "published" || existing.status === "publishing") {
      throw new Error("Cannot edit a published or publishing post");
    }

    const setValues: any = { updatedAt: new Date() };
    if (updates.caption !== undefined) setValues.caption = updates.caption;
    if (updates.hashtags !== undefined) setValues.hashtags = updates.hashtags;
    if (updates.platforms !== undefined) setValues.platforms = updates.platforms;
    if (updates.scheduledFor !== undefined)
      setValues.scheduledFor = updates.scheduledFor;
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.mediaUrls !== undefined) setValues.mediaUrls = updates.mediaUrls;

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
      .where(
        and(eq(scheduledPosts.id, postId), eq(scheduledPosts.userId, userId))
      );

    if (!existing) {
      throw new Error("Post not found");
    }

    if (existing.status === "publishing") {
      throw new Error("Cannot delete a post that is currently publishing");
    }

    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId));
  }

  async generateCaptions(
    projectId: string | undefined,
    platforms: string[],
    tone: string,
    topic: string
  ): Promise<{ captions: Array<{ platform: string; caption: string; hashtags: string[] }> }> {
    if (!llmClient.isAvailable()) {
      return {
        captions: platforms.map((p) => ({
          platform: p,
          caption: `Check out our latest ${topic}! ${tone === "professional" ? "Learn more at the link in bio." : "You won't believe this!"}`,
          hashtags: ["#viral", "#trending", `#${topic.replace(/\s+/g, "")}`],
        })),
      };
    }

    const systemPrompt = `You are a social media expert. Generate engaging captions optimized for each platform. Return ONLY valid JSON.`;
    const userPrompt = `Generate social media captions for these platforms: ${platforms.join(", ")}

Topic: ${topic}
Tone: ${tone}

Return JSON:
{
  "captions": [
    {
      "platform": "platform_name",
      "caption": "platform-optimized caption text",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
    }
  ]
}

Rules:
- Twitter/X: max 280 characters, concise and punchy
- Instagram: longer, story-driven, emoji-friendly, up to 10 hashtags
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

      const cleaned = result.text
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      return { captions: parsed.captions || [] };
    } catch (error: any) {
      console.error(`[SocialPublishing] Caption generation failed: ${error.message}`);
      return {
        captions: platforms.map((p) => ({
          platform: p,
          caption: `${topic} - ${tone}`,
          hashtags: [`#${topic.replace(/\s+/g, "")}`],
        })),
      };
    }
  }

  async getOptimalTimes(
    platforms: string[]
  ): Promise<Array<{ platform: string; times: string[]; timezone: string }>> {
    const optimalTimes: Record<string, string[]> = {
      twitter: ["9:00 AM", "12:00 PM", "5:00 PM"],
      facebook: ["9:00 AM", "1:00 PM", "4:00 PM"],
      instagram: ["11:00 AM", "2:00 PM", "7:00 PM"],
      tiktok: ["7:00 AM", "12:00 PM", "7:00 PM"],
      linkedin: ["8:00 AM", "12:00 PM", "5:00 PM"],
      youtube: ["2:00 PM", "4:00 PM", "6:00 PM"],
      pinterest: ["8:00 PM", "9:00 PM", "11:00 PM"],
      threads: ["10:00 AM", "1:00 PM", "6:00 PM"],
    };

    return platforms.map((p) => ({
      platform: p,
      times: optimalTimes[p] || ["10:00 AM", "2:00 PM", "6:00 PM"],
      timezone: "America/New_York",
    }));
  }

  private async getProfileKey(userId: string): Promise<string | null> {
    const [user] = await db
      .select({ ayrshareProfileKey: users.ayrshareProfileKey })
      .from(users)
      .where(eq(users.id, userId));
    return user?.ayrshareProfileKey || null;
  }

  private async publishToAyrshare(
    userId: string,
    caption: string,
    platforms: string[],
    mediaUrls?: string[],
    scheduledDate?: Date
  ): Promise<AyrsharePostResponse> {
    const profileKey = await this.getProfileKey(userId);
    if (!profileKey) {
      throw new Error("No social profile configured");
    }

    const body: any = {
      post: caption,
      platforms,
    };

    if (mediaUrls?.length) {
      body.mediaUrls = mediaUrls;
    }

    if (scheduledDate) {
      body.scheduleDate = scheduledDate.toISOString();
    }

    const response = await fetch(`${AYRSHARE_API_BASE}/post`, {
      method: "POST",
      headers: this.getHeaders(profileKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`Ayrshare post failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as AyrsharePostResponse;
  }
}

export const socialPublishingService = new SocialPublishingService();
