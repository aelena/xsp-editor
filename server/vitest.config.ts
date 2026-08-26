import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",

    /**
     * The default 5s is too tight for the first test in each file on CI
     * hardware.
     *
     * Six tests failed the first time this suite ran on Linux in a container,
     * and every one of them was the first test in its file. None of them were
     * slow tests: the cost is importing the module graph and building a Fastify
     * app with every route registered, which lands on whichever test happens to
     * trigger it. Vitest attributes that to the test rather than to collection,
     * so a cold start reads as a timeout.
     *
     * Raised rather than worked around by warming something up in a hook,
     * because the cost is real and moving it into a hook only moves which line
     * reports the failure. A suite that goes red on a slower runner teaches
     * people to re-run CI until it passes, which is worse than waiting.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,

    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // The process entry point. Covering it means starting a real server and
        // binding a port from a unit test, which buys a number and no confidence.
        "src/server.ts",
        // Interfaces and types. They compile to nothing, so v8 reports them as
        // zero per cent of nothing, which drags the figure down while saying
        // nothing about what is tested.
        "src/storage/adapter.ts",
      ],
      /**
       * A floor, not a target.
       *
       * Set just under where the suite actually sits, so it catches a real drop
       * without failing on the ordinary noise of adding a branch. Raise it when
       * the real number moves up; never lower it to make a build pass.
       */
      thresholds: {
        statements: 85,
        branches: 82,
        functions: 85,
        lines: 85,
      },
    },
  },
});
