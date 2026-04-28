// Manual verification script for Task #107.
//
// Exercises the live PiAPI nano-banana-2 endpoint with `enable_web_search`
// turned on and prints the resulting image URL plus enough metadata to
// confirm web-grounded generation actually rendered with relevant context.
//
// Why this is a script and not a unit test:
//   - It costs real PIAPI credits per run (~$0.06 at 1K resolution, March
//     2026 pricing) and depends on a live third-party API, so it can't run
//     in CI.
//   - It's the "short test confirming web-grounded scenes render with
//     relevant context" called out in Task #107's "Done looks like".
//
// Usage:
//   PIAPI_API_KEY=... npx tsx scripts/manual/verify-nb2-web-search.ts
//
// Optional env:
//   NB2_PROMPT="A barista pouring oat-milk latte art at a Tokyo specialty cafe"
//
// Expected outcome:
//   - One image URL printed.
//   - Inspect the image and confirm it shows recognisable Tokyo cafe
//     elements (signage, fixtures, menu cues) — that visual specificity is
//     what web-grounding contributes.

import { nanoBanana2Service } from '../../server/services/nano-banana2.service';

async function main(): Promise<void> {
  if (!process.env.PIAPI_API_KEY) {
    console.error('PIAPI_API_KEY is not set. Aborting to avoid a misleading error.');
    process.exit(1);
  }

  const prompt =
    process.env.NB2_PROMPT
    || 'A barista pouring oat-milk latte art at a Tokyo specialty cafe, golden hour light, 35mm photo, brand-aware shop signage';

  console.log('Submitting nano-banana-2 task with enable_web_search=true');
  console.log(`Prompt: ${prompt}`);

  const startedAt = Date.now();
  const result = await nanoBanana2Service.generateImage({
    prompt,
    aspectRatio: '16:9',
    format: 'jpeg',
    enableWebSearch: true,
  });
  const elapsedMs = Date.now() - startedAt;

  console.log('---');
  console.log(`taskId: ${result.taskId}`);
  console.log(`imageUrl: ${result.imageUrl}`);
  console.log(`elapsedMs: ${elapsedMs}`);
  console.log('Open the image and confirm it shows specific, real-world cues.');
}

main().catch((err) => {
  console.error('verify-nb2-web-search failed:', err);
  process.exit(1);
});
