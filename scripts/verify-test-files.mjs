#!/usr/bin/env node
/**
 * Fail if the test run executed fewer files than exist on disk.
 *
 * Why this exists: running the client suite in a constrained container, vitest
 * reported "13 passed (13)" once, "12 passed (12)" the next time and "12 passed
 * (12)" with a different file missing the time after. Three green runs, three
 * different sets of tests. Under file parallelism it dropped whole files and
 * still exited zero.
 *
 * A suite that quietly runs less than all of itself is worse than a red one: it
 * reports success for work it did not do, and the file it skips is not the file
 * you were watching. Tuning worker counts made it deterministic here, but that
 * tuning is guesswork against one machine's limits, and the failure would come
 * back on a different runner. This checks the outcome instead of guessing at the
 * cause.
 *
 * Usage: node scripts/verify-test-files.mjs <project-dir> <vitest-json-output>
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const [projectDir, resultsPath] = process.argv.slice(2);

if (!projectDir || !resultsPath) {
  console.error("usage: verify-test-files.mjs <project-dir> <vitest-json-output>");
  process.exit(2);
}

const root = resolve(projectDir);
const IGNORED = new Set(["node_modules", "dist", "coverage", ".git"]);

/** Every test file under src, found the same way vitest's default glob does. */
async function findTestFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findTestFiles(path)));
    } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

const normalise = (path) => relative(root, resolve(path)).split(sep).join("/");

const onDisk = new Set((await findTestFiles(join(root, "src"))).map(normalise));

let results;
try {
  results = JSON.parse(readFileSync(resultsPath, "utf-8"));
} catch (err) {
  console.error(`Could not read the vitest JSON output at ${resultsPath}: ${err.message}`);
  process.exit(1);
}

const executed = new Set(
  (results.testResults ?? []).map((result) => normalise(result.name)),
);

const missing = [...onDisk].filter((file) => !executed.has(file)).sort();
// Not an error, but worth saying out loud: it means this check is reading the
// wrong thing and would not catch a dropped file either.
const unexpected = [...executed].filter((file) => !onDisk.has(file)).sort();

console.log(`test files on disk: ${onDisk.size}, executed: ${executed.size}`);

if (unexpected.length > 0) {
  console.log(`ran but not found on disk:\n  ${unexpected.join("\n  ")}`);
}

if (missing.length > 0) {
  console.error(
    `\n${missing.length} test file(s) were never run:\n  ${missing.join("\n  ")}\n\n` +
      "The suite reported success without executing these. Re-running is not a " +
      "fix: reduce parallelism (vitest --no-file-parallelism, or maxWorkers) " +
      "until every file runs every time.",
  );
  process.exit(1);
}

if (onDisk.size === 0) {
  console.error("No test files found at all, which is not a passing state.");
  process.exit(1);
}

console.log("Every test file on disk was executed.");
