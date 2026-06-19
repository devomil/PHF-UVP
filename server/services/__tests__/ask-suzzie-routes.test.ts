import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Prevent the DB module from throwing at load time when DATABASE_URL is unset.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

// ---------------------------------------------------------------------------
// DB mock — ask-suzzie does not touch the database directly, but
// universal-video-routes imports it at the top level.
// ---------------------------------------------------------------------------
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
  },
  pool: {},
}));

// ---------------------------------------------------------------------------
// Auth middleware — spoofs req.user via x-test-user header so we can test
// both authenticated and unauthenticated paths without a real session.
// ---------------------------------------------------------------------------
vi.mock('../../auth', () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ success: false, error: 'Not authenticated' });
    req.user = { id };
    return next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  isAdmin: (_req: any, _res: any, next: any) => next(),
}));

// ---------------------------------------------------------------------------
// LLM client mock — controlled per-test via the `mockLlmText` variable.
// `createChatCompletionMock` is a vi.fn() spy so tests can assert call counts.
// ---------------------------------------------------------------------------
let mockLlmText = '';
let mockLlmAvailable = true;

// vi.hoisted ensures the spy reference is available inside vi.mock factories,
// which are hoisted to the top of the file before other module-level code runs.
const createChatCompletionMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/piapi-llm-client', () => ({
  llmClient: {
    isAvailable: () => mockLlmAvailable,
    createChatCompletion: createChatCompletionMock,
  },
}));

// ---------------------------------------------------------------------------
// Suzzie knowledge-base — pure builders, no network access needed.
// ---------------------------------------------------------------------------
vi.mock('../../services/suzzie-knowledge-base', () => ({
  buildSuzzieSystemPrompt: () => 'SYSTEM_PROMPT',
  buildAssetLibrarySuzziePrompt: () => 'ASSET_LIBRARY_SYSTEM_PROMPT',
}));

// ---------------------------------------------------------------------------
// Credits service — just return a plausible provider list.
// ---------------------------------------------------------------------------
vi.mock('../../services/credits-service', () => ({
  getAvailableProviderIdsForUser: async () => ['kling', 'runway', 'luma'],
  consumeCredits: async () => {},
  getAvailableCredits: async () => ({ currentGC: 1000, unlimited: false }),
  canAfford: async () => true,
}));

// ---------------------------------------------------------------------------
// Brand-context service — used by the default (non-assistant) ask-suzzie mode.
// ---------------------------------------------------------------------------
vi.mock('../../services/brand-context-service', () => ({
  brandContextService: {
    getVisualDirectionGenerationContext: async () => '',
  },
}));

