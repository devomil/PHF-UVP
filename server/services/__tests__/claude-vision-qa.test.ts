import { describe, it, expect } from 'vitest';
import { CLAUDE_VISION_QA_MODEL, parseScoreResponse } from '../claude-vision-qa.service';

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
