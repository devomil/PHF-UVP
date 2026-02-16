export interface ProductKnowledge {
  name: string;
  category: string;
  primaryBenefits: string[];
  keyIngredients: string[];
  targetAudience: string;
  commonClaims: string[];
  avoidClaims: string[];
}

export interface HealthStatistic {
  claim: string;
  statistic: string;
  source: string;
  year: number;
}

export const PRODUCT_KNOWLEDGE: Record<string, ProductKnowledge> = {
  'general-supplement': {
    name: 'Pine Hill Farm Supplements',
    category: 'dietary supplements',
    primaryBenefits: [
      'supports overall wellness',
      'made with organic ingredients',
      'locally sourced',
      'third-party tested',
    ],
    keyIngredients: ['organic herbs', 'natural vitamins', 'plant-based minerals'],
    targetAudience: 'health-conscious adults seeking natural wellness solutions',
    commonClaims: [
      'supports healthy lifestyle',
      'made with care',
      'pure ingredients',
      'family-owned quality',
    ],
    avoidClaims: [
      'cures disease',
      'treats medical conditions',
      'FDA approved',
      'clinically proven to cure',
      'guaranteed results',
    ],
  },
  'immune-support': {
    name: 'Immune Support Formula',
    category: 'immune health',
    primaryBenefits: [
      'supports immune system function',
      'made with organic elderberry',
      'contains vitamin C and zinc',
      'suitable for daily use',
    ],
    keyIngredients: ['elderberry', 'vitamin C', 'zinc', 'echinacea'],
    targetAudience: 'adults looking to support their immune health naturally',
    commonClaims: [
      'supports immune system',
      'daily wellness support',
      'natural ingredients',
      'gentle on stomach',
    ],
    avoidClaims: [
      'prevents illness',
      'cures colds or flu',
      'boosts immunity',
      'protects against disease',
    ],
  },
  'weight-support': {
    name: 'Weight Management Support',
    category: 'weight management',
    primaryBenefits: [
      'supports healthy metabolism',
      'made with natural ingredients',
      'supports energy levels',
      'part of a healthy lifestyle',
    ],
    keyIngredients: ['green tea extract', 'garcinia', 'chromium', 'B vitamins'],
    targetAudience: 'adults pursuing weight management goals with healthy habits',
    commonClaims: [
      'supports metabolism',
      'complements healthy diet',
      'natural energy support',
      'quality ingredients',
    ],
    avoidClaims: [
      'causes weight loss',
      'burns fat',
      'lose X pounds',
      'no diet or exercise needed',
      'rapid results',
    ],
  },
  'sleep-support': {
    name: 'Natural Sleep Support',
    category: 'sleep and relaxation',
    primaryBenefits: [
      'supports restful sleep',
      'made with calming herbs',
      'non-habit forming',
      'gentle and natural',
    ],
    keyIngredients: ['melatonin', 'valerian root', 'chamomile', 'magnesium'],
    targetAudience: 'adults seeking natural support for occasional sleeplessness',
    commonClaims: [
      'supports relaxation',
      'calming formula',
      'natural ingredients',
      'wake refreshed',
    ],
    avoidClaims: [
      'cures insomnia',
      'treats sleep disorders',
      'guaranteed sleep',
      'prescription alternative',
    ],
  },
  'joint-support': {
    name: 'Joint Health Formula',
    category: 'joint and mobility',
    primaryBenefits: [
      'supports joint comfort',
      'promotes flexibility',
      'made with glucosamine',
      'supports active lifestyle',
    ],
    keyIngredients: ['glucosamine', 'chondroitin', 'MSM', 'turmeric'],
    targetAudience: 'active adults wanting to support joint health',
    commonClaims: [
      'supports joint health',
      'promotes flexibility',
      'quality ingredients',
      'supports mobility',
    ],
    avoidClaims: [
      'cures arthritis',
      'eliminates pain',
      'repairs cartilage',
      'reverses joint damage',
    ],
  },
  'digestive-support': {
    name: 'Digestive Wellness',
    category: 'digestive health',
    primaryBenefits: [
      'supports digestive comfort',
      'contains probiotics',
      'supports gut health',
      'made with natural enzymes',
    ],
    keyIngredients: ['probiotics', 'digestive enzymes', 'ginger', 'peppermint'],
    targetAudience: 'adults seeking digestive wellness support',
    commonClaims: [
      'supports digestion',
      'gut-friendly formula',
      'natural ingredients',
      'gentle support',
    ],
    avoidClaims: [
      'cures digestive disorders',
      'treats IBS',
      'eliminates bloating',
      'fixes gut problems',
    ],
  },
};

