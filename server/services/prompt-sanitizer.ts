/**
 * Phase 11A: AI Prompt Sanitization
 * 
 * Prevents AI image/video generators from creating text, logos, buttons,
 * or UI elements inside generated assets. All text and branding should be
 * added via Remotion overlays, not baked into the image.
 */

const ART_PRESET_WHITELIST = [
  '3d render', '3d rendered', '3d illustration', 'pixar style', 'isometric',
  'claymation', 'clay figure', 'stop-motion', 'plasticine', 'miniature set',
  'watercolor', 'watercolour', 'brush strokes', 'painterly',
  'line art', 'vector illustration', 'flat design', 'geometric shapes',
  'collage', 'paper cutout', 'mixed media', 'scrapbook',
  'neon', 'cyberpunk', 'holographic', 'sci-fi', 'futuristic',
  'cinematic', 'photorealistic', 'film-grade',
  'minimalist', 'flat', 'bauhaus', 'scandinavian design',
  'octane render', 'ambient occlusion', 'global illumination',
  'diorama', 'handcrafted', 'tactile',
];

export interface SanitizedPrompt {
  cleanPrompt: string;
  removedElements: string[];
  extractedText: string[];
  extractedLogos: string[];
  warnings: string[];
  originalPrompt: string;
}

/**
 * Sanitize a visual direction prompt before sending to AI providers.
 * Removes text/logo requests and adds explicit "no text" instructions.
 */
