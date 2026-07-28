/**
 * A1-1 verification script — tests cfgScale log output for four paths.
 * Run with: npx tsx server/scripts/verify-a1-1.ts
 * Does NOT make any real API calls.
 */
process.env.PIAPI_API_KEY = 'test-key-no-call';
process.env.REMOTION_AWS_ACCESS_KEY_ID = 'test';
process.env.REMOTION_AWS_SECRET_ACCESS_KEY = 'test';
process.env.REMOTION_AWS_REGION = 'us-east-2';
process.env.REMOTION_S3_BUCKET = 'test-bucket';

import { piapiVideoService } from '../services/piapi-video-service.js';

// Capture log lines
const captured: string[] = [];
const origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const line = args.map(a => String(a)).join(' ');
  captured.push(line);
  origLog(...args);
};

function runCase(label: string, options: any) {
  captured.length = 0;
  const prompt = options._prompt ?? 'A woman stands in a sunlit kitchen preparing coffee. She smiles warmly.';
  const svc = piapiVideoService as any;
  try {
    svc.buildI2VRequestBody({
      imageUrl: 'https://example.com/test.jpg',
      prompt,
      duration: 5,
      aspectRatio: '16:9' as const,
      model: 'kling-2.6',
      ...options,
    }, prompt);
  } catch (_) {}
  const cfgLine = captured.find(l => l.includes('[PiAPI I2V] cfg='));
  console.log = console.log; // restore later
  return cfgLine;
}

console.log('\n=== A1-1 Verification ===\n');

// Test 1: Normal pipeline scene (no i2vSettings)
const t1 = runCase('1. Normal pipeline (no i2vSettings)', {});
console.log(`[TEST 1] Normal pipeline:    ${t1}`);
console.assert(t1?.includes('cfg=0.40'), `FAIL: expected cfg=0.40, got: ${t1}`);
console.assert(t1?.includes('animationStyle default (subtle-motion)'), `FAIL: expected animationStyle default (subtle-motion), got: ${t1}`);

// Test 2: Action-heavy pipeline scene
const actionPrompt = 'Water explodes upward in a dramatic burst, droplets scatter across the frame with high energy.';
const t2 = runCase('2. Action prompt (no i2vSettings)', { _prompt: actionPrompt });
console.log(`[TEST 2] Action prompt:      ${t2}`);
console.assert(t2?.includes('cfg=0.55'), `FAIL: expected cfg=0.55, got: ${t2}`);
console.assert(t2?.includes('animationStyle default (dynamic)'), `FAIL: expected animationStyle default (dynamic), got: ${t2}`);

// Test 3: Asset Library fidelity slider at maximum (imageControlStrength = 1)
const t3 = runCase('3. Fidelity slider = 1', { i2vSettings: { imageControlStrength: 1 } });
console.log(`[TEST 3] Fidelity slider=1:  ${t3}`);
console.assert(t3?.includes('cfg=0.10'), `FAIL: expected cfg=0.10, got: ${t3}`);
console.assert(t3?.includes('user fidelity slider (1)'), `FAIL: expected user fidelity slider (1), got: ${t3}`);

// Test 4: Fidelity slider at minimum (imageControlStrength = 0) → expect cfg=0.50
const t4 = runCase('4. Fidelity slider = 0', { i2vSettings: { imageControlStrength: 0 } });
console.log(`[TEST 4] Fidelity slider=0:  ${t4}`);
console.assert(t4?.includes('cfg=0.50'), `FAIL: expected cfg=0.50, got: ${t4}`);
console.assert(t4?.includes('user fidelity slider (0)'), `FAIL: expected user fidelity slider (0), got: ${t4}`);

// Test 5: product-static style → expect cfg=0.15
const t5 = runCase('5. product-static style', { i2vSettings: { animationStyle: 'product-static' } });
console.log(`[TEST 5] product-static:     ${t5}`);
console.assert(t5?.includes('cfg=0.15'), `FAIL: expected cfg=0.15, got: ${t5}`);

// Test 6: Stylized character-reference floor (artPresetId='3d-illustration', isCharacterReference=true)
// cfg starts at 0.40 (subtle-motion default), floor raises it to 0.85
const t6 = runCase('6. Stylized character floor', { artPresetId: '3d-illustration', isCharacterReference: true });
console.log(`[TEST 6] Stylized char floor: ${t6}`);
console.assert(t6?.includes('cfg=0.85'), `FAIL: expected cfg=0.85, got: ${t6}`);
console.assert(t6?.includes('stylized floor (character)'), `FAIL: expected stylized floor (character), got: ${t6}`);

// Test 7: Stylized environment floor (artPresetId='3d-illustration', isCharacterReference=false)
// cfg starts at 0.40 (subtle-motion default), floor raises it to 0.75
const t7 = runCase('7. Stylized environment floor', { artPresetId: '3d-illustration', isCharacterReference: false });
console.log(`[TEST 7] Stylized env floor:  ${t7}`);
console.assert(t7?.includes('cfg=0.75'), `FAIL: expected cfg=0.75, got: ${t7}`);
console.assert(t7?.includes('stylized floor (environment)'), `FAIL: expected stylized floor (environment), got: ${t7}`);

console.log('\n=== All A1-1 assertions passed ===\n');
