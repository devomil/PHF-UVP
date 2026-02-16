export interface TextOverlayRequirement {
  sceneIndex: number;
  required: boolean;
  overlayType: 'bullet_list' | 'single_text' | 'title' | 'cta' | 'none';
  textContent: string[];
  source: 'visual_direction' | 'narration' | 'scene_type';
}

interface Scene {
  sceneIndex?: number;
  visualDirection?: string;
  narration?: string;
  type?: string;
}

export function detectTextOverlayRequirements(scene: Scene): TextOverlayRequirement {
  const visualDirection = scene.visualDirection?.toLowerCase() || '';
  const originalVisualDirection = scene.visualDirection || '';
  const narration = scene.narration || '';
  const sceneType = scene.type?.toLowerCase() || '';
  
  console.log(`[TextOverlay] Analyzing scene ${scene.sceneIndex || 0}:`, {
    hasVisualDirection: !!scene.visualDirection,
    hasNarration: !!narration,
    sceneType,
  });
  
  if (visualDirection.includes('text overlay') || 
      visualDirection.includes('text with') ||
      visualDirection.includes('overlay with') ||
      visualDirection.includes('showing text')) {
    
    const textContent = extractTextContent(originalVisualDirection, narration);
    console.log(`[TextOverlay] Detected text overlay requirement from visual direction:`, textContent);
    
    return {
      sceneIndex: scene.sceneIndex || 0,
      required: true,
      overlayType: textContent.length > 1 ? 'bullet_list' : 'single_text',
      textContent,
      source: 'visual_direction',
    };
  }
  
  if (sceneType === 'cta' || sceneType === 'call_to_action') {
    const ctaContent = extractCTAContent(narration);
    console.log(`[TextOverlay] Detected CTA scene, extracted content:`, ctaContent);
    
    return {
      sceneIndex: scene.sceneIndex || 0,
      required: true,
      overlayType: 'cta',
      textContent: ctaContent,
      source: 'scene_type',
    };
  }
  
  if (narration.toLowerCase().includes('try this:') || 
      narration.toLowerCase().includes('steps:') ||
      narration.toLowerCase().includes('tips:')) {
    const actionItems = extractActionItems(narration);
    
    if (actionItems.length > 0) {
      console.log(`[TextOverlay] Detected action items in narration:`, actionItems);
      return {
        sceneIndex: scene.sceneIndex || 0,
        required: true,
        overlayType: 'bullet_list',
        textContent: actionItems,
        source: 'narration',
      };
    }
  }
  
  // Check for numbered lists (1. item, 2. item, etc.)
  const numberedItems = extractNumberedItems(narration);
  if (numberedItems.length >= 2) {
    console.log(`[TextOverlay] Detected numbered list in narration:`, numberedItems);
    return {
      sceneIndex: scene.sceneIndex || 0,
      required: true,
      overlayType: 'bullet_list',
      textContent: numberedItems,
      source: 'narration',
    };
  }
  
  return {
    sceneIndex: scene.sceneIndex || 0,
    required: false,
    overlayType: 'none',
    textContent: [],
    source: 'visual_direction',
  };
}

