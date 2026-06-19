export interface SuzzieSceneEditorParseResult {
  suggestedPrompt?: string;
  suggestedProvider?: string;
  suggestedProviderRationale?: string;
  suggestedArtStyle?: { id: string; name: string };
  cleanMessage: string;
}

export interface SuzzieAssetLibraryParseResult {
  suggestedPrompt?: string;
  suggestedProvider?: string;
  suggestedProviderRationale?: string;
  suggestedNegativePrompt?: string;
  suggestedCfgScale?: number;
  cleanMessage: string;
}

function extractJsonBlocks(text: string): Record<string, unknown>[] {
  const blocks = text.match(/```json\s*([\s\S]*?)```/g) || [];
  const parsed: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      const jsonStr = block.replace(/```json\s*/, '').replace(/```$/, '').trim();
      parsed.push(JSON.parse(jsonStr));
    } catch {
    }
  }
  return parsed;
}

export function parseSuzzieSceneEditorResponse(text: string): SuzzieSceneEditorParseResult {
  let suggestedPrompt: string | undefined;
  let suggestedProvider: string | undefined;
  let suggestedProviderRationale: string | undefined;
  let suggestedArtStyle: { id: string; name: string } | undefined;

  for (const parsed of extractJsonBlocks(text)) {
    if (parsed.suggestedPrompt && !suggestedPrompt) suggestedPrompt = String(parsed.suggestedPrompt);
    if (parsed.suggestedProvider && !suggestedProvider) suggestedProvider = String(parsed.suggestedProvider);
    if (parsed.suggestedProviderRationale && !suggestedProviderRationale) suggestedProviderRationale = String(parsed.suggestedProviderRationale);
    if (parsed.suggestedArtStyle && !suggestedArtStyle) {
      const style = parsed.suggestedArtStyle as Record<string, unknown>;
      if (style.id && style.name) {
        suggestedArtStyle = { id: String(style.id), name: String(style.name) };
      }
    }
  }

  const cleanMessage = text.replace(/```json\s*[\s\S]*?```/g, '').trim();

  return { suggestedPrompt, suggestedProvider, suggestedProviderRationale, suggestedArtStyle, cleanMessage };
}

export function parseSuzzieAssetLibraryResponse(text: string): SuzzieAssetLibraryParseResult {
  let suggestedPrompt: string | undefined;
  let suggestedProvider: string | undefined;
  let suggestedProviderRationale: string | undefined;
  let suggestedNegativePrompt: string | undefined;
  let suggestedCfgScale: number | undefined;

  for (const parsed of extractJsonBlocks(text)) {
    if (parsed.suggestedPrompt && !suggestedPrompt) suggestedPrompt = String(parsed.suggestedPrompt);
    if (parsed.suggestedProvider && !suggestedProvider) suggestedProvider = String(parsed.suggestedProvider);
    if (parsed.suggestedProviderRationale && !suggestedProviderRationale) suggestedProviderRationale = String(parsed.suggestedProviderRationale);
    if (parsed.suggestedNegativePrompt && !suggestedNegativePrompt) suggestedNegativePrompt = String(parsed.suggestedNegativePrompt);
    if (parsed.suggestedCfgScale !== undefined && suggestedCfgScale === undefined) {
      const val = parseFloat(String(parsed.suggestedCfgScale));
      if (!isNaN(val) && val >= 0 && val <= 1) suggestedCfgScale = val;
    }
  }

  const cleanMessage = text.replace(/```json\s*[\s\S]*?```/g, '').trim();

  return { suggestedPrompt, suggestedProvider, suggestedProviderRationale, suggestedNegativePrompt, suggestedCfgScale, cleanMessage };
}
