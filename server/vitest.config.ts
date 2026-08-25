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
  },
});