export function sanitizePromptForAI(
  visualDirection: string,
  sceneType: string
): SanitizedPrompt {
  if (!visualDirection) {
    return {
      cleanPrompt: '',
      removedElements: [],
      extractedText: [],
      extractedLogos: [],
      warnings: ['Empty visual direction provided'],
      originalPrompt: '',
    };
  }

  let cleanPrompt = visualDirection;
  const removedElements: string[] = [];
  const extractedText: string[] = [];
  const extractedLogos: string[] = [];
  const warnings: string[] = [];

  // === STEP 1: Extract and remove text overlay requests ===
  
  // Pattern: "text overlay with X" or "text showing X" or "overlay with X"
  const textOverlayPattern = /(?:text\s+)?overlay\s+(?:with|showing|displaying)\s+["']?([^"',.]+)["']?/gi;
  let match;
  while ((match = textOverlayPattern.exec(visualDirection)) !== null) {
    const text = match[1].trim();
    if (text.length > 0) extractedText.push(text);
    removedElements.push(match[0]);
  }
  cleanPrompt = cleanPrompt.replace(textOverlayPattern, '');

  // Pattern: "text with X" or "showing text X" or "text saying X"
  const textWithPattern = /(?:showing\s+)?text\s+(?:with|saying|reading|displaying)\s+["']?([^"',.]+)["']?/gi;
  while ((match = textWithPattern.exec(visualDirection)) !== null) {
    const text = match[1].trim();
    if (text.length > 0) extractedText.push(text);
    removedElements.push(match[0]);
  }
  cleanPrompt = cleanPrompt.replace(textWithPattern, '');

  // Pattern: quoted text that should be displayed (before text/title/heading words)
  const quotedTextBeforePattern = /["']([^"']+)["']\s*(?:text|title|heading|caption|label)/gi;
  while ((match = quotedTextBeforePattern.exec(visualDirection)) !== null) {
    const text = match[1].trim();
    if (text.length > 0) extractedText.push(text);
    removedElements.push(match[0]);
  }
  cleanPrompt = cleanPrompt.replace(quotedTextBeforePattern, '');

  // Pattern: text/title/heading followed by quoted text
  const quotedTextAfterPattern = /(?:text|title|heading|caption|label)\s*(?::|of|with|showing|reading)?\s*["']([^"']+)["']/gi;
  while ((match = quotedTextAfterPattern.exec(visualDirection)) !== null) {
    const text = match[1].trim();
    if (text.length > 0) extractedText.push(text);
    removedElements.push(match[0]);
  }
  cleanPrompt = cleanPrompt.replace(quotedTextAfterPattern, '');

  // Pattern: standalone quoted text (likely meant for overlay)
  const standaloneQuotedPattern = /["']([^"']{3,50})["']/g;
  while ((match = standaloneQuotedPattern.exec(cleanPrompt)) !== null) {
    const text = match[1].trim();
    // Only extract if it looks like display text (not part of a description)
    if (!text.toLowerCase().includes(' of ') && 
        !text.toLowerCase().includes(' with ') &&
        !text.toLowerCase().includes(' in ')) {
      extractedText.push(text);
      removedElements.push(match[0]);
    }
  }
  cleanPrompt = cleanPrompt.replace(standaloneQuotedPattern, '');

  // === STEP 2: Extract and remove logo requests ===

  // Pattern: "X logo" or "logo of X" or "logo for X"
  const logoPattern = /(?:(\w+(?:\s+\w+){0,3})\s+logo|logo\s+(?:of|for)\s+(\w+(?:\s+\w+){0,3}))/gi;
  while ((match = logoPattern.exec(visualDirection)) !== null) {
    const logoName = (match[1] || match[2])?.trim();
    if (logoName && logoName.length > 0) {
      extractedLogos.push(logoName);
      removedElements.push(match[0]);
    }
  }
  cleanPrompt = cleanPrompt.replace(logoPattern, '');

  // Specific brand names that should NEVER be in AI prompts
  const brandNames = [
    'pine hill farm',
    'pinehillfarm',
    'phf',
    'pine hill',
  ];
  for (const brand of brandNames) {
    const brandRegex = new RegExp(brand, 'gi');
    if (brandRegex.test(cleanPrompt)) {
      extractedLogos.push(brand);
      cleanPrompt = cleanPrompt.replace(brandRegex, 'wellness center');
      removedElements.push(brand);
    }
  }

  // === STEP 3: Remove button/CTA requests ===

  const buttonPatterns = [
    /book\s+now\s*(?:button|cta)?/gi,
    /learn\s+more\s*(?:button|cta)?/gi,
    /get\s+started\s*(?:button|cta)?/gi,
    /contact\s+us\s*(?:button|cta)?/gi,
    /call\s+now\s*(?:button|cta)?/gi,
    /shop\s+now\s*(?:button|cta)?/gi,
    /order\s+now\s*(?:button|cta)?/gi,
    /sign\s+up\s*(?:button|cta)?/gi,
    /subscribe\s*(?:button|cta)?/gi,
    /schedule\s+(?:now|today|consultation)\s*(?:button|cta)?/gi,
  ];
  
  for (const pattern of buttonPatterns) {
    while ((match = pattern.exec(visualDirection)) !== null) {
      const buttonText = match[0].replace(/\s*(button|cta)\s*$/i, '').trim();
      extractedText.push(buttonText);
      removedElements.push(match[0]);
    }
    pattern.lastIndex = 0;
    cleanPrompt = cleanPrompt.replace(pattern, '');
  }

  // === STEP 4: Remove generic text/title/headline/label requests ===

  const genericTextPatterns = [
    /(?:with\s+)?(?:title|headline|heading|subtitle)\s*(?:overlay)?/gi,
    /(?:with\s+)?(?:caption|badge)\s*(?:overlay)?/gi,
    /(?:with\s+)?text\s*(?:overlay|element)?s?/gi,
    /(?:with\s+)?(?:company\s+)?(?:watermark|stamp)s?/gi,
    /(?:show(?:ing)?|display(?:ing)?)\s+(?:text|words|letters)/gi,
    /\w+\s+text\s+labels?/gi,  // "X text labels"
    /text\s+labels?\s+(?:for|of|with)?\s*\w*/gi,  // "text labels for/of X"
    /(?:with\s+)?labels?\s*(?:overlay)?/gi,  // "with labels"
  ];
  
  for (const pattern of genericTextPatterns) {
    while ((match = pattern.exec(cleanPrompt)) !== null) {
      removedElements.push(match[0]);
    }
    pattern.lastIndex = 0;
    cleanPrompt = cleanPrompt.replace(pattern, '');
  }

  // === STEP 4B: Remove text-generating trigger words ===
  const textTriggerReplacements: [RegExp, string][] = [
    [/(?:welcoming|branded|informational|decorative|promotional)\s+signage/gi, 'welcoming entrance'],
    [/(?:with\s+)?signage\b/gi, ''],
    [/(?:with\s+)?(?:a\s+)?sign\s+(?:reading|saying|displaying|showing)\s+[^,.]+/gi, ''],
    [/(?:wooden|stone|metal|elegant|rustic)\s+sign\b/gi, 'entrance detail'],
    [/storefront\s+(?:with|showing|displaying)/gi, 'storefront exterior,'],
    [/(?:with\s+)?(?:company|business|brand|shop)\s+(?:name|sign)/gi, ''],
    [/(?:with\s+)?(?:infographic|diagram|chart|graph|flowchart|mind\s*map)/gi, 'abstract visual composition'],
    [/(?:with\s+)?(?:bullet\s+points?|numbered\s+(?:list|steps?))/gi, ''],
    [/(?:with\s+)?(?:product\s+)?(?:packaging|label)\s+(?:showing|reading|with)\s+[^,.]+/gi, 'product packaging,'],
    [/(?:menu|price\s*list|directory)\s+(?:board|sign)/gi, 'decorative display'],
    [/(?:neon|illuminated|lit)\s+sign/gi, 'ambient lighting'],
    [/(?:chalkboard|whiteboard|blackboard)\s+(?:with|showing|displaying)/gi, 'rustic wall decor'],
    [/(?:plaque|nameplate|door\s*sign|wayfinding)/gi, 'entrance detail'],
    [/(?:certificate|diploma|award)\s+(?:on|hanging|displayed)/gi, 'framed art on'],
    [/(?:with\s+)?(?:visible\s+)?(?:writing|lettering|inscription|engraving)/gi, ''],
    [/(?:website|url|web\s*address|email|phone\s*number)\s*(?:display|shown|visible)?/gi, ''],
  ];

  for (const [pattern, replacement] of textTriggerReplacements) {
    if (pattern.test(cleanPrompt)) {
      removedElements.push(`text-trigger: ${cleanPrompt.match(pattern)?.[0]}`);
      cleanPrompt = cleanPrompt.replace(pattern, replacement);
    }
  }

  // === STEP 5: Remove UI element and branding requests ===

  const uiPatterns = [
    /(?:with\s+)?(?:ui|user interface)\s*(?:element)?s?/gi,
    /(?:with\s+)?(?:button|buttons)/gi,
    /(?:with\s+)?(?:icon|icons)/gi,
    /(?:with\s+)?(?:banner|banners)/gi,
    /(?:with\s+)?(?:overlay|overlays)/gi,
    /(?:with\s+)?(?:graphics|graphic)/gi,
    /(?:with\s+)?(?:branding\s+)?(?:elements?|assets?)/gi,
    /(?:and\s+)?branding\b/gi,
  ];
  
  for (const pattern of uiPatterns) {
    while ((match = pattern.exec(cleanPrompt)) !== null) {
      removedElements.push(match[0]);
    }
    pattern.lastIndex = 0;
    cleanPrompt = cleanPrompt.replace(pattern, '');
  }

  // === STEP 5B: Restore any whitelisted art preset keywords that were accidentally stripped ===
  for (const keyword of ART_PRESET_WHITELIST) {
    const keywordLower = keyword.toLowerCase();
    if (visualDirection.toLowerCase().includes(keywordLower) && !cleanPrompt.toLowerCase().includes(keywordLower)) {
      cleanPrompt = `${keyword}, ${cleanPrompt}`;
    }
  }

  // === STEP 6: Clean up the prompt ===

  // Remove double spaces
  cleanPrompt = cleanPrompt.replace(/\s+/g, ' ').trim();
  
  // Remove orphaned punctuation
  cleanPrompt = cleanPrompt.replace(/,\s*,/g, ',');
  cleanPrompt = cleanPrompt.replace(/,\s*\./g, '.');
  cleanPrompt = cleanPrompt.replace(/^\s*,\s*/, '');
  cleanPrompt = cleanPrompt.replace(/\s*,\s*$/, '');
  cleanPrompt = cleanPrompt.replace(/\.\s*\./g, '.');
  cleanPrompt = cleanPrompt.replace(/,\s*$/g, '');

  // === STEP 7: Add explicit "no text" instruction ===

  const noTextSuffix = '. CRITICAL REQUIREMENT: Generate ONLY the visual scene with absolutely NO text, NO words, NO letters, NO numbers, NO logos, NO signs with writing, NO watermarks, NO labels, NO captions, NO UI elements anywhere in the image. Any surfaces that might contain text (signs, screens, papers, packaging) must be blank or blurred. Pure visual imagery only.';

  // Only add if we have a prompt
  if (cleanPrompt.length > 0) {
    // Ensure proper sentence ending before adding suffix
    if (!cleanPrompt.endsWith('.') && !cleanPrompt.endsWith('!') && !cleanPrompt.endsWith('?')) {
      cleanPrompt = cleanPrompt + '.';
    }
    cleanPrompt = cleanPrompt + noTextSuffix;
  }

  // === STEP 8: Generate warnings ===

  if (extractedText.length > 0) {
    warnings.push(`Extracted ${extractedText.length} text element(s) for Remotion overlay: ${extractedText.slice(0, 3).join(', ')}${extractedText.length > 3 ? '...' : ''}`);
  }
  if (extractedLogos.length > 0) {
    warnings.push(`Extracted ${extractedLogos.length} logo request(s) - will use brand assets: ${extractedLogos.join(', ')}`);
  }
  if (removedElements.length === 0 && sceneTypicallyNeedsText(sceneType)) {
    warnings.push(`Scene type "${sceneType}" typically needs text overlays - consider adding via UI`);
  }

  console.log(`[PromptSanitizer] Sanitized prompt for ${sceneType} scene:`);
  console.log(`  Original: ${visualDirection.substring(0, 80)}...`);
  console.log(`  Clean: ${cleanPrompt.substring(0, 80)}...`);
  console.log(`  Removed: ${removedElements.length} elements`);
  console.log(`  Extracted text: ${extractedText.join(', ') || 'none'}`);
  console.log(`  Extracted logos: ${extractedLogos.join(', ') || 'none'}`);

  return {
    cleanPrompt,
    removedElements,
    extractedText: Array.from(new Set(extractedText)), // Deduplicate
    extractedLogos: Array.from(new Set(extractedLogos)), // Deduplicate
    warnings,
    originalPrompt: visualDirection,
  };
}

