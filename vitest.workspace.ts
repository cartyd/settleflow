import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // API tests
  {
    extends: './apps/api/vitest.config.ts',
    test: {
      name: 'api',
      root: './apps/api',
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'html'],
        reportsDirectory: '../../coverage/api',
      },
    },
  },
  
  // Admin UI tests (when added)
  {
    test: {
      name: 'admin-ui',
      root: './apps/admin-ui',
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reportsDirectory: '../../coverage/admin-ui',
      },
    },
  },
  
  // Unit tests for shared packages
  {
    test: {
      name: 'shared',
      root: './packages',
      include: ['*/tests/**/*.test.ts', '*/src/**/*.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reportsDirectory: '../coverage/shared',
      },
    },
  },
]);