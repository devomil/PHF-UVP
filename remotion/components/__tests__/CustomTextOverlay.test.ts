import { describe, expect, it } from 'vitest';
import { TEXT_OVERLAY_WRAP_STYLE } from '../overlay-utils';

describe('CustomTextOverlay wrap policy', () => {
  it('exposes the exact CSS wrap policy expected by the renderer (snapshot)', () => {
    // Locked snapshot. If any of these properties change, long brand URLs
    // can start splitting mid-word in lower-thirds.
    expect(TEXT_OVERLAY_WRAP_STYLE).toMatchInlineSnapshot(`
      {
        "hyphens": "manual",
        "overflowWrap": "normal",
        "whiteSpace": "pre-wrap",
        "wordBreak": "keep-all",
      }
    `);
  });

  it('keeps a compound brand URL as a single unbreakable token under the policy', () => {
    // The browser word-breaking algorithm cannot be invoked from a node test,
    // but we can assert the contract that prevents the regression:
    //   - wordBreak: 'keep-all' → no breaks within Latin words (incl. periods inside URLs)
    //   - overflowWrap: 'normal' → never break long words to fit the container
    //   - hyphens: 'manual'      → no automatic hyphenation across long tokens
    //   - whiteSpace: 'pre-wrap' → only break at user-authored whitespace
    // Together these are the four properties that make a compound brand URL
    // render as one atomic unit at typical lower-third widths.
    expect(TEXT_OVERLAY_WRAP_STYLE.wordBreak).toBe('keep-all');
    expect(TEXT_OVERLAY_WRAP_STYLE.overflowWrap).toBe('normal');
    expect(TEXT_OVERLAY_WRAP_STYLE.hyphens).toBe('manual');
    expect(TEXT_OVERLAY_WRAP_STYLE.whiteSpace).toBe('pre-wrap');

    // Sanity: the example URL contains the period that historically tempted
    // browsers to break the line — guard against the test losing its target.
    const brandUrl = 'yourbusiness.com';
    expect(brandUrl).toMatch(/\./);
    expect(brandUrl.split(/\s+/).length).toBe(1);
  });
});
