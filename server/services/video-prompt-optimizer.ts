import { isStylizedPreset as isStylizedPresetFn } from '../../shared/config/visual-art-presets';

interface OptimizePromptInput {
  visualDescription: string;
  sceneType: string;
  includeProduct: boolean;
  productName?: string;
  visualStyle?: string;
  generationMode: string;
  provider: string;
  artPresetId?: string;
}

interface OptimizedPrompt {
  prompt: string;
  negativePrompt: string;
}

interface PromptAnalysis {
  score: number;
  issues: string[];
}

function splitByOrAlternatives(prompt: string): string[] {
  const orPatterns = [
    /,\s*or\s+/gi,
    /\.\s*[Oo]r\s+/g,
    /,\s*or\s*,/gi,
  ];

  let segments = [prompt];
  for (const pattern of orPatterns) {
    const newSegments: string[] = [];
    for (const seg of segments) {
      const parts = seg.split(pattern).map(s => s.trim()).filter(s => s.length > 5);
      newSegments.push(...parts);
    }
    segments = newSegments;
  }

  const MIN_WORDS_FOR_VALID_SEGMENT = 15;
  const allLongEnough = segments.every(s => s.split(/\s+/).length >= MIN_WORDS_FOR_VALID_SEGMENT);
  if (!allLongEnough) {
    return [prompt];
  }

  return segments;
}

function scoreSegmentConcreteness(segment: string): number {
  let score = 0;

  const concreteNouns = /\b(table|desk|counter|shelf|bottle|glass|cup|plate|bowl|phone|screen|laptop|window|door|chair|bed|couch|scale|mirror|wall|floor|path|garden|tree|plant|flower|water|light|sun|sky|cloud|hand|feet|face|eye|food|meal|salad|fruit|vegetable|pill|supplement|kitchen|bathroom|bedroom|gym|park|office|porch|stairway|hallway|cabinet|drawer|fridge|refrigerator|oven|stove|sink|faucet)\b/gi;
  const matches = segment.match(concreteNouns);
  score += (matches?.length || 0) * 10;

  const abstractWords = /\b(progression|transition|journey|concept|metaphor|transformation|reality|misconception|deeper|overload|healing|needs|approach|philosophy|struggle|balance|harmony|wellness|holistic)\b/gi;
  const abstractMatches = segment.match(abstractWords);
  score -= (abstractMatches?.length || 0) * 8;

  const actionVerbs = /\b(sitting|standing|walking|reaching|pouring|holding|placing|opening|closing|stepping|looking|cooking|eating|drinking|running|stretching|writing|reading|typing|stirring)\b/gi;
  const actionMatches = segment.match(actionVerbs);
  score += (actionMatches?.length || 0) * 7;

  const wordCount = segment.split(/\s+/).length;
  if (wordCount >= 5 && wordCount <= 25) score += 5;
  if (wordCount > 40) score -= 10;

  if (segment.match(/^[A-Z]/)) score += 2;

  return score;
}

