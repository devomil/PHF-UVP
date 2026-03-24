import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { trendCache } from "../../shared/schema";
import { eq, and, gt } from "drizzle-orm";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const INDUSTRY_YOUTUBE_CATEGORY: Record<string, string> = {
  "Health & Wellness": "26",
  "Fitness": "17",
  "Food & Beverage": "26",
  "Education": "27",
  "Beauty": "26",
  "E-commerce": "22",
  "Home & Garden": "26",
  "Professional Services": "22",
};

export interface TrendHook {
  template: string;
  psychologicalDriver: string;
  example: string;
}

export interface TrendFormat {
  name: string;
  description: string;
  why: string;
}

export interface TrendResult {
  hooks: TrendHook[];
  keywords: string[];
  formats: TrendFormat[];
  insight: string;
  cachedAt?: string;
  expiresAt?: string;
}

async function checkCache(industry: string, contentNiche: string, targetAudience: string): Promise<TrendResult | null> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(trendCache)
      .where(
        and(
          eq(trendCache.industry, industry),
          eq(trendCache.contentNiche, contentNiche || ""),
          eq(trendCache.targetAudience, targetAudience || ""),
          gt(trendCache.expiresAt, now)
        )
      )
      .limit(1);

    if (rows.length > 0) {
      const row = rows[0];
      console.log(`[TrendIntelligence] Cache hit for ${industry}/${contentNiche}`);
      return {
        ...(row.result as TrendResult),
        cachedAt: row.createdAt?.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    }
  } catch (err: any) {
    console.error(`[TrendIntelligence] Cache check error:`, err.message);
  }
  return null;
}

async function fetchGoogleTrends(contentNiche: string): Promise<string[]> {
  try {
    const googleTrends = await import("google-trends-api");
    const keywords = contentNiche
      .split(/[,;&]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (keywords.length === 0) return [];

    const risingKeywords: string[] = [];

    for (const keyword of keywords) {
      try {
        const relatedResult = await googleTrends.default.relatedQueries({
          keyword,
          geo: "US",
        });
        const parsed = JSON.parse(relatedResult);
        const rising = parsed?.default?.rankedList?.[1]?.rankedKeyword || [];
        for (const item of rising.slice(0, 3)) {
          if (item.query) risingKeywords.push(item.query);
        }
      } catch (innerErr: any) {
        console.warn(`[TrendIntelligence] Google Trends query failed for "${keyword}":`, innerErr.message?.substring(0, 100));
      }
    }

    const unique = [...new Set(risingKeywords)].slice(0, 5);
    console.log(`[TrendIntelligence] Google Trends rising keywords: ${unique.join(", ") || "none"}`);
    return unique;
  } catch (err: any) {
    console.warn(`[TrendIntelligence] Google Trends unavailable:`, err.message?.substring(0, 100));
    return [];
  }
}

interface YouTubeVideo {
  title: string;
  description: string;
  viewCount: string;
  likeCount: string;
}

async function fetchYouTubeTrending(industry: string): Promise<YouTubeVideo[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn("[TrendIntelligence] YOUTUBE_API_KEY not configured");
    return [];
  }

  const categoryId = INDUSTRY_YOUTUBE_CATEGORY[industry] || "26";

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=${categoryId}&maxResults=20&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      console.warn(`[TrendIntelligence] YouTube API error ${res.status}: ${errorText.substring(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const videos: YouTubeVideo[] = (data.items || []).map((item: any) => ({
      title: item.snippet?.title || "",
      description: (item.snippet?.description || "").substring(0, 200),
      viewCount: item.statistics?.viewCount || "0",
      likeCount: item.statistics?.likeCount || "0",
    }));

    console.log(`[TrendIntelligence] YouTube trending: ${videos.length} videos in category ${categoryId}`);
    return videos;
  } catch (err: any) {
    console.warn(`[TrendIntelligence] YouTube fetch failed:`, err.message?.substring(0, 100));
    return [];
  }
}

async function analyzeWithClaude(
  industry: string,
  contentNiche: string,
  targetAudience: string,
  risingKeywords: string[],
  youtubeVideos: YouTubeVideo[]
): Promise<TrendResult> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const youtubeTitles = youtubeVideos
    .slice(0, 15)
    .map((v) => `- "${v.title}" (${Number(v.viewCount).toLocaleString()} views)`)
    .join("\n");

  const keywordsStr = risingKeywords.length > 0
    ? risingKeywords.join(", ")
    : "No trending search data available — use your web search to find current trends";

  const userPrompt = `Industry: ${industry}
Content Niche: ${contentNiche}
Target Audience: ${targetAudience}

Trending Google searches this week: ${keywordsStr}

Top performing YouTube titles in this category:
${youtubeTitles || "No YouTube data available"}

Use your web search tool to find 2-3 trending discussions about "${contentNiche}" on Reddit or health/wellness forums right now. Look for recurring pain points and questions.

Based on all of this data, return a JSON object:
{
  "hooks": [
    {
      "template": "hook text here",
      "psychologicalDriver": "why this works",
      "example": "applied to ${contentNiche}"
    }
  ],
  "keywords": ["keyword1", "keyword2"],
  "formats": [
    {
      "name": "format name",
      "description": "what it looks like",
      "why": "why it's working right now"
    }
  ],
  "insight": "one paragraph summary of what's trending and why"
}

Return 5 hooks, 10 keywords, 3 formats.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool],
      system: `You are a viral content strategist specializing in short-form marketing video for small businesses and social media creators. Return ONLY valid JSON. No markdown, no explanation outside the JSON.`,
      messages: [{ role: "user", content: userPrompt }],
    });

    let resultText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        resultText += block.text;
      }
    }

    resultText = resultText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const parsed = JSON.parse(resultText);

    const result: TrendResult = {
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [],
      formats: Array.isArray(parsed.formats) ? parsed.formats.slice(0, 3) : [],
      insight: parsed.insight || "",
    };

    console.log(`[TrendIntelligence] Claude analysis complete: ${result.hooks.length} hooks, ${result.keywords.length} keywords`);
    return result;
  } catch (err: any) {
    console.error(`[TrendIntelligence] Claude analysis failed:`, err.message);
    const nicheWords = contentNiche.split(/[,\s]+/).filter(Boolean);
    const fallbackKeywords = [...nicheWords, industry, "trending", "viral", "tips", "secrets", "guide", "how to", "best", "top"].slice(0, 10);
    return {
      hooks: [
        { template: `What nobody tells you about ${contentNiche}`, psychologicalDriver: "Curiosity gap", example: `A ${contentNiche} deep-dive revealing hidden truths` },
        { template: `Stop making this ${contentNiche} mistake`, psychologicalDriver: "Loss aversion", example: `Common ${contentNiche} error that's costing you results` },
        { template: `I tested every ${contentNiche} method — here's what actually works`, psychologicalDriver: "Authority + specificity", example: `Comprehensive ${contentNiche} comparison with real data` },
        { template: `The ${contentNiche} hack that changed everything for me`, psychologicalDriver: "Personal transformation", example: `Before/after story with ${contentNiche} results` },
        { template: `Why ${targetAudience || "most people"} get ${contentNiche} completely wrong`, psychologicalDriver: "Pattern interrupt", example: `Contrarian take on mainstream ${contentNiche} advice` },
      ],
      keywords: fallbackKeywords,
      formats: [
        { name: "Problem-Solution", description: "Open with a relatable pain point, then reveal the solution", why: "Timeless format that drives engagement across all platforms" },
        { name: "Before-After-Bridge", description: "Show the before state, the desired after, and the bridge to get there", why: "Visual transformation content consistently outperforms other formats" },
        { name: "Myth-Busting", description: "Challenge a common belief, then reveal the surprising truth", why: "Controversy and pattern interrupts drive shares and comments" },
      ],
      insight: `Trending content in ${industry} is currently driven by authenticity and personal experience sharing. Focus on relatable storytelling and real results.`,
    };
  }
}