function extractTextContent(visualDirection: string, narration: string): string[] {
  const content: string[] = [];
  
  // First, try to extract quoted text from visual direction (e.g., "30 Day Money Back Guarantee")
  const quotedPattern = /"([^"]+)"|'([^']+)'/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(visualDirection)) !== null) {
    const quotedText = (quotedMatch[1] || quotedMatch[2]).trim();
    if (quotedText.length >= 3 && quotedText.length <= 100) {
      content.push(quotedText);
    }
  }
  
  // Also try to extract quoted text from narration if none found in visual direction
  if (content.length === 0) {
    quotedPattern.lastIndex = 0;
    while ((quotedMatch = quotedPattern.exec(narration)) !== null) {
      const quotedText = (quotedMatch[1] || quotedMatch[2]).trim();
      if (quotedText.length >= 3 && quotedText.length <= 100) {
        content.push(quotedText);
      }
    }
  }
  
  if (content.length === 0) {
    const stepsMatch = visualDirection.match(/(?:steps|points|items)[:\s]+([^.]+)/i);
    if (stepsMatch) {
      const steps = stepsMatch[1].split(/[•\-,]/).map(s => s.trim()).filter(s => s.length > 0);
      content.push(...steps);
    }
  }
  
  if (content.length === 0) {
    const bulletPattern = /[•\-]\s*([^•\-\n]+)/g;
    let match;
    while ((match = bulletPattern.exec(narration)) !== null) {
      content.push(match[1].trim());
    }
    
    const numberPattern = /\d+[.)]\s*([^.\n]+)/g;
    while ((match = numberPattern.exec(narration)) !== null) {
      content.push(match[1].trim());
    }
  }
  
  if (content.length === 0) {
    const actionItems = extractActionItems(narration);
    if (actionItems.length > 0) {
      content.push(...actionItems);
    }
  }
  
  if (content.length === 0 && narration.toLowerCase().includes('try this:')) {
    const afterTryThis = narration.split(/try this:/i)[1];
    if (afterTryThis) {
      const items = afterTryThis
        .split(/[.•\-]/)
        .map(s => s.trim())
        .filter(s => s.length > 10 && s.length < 100);
      content.push(...items.slice(0, 5));
    }
  }
  
  return content;
}

function extractCTAContent(narration: string): string[] {
  const content: string[] = [];
  
  // Capture full "Visit [domain/phrase]" - stop at punctuation or end of sentence
  if (narration.toLowerCase().includes('visit')) {
    const visitMatch = narration.match(/visit\s+([^\s.,!?]+(?:\s+[^\s.,!?]+){0,5})/i);
    if (visitMatch) {
      // Capture until we hit common sentence-ending punctuation or connecting words
      const fullVisit = visitMatch[0].replace(/\s+(for|to|and|at|today|now)\b.*$/i, '').trim();
      content.push(fullVisit);
    }
  }
  
  const phoneMatch = narration.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/);
  if (phoneMatch) content.push(phoneMatch[0]);
  
  // Extract URLs/domains
  const urlMatch = narration.match(/\b([a-z0-9-]+\.(com|co|org|net|io))\b/i);
  if (urlMatch && !content.some(c => c.toLowerCase().includes(urlMatch[1].toLowerCase()))) {
    content.push(urlMatch[1]);
  }
  
  const ctaPhrases = ['learn more', 'get started', 'schedule', 'book now', 'call us', 'contact us', 'shop now', 'order today'];
  for (const phrase of ctaPhrases) {
    if (narration.toLowerCase().includes(phrase)) {
      const phraseIndex = narration.toLowerCase().indexOf(phrase);
      const ctaText = narration.substring(phraseIndex, phraseIndex + 60).split(/[.!?]/)[0].trim();
      if (ctaText.length >= 5 && !content.includes(ctaText)) {
        content.push(ctaText);
      }
      break;
    }
  }
  
  return content;
}

function extractNumberedItems(narration: string): string[] {
  const items: string[] = [];
  
  // Match patterns like "1. item", "2. item", "1) item", "2) item"
  const numberPattern = /\d+[.)]\s*([^0-9.\n]+?)(?=\d+[.)]|\s*$)/g;
  let match;
  while ((match = numberPattern.exec(narration)) !== null) {
    const item = match[1].trim();
    if (item.length >= 5 && item.length <= 100) {
      items.push(item);
    }
  }
  
  return items.slice(0, 6);
}

function extractActionItems(narration: string): string[] {
  const items: string[] = [];
  
  const patterns = [
    /Identify\s+([^.]+)/gi,
    /Add\s+([^.]+)/gi,
    /Replace\s+([^.]+)/gi,
    /Try\s+([^.]+)/gi,
    /Start\s+([^.]+)/gi,
    /Focus\s+on\s+([^.]+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(narration)) !== null) {
      const item = match[0].trim();
      if (item.length < 80 && item.length > 5) {
        items.push(item);
      }
    }
  }
  
  return items.slice(0, 5);
}

export const textOverlayDetector = {
  detectTextOverlayRequirements,
};
