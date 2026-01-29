import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@settleflow/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@settleflow/shared-validation': path.resolve(
        __dirname,
        '../../packages/shared-validation/src'
      ),
      '@settleflow/shared-config': path.resolve(__dirname, '../../packages/shared-config/src'),
    },
  },
});
