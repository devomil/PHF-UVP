import Anthropic from "@anthropic-ai/sdk";
import type { Scene, TextLabel } from "../../shared/video-types";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function extractSceneTextLabels(
  scenes: Scene[],
  artPresetId?: string
): Promise<Scene[]> {
  if (!anthropic) {
    console.warn("[TextLabelExtractor] Anthropic not configured, skipping text label extraction");
    return scenes;
  }

  const sceneSummaries = scenes.map((scene, idx) => ({
    index: idx,
    id: scene.id,
    type: scene.type,
    narration: scene.narration || "",
    visualDirection: scene.visualDirection || "",
    duration: scene.duration || 5,
  }));

  const visualTreatmentHint = getVisualTreatmentHint(artPresetId);

  const prompt = `Analyze these video scenes and extract key terms/concepts that should appear as on-screen text labels. These labels highlight important words, statistics, product names, or key concepts mentioned in the narration — rendered as crisp overlays (not baked into AI images).

Scenes:
${JSON.stringify(sceneSummaries, null, 2)}

Art style context: ${visualTreatmentHint}

For each scene, identify 0-3 text labels. Not every scene needs labels — only extract when there's a clear keyword, statistic, product name, or concept worth highlighting visually.

Return a JSON array where each element corresponds to a scene (by index). Each element is an array of label objects:

[
  [
    {
      "text": "Label text (short, 1-4 words)",
      "position": "top-left|top-center|top-right|center-left|center|center-right|bottom-left|bottom-center|bottom-right",
      "visualTreatment": "badge|floating-tag|holographic-panel|handwritten|neon-glow|minimal|pill|underline",
      "startAt": 0.5,
      "duration": 3.0
    }
  ],
  []
]

Rules:
- Keep label text SHORT (1-4 words max)
- Use timing that fits within the scene duration
- Start labels 0.3-1.0 seconds into the scene
- Duration should be 2-4 seconds
- Position labels to avoid the lower-third (where captions appear)
- Choose visualTreatment appropriate to the art style
- Return empty array [] for scenes that don't need labels
- Return ONLY valid JSON, no markdown

Return the JSON array now:`;

  try {
    console.log(`[TextLabelExtractor] Extracting labels for ${scenes.length} scenes...`);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      console.warn("[TextLabelExtractor] Unexpected response type");
      return scenes;
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[TextLabelExtractor] No JSON array found in response");
      return scenes;
    }

    const parsed: Array<Array<{
      text: string;
      position: string;
      visualTreatment: string;
      startAt: number;
      duration: number;
    }>> = JSON.parse(jsonMatch[0]);

    let totalLabels = 0;

    for (let i = 0; i < scenes.length; i++) {
      const sceneLabels = parsed[i] || [];
      if (sceneLabels.length === 0) continue;

      const sceneDuration = scenes[i].duration || 5;

      scenes[i].textLabels = sceneLabels
        .filter((l) => l.text && l.text.trim().length > 0)
        .map((label, idx) => {
          const startAt = Math.max(0, Math.min(label.startAt || 0.5, sceneDuration - 1));
          const maxDuration = sceneDuration - startAt;
          const duration = Math.min(label.duration || 3, maxDuration);

          totalLabels++;
          return {
            id: `label-${scenes[i].id}-${idx}`,
            text: label.text.trim(),
            position: validatePosition(label.position),
            visualTreatment: validateTreatment(label.visualTreatment),
            timing: { startAt, duration },
          };
        });
    }

    console.log(`[TextLabelExtractor] Extracted ${totalLabels} labels across ${scenes.length} scenes`);
    return scenes;
  } catch (error: any) {
    console.error("[TextLabelExtractor] Extraction failed:", error.message);
    return scenes;
  }
}

function validatePosition(pos: string): TextLabel["position"] {
  const valid: TextLabel["position"][] = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return valid.includes(pos as any) ? (pos as TextLabel["position"]) : "top-center";
}

function validateTreatment(treatment: string): TextLabel["visualTreatment"] {
  const valid: TextLabel["visualTreatment"][] = [
    "badge", "floating-tag", "holographic-panel",
    "handwritten", "neon-glow", "minimal", "pill", "underline",
  ];
  return valid.includes(treatment as any) ? (treatment as TextLabel["visualTreatment"]) : "minimal";
}

function getVisualTreatmentHint(artPresetId?: string): string {
  switch (artPresetId) {
    case "3d-illustration":
      return "Use 'badge' or 'pill' treatments with vibrant colors for 3D illustration style";
    case "cinematic-realism":
      return "Use 'minimal' or 'underline' treatments for cinematic realism";
    case "2d-line-art":
      return "Use 'badge' or 'underline' treatments for clean line art style";
    case "collage":
      return "Use 'floating-tag' or 'badge' treatments for collage mixed-media style";
    case "claymation":
      return "Use 'handwritten' or 'badge' treatments for claymation style";
    case "neon-futuristic":
      return "Use 'holographic-panel' or 'neon-glow' treatments for cyberpunk/neon style";
    case "watercolor":
      return "Use 'handwritten' or 'floating-tag' treatments for watercolor style";
    case "minimalist-flat":
      return "Use 'pill' or 'minimal' treatments for minimalist flat design";
    default:
      return "Choose treatments that feel professional and readable";
  }
}
