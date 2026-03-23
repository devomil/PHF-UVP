import fs from 'fs';
import path from 'path';
import { llmClient, type LLMMessageContent } from './piapi-llm-client';

export interface ProductContext {
  productName: string;
  category: string;
  keyFeatures: string[];
  brandTone: string;
  colorPalette: string[];
  targetDemographic: string;
  visualDescription: string;
}

export async function analyzeProductImage(
  imageUrl: string,
  brief: string
): Promise<ProductContext> {
  const uploadsDir = path.resolve('uploads');
  const localPath = imageUrl.startsWith('/uploads/')
    ? path.resolve(imageUrl.replace(/^\//, ''))
    : null;

  if (!localPath || !localPath.startsWith(uploadsDir + path.sep) || !fs.existsSync(localPath)) {
    console.warn(`[ProductAnalysis] Image file not accessible: ${imageUrl}`);
    return buildFallbackContext(brief);
  }

  const buffer = fs.readFileSync(localPath);
  const base64Data = buffer.toString('base64');

  const ext = path.extname(localPath).toLowerCase();
  const mediaTypeMap: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mediaType = mediaTypeMap[ext] || 'image/jpeg';

  const content: LLMMessageContent[] = [
    {
      type: 'image',
      mediaType,
      base64Data,
    },
    {
      type: 'text',
      text: `Analyze this product/brand image. The user's brief is: "${brief || 'No brief provided'}"

Return a JSON object with these fields:
- productName: The product name visible or inferred (string)
- category: Product category like "skincare", "food", "tech", etc. (string)
- keyFeatures: Up to 5 key visible features, ingredients, or selling points (string array)
- brandTone: The brand's visual tone - e.g. "premium", "playful", "clinical", "natural" (string)
- colorPalette: Up to 5 dominant colors visible in hex format (string array)
- targetDemographic: Who this product seems designed for (string)
- visualDescription: A concise 2-sentence description of what's visible in the image (string)

Return ONLY valid JSON, no markdown fences or extra text.`,
    },
  ];

  const result = await llmClient.createChatCompletion({
    systemPrompt: 'You are a product analysis expert. Analyze images and extract structured product information. Return only valid JSON.',
    messages: [{ role: 'user', content }],
    maxTokens: 1500,
    temperature: 0.2,
  });

  try {
    const cleaned = result.text.replace(/```json\s*|\s*```/g, '').trim();
    const raw = JSON.parse(cleaned);
    const parsed: ProductContext = {
      productName: typeof raw.productName === 'string' ? raw.productName : 'Product',
      category: typeof raw.category === 'string' ? raw.category : 'general',
      keyFeatures: Array.isArray(raw.keyFeatures) ? raw.keyFeatures.filter((f: any) => typeof f === 'string') : [],
      brandTone: typeof raw.brandTone === 'string' ? raw.brandTone : 'professional',
      colorPalette: Array.isArray(raw.colorPalette) ? raw.colorPalette.filter((c: any) => typeof c === 'string') : [],
      targetDemographic: typeof raw.targetDemographic === 'string' ? raw.targetDemographic : '',
      visualDescription: typeof raw.visualDescription === 'string' ? raw.visualDescription : '',
    };
    console.log(`[ProductAnalysis] Analyzed product: ${parsed.productName} (${parsed.category})`);
    return parsed;
  } catch (err: any) {
    console.error('[ProductAnalysis] Failed to parse LLM response:', err.message);
    return buildFallbackContext(brief);
  }
}

function buildFallbackContext(brief: string): ProductContext {
  return {
    productName: 'Product',
    category: 'general',
    keyFeatures: [],
    brandTone: 'professional',
    colorPalette: [],
    targetDemographic: '',
    visualDescription: brief || '',
  };
}
