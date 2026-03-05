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
  '3d rendered illustration', '3d render', 'pixar style', 'isometric perspective',
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

function cleanPromptText(prompt: string): string {
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

  cleaned = cleaned.replace(/\b(cinematic|dramatic|epic|sweeping|ethereal|moody|atmospheric)\s+(shot|angle|lighting|camera|pan|zoom|dolly|tracking)\b/gi, '');
  cleaned = cleaned.replace(/\b(close-up shot|wide shot|medium shot|establishing shot|aerial shot|bird's eye view|low angle|high angle|dutch angle)\b/gi, '');
  cleaned = cleaned.replace(/\b(soft morning light|golden hour|natural lighting|rim lighting|backlit|silhouetted|lens flare|bokeh|shallow depth of field)\b/gi, '');
  cleaned = cleaned.replace(/\b(camera slowly|camera pans|camera tilts|camera tracks|camera dollies|camera zooms|camera pulls back|camera pushes in)\b/gi, '');

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
  const hasArtPresetTokens = ART_PRESET_STYLE_TOKENS.some(token => 
    prompt.toLowerCase().includes(token.toLowerCase())
  );
  const effectiveMax = hasArtPresetTokens ? maxWords + 15 : maxWords;
  
  const words = prompt.split(/\s+/);
  if (words.length <= effectiveMax) return prompt;

  const truncated = words.slice(0, effectiveMax).join(' ');
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > truncated.length * 0.5) {
    return truncated.substring(0, lastPeriod + 1);
  }
  return truncated + '.';
}

export function optimizePrompt(input: OptimizePromptInput): OptimizedPrompt {
  let prompt = input.visualDescription;
  const isStylized = isStylizedPresetFn(input.artPresetId);

  const segments = splitByOrAlternatives(prompt);
  if (segments.length > 1) {
    const best = pickBestSegment(segments);
    console.log(`[PromptOptimizer] Detected ${segments.length} alternatives joined by "or" — selected most concrete: "${best.substring(0, 60)}..."`);
    prompt = best;
  }

  if (!isStylized) {
    prompt = cleanPromptText(prompt);
  }

  const maxWords = isStylized ? 80 : 30;
  prompt = enforcePromptLength(prompt, maxWords);

  if (prompt.length < 10) {
    prompt = input.visualDescription.substring(0, 100);
    console.log(`[PromptOptimizer] Prompt too short after cleaning, using truncated original`);
  }

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

export function analyzePrompt(prompt: string): PromptAnalysis {
  const issues: string[] = [];
  let score = 100;

  if (/,\s*or\s+/i.test(prompt) || /\.\s*[Oo]r\s+/.test(prompt)) {
    issues.push('Contains "or" alternatives — AI will try to render all options');
    score -= 25;
  }

  const commaCount = (prompt.match(/,/g) || []).length;
  if (commaCount > 5) {
    issues.push(`Too many comma-separated elements (${commaCount}) — overly complex`);
    score -= 15;
  }

  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 40) {
    issues.push(`Prompt too long (${wordCount} words) — AI works best with 10-25 words`);
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

  if (/\b(cinematic|dramatic shot|camera pan|lens flare|bokeh|shallow depth)\b/i.test(prompt)) {
    issues.push('Contains cinematic/camera language — AI video providers ignore these');
    score -= 10;
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}
