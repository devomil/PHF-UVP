import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

// Some sibling modules referenced by scene-card.tsx and
// universal-video-producer.tsx (`./content-type-selector`,
// `./workflow-override-toggle`) are not checked into the repo. They
// exist as production runtime stubs only — for tests we redirect those
// relative imports to the test-only stubs under
// client/src/__tests__/stubs so render tests can mount the real
// scene-card without pulling in missing modules.
const MISSING_SIBLING_STUBS: Record<string, string> = {
  'content-type-selector': path.resolve(
    __dirname,
    'client/src/__tests__/stubs/content-type-selector.tsx',
  ),
  'workflow-override-toggle': path.resolve(
    __dirname,
    'client/src/__tests__/stubs/workflow-override-toggle.tsx',
  ),
};

const stubMissingSiblings = {
  name: 'stub-missing-video-siblings',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (source.startsWith('./')) {
      const bare = source.slice(2);
      if (bare in MISSING_SIBLING_STUBS) {
        return MISSING_SIBLING_STUBS[bare];
      }
    }
    return null;
  },
};

export default defineConfig({
  plugins: [stubMissingSiblings, react()],
  test: {
    environment: 'node',
    include: [
      'remotion/**/__tests__/**/*.test.ts',
      'remotion/**/*.test.ts',
      'client/src/**/*.test.{ts,tsx}',
      'client/src/__tests__/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.test.ts',
      'shared/**/__tests__/**/*.test.ts',
      'server/**/*.test.ts',
      'server/**/__tests__/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