// ---------------------------------------------------------------------------
// Heavy services statically imported by universal-video-routes that are not
// exercised by the ask-suzzie handlers.  Stub them out to keep import fast.
// ---------------------------------------------------------------------------
vi.mock('../../services/universal-video-service', () => ({ universalVideoService: {} }));
vi.mock('../../services/remotion-lambda-service', () => ({ remotionLambdaService: {} }));
vi.mock('../../services/chunked-render-service', () => ({
  chunkedRenderService: {},
  MAX_CHUNK_DURATION_SEC: 30,
  CHUNK_THRESHOLD_SEC: 60,
}));
vi.mock('../../services/quality-evaluation-service', () => ({ qualityEvaluationService: {} }));
vi.mock('../../services/scene-analysis-service', () => ({ sceneAnalysisService: {} }));
vi.mock('../../services/scene-regeneration-service', () => ({ sceneRegenerationService: {} }));
vi.mock('../../services/auto-regeneration-service', () => ({ autoRegenerationService: {} }));
vi.mock('../../services/intelligent-regeneration-service', () => ({
  intelligentRegenerationService: {},
}));
vi.mock('../../services/intelligent-prompt-improver', () => ({ intelligentPromptImprover: {} }));
vi.mock('../../services/regeneration-strategy-engine', () => ({ regenerationStrategyEngine: {} }));
vi.mock('../../services/prompt-complexity-analyzer', () => ({ promptComplexityAnalyzer: {} }));
vi.mock('../../services/sound-design-service', () => ({ soundDesignService: {} }));
vi.mock('../../services/script-pipeline-service', () => ({ runScriptPipeline: async () => ({}) }));
vi.mock('../../services/image-generation-service', () => ({ imageGenerationService: {} }));
vi.mock('../../services/image-composition-service', () => ({ imageCompositionService: {} }));
vi.mock('../../services/image-to-video-service', () => ({ imageToVideoService: {} }));
vi.mock('../../services/piapi-video-service', () => ({ piapiVideoService: {} }));
vi.mock('../../services/cinematic-flow-service', () => ({
  runCinematicFlow: async () => ({}),
  getCinematicFlowStatus: () => ({}),
  cancelCinematicFlow: () => {},
}));
vi.mock('../../services/text-overlay-detector', () => ({ textOverlayDetector: {} }));
vi.mock('../../services/text-placement-service', () => ({ textPlacementService: {} }));
vi.mock('../../services/asset-url-resolver', () => ({ assetUrlResolver: {} }));
vi.mock('../../services/s3-render-asset-service', () => ({ s3RenderAssetService: {} }));
vi.mock('../../services/video-frame-extractor', () => ({ videoFrameExtractor: {} }));
vi.mock('../../services/logo-composition-service', () => ({ logoCompositionService: {} }));
vi.mock('../../services/logo-asset-selector', () => ({ logoAssetSelector: {} }));
vi.mock('../../services/logo-placement-calculator', () => ({ logoPlacementCalculator: {} }));
vi.mock('../../services/brand-workflow-orchestrator', () => ({ brandWorkflowOrchestrator: {} }));
vi.mock('../../services/brand-workflow-router', () => ({ brandWorkflowRouter: {} }));
vi.mock('../../services/media-source-selector', () => ({ selectMediaSource: async () => ({}) }));
vi.mock('../../services/overlay-configuration-service', () => ({ overlayConfigurationService: {} }));
vi.mock('../../services/motion-style-detector', () => ({ motionStyleDetector: {} }));
vi.mock('../../services/brand-settings-service', () => ({ getBrandContext: async () => ({}) }));
vi.mock('../../services/composition-request-builder', () => ({ compositionRequestBuilder: {} }));
vi.mock('../../services/video-provider-selector', () => ({
  videoProviderSelector: {},
  SceneForSelection: {},
}));
vi.mock('../../services/image-provider-selector', () => ({ imageProviderSelector: {} }));
vi.mock('../../services/motion-graphics-router', () => ({ motionGraphicsRouter: {} }));
vi.mock('../../services/motion-graphics-generator', () => ({ motionGraphicsGenerator: {} }));
vi.mock('../../services/transition-service', () => ({ transitionService: {} }));
vi.mock('../../services/i2v-provider-capabilities', () => ({
  selectI2VProvider: () => null,
  I2V_PROVIDER_CAPABILITIES: {},
  getAllI2VProviders: () => [],
}));
vi.mock('../../services/scene-classifier-routes', () => ({
  registerSceneClassifierRoutes: () => {},
}));
vi.mock('../../objectStorage', () => ({
  ObjectStorageService: class {
    normalizeObjectEntityPath() { return ''; }
    trySetObjectEntityAclPolicy() { return Promise.resolve(); }
  },
  objectStorageClient: {},
}));

// ---------------------------------------------------------------------------
// Now safe to load the router under test.
// ---------------------------------------------------------------------------
const { default: universalVideoRouter } = await import('../universal-video-routes');

