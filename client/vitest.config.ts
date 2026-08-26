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

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
      ],
      /**
       * A floor, set just under where the suite sits. Lower than the server's
       * because a fair slice of this codebase is CodeMirror wiring and page
       * chrome, where a test asserts that the markup is the markup and finds
       * nothing. Raise it as the number rises; never lower it to pass a build.
       */
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
})
