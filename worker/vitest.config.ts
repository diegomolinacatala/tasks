import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Adaptadores de Cloudflare: se prueban con `wrangler dev`, no en Node.
      exclude: ['src/**/*.test.ts', 'src/testing.ts', 'src/index.ts', 'src/env.ts', 'src/scheduler.ts', 'src/store.ts', 'src/push.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
})