function makeApp() {
  const app = express();
  // Use a generous body limit so oversized-image validation tests can send large
  // payloads and have them reach the route handler (rather than being rejected
  // by Express's body-parser before our code runs).
  app.use(express.json({ limit: '25mb' }));
  app.use('/api/universal-video', universalVideoRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an LLM response text that embeds a JSON block Suzzie will parse. */
function makeLlmResponseWithProvider(provider: string, rationale: string, prompt?: string): string {
  const block = {
    suggestedProvider: provider,
    suggestedProviderRationale: rationale,
    ...(prompt ? { suggestedPrompt: prompt } : {}),
  };
  return `Here is my recommendation for your scene.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n\nFeel free to adjust the prompt as needed.`;
}

/** Build an LLM response that includes a suggestedArtStyle block. */
function makeLlmResponseWithArtStyle(
  artStyleId: string,
  artStyleName: string,
  provider?: string,
  rationale?: string,
): string {
  const block: Record<string, unknown> = {
    suggestedArtStyle: { id: artStyleId, name: artStyleName },
    ...(provider ? { suggestedProvider: provider } : {}),
    ...(rationale ? { suggestedProviderRationale: rationale } : {}),
  };
  return `Here is my art style recommendation.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n\nLet me know if you need further adjustments.`;
}

// ---------------------------------------------------------------------------
// Tests — POST /api/universal-video/ask-suzzie  (assistant mode)
// ---------------------------------------------------------------------------
describe('POST /api/universal-video/ask-suzzie (assistant mode)', () => {
  beforeEach(() => {
    mockLlmAvailable = true;
    mockLlmText = makeLlmResponseWithProvider(
      'kling',
      'Kling excels at cinematic motion with smooth camera moves.',
      'A product floating in soft golden light with gentle bokeh.',
    );
    // Wire the spy implementation so it captures the current mockLlmText at
    // call time, and reset call history so each test starts clean.
    createChatCompletionMock.mockClear();
    createChatCompletionMock.mockImplementation(async () => ({
      text: mockLlmText,
      provider: 'anthropic',
      model: 'claude-test',
    }));
  });

  it('returns 401 when no session user is provided', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .send({ mode: 'assistant', question: 'Which provider should I use?' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when question is missing in assistant mode', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({ mode: 'assistant' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 when the LLM service is not configured', async () => {
    mockLlmAvailable = false;

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({ mode: 'assistant', question: 'Which provider?' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('surfaces suggestedProvider and suggestedProviderRationale in the JSON response', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({
        mode: 'assistant',
        question: 'Which provider should I use for a product showcase video?',
        sceneType: 'product',
        artPresetName: 'Cinematic',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBe('kling');
    expect(res.body.suggestedProviderRationale).toBe(
      'Kling excels at cinematic motion with smooth camera moves.',
    );
    expect(res.body.suggestedPrompt).toBe(
      'A product floating in soft golden light with gentle bokeh.',
    );
    expect(res.body.message).toBeTruthy();
  });

  it('omits suggestedProvider when the LLM response contains no JSON block', async () => {
    mockLlmText = 'I recommend Kling for this scene, it handles motion well.';

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({ mode: 'assistant', question: 'Any suggestions?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBeUndefined();
    expect(res.body.suggestedProviderRationale).toBeUndefined();
    expect(res.body.message).toBeTruthy();
  });

  it('passes conversation history to the LLM when provided', async () => {
    mockLlmText = makeLlmResponseWithProvider('runway', 'Runway handles complex motion well.');

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({
        mode: 'assistant',
        question: 'What about for a lifestyle video?',
        conversationHistory: [
          { role: 'user', content: 'I need help picking a provider.' },
          { role: 'assistant', content: 'Sure, what kind of video are you making?' },
          { role: 'user', content: 'What about for a lifestyle video?' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBe('runway');
    expect(res.body.suggestedProviderRationale).toBe('Runway handles complex motion well.');
  });

  it('returns 400 when imageAttachment has an unsupported media type', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({
        mode: 'assistant',
        question: 'What do you think of this image?',
        imageAttachment: {
          mediaType: 'image/gif',
          base64: 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/unsupported image format/i);
    expect(createChatCompletionMock).not.toHaveBeenCalled();
  });

  it('returns 413 when imageAttachment base64 decodes to more than 10 MB', async () => {
    // Need decoded byte length > 10 MB (10 * 1024 * 1024 = 10_485_760 bytes).
    // estimatedBytes = Math.ceil(base64Len * 0.75), so base64Len must exceed ~13_981_014.
    // 'A' is a valid base64 character and passes the first-200-chars sanity regex.
    const oversizedBase64 = 'A'.repeat(14_000_000);

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({
        mode: 'assistant',
        question: 'Can you analyse this large image?',
        imageAttachment: {
          mediaType: 'image/jpeg',
          base64: oversizedBase64,
        },
      });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/image too large/i);
    expect(createChatCompletionMock).not.toHaveBeenCalled();
  });

  it('surfaces suggestedArtStyle with id and name when the LLM emits it', async () => {
    mockLlmText = makeLlmResponseWithArtStyle(
      'cinematic-noir',
      'Cinematic Noir',
      'kling',
      'Kling pairs well with high-contrast noir visuals.',
    );

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({
        mode: 'assistant',
        question: 'What art style should I use for a dark thriller scene?',
        sceneType: 'dramatic',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedArtStyle).toBeDefined();
    expect(res.body.suggestedArtStyle.id).toBe('cinematic-noir');
    expect(res.body.suggestedArtStyle.name).toBe('Cinematic Noir');
    expect(res.body.suggestedProvider).toBe('kling');
  });

  it('omits suggestedArtStyle when the LLM JSON block does not include it', async () => {
    mockLlmText = makeLlmResponseWithProvider('luma', 'Luma is great for dreamy visuals.');

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie')
      .set('x-test-user', 'user-1')
      .send({ mode: 'assistant', question: 'Any provider suggestions?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedArtStyle).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — POST /api/universal-video/ask-suzzie/asset-library
// ---------------------------------------------------------------------------
describe('POST /api/universal-video/ask-suzzie/asset-library', () => {
  beforeEach(() => {
    mockLlmAvailable = true;
    mockLlmText = makeLlmResponseWithProvider(
      'luma',
      'Luma Dream Machine is great for high-quality photorealistic imagery.',
      'Vibrant close-up product shot on a marble surface with natural light.',
    );
    createChatCompletionMock.mockClear();
    createChatCompletionMock.mockImplementation(async () => ({
      text: mockLlmText,
      provider: 'anthropic',
      model: 'claude-test',
    }));
  });

  it('returns 401 when no session user is provided', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .send({ message: 'Which provider for a product photo?' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 500 when the LLM service is not configured', async () => {
    mockLlmAvailable = false;

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({ message: 'Help with provider selection.' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('surfaces suggestedProvider and suggestedProviderRationale in the JSON response', async () => {
    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({
        message: 'Which provider should I use for a product image?',
        context: { mode: 't2i', provider: 'recraft' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBe('luma');
    expect(res.body.suggestedProviderRationale).toBe(
      'Luma Dream Machine is great for high-quality photorealistic imagery.',
    );
    expect(res.body.suggestedPrompt).toBe(
      'Vibrant close-up product shot on a marble surface with natural light.',
    );
    expect(res.body.message).toBeTruthy();
  });

  it('omits suggestedProvider when the LLM returns plain text with no JSON block', async () => {
    mockLlmText = 'For product photography, I suggest using Recraft for text accuracy.';

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({ message: 'Any provider suggestions?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBeUndefined();
    expect(res.body.suggestedProviderRationale).toBeUndefined();
    expect(res.body.message).toBeTruthy();
  });

  it('includes optional fields (negativePrompt, cfgScale) when the LLM emits them', async () => {
    mockLlmText =
      'Here is a detailed recommendation.\n\n```json\n' +
      JSON.stringify({
        suggestedProvider: 'recraft',
        suggestedProviderRationale: 'Recraft is best for product text overlays.',
        suggestedPrompt: 'Clean product shot with bold label',
        suggestedNegativePrompt: 'blurry, low quality',
        suggestedCfgScale: 0.7,
      }) +
      '\n```';

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({ message: 'Product label photo tips?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBe('recraft');
    expect(res.body.suggestedProviderRationale).toBe('Recraft is best for product text overlays.');
    expect(res.body.suggestedNegativePrompt).toBe('blurry, low quality');
    expect(res.body.suggestedCfgScale).toBe(0.7);
  });

  it('passes conversation history to the LLM when provided', async () => {
    mockLlmText = makeLlmResponseWithProvider('runway', 'Runway is ideal for high-quality video.');

    const res = await request(makeApp())
      .post('/api/universal-video/ask-suzzie/asset-library')
      .set('x-test-user', 'user-1')
      .send({
        message: 'I want something cinematic.',
        conversationHistory: [
          { role: 'user', content: 'Which providers are best for video?' },
          { role: 'assistant', content: 'It depends on the style you want.' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestedProvider).toBe('runway');
  });
});
