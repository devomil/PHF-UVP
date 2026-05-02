// Task #129: integration coverage for the style → default-duration seed.
//
// The unit test in `shared/__tests__/scene-defaults.test.ts` covers the
// pure helper (`getDefaultDurationForStyle`). This test exercises the
// REAL `universalVideoService.parseScript` path end-to-end with the LLM
// stubbed out, so it locks in:
//
//   1. when the LLM omits per-scene `duration` and the project visual
//      style is "hero", every parsed scene comes out at duration=12;
//   2. when the visual style is the legacy "professional" id (not in the
//      style→duration map), scenes fall back to the canonical
//      SCENE_DEFAULT_DURATION_FALLBACK (=8);
//   3. when the LLM DOES supply a `duration`, it's preserved verbatim
//      and is NOT overwritten by the style-based default.
//
// We mock only the LLM client and the brand/role context fetchers
// (which would otherwise hit the DB and the brand JSON files). The
// production code path under test — `scriptParserService.parseResponse`
// inside `parseScript`, then `universalVideoService.createSceneFromRaw`
// — is the unmocked code that ships.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createChatCompletionMock } = vi.hoisted(() => ({
  createChatCompletionMock: vi.fn(),
}));

vi.mock('../piapi-llm-client', () => ({
  llmClient: {
    isAvailable: () => true,
    createChatCompletion: createChatCompletionMock,
  },
}));

vi.mock('../brand-context-service', () => ({
  brandContextService: {
    getScriptParsingContext: async () => '',
    getAestheticOnlyContext: async () => '',
    matchScriptToServices: async () => ({
      services: [],
      products: [],
      conditions: [],
    }),
  },
}));

vi.mock('../project-instructions-service', () => ({
  projectInstructionsService: {
    getCondensedRoleContext: async () => '',
    getRoleContext: async () => '',
  },
}));

vi.mock('../brand-settings-service', () => ({
  getBrandContext: async () => ({
    brandName: '',
    tagline: '',
    website: '',
    primaryColor: '#000',
    secondaryColor: '#000',
    accentColor: '#000',
    logoUrl: null,
    guidelines: '',
  }),
  getBrandNameOrDefault: () => 'the brand',
}));

import { universalVideoService } from '../universal-video-service';
import type { ScriptVideoInput } from '../../../shared/video-types';

function llmJsonForScenes(scenes: Array<Record<string, any>>): string {
  return JSON.stringify({
    scenes,
    summary: {
      totalDuration: scenes.reduce((sum, s) => sum + (s.duration ?? 0), 0),
      sceneCount: scenes.length,
      primaryService: null,
      targetConditions: [],
      brandAlignment: 'ok',
    },
  });
}

function mockLlmReply(scenes: Array<Record<string, any>>): void {
  createChatCompletionMock.mockResolvedValueOnce({
    text: llmJsonForScenes(scenes),
    provider: 'anthropic' as const,
    model: 'test-model',
  });
}

function input(style: string): ScriptVideoInput {
  return {
    script: 'A short test script that the stubbed LLM will pretend to parse.',
    style,
    platform: 'youtube',
  } as ScriptVideoInput;
}

describe('universalVideoService.parseScript — style-based default duration (Task #129)', () => {
  beforeEach(() => {
    createChatCompletionMock.mockReset();
  });

  it('seeds every scene with duration=12 when style=hero and the LLM omits duration', async () => {
    mockLlmReply([
      { id: 'scene-1', type: 'hook', narration: 'Open on a wide shot.', visualDirection: 'cinematic landscape' },
      { id: 'scene-2', type: 'benefit', narration: 'Show the payoff.', visualDirection: 'product hero shot' },
      { id: 'scene-3', type: 'cta', narration: 'Visit the website.', visualDirection: 'branded end card' },
    ]);

    const scenes = await universalVideoService.parseScript(input('hero'));

    expect(scenes).toHaveLength(3);
    for (const scene of scenes) {
      expect(scene.duration).toBe(12);
    }
  });

  it('falls back to 8 for the legacy "professional" style (not in the style map)', async () => {
    mockLlmReply([
      { id: 'scene-1', type: 'hook', narration: 'Hello there.', visualDirection: 'office interior' },
      { id: 'scene-2', type: 'cta', narration: 'Learn more today.', visualDirection: 'logo lockup' },
    ]);

    const scenes = await universalVideoService.parseScript(input('professional'));

    expect(scenes).toHaveLength(2);
    for (const scene of scenes) {
      expect(scene.duration).toBe(8);
    }
  });

  it('preserves LLM-supplied durations verbatim instead of overwriting them with the style default', async () => {
    mockLlmReply([
      { id: 'scene-1', type: 'hook', narration: 'Punchy hook.', visualDirection: 'fast cut', duration: 4 },
      { id: 'scene-2', type: 'benefit', narration: 'Slow it down.', visualDirection: 'lingering shot', duration: 15 },
      { id: 'scene-3', type: 'cta', narration: 'Subscribe.', visualDirection: 'end frame', duration: 6 },
    ]);

    const scenes = await universalVideoService.parseScript(input('hero'));

    expect(scenes).toHaveLength(3);
    expect(scenes[0].duration).toBe(4);
    expect(scenes[1].duration).toBe(15);
    expect(scenes[2].duration).toBe(6);
  });
});
