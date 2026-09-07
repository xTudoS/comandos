import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app/', import.meta.url)),
      '@': fileURLToPath(new URL('./app/', import.meta.url)),
      // Design system (packages/ui). Espelha o alias declarado no
      // nuxt.config do layer — ver design-system/MASTER.md.
      '#ui': fileURLToPath(new URL('./packages/ui/app/', import.meta.url)),
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '@@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share a single Postgres instance and TRUNCATE on setup,
    // so they must not run concurrently. Unit tests are cheap; serial is fine.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