export const HEALTH_STATISTICS: HealthStatistic[] = [
  {
    claim: 'supplement usage',
    statistic: '57% of U.S. adults use dietary supplements',
    source: 'CRN Consumer Survey',
    year: 2023,
  },
  {
    claim: 'organic preference',
    statistic: '76% of consumers seek organic options when available',
    source: 'Organic Trade Association',
    year: 2023,
  },
  {
    claim: 'local sourcing',
    statistic: '65% of consumers prefer locally-sourced products',
    source: 'Food Marketing Institute',
    year: 2023,
  },
  {
    claim: 'natural ingredients',
    statistic: '73% of supplement users prioritize natural ingredients',
    source: 'Natural Products Association',
    year: 2023,
  },
  {
    claim: 'wellness investment',
    statistic: 'Americans spend $50+ billion annually on supplements',
    source: 'Nutrition Business Journal',
    year: 2023,
  },
  {
    claim: 'immune health',
    statistic: '72% of adults actively seek immune support products',
    source: 'IQVIA Consumer Health Survey',
    year: 2024,
  },
  {
    claim: 'sleep concerns',
    statistic: '35% of adults report getting less than recommended sleep',
    source: 'CDC Sleep Statistics',
    year: 2023,
  },
  {
    claim: 'digestive wellness',
    statistic: '61% of adults experience digestive discomfort regularly',
    source: 'American Gastroenterological Association',
    year: 2023,
  },
  {
    claim: 'joint health',
    statistic: '54% of adults over 40 are concerned about joint health',
    source: 'Arthritis Foundation Survey',
    year: 2023,
  },
  {
    claim: 'weight management',
    statistic: '45% of American adults are trying to lose weight',
    source: 'CDC National Health Statistics',
    year: 2023,
  },
  {
    claim: 'trust in brands',
    statistic: '82% of consumers trust family-owned businesses more',
    source: 'Edelman Trust Barometer',
    year: 2024,
  },
  {
    claim: 'quality over price',
    statistic: '68% will pay more for products they trust',
    source: 'Consumer Reports Survey',
    year: 2023,
  },
];

export function getRelevantStatistics(topic: string, limit: number = 2): HealthStatistic[] {
  const keywords = topic.toLowerCase().split(/\s+/);
  
  const scored = HEALTH_STATISTICS.map(stat => {
    const text = `${stat.claim} ${stat.statistic}`.toLowerCase();
    const score = keywords.filter(kw => kw.length > 3 && text.includes(kw)).length;
    return { stat, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.stat);
}

export function getProductKnowledge(productType: string): ProductKnowledge {
  const normalizedType = productType.toLowerCase().replace(/\s+/g, '-');
  
  for (const [key, knowledge] of Object.entries(PRODUCT_KNOWLEDGE)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      return knowledge;
    }
  }
  
  if (normalizedType.includes('immune')) return PRODUCT_KNOWLEDGE['immune-support'];
  if (normalizedType.includes('weight') || normalizedType.includes('metabolism')) return PRODUCT_KNOWLEDGE['weight-support'];
  if (normalizedType.includes('sleep') || normalizedType.includes('relax')) return PRODUCT_KNOWLEDGE['sleep-support'];
  if (normalizedType.includes('joint') || normalizedType.includes('mobility')) return PRODUCT_KNOWLEDGE['joint-support'];
  if (normalizedType.includes('digest') || normalizedType.includes('gut') || normalizedType.includes('probiotic')) return PRODUCT_KNOWLEDGE['digestive-support'];
  
  return PRODUCT_KNOWLEDGE['general-supplement'];
}

export function getSafeClaims(productType: string): string[] {
  const product = getProductKnowledge(productType);
  return product.commonClaims;
}

export function isClaimRisky(claim: string): boolean {
  const riskyPatterns = [
    /\bcure[sd]?\b/i,
    /\btreat[s]?\b/i,
    /\bprevent[s]?\b/i,
    /\bdiagnos/i,
    /\bFDA\s*approved\b/i,
    /\bclinically\s+proven\b/i,
    /\bguarantee[d]?\b/i,
    /\bmiracle\b/i,
    /\bbreakthrough\b/i,
    /\beliminate[s]?\b/i,
    /\bfix(es)?\b/i,
    /\bheal[s]?\b/i,
    /\breverse[s]?\b/i,
    /\bno\s+side\s+effects\b/i,
    /\b100%\s+(safe|effective|natural)\b/i,
  ];
  
  return riskyPatterns.some(pattern => pattern.test(claim));
}

export function detectProductType(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('immune') || desc.includes('elderberry') || desc.includes('vitamin c') || desc.includes('zinc')) {
    return 'immune-support';
  }
  if (desc.includes('weight') || desc.includes('metabolism') || desc.includes('fat') || desc.includes('slim')) {
    return 'weight-support';
  }
  if (desc.includes('sleep') || desc.includes('relax') || desc.includes('calm') || desc.includes('melatonin')) {
    return 'sleep-support';
  }
  if (desc.includes('joint') || desc.includes('mobility') || desc.includes('glucosamine') || desc.includes('arthrit')) {
    return 'joint-support';
  }
  if (desc.includes('digest') || desc.includes('gut') || desc.includes('probiotic') || desc.includes('bloat')) {
    return 'digestive-support';
  }
  
  return 'general-supplement';
}

