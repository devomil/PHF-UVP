/**
 * PRE-ENFORCEMENT NUMBERS
 * Runs five T2V scenes through aiVideoService.generateVideo() and collects
 * every [AIVideo] Pre-enforcement: N words line.
 * LLM calls for intelligent selection run for real.
 * Video task POSTs are stubbed.
 *
 * Run with: npx tsx server/scripts/runtime-evidence-pre-enforcement.ts
 */

process.env.REMOTION_AWS_ACCESS_KEY_ID ??= 'test';
process.env.REMOTION_AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.REMOTION_AWS_REGION ??= 'us-east-2';
process.env.REMOTION_S3_BUCKET ??= 'test-bucket';

const PIAPI_TASK_RE = /\/task\b/;
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: any, opts?: any) => {
  const urlStr = String(url);
  if (PIAPI_TASK_RE.test(urlStr)) {
    if (opts?.method === 'POST') {
      return { ok: true, status: 200,
        json: async () => ({ data: { task_id: 'STUB' } }),
        text: async () => '{"data":{"task_id":"STUB"}}' } as any;
    }
    return { ok: true, status: 200,
      json: async () => ({ data: { status: 'failed', error: 'STUB_ABORT' } }),
      text: async () => '{"data":{"status":"failed","error":"STUB_ABORT"}}' } as any;
  }
  return origFetch(url, opts);
};

// Capture Pre-enforcement lines
const preEnfLines: string[] = [];
const origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const line = args.map(a => String(a)).join(' ');
  if (line.includes('Pre-enforcement:')) preEnfLines.push(line);
  origLog(...args);
};

import { aiVideoService } from '../services/ai-video-service.js';

const scenes = [
  {
    label: 'hook (short prompt)',
    opts: {
      prompt: 'Bold text on screen: "Discover the difference." Quick cut to a glowing product on a dark surface.',
      narration: 'Discover the difference today.',
      duration: 3, aspectRatio: '16:9' as const, sceneType: 'hook',
    },
  },
  {
    label: 'problem (medium)',
    opts: {
      prompt: 'A tired professional sits at a cluttered desk, surrounded by stacks of paper and multiple glowing screens. She rubs her eyes, overwhelmed by the volume of work. The office is dim, lit only by blue monitor light. Notifications ping incessantly.',
      narration: 'Every day, professionals lose hours to repetitive manual tasks.',
      duration: 5, aspectRatio: '16:9' as const, sceneType: 'problem',
    },
  },
  {
    label: 'solution (long prompt, near limit)',
    opts: {
      prompt: 'A sleek dashboard fills the screen with real-time analytics, colorful charts updating live as data streams in. A confident professional in a bright modern office reviews the results, nodding with satisfaction. The workspace is open, airy, filled with natural light. Colleagues collaborate in the background. Clean minimalist design. Data flows seamlessly between systems. Automated workflows run silently in the background, eliminating hours of manual effort. The interface is intuitive, powerful, fast. Green checkmarks cascade down a list of completed tasks. A progress bar reaches 100%. Confetti animation. The team celebrates a milestone. Productivity soars. Revenue grows. The future is automated. Smooth camera move across the workspace. Cinematic depth of field. Golden-hour lighting floods the room.',
      narration: 'Automate the routine. Amplify the human.',
      duration: 7, aspectRatio: '16:9' as const, sceneType: 'solution',
    },
  },
  {
    label: 'social proof (people)',
    opts: {
      prompt: 'A smiling customer holds up the product, giving a thumbs up to the camera. Behind her, a cheerful modern apartment with houseplants and warm lighting. Natural authentic feel, handheld camera style, documentary warmth.',
      narration: 'Join thousands of happy customers.',
      duration: 4, aspectRatio: '16:9' as const, sceneType: 'testimonial',
    },
  },
  {
    label: 'cta (short)',
    opts: {
      prompt: 'Animated call-to-action button pulses gently on a clean white background. Text reads "Start Free Today." Subtle particle effects. Modern, clean, inviting.',
      narration: 'Start free today. No credit card required.',
      duration: 3, aspectRatio: '16:9' as const, sceneType: 'cta',
    },
  },
];

console.log('\n=== PRE-ENFORCEMENT WORD COUNT SURVEY ===\n');

for (const { label, opts } of scenes) {
  console.log(`\n--- Scene: ${label} ---`);
  try {
    await aiVideoService.generateVideo(opts);
  } catch (_) {}
}

console.log('\n\n=== COLLECTED Pre-enforcement LINES ===');
preEnfLines.forEach(l => console.log(l));
console.log(`\nTotal scenes: ${scenes.length}, Pre-enforcement lines captured: ${preEnfLines.length}\n`);
