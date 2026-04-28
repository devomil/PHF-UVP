import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLAUDE_VISION_QA_MODEL, parseScoreResponse } from '../claude-vision-qa.service';

// Mocked Anthropic transport — captures the request that scoreImage builds
// and lets each test return its own canned response. The mock is hoisted so
// the SUT picks it up via dynamic import below.
const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: messagesCreateMock };
    },
  };
});

describe('CLAUDE_VISION_QA_MODEL', () => {
  it('is pinned to Haiku 4.5 (2025-10-01)', () => {
    expect(CLAUDE_VISION_QA_MODEL).toBe('claude-haiku-4-5-20251001');
  });
});

describe('parseScoreResponse', () => {
  it('parses well-formed JSON with score + reason', () => {
    const r = parseScoreResponse('{"score": 0.82, "reason": "good composition"}');
    expect(r.score).toBeCloseTo(0.82, 5);
    expect(r.reason).toBe('good composition');
  });

  it('extracts a JSON object embedded in surrounding prose', () => {
    const r = parseScoreResponse('Sure! Here is my response: {"score": 0.4, "reason": "off-brand"} Done.');
    expect(r.score).toBeCloseTo(0.4, 5);
    expect(r.reason).toBe('off-brand');
  });

  it('clamps scores above 1 down to 1', () => {
    const r = parseScoreResponse('{"score": 1.4}');
    expect(r.score).toBe(1);
  });

  it('clamps negative scores up to 0', () => {
    const r = parseScoreResponse('{"score": -0.3}');
    expect(r.score).toBe(0);
  });

  it('normalizes 0..100 inputs when given as a bare number', () => {
    const r = parseScoreResponse('72');
    expect(r.score).toBeCloseTo(0.72, 5);
  });

  it('falls back to neutral 0.5 on completely unparseable input', () => {
    expect(parseScoreResponse('').score).toBe(0.5);
    expect(parseScoreResponse('I cannot rate this image.').score).toBe(0.5);
    expect(parseScoreResponse('{not valid json at all').score).toBe(0.5);
  });

  it('truncates excessively long reasons to 160 chars', () => {
    const long = 'x'.repeat(500);
    const r = parseScoreResponse(`{"score": 0.5, "reason": "${long}"}`);
    expect(r.reason).toBeDefined();
    expect(r.reason!.length).toBeLessThanOrEqual(160);
  });
});

describe('scoreImage / scoreImages — mocked Anthropic transport', () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('calls Anthropic with the pinned Haiku model and returns the parsed score', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"score": 0.84, "reason": "great match"}' }],
    });
    const { scoreImage } = await import('../claude-vision-qa.service');

    const r = await scoreImage('https://cdn/test.png', { prompt: 'a sunset', sceneLabel: 's1' });

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const callArg = messagesCreateMock.mock.calls[0][0];
    expect(callArg.model).toBe(CLAUDE_VISION_QA_MODEL);
    // Confirm the image URL and prompt were passed in the user content blocks.
    const blocks = callArg.messages[0].content;
    expect(blocks.find((b: any) => b.type === 'image')?.source?.url).toBe('https://cdn/test.png');
    expect(blocks.find((b: any) => b.type === 'text')?.text).toContain('a sunset');
    expect(r).toEqual({ url: 'https://cdn/test.png', score: 0.84, reason: 'great match' });
  });

  it('returns a neutral 0.5 with reason "qa-error" when the SDK call rejects', async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error('429 rate limit'));
    const { scoreImage } = await import('../claude-vision-qa.service');

    const r = await scoreImage('https://cdn/x.png', { prompt: 'p', sceneLabel: 's' });
    expect(r.score).toBe(0.5);
    expect(r.reason).toBe('qa-error');
  });

  it('returns "qa-disabled" when no API key is configured (skips the SDK entirely)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Reload the module so the cached client is re-evaluated against the
    // missing key.
    vi.resetModules();
    const { scoreImage } = await import('../claude-vision-qa.service');
    const r = await scoreImage('https://cdn/x.png', { prompt: 'p' });
    expect(r.score).toBe(0.5);
    expect(r.reason).toBe('qa-disabled');
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('scoreImages fans out one SDK call per image URL', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.resetModules();
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.7}' }],
    });
    const { scoreImages } = await import('../claude-vision-qa.service');

    const results = await scoreImages(
      ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'],
      { prompt: 'p' }
    );
    expect(results).toHaveLength(3);
    expect(messagesCreateMock).toHaveBeenCalledTimes(3);
    for (const r of results) expect(r.score).toBeCloseTo(0.7, 5);
  });
});