export const HEALTH_SCRIPT_SYSTEM_PROMPT = `You are a health and wellness marketing scriptwriter for Pine Hill Farm, a family-owned organic supplement company.

## YOUR ROLE
Create compelling video scripts that:
1. Highlight genuine health benefits (not medical claims)
2. Include relevant statistics when they strengthen the message
3. Focus on lifestyle improvement and wellness support
4. Maintain FDA/FTC compliance (no disease claims)

## PINE HILL FARM BRAND VOICE
- Warm, authentic, family-owned feel
- Trustworthy and transparent
- Health-conscious but not preachy
- Community and local focus
- Quality and care in every product

## SCRIPT STRUCTURE FOR VIDEO
Each scene should be designed for AI video generation:
- HOOK: Grab attention in first 3 seconds (relatable problem or aspiration)
- PROBLEM: The challenge your audience faces (keep brief, 1 scene)
- SOLUTION: Introduce the product naturally (show, don't just tell)
- BENEFIT: How life improves with the product (emotional payoff)
- SOCIAL PROOF: Statistic or testimonial reference (builds credibility)
- CTA: Clear next step (visit website, try today, etc.)

## COMPLIANCE RULES (CRITICAL)
✅ CAN SAY: "supports healthy lifestyle", "made with organic ingredients", "may help support wellness"
❌ CANNOT SAY: "cures", "treats", "prevents disease", "FDA approved", "guaranteed results", "eliminates", "fixes"

## OUTPUT FORMAT
Return a JSON object with this structure:
{
  "title": "Video title",
  "targetDuration": 30,
  "scenes": [
    {
      "type": "hook|problem|solution|benefit|social_proof|cta",
      "narration": "What the voiceover says",
      "visualDirection": "Simple description for video generation",
      "duration": 5,
      "includeProduct": true/false,
      "textOverlays": [{ "text": "on-screen text", "style": "title|subtitle|headline|cta" }]
    }
  ],
  "suggestedStatistic": "Optional relevant statistic to include",
  "keyMessage": "The one thing viewers should remember"
}

## VISUAL DESCRIPTION RULES (CRITICAL)
Keep visual descriptions SIMPLE. These will be used for AI video generation.

✅ GOOD: "A woman in her 40s taking supplements with morning coffee in a sunny kitchen"
✅ GOOD: "Hands opening a Pine Hill supplement bottle on a wooden table"
✅ GOOD: "Happy family having breakfast together, warm morning light"

❌ BAD: "Cinematic shot with golden hour lighting, shallow depth of field, 35mm lens"
❌ BAD: "Rule of thirds composition, film grain texture, teal and orange color grading"

Focus on: WHO is doing WHAT, WHERE, with WHAT MOOD
Avoid: Camera jargon, lighting instructions, film terminology, lens specifications`;

export function buildHealthScriptContext(
  description: string,
  productType?: string,
  platform: string = 'youtube'
): string {
  const detectedType = productType || detectProductType(description);
  const knowledge = getProductKnowledge(detectedType);
  const statistics = getRelevantStatistics(description, 3);
  const safeClaims = knowledge.commonClaims;
  
  return `
## PRODUCT CONTEXT
Product Category: ${knowledge.category}
Target Audience: ${knowledge.targetAudience}
Key Benefits: ${knowledge.primaryBenefits.join(', ')}
Key Ingredients: ${knowledge.keyIngredients.join(', ')}

## AVAILABLE STATISTICS (use if relevant)
${statistics.length > 0 
  ? statistics.map(s => `- ${s.statistic} (${s.source}, ${s.year})`).join('\n')
  : '- 57% of U.S. adults use dietary supplements (CRN Consumer Survey, 2023)'}

## SAFE CLAIMS FOR THIS PRODUCT
${safeClaims.map(c => `- "${c}"`).join('\n')}

## CLAIMS TO AVOID
${knowledge.avoidClaims.map(c => `- "${c}"`).join('\n')}

## PLATFORM: ${platform.toUpperCase()}
${platform === 'tiktok' || platform === 'reels' ? 'Keep fast-paced, hook in first 1-2 seconds, vertical format mindset, trendy and relatable tone' : ''}
${platform === 'youtube' ? 'Can be more detailed, horizontal format, allow for story development, professional but warm' : ''}
${platform === 'facebook' ? 'Community-focused, shareable content, appeal to family values' : ''}
`;
}