/**
 * Check if a scene type typically needs text overlays
 */
export function sceneTypicallyNeedsText(sceneType: string): boolean {
  const textSceneTypes = [
    'cta',
    'call_to_action',
    'intro',
    'outro',
    'title',
    'explanation',
    'benefits',
    'benefit',
    'features',
    'feature',
    'pricing',
    'contact',
    'testimonial',
    'proof',
    'solution',
  ];
  return textSceneTypes.includes(sceneType.toLowerCase());
}

/**
 * Apply provider-specific prompt enhancements after sanitization
 */
export function enhancePromptForProvider(
  sanitizedPrompt: string,
  provider: string
): string {
  if (!sanitizedPrompt) return sanitizedPrompt;

  const stylizedTokens = [
    'pixar', '3d rendered', '3d illustration', '3d animated',
    'claymation', 'clay style', 'stop motion',
    '2d line art', 'line art', 'hand-drawn',
    'neon futuristic', 'cyberpunk', 'neon glow',
    'watercolor', 'watercolour', 'ink wash',
    'collage', 'mixed media', 'scrapbook',
    'minimalist flat', 'flat design',
    'scientific animation', 'medical animation',
  ];
  const promptLower = sanitizedPrompt.toLowerCase();
  const hasStylizedContent = stylizedTokens.some(token => promptLower.includes(token));

  if (hasStylizedContent) {
    return sanitizedPrompt;
  }

  switch (provider.toLowerCase()) {
    case 'runway':
    case 'runway-gen4':
      return `Cinematic shot: ${sanitizedPrompt}`;
    
    case 'kling':
    case 'kling-ai':
      return `Natural, realistic: ${sanitizedPrompt}`;
    
    case 'luma':
    case 'luma-ai':
      return `High quality, detailed: ${sanitizedPrompt}`;
    
    case 'hailuo':
    case 'minimax':
      return `Professional quality: ${sanitizedPrompt}`;
    
    case 'hunyuan':
      return `Photorealistic: ${sanitizedPrompt}`;
    
    case 'flux':
    case 'flux.1':
    case 'fal':
    case 'fal.ai':
      return sanitizedPrompt;
    
    default:
      return sanitizedPrompt;
  }
}

/**
 * Sanitize and enhance a prompt for a specific provider
 */
export function preparePromptForProvider(
  visualDirection: string,
  sceneType: string,
  provider: string
): SanitizedPrompt {
  const sanitized = sanitizePromptForAI(visualDirection, sceneType);
  sanitized.cleanPrompt = enhancePromptForProvider(sanitized.cleanPrompt, provider);
  return sanitized;
}

export const promptSanitizer = {
  sanitizePromptForAI,
  sceneTypicallyNeedsText,
  enhancePromptForProvider,
  preparePromptForProvider,
};
