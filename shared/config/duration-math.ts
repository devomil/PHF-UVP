interface TransitionLike {
  type: string;
  duration: number;
}

interface SceneLike {
  duration?: number;
}

export function calculateEffectiveDuration(
  scenes: SceneLike[],
  transitions?: TransitionLike[],
  defaultSceneDuration = 5
): number {
  if (!scenes || scenes.length === 0) return 0;

  const totalSceneDuration = scenes.reduce(
    (acc, scene) => acc + (scene.duration || defaultSceneDuration),
    0
  );

  if (!transitions || transitions.length === 0) return totalSceneDuration;

  const noOverlapTypes = new Set(['none', 'cut']);

  let transitionOverlap = 0;
  for (let i = 0; i < Math.min(transitions.length, scenes.length - 1); i++) {
    const t = transitions[i];
    if (t && t.duration > 0 && !noOverlapTypes.has(t.type)) {
      transitionOverlap += t.duration / 2;
    }
  }

  return Math.max(totalSceneDuration - transitionOverlap, 0);
}

export function calculateEffectiveDurationInFrames(
  scenes: SceneLike[],
  fps: number,
  transitions?: TransitionLike[],
  defaultSceneDuration = 5,
  minFrames = 150
): number {
  const effectiveDuration = calculateEffectiveDuration(scenes, transitions, defaultSceneDuration);
  return Math.max(Math.ceil(effectiveDuration * fps), minFrames);
}
