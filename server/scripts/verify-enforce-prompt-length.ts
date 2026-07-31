import { optimizePrompt } from '../services/video-prompt-optimizer.js';

const INPUT_59W = 'A woman in her early thirties with dark curly hair, wearing a soft sage green linen blouse, sits at a sunlit wooden kitchen table with her hands wrapped around a ceramic mug. Steam rises gently from the mug. Outside the window behind her, morning light filters through dappled leaves. A small succulent plant sits beside her on the table.';

async function run() {
  const result = optimizePrompt({
    visualDescription: INPUT_59W,
    sceneType: 'broll',
    includeProduct: false,
    productName: 'product',
    visualStyle: 'lifestyle',
    generationMode: 't2v',
    provider: 'seedance',
    artPresetId: undefined,
  });

  console.log('\n=== Task 2 Verification: enforcePromptLength sentence-boundary ===');
  console.log(`Input  (${INPUT_59W.split(/\s+/).length} words): "${INPUT_59W}"`);
  console.log(`Output (${result.prompt.split(/\s+/).length} words): "${result.prompt}"`);
  console.log(`Ends on sentence boundary: ${/[.!?]$/.test(result.prompt.trim())}`);
}

run().catch(console.error);
