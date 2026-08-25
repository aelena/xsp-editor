import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";

function createTestApp() {
  return buildApp(new MemoryStorageAdapter());
}

/** What the endpoint returns, as the client consumes it. */
interface Listing {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
}

describe("GET /api/v1/browse-folder", () => {
  it("starts from the home directory when given no path", async () => {
    // The client cannot know where to begin, and the previous design answered
    // that question with a native dialog on the server's desktop.
    const app = createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/browse-folder" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Listing;
    expect(body.current).toBe(homedir().replace(/\\/g, "/"));
  });

  it("lists the directories inside a path", async () => {
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(process.cwd())}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Listing;
    expect(body.directories.map((d) => d.name)).toContain("src");
  });

  it("lists a path with no project registered against it", async () => {
    // The bug this replaced: the listing refused any path outside a registered
    // project, which is every path at the moment you are choosing the folder
    // for a new one. The restriction made the feature impossible to use.
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(homedir())}`,
    });

    expect(res.statusCode).toBe(200);
  });

  it("offers a parent to climb to", async () => {
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(process.cwd())}`,
    });

    const body = res.json() as Listing;
    expect(body.parent).toBe(dirname(process.cwd()).replace(/\\/g, "/"));
  });

  it("reports no parent at a filesystem root", async () => {
    // So the client can decide whether to draw an "up" row rather than
    // comparing strings to work it out for itself.
    const app = createTestApp();
    const root = process.platform === "win32" ? "C:/" : "/";
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(root)}`,
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as Listing).parent).toBeNull();
  });

  it("hides dotted directories", async () => {
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(process.cwd())}`,
    });

    const names = (res.json() as Listing).directories.map((d) => d.name);
    expect(names.every((n) => !n.startsWith("."))).toBe(true);
  });

  it("uses forward slashes everywhere, including on Windows", async () => {
    // The path travels to the client, into a text field, and back on create.
    // Mixed separators in that round trip are a source of paths that look
    // right and do not match.
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/browse-folder?path=${encodeURIComponent(process.cwd())}`,
    });

    const body = res.json() as Listing;
    expect(body.current).not.toContain("\\");
    for (const dir of body.directories) {
      expect(dir.path).not.toContain("\\");
    }
  });

  it("answers 400 for a directory that is not there", async () => {
    const app = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/browse-folder?path=/definitely/not/a/real/path/anywhere",
    });

    expect(res.statusCode).toBe(400);
  });

  it("no longer offers the POST dialog", async () => {
    // It shelled out to a native folder picker, which opened on whatever
    // desktop the server was attached to, with no owner window, and blocked the
    // request for up to sixty seconds while nothing appeared.
    const app = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/browse-folder",
    });

    expect(res.statusCode).toBe(404);
  });
});