function pickBestSegment(segments: string[]): string {
  if (segments.length <= 1) return segments[0] || '';

  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < segments.length; i++) {
    const score = scoreSegmentConcreteness(segments[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return segments[bestIdx];
}

const ART_PRESET_STYLE_TOKENS = [
  'pixar-style 3d animated', '3d rendered illustration', '3d render', 'pixar style', 'isometric perspective',
  'disney/pixar 3d cgi', 'disney/pixar',
  'claymation stop-motion', 'clay figure', 'miniature set', 'plasticine',
  'watercolor painting style', 'watercolor', 'brush strokes',
  'clean vector illustration', 'line art style', 'vector illustration',
  'mixed media collage', 'collage style', 'paper cutouts',
  'futuristic cyberpunk', 'neon-lit', 'holographic', 'cyberpunk',
  'photorealistic cinematic', 'film-grade', 'cinematic shot',
  'minimalist flat design', 'flat design', 'geometric shapes',
  'octane render', 'ambient occlusion', 'global illumination',
  'soft global illumination', 'diorama', 'handcrafted',
  'vibrant saturated colors', 'soft shadows', 'clay-like textures',
  'anamorphic lens', 'shallow depth of field',
  'delicate color washes', 'paint bleeding',
  'crisp outlines', 'flat color fills',
  'torn paper edges', 'scrapbook aesthetic',
  'glowing neon accents', 'volumetric fog',
  'ample white space', 'sans-serif typography feel',
];

function cleanPromptText(prompt: string, isStylized: boolean = false): string {
  let cleaned = prompt;

  cleaned = cleaned.replace(/^["'\s]+|["'\s]+$/g, '');

  const preservedTokens: { placeholder: string; original: string }[] = [];
  for (const token of ART_PRESET_STYLE_TOKENS) {
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const match = cleaned.match(regex);
    if (match) {
      const placeholder = `__ART_TOKEN_${preservedTokens.length}__`;
      preservedTokens.push({ placeholder, original: match[0] });
      cleaned = cleaned.replace(regex, placeholder);
    }
  }

  if (!isStylized) {
    cleaned = cleaned.replace(/\b(cinematic|dramatic|epic|sweeping|ethereal|moody|atmospheric)\s+(shot|angle|lighting|camera|pan|zoom|dolly|tracking)\b/gi, '');
    cleaned = cleaned.replace(/\b(close-up shot|wide shot|medium shot|establishing shot|aerial shot|bird's eye view|low angle|high angle|dutch angle)\b/gi, '');
    cleaned = cleaned.replace(/\b(soft morning light|golden hour|natural lighting|rim lighting|backlit|silhouetted|lens flare|bokeh|shallow depth of field)\b/gi, '');
    cleaned = cleaned.replace(/\b(camera slowly|camera pans|camera tilts|camera tracks|camera dollies|camera zooms|camera pulls back|camera pushes in)\b/gi, '');
  }

  for (const { placeholder, original } of preservedTokens) {
    cleaned = cleaned.replace(placeholder, original);
  }

  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  if (cleaned.endsWith(',')) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  return cleaned;
}

function enforcePromptLength(prompt: string, maxWords: number = 30): string {
  // Test-only bypass: set BYPASS_PROMPT_CAP=1 to skip truncation (used by three-way-C comparison)
  if (process.env.BYPASS_PROMPT_CAP === '1') return prompt;
  const hasArtPresetTokens = ART_PRESET_STYLE_TOKENS.some(token => 
    prompt.toLowerCase().includes(token.toLowerCase())
  );
  const effectiveMax = hasArtPresetTokens ? maxWords + 15 : maxWords;

  const words = prompt.split(/\s+/).filter(Boolean);
  if (words.length <= effectiveMax) return prompt;

  // Accumulate whole sentences up to the cap (soft — a sentence may overshoot
  // the cap rather than be fragmented). A 40-word whole sentence is better than
  // a 30-word fragment with a fabricated terminal period.
  const sentences = prompt.match(/[^.!?]+[.!?]+\s*/g) || [];
  let kept = '', keptWords = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).filter(Boolean).length;
    if (keptWords + w > effectiveMax && kept) break;
    kept += s; keptWords += w;
    if (keptWords >= effectiveMax) break;
  }
  if (kept.trim()) {
    console.warn(
      `[PromptOptimizer] TRUNCATED ${words.length} → ${keptWords} words (cap ${effectiveMax}). DROPPED: "${prompt.slice(kept.length).trim()}"`,
    );
    return kept.trim();
  }
  // No sentence boundary found — fall back to word-slice without fabricated period.
  console.warn(
    `[PromptOptimizer] TRUNCATED (no sentence boundary) ${words.length} → ${effectiveMax} words.`,
  );
  return words.slice(0, effectiveMax).join(' ');
}

function extractCharacterBlocks(prompt: string): { cleaned: string; blocks: string[]; totalWords: number } {
  const charPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\((?:late-\d+s\s+\w+|[^)]*(?:hair|eyes?|skin|build|wearing)[^)]*)[^)]{15,}\)/g;
  const blocks: string[] = [];
  let totalWords = 0;
  
  const cleaned = prompt.replace(charPattern, (match) => {
    const placeholder = `__CHAR_BLOCK_${blocks.length}__`;
    blocks.push(match);
    totalWords += match.split(/\s+/).length;
    return placeholder;
  });
  
  return { cleaned, blocks, totalWords };
}

interface StyleSuffixExtraction {
  cleaned: string;
  suffix: string;
  suffixWords: number;
}

function extractStyleSuffix(prompt: string, isStylized: boolean): StyleSuffixExtraction {
  if (!isStylized) return { cleaned: prompt, suffix: '', suffixWords: 0 };

  const suffixPattern = /Disney\/Pixar\s+3D\s+CGI\s+animation\s+quality[^.]*\.\s*No\s+text[^.]*\.\s*Clean\s+background[^.]*\.\s*Smooth\s+natural\s+movement[^.]*/i;
  const match = prompt.match(suffixPattern);
  if (match) {
    const suffix = match[0].trim();
    const suffixWords = suffix.split(/\s+/).length;
    const cleaned = prompt.replace(suffixPattern, '__STYLE_SUFFIX__').replace(/\s{2,}/g, ' ').trim();
    return { cleaned, suffix, suffixWords };
  }

  const maintainPattern = /Maintain\s+exact\s+character\s+appearance\s+as\s+described[^.]*/i;
  const maintainMatch = prompt.match(maintainPattern);
  if (maintainMatch) {
    const suffix = maintainMatch[0].trim();
    const suffixWords = suffix.split(/\s+/).length;
    const cleaned = prompt.replace(maintainPattern, '__STYLE_SUFFIX__').replace(/\s{2,}/g, ' ').trim();
    return { cleaned, suffix, suffixWords };
  }

  return { cleaned: prompt, suffix: '', suffixWords: 0 };
}

export function optimizePrompt(input: OptimizePromptInput): OptimizedPrompt {
  let prompt = input.visualDescription;
  const isStylized = isStylizedPresetFn(input.artPresetId);

  const inputWordCount = prompt.split(/\s+/).length;
  const inputCharCount = prompt.length;
  console.log(`[PromptOptimizer] Input: ${inputWordCount} words, ${inputCharCount} chars (stylized=${isStylized}, provider=${input.provider})`);

  if (!isStylized) {
    const segments = splitByOrAlternatives(prompt);
    if (segments.length > 1) {
      const best = pickBestSegment(segments);
      console.log(`[PromptOptimizer] Detected ${segments.length} alternatives joined by "or" — selected most concrete: "${best.substring(0, 60)}..."`);
      prompt = best;
    }
  }

  prompt = cleanPromptText(prompt, isStylized);

  const { cleaned: styleCleaned, suffix: styleSuffix, suffixWords: styleSuffixWords } = extractStyleSuffix(prompt, isStylized);
  if (styleSuffix) {
    prompt = styleCleaned;
    console.log(`[PromptOptimizer] Protected style suffix (${styleSuffixWords} words): "${styleSuffix.substring(0, 60)}..."`);
  }

  const { cleaned, blocks, totalWords: charWords } = extractCharacterBlocks(prompt);

  if (blocks.length > 0) {
    const TOTAL_BUDGET = isStylized ? 200 : 60;
    const MAX_CHAR_WORDS = 80;
    const effectiveCharWords = Math.min(charWords, MAX_CHAR_WORDS);

    let styleTokenWords = styleSuffixWords;
    for (const token of ART_PRESET_STYLE_TOKENS) {
      if (cleaned.toLowerCase().includes(token.toLowerCase())) {
        styleTokenWords += token.split(/\s+/).length;
      }
    }

    const protectedWords = effectiveCharWords + styleTokenWords;
    const sceneWordBudget = Math.max(isStylized ? 80 : 15, TOTAL_BUDGET - protectedWords);

    const sceneSegments = cleaned.split(/__CHAR_BLOCK_\d+__|__STYLE_SUFFIX__/);
    const placeholderOrder: Array<{ type: 'char' | 'style'; index: number }> = [];
    const allPlaceholders = [...cleaned.matchAll(/__CHAR_BLOCK_(\d+)__|__STYLE_SUFFIX__/g)];
    for (const m of allPlaceholders) {
      if (m[0] === '__STYLE_SUFFIX__') {
        placeholderOrder.push({ type: 'style', index: -1 });
      } else {
        placeholderOrder.push({ type: 'char', index: parseInt(m[1]) });
      }
    }

    const totalSceneWords = sceneSegments.reduce((sum, seg) => sum + seg.trim().split(/\s+/).filter(Boolean).length, 0);
    const ratio = totalSceneWords > sceneWordBudget ? sceneWordBudget / totalSceneWords : 1;

    const trimmedSegments = sceneSegments.map(seg => {
      const words = seg.trim().split(/\s+/).filter(Boolean);
      if (ratio >= 1 || words.length === 0) return seg.trim();
      const keep = Math.max(1, Math.round(words.length * ratio));
      return words.slice(0, keep).join(' ');
    });

    let result = '';
    for (let i = 0; i < trimmedSegments.length; i++) {
      result += trimmedSegments[i];
      if (i < placeholderOrder.length) {
        const ph = placeholderOrder[i];
        if (ph.type === 'char') {
          result += ' ' + blocks[ph.index] + ' ';
        } else {
          result += ' ' + styleSuffix + ' ';
        }
      }
    }
    prompt = result.replace(/\s{2,}/g, ' ').trim();

    const finalWords = prompt.split(/\s+/).length;
    const finalChars = prompt.length;
    console.log(`[PromptOptimizer] Character blocks: ${blocks.length} (${effectiveCharWords} char words + ${styleTokenWords} style words = ${protectedWords} protected). Scene budget: ${sceneWordBudget} words. Total: ~${finalWords} words, ${finalChars} chars.`);
  } else {
    const maxWords = isStylized ? 150 : 30;
    prompt = enforcePromptLength(prompt, maxWords);

    if (styleSuffix) {
      prompt = prompt.replace('__STYLE_SUFFIX__', styleSuffix);
      if (!prompt.includes(styleSuffix)) {
        prompt = prompt + ' ' + styleSuffix;
      }
    }
  }

  if (prompt.length < 10) {
    prompt = input.visualDescription.substring(0, 100);
    console.log(`[PromptOptimizer] Prompt too short after cleaning, using truncated original`);
  }

  const outputWords = prompt.split(/\s+/).length;
  const outputChars = prompt.length;
  console.log(`[PromptOptimizer] Output: ${outputWords} words, ${outputChars} chars`);

  return {
    prompt,
    negativePrompt: 'text, words, letters, numbers, writing, signage, logos, watermarks, labels, captions, titles, subtitles, UI elements, buttons, banners, blurry, low quality, distorted',
  };
}

export function logPromptOptimization(originalPrompt: string, optimized: OptimizedPrompt): void {
  if (originalPrompt !== optimized.prompt) {
    console.log(`[PromptOptimizer] Original: "${originalPrompt.substring(0, 80)}..."`);
    console.log(`[PromptOptimizer] Optimized: "${optimized.prompt.substring(0, 80)}..."`);
  } else {
    console.log(`[PromptOptimizer] Prompt unchanged: "${optimized.prompt.substring(0, 80)}..."`);
  }
}

export function analyzePrompt(prompt: string, artPresetId?: string): PromptAnalysis {
  const issues: string[] = [];
  let score = 100;
  const isStylized = isStylizedPresetFn(artPresetId);

  if (/,\s*or\s+/i.test(prompt) || /\.\s*[Oo]r\s+/.test(prompt)) {
    issues.push('Contains "or" alternatives — AI will try to render all options');
    score -= 25;
  }

  const commaCount = (prompt.match(/,/g) || []).length;
  const commaThreshold = isStylized ? 15 : 5;
  if (commaCount > commaThreshold) {
    issues.push(`Too many comma-separated elements (${commaCount}) — overly complex`);
    score -= 15;
  }

  const wordCount = prompt.split(/\s+/).length;
  const wordThreshold = isStylized ? 250 : 40;
  if (wordCount > wordThreshold) {
    issues.push(`Prompt too long (${wordCount} words) — AI works best with ${isStylized ? '100-200' : '10-25'} words`);
    score -= 15;
  }

  if (/\b(progression|transition from.*to|journey from|evolution of|transformation from)\b/i.test(prompt)) {
    issues.push('Describes a progression/transition — AI generates single frames, not narratives');
    score -= 20;
  }

  const abstractWords = prompt.match(/\b(concept|metaphor|reality|philosophy|overload|misconception|deeper meaning|holistic|wellness journey|root cause)\b/gi);
  if (abstractWords && abstractWords.length >= 2) {
    issues.push(`Multiple abstract concepts (${abstractWords.join(', ')}) — needs concrete visual`);
    score -= 15;
  }

  if (!isStylized && /\b(cinematic|dramatic shot|camera pan|lens flare|bokeh|shallow depth)\b/i.test(prompt)) {
    issues.push('Contains cinematic/camera language — AI video providers ignore these');
    score -= 10;
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}
