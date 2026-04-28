import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NanoBanana2Service } from '../nano-banana2.service';

// Task #107: After verifying PiAPI's `nano-banana-2` task accepts
// `input.enable_web_search`, we forward the policy decision into the request
// payload. These tests pin the wire format so a future refactor can't quietly
// drop the field.

describe('NanoBanana2Service: enable_web_search wire format', () => {
  const fetchMock = vi.fn();
  const realSetTimeout = globalThis.setTimeout;
  let svc: NanoBanana2Service;

  beforeEach(() => {
    vi.stubEnv('PIAPI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
    svc = new NanoBanana2Service();

    // Default: task creation succeeds, then every poll returns "completed".
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { task_id: 't-1' } }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            status: 'completed',
            output: { image_urls: ['https://cdn.test/out.png'] },
          },
        }),
      });

    // Collapse the 3s poll delay to ~0ms by replacing the captured real
    // setTimeout with a 0ms delegate. Keeps native typing intact, no casts.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, _ms, ...args) =>
      realSetTimeout(fn, 0, ...args),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes enable_web_search:true in the input payload when explicitly enabled', async () => {
    await svc.generateImage({
      prompt: 'A street scene in Tokyo at night',
      aspectRatio: '16:9',
      enableWebSearch: true,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.task_type).toBe('nano-banana-2');
    expect(body.input.enable_web_search).toBe(true);
  });

  it('includes enable_web_search:false in the input payload when explicitly disabled', async () => {
    await svc.generateImage({
      prompt: 'Abstract studio product shot',
      aspectRatio: '1:1',
      enableWebSearch: false,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.input.enable_web_search).toBe(false);
  });

  it('omits enable_web_search when not specified (PiAPI default applies)', async () => {
    await svc.generateImage({
      prompt: 'Generic image',
      aspectRatio: '16:9',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.input).not.toHaveProperty('enable_web_search');
  });
});
