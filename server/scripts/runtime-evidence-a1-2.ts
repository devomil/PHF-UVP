/**
 * A1-2 REAL RUNTIME EVIDENCE
 * Run WITH FINAL_MAX_WORDS = 40 in ai-video-service.ts (temporary edit, see instructions).
 * Calls aiVideoService.generateVideo() with a multi-sentence prompt >40 words.
 * The PROMPT TRUNCATED warning fires in the prompt-enforcement block BEFORE any
 * provider call — no video credits are spent even without the fetch stub.
 *
 * Run with: npx tsx server/scripts/runtime-evidence-a1-2.ts
 */

process.env.REMOTION_AWS_ACCESS_KEY_ID ??= 'test';
process.env.REMOTION_AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.REMOTION_AWS_REGION ??= 'us-east-2';
process.env.REMOTION_S3_BUCKET ??= 'test-bucket';

// Stub video task POST — not needed for the truncation test (truncation fires
// before provider selection) but prevents accidental credit spend if the code
// somehow reaches that far.
const PIAPI_TASK_RE = /\/task\b/;
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: any, opts?: any) => {
  const urlStr = String(url);
  if (PIAPI_TASK_RE.test(urlStr)) {
    if (opts?.method === 'POST') {
      return { ok: true, status: 200,
        json: async () => ({ data: { task_id: 'STUB_TASK' } }),
        text: async () => '{"data":{"task_id":"STUB_TASK"}}' } as any;
    }
    // Status-check GET — return immediate failure so polling loop exits fast
    return { ok: true, status: 200,
      json: async () => ({ data: { status: 'failed', error: 'STUB_ABORT' } }),
      text: async () => '{"data":{"status":"failed","error":"STUB_ABORT"}}' } as any;
  }
  return origFetch(url, opts);
};

// Capture all warn/log output
const capturedWarn: string[] = [];
const capturedLog: string[] = [];
const origWarn = console.warn.bind(console);
const origLog  = console.log.bind(console);
console.warn = (...args: any[]) => {
  const line = args.map(a => String(a)).join(' ');
  capturedWarn.push(line);
  origWarn(...args);
};
console.log = (...args: any[]) => {
  const line = args.map(a => String(a)).join(' ');
  capturedLog.push(line);
  origLog(...args);
};

import { aiVideoService } from '../services/ai-video-service.js';

// Dense, multi-sentence scene description with very specific visual details.
// Using a character-rich cinematic scene: the specificity (named attributes,
// specific props, exact lighting, precise camera path) forces the optimizer to
// keep more of the text than a generic landscape prompt.
const longPrompt =
  'A biochemist in her mid-thirties, auburn hair pulled back in a loose bun, ' +
  'wearing a white lab coat over a navy turtleneck, stands at a dark granite workbench. ' +
  'Fluorescent blue liquid glows in glass beakers arranged left to right in ascending height. ' +
  'A holographic molecular model rotates slowly on her right, casting cyan light across her face. ' +
  'Rain streaks the floor-to-ceiling windows behind her; forty floors below, city lights blur in wet halos. ' +
  'She reaches forward and adjusts a precision microscope dial with two fingers, expression focused and calm. ' +
  'Soft blue LED underlighting illuminates the shelf behind her at exactly 4200K. ' +
  'Camera orbits clockwise at eye level, smooth arc of 90 degrees, rack-focusing from her eyes to the glowing beaker. ' +
  'Shallow depth of field, 85mm equivalent, cool cinematic grade, no lens flare.';

const wordCount = longPrompt.split(/\s+/).filter(Boolean).length;

console.log('\n=== A1-2 REAL RUNTIME EVIDENCE (FINAL_MAX_WORDS=40 temporary) ===');
console.log(`Input prompt: ${wordCount} words\n`);

try {
  await aiVideoService.generateVideo({
    prompt: longPrompt,
    narration: 'In quiet laboratories, the next breakthrough takes shape one precise measurement at a time.',
    duration: 6,
    aspectRatio: '16:9',
    sceneType: 'broll',
    // No imageUrl → T2V path → prompt-enforcement block runs
    // No artPresetId → isStylizedArt=false → FINAL_MAX_WORDS = 40 (temp)
  });
} catch (_) {}

console.log('\n--- RESULTS ---');

const truncLine = capturedWarn.find(l => l.includes('PROMPT TRUNCATED'));
const preEnfLine = capturedLog.find(l => l.includes('Pre-enforcement:'));

console.log(`Pre-enforcement:    ${preEnfLine || '(not found)'}`);
console.log(`PROMPT TRUNCATED:   ${truncLine || '(NOT FIRED — check FINAL_MAX_WORDS is 40)'}`);

if (truncLine) {
  // Extract the retained prompt from post-assembly log
  const postAssemblyLine = capturedLog.find(l => l.includes('Post-assembly length enforcement'));
  console.log(`Post-assembly:      ${postAssemblyLine || '(not found)'}`);

  // Extract dropped text from the warn line
  const droppedMatch = truncLine.match(/DROPPED: "(.+)"$/);
  const droppedText = droppedMatch?.[1] || '';
  
  // Reconstruct retained text: original minus dropped
  const droppedIdx = longPrompt.indexOf(droppedText.substring(0, 30));
  const retainedApprox = droppedIdx > 0 ? longPrompt.slice(0, droppedIdx).trim() : '(cannot extract)';

  console.log(`\nRetained (approx):  "${retainedApprox}"`);
  const lastChar = retainedApprox.slice(-1);
  console.log(`Last char:          "${lastChar}" — sentence boundary: ${/[.!?]/.test(lastChar)}`);
  console.log(`Retained non-empty: ${retainedApprox.length > 0}`);
}

console.log('\n=== IMPORTANT: restore FINAL_MAX_WORDS to 200 before next commit ===\n');
