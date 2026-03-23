import { llmClient } from "./piapi-llm-client";

export interface ChapterOutline {
  title: string;
  summary: string;
  recommendedSceneCount: number;
  estimatedDuration: number;
  visualStorytellingScore: number;
  keyTopics: string[];
}

export interface DocumentOutline {
  documentTitle: string;
  totalEstimatedDuration: number;
  chapters: ChapterOutline[];
}

export async function generateChapterOutline(
  text: string,
  targetDuration: number = 300
): Promise<DocumentOutline> {
  if (!llmClient.isAvailable()) {
    throw new Error("No LLM API configured");
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const truncatedText = wordCount > 8000
    ? text.split(/\s+/).slice(0, 8000).join(' ') + '\n\n[... content truncated for analysis ...]'
    : text;

  const systemPrompt = `You are a video content strategist specializing in long-form documentary and educational video production. You analyze written content and break it into optimal chapter structures for video production.

Your output must be valid JSON matching this exact structure:
{
  "documentTitle": "string - a compelling title for the video",
  "totalEstimatedDuration": number (seconds),
  "chapters": [
    {
      "title": "string - chapter title",
      "summary": "string - 1-2 sentence summary of this chapter's content",
      "recommendedSceneCount": number (2-6 scenes per chapter),
      "estimatedDuration": number (seconds, 45-90 per chapter),
      "visualStorytellingScore": number (1-10, how visually compelling this section is),
      "keyTopics": ["string array of key topics covered"]
    }
  ]
}`;

  const userPrompt = `Analyze this long-form content and break it into ${Math.min(8, Math.max(4, Math.round(targetDuration / 60)))} chapters optimized for a ${Math.round(targetDuration / 60)}-minute video.

Requirements:
- Each chapter should be 45-90 seconds when narrated
- Total duration should target ~${targetDuration} seconds
- Identify natural section breaks and thematic groupings
- Score each section's visual storytelling potential (1-10)
- Recommend 2-6 scenes per chapter based on content density
- Order chapters for maximum narrative engagement (hook the viewer early)

CONTENT TO ANALYZE (${wordCount} words):
"""
${truncatedText}
"""

Return ONLY valid JSON, no markdown fences.`;

  const result = await llmClient.createChatCompletion({
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 4000,
  });

  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse outline from LLM response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as DocumentOutline;

  if (!parsed.chapters || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    throw new Error("LLM returned empty chapter outline");
  }

  for (const ch of parsed.chapters) {
    ch.recommendedSceneCount = Math.max(2, Math.min(6, ch.recommendedSceneCount || 3));
    ch.estimatedDuration = Math.max(45, Math.min(90, ch.estimatedDuration || 60));
    ch.visualStorytellingScore = Math.max(1, Math.min(10, ch.visualStorytellingScore || 5));
    ch.keyTopics = ch.keyTopics || [];
  }

  parsed.totalEstimatedDuration = parsed.chapters.reduce((sum, ch) => sum + ch.estimatedDuration, 0);

  console.log(`[ChapterOutline] Generated ${parsed.chapters.length} chapters, total ${parsed.totalEstimatedDuration}s`);
  return parsed;
}
