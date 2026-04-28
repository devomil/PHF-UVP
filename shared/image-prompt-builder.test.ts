import { describe, it, expect } from 'vitest';
import { buildSceneImagePrompt, stripMotionWords } from './image-prompt-builder';

describe('stripMotionWords', () => {
  it('removes "the camera slowly pans" phrases', () => {
    const out = stripMotionWords('A serene meadow at sunset, the camera slowly pans across the field of flowers.');
    expect(out).not.toMatch(/camera/i);
    expect(out).not.toMatch(/slowly pans/i);
    expect(out).toContain('serene meadow');
  });

  it('removes "zooms in", "transitions to", and similar phrases', () => {
    expect(stripMotionWords('Hero shot of the bottle, then zooms in on the label.')).not.toMatch(/zoom/i);
    expect(stripMotionWords('Living room transitions to bedroom.')).not.toMatch(/transitions/i);
  });

  it('collapses orphan punctuation and whitespace', () => {
    const out = stripMotionWords('A , product , the camera pans  ,  glowing.');
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).not.toMatch(/^,/);
  });

  it('returns the input unchanged when no motion words are present', () => {
    const input = 'A close-up portrait of an elderly woman smiling.';
    expect(stripMotionWords(input)).toBe(input);
  });
});

describe('buildSceneImagePrompt', () => {
  const preset = {
    imagePromptPrefix: 'cinematic photograph',
    imagePromptSuffix: 'shot on 35mm film, warm color grade',
  };

  it('prefers imagePrompt over visualDirection over narration', () => {
    const out1 = buildSceneImagePrompt({ imagePrompt: 'A', visualDirection: 'B', narration: 'C' });
    expect(out1).toBe('A');

    const out2 = buildSceneImagePrompt({ visualDirection: 'B', narration: 'C' });
    expect(out2).toBe('B');

    const out3 = buildSceneImagePrompt({ narration: 'C' });
    expect(out3).toBe('C');
  });

  it('returns empty string when no source text is available', () => {
    expect(buildSceneImagePrompt({ narration: '' })).toBe('');
    expect(buildSceneImagePrompt({ narration: '   ' })).toBe('');
  });

  it('wraps the stripped text with preset prefix and suffix', () => {
    const out = buildSceneImagePrompt(
      { visualDirection: 'A woman drinks coffee, the camera slowly zooms in on her face.' },
      { preset }
    );
    expect(out.startsWith('cinematic photograph,')).toBe(true);
    expect(out.endsWith('shot on 35mm film, warm color grade')).toBe(true);
    expect(out).not.toMatch(/zoom/i);
    expect(out).not.toMatch(/camera/i);
  });

  it('appends the trailingTag when provided', () => {
    const out = buildSceneImagePrompt(
      { visualDirection: 'A meadow at sunset' },
      { preset, trailingTag: 'ultra detailed' }
    );
    expect(out.endsWith('ultra detailed')).toBe(true);
  });

  it('works with no preset (just stripped base)', () => {
    const out = buildSceneImagePrompt({
      visualDirection: 'Hero shot, the camera tilts up to reveal the skyline.',
    });
    expect(out).not.toMatch(/camera/i);
    expect(out).not.toMatch(/tilts up/i);
    expect(out).toContain('Hero shot');
  });
});
