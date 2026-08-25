import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',

    // The first test in a file pays for importing its module graph, and vitest
    // bills that to the test. On slower hardware that reads as a timeout in a
    // test that is not slow.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
