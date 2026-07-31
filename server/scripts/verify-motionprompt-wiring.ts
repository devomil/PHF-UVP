/**
 * Verify that the motionPrompt priority logic fires correctly.
 * Exercises the same ternary added to all three I2V call sites.
 */

type TestScene = { motionPrompt?: string; visualDirection?: string; narration?: string };

function resolveI2VPrompt(scene: TestScene): { field: string; prompt: string; words: number } {
  const motionField = scene.motionPrompt ? 'motionPrompt' : (scene.visualDirection ? 'visualDirection' : 'narration(fallback)');
  const prompt = scene.motionPrompt || scene.visualDirection || scene.narration || 'Dynamic professional video content';
  return { field: motionField, prompt, words: prompt.split(/\s+/).filter(Boolean).length };
}

const REAL_SCENE = {
  motionPrompt: "Slow push-in toward lion's face, light subtly shifts, brass details emerge from shadows.",
  visualDirection: "Extreme close-up on the lion's mane details, golden light catching the brass texture. Slow push-in deepening the sense of mystery and exclusivity.",
  narration: "Discover what sets us apart.",
};

const NO_MOTION_SCENE = {
  visualDirection: "Woman sitting at kitchen table, sunlight streaming through window, hands around ceramic mug.",
  narration: "Start every morning with intention.",
};

const FALLBACK_SCENE = {
  narration: "Our product changes everything.",
};

for (const [label, scene] of [
  ['BOTH fields (motionPrompt wins)', REAL_SCENE],
  ['NO motionPrompt (visualDirection wins)', NO_MOTION_SCENE],
  ['NARRATION ONLY fallback', FALLBACK_SCENE],
] as const) {
  const r = resolveI2VPrompt(scene as TestScene);
  console.log(`[PromptWiring] ${label}`);
  console.log(`  source: ${r.field} (${r.words} words): "${r.prompt.substring(0, 90)}"`);
  console.log();
}
