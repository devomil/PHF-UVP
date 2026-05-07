// Phase 24A (Task #175): unit tests for the title-card render handler.
// Mocks the Remotion Lambda renderer + the ai_video fallback handler so
// we exercise the handler's branching without hitting AWS.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  RenderHandlerContext,
  RenderHandlerResult,
  RenderOptions,
} from '../types';

const { renderVideoMock, aiVideoRenderMock } = vi.hoisted(() => ({
  renderVideoMock: vi.fn(),
  aiVideoRenderMock: vi.fn(),
}));

vi.mock('../../remotion-lambda-service', () => ({
  remotionLambdaService: {
    renderVideo: renderVideoMock,
  },
}));

vi.mock('../ai-video.handler', () => ({
  aiVideoHandler: {
    type: 'ai_video' as const,
    render: aiVideoRenderMock,
  },
}));

import {
  titleCardHandler,
  extractTitleAndSubtitle,
} from '../title-card.handler';

const baseOptions: RenderOptions = {
  prompt: 'Animated chapter title',
  duration: 5,
  aspectRatio: '16:9',
  sceneType: 'intro',
};

const baseCtx: RenderHandlerContext = {
  projectId: 'proj-1',
  sceneId: 'scene-1',
  jobId: 'job-1',
  scene: {
    id: 'scene-1',
    narration: 'Chapter One: The Beginning. A founder’s journey starts here.',
    brandPrimaryColor: '#0b1c3d',
    brandSecondaryColor: '#7b3aed',
    brandTextColor: '#fefefe',
    brandHeadingFont: 'Poppins',
    brandLogoUrl: 'https://cdn.example.com/logo.png',
  },
};

beforeEach(() => {
  renderVideoMock.mockReset();
  aiVideoRenderMock.mockReset();
  process.env.REMOTION_AWS_ACCESS_KEY_ID = 'test-key';
  process.env.REMOTION_AWS_SECRET_ACCESS_KEY = 'test-secret';
});

describe('extractTitleAndSubtitle', () => {
  it('splits on the first sentence terminator', () => {
    const r = extractTitleAndSubtitle('Welcome aboard! This is your day one.');
    expect(r.title).toBe('Welcome aboard');
    expect(r.subtitle).toBe('This is your day one.');
  });

  it('returns just a title when there is no second sentence', () => {
    const r = extractTitleAndSubtitle('Episode Five');
    expect(r.title).toBe('Episode Five');
    expect(r.subtitle).toBeUndefined();
  });

  it('truncates over-long titles to the last word boundary with an ellipsis', () => {
    const long = 'a'.repeat(120);
    const r = extractTitleAndSubtitle(long);
    expect(r.title.length).toBeLessThanOrEqual(81); // 80 chars + ellipsis
    expect(r.title.endsWith('…')).toBe(true);
  });
});

describe('titleCardHandler.render', () => {
  it('renders the right composition + propagates brand props on the happy path', async () => {
    renderVideoMock.mockResolvedValue('https://s3.example.com/title.mp4');

    const result: RenderHandlerResult = await titleCardHandler.render(
      baseOptions,
      baseCtx,
    );

    expect(renderVideoMock).toHaveBeenCalledTimes(1);
    const call = renderVideoMock.mock.calls[0][0];
    expect(call.compositionId).toBe('TitleCard');
    expect(call.codec).toBe('h264');
    expect(call.inputProps).toMatchObject({
      title: 'Chapter One',
      subtitle: 'The Beginning. A founder’s journey starts here.',
      brandPrimary: '#0b1c3d',
      brandSecondary: '#7b3aed',
      brandText: '#fefefe',
      fontFamily: 'Poppins',
      logoUrl: 'https://cdn.example.com/logo.png',
      durationSeconds: 5,
    });

    expect(aiVideoRenderMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.videoUrl).toBe('https://s3.example.com/title.mp4');
    expect(result.s3Url).toBe('https://s3.example.com/title.mp4');
    expect(result.provider).toBe('remotion-lambda');
    expect(result.resolvedHandler).toBe('title_card');
    expect(result.fallback).toBeUndefined();
  });

  it('picks the vertical composition for 9:16 aspect ratio', async () => {
    renderVideoMock.mockResolvedValue('https://s3.example.com/v.mp4');
    await titleCardHandler.render(
      { ...baseOptions, aspectRatio: '9:16' },
      baseCtx,
    );
    expect(renderVideoMock.mock.calls[0][0].compositionId).toBe(
      'TitleCardVertical',
    );
  });

  it('falls back to ai_video when the Lambda render throws', async () => {
    renderVideoMock.mockRejectedValue(new Error('AWS rate limited'));
    aiVideoRenderMock.mockResolvedValue({
      success: true,
      videoUrl: 'https://s3.example.com/ai.mp4',
      provider: 'kling-2.6',
      resolvedHandler: 'ai_video',
    });

    const result = await titleCardHandler.render(baseOptions, baseCtx);

    expect(renderVideoMock).toHaveBeenCalledTimes(1);
    expect(aiVideoRenderMock).toHaveBeenCalledWith(baseOptions, baseCtx);
    expect(result.success).toBe(true);
    expect(result.videoUrl).toBe('https://s3.example.com/ai.mp4');
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback).toEqual({
      from: 'title_card',
      to: 'ai_video',
      reason: expect.stringContaining('Remotion title-card render failed'),
    });
    expect(result.fallback?.reason).toContain('AWS rate limited');
  });

  it('falls back to ai_video when the scene has no usable text', async () => {
    aiVideoRenderMock.mockResolvedValue({
      success: true,
      videoUrl: 'https://s3.example.com/ai.mp4',
      provider: 'kling-2.6',
      resolvedHandler: 'ai_video',
    });

    const result = await titleCardHandler.render(
      { ...baseOptions, prompt: '' },
      {
        ...baseCtx,
        scene: { id: 'scene-1' },
      },
    );

    expect(renderVideoMock).not.toHaveBeenCalled();
    expect(aiVideoRenderMock).toHaveBeenCalled();
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback?.reason).toContain('requires narration');
  });

  it('reports unavailable + falls back when AWS credentials are missing', async () => {
    delete process.env.REMOTION_AWS_ACCESS_KEY_ID;
    delete process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    aiVideoRenderMock.mockResolvedValue({
      success: true,
      videoUrl: 'https://s3.example.com/ai.mp4',
      provider: 'kling-2.6',
      resolvedHandler: 'ai_video',
    });

    expect(titleCardHandler.isAvailable()).toBe(false);
    const result = await titleCardHandler.render(baseOptions, baseCtx);

    expect(renderVideoMock).not.toHaveBeenCalled();
    expect(result.resolvedHandler).toBe('ai_video');
    expect(result.fallback?.reason).toContain('AWS credentials');
  });
});