async function saveToCache(industry: string, contentNiche: string, targetAudience: string, result: TrendResult): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(trendCache).values({
      industry,
      contentNiche: contentNiche || "",
      targetAudience: targetAudience || "",
      result: JSON.parse(JSON.stringify(result)),
      expiresAt,
    });
    console.log(`[TrendIntelligence] Cached result for ${industry}/${contentNiche}, expires ${expiresAt.toISOString()}`);
  } catch (err: any) {
    console.error(`[TrendIntelligence] Cache save error:`, err.message);
  }
}

export async function getTrendingHooks(
  industry: string,
  contentNiche: string,
  targetAudience: string
): Promise<TrendResult> {
  const cached = await checkCache(industry, contentNiche, targetAudience);
  if (cached) return cached;

  console.log(`[TrendIntelligence] Generating fresh trends for ${industry}/${contentNiche}`);

  const [risingKeywords, youtubeVideos] = await Promise.all([
    fetchGoogleTrends(contentNiche),
    fetchYouTubeTrending(industry),
  ]);

  const result = await analyzeWithClaude(industry, contentNiche, targetAudience, risingKeywords, youtubeVideos);

  await saveToCache(industry, contentNiche, targetAudience, result);

  const now = new Date();
  result.cachedAt = now.toISOString();
  result.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return result;
}

export async function clearCacheForIndustry(industry: string, contentNiche: string, targetAudience: string): Promise<void> {
  try {
    await db
      .delete(trendCache)
      .where(
        and(
          eq(trendCache.industry, industry),
          eq(trendCache.contentNiche, contentNiche || ""),
          eq(trendCache.targetAudience, targetAudience || "")
        )
      );
    console.log(`[TrendIntelligence] Cleared cache for ${industry}/${contentNiche}`);
  } catch (err: any) {
    console.error(`[TrendIntelligence] Cache clear error:`, err.message);
  }
}
