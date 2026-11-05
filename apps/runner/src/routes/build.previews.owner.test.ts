import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("TanStack-only Runner preview owner boundary", () => {
  it("registers all preview operations behind global service auth", () => {
    const app = read("../app.ts");
    const guard = app.indexOf("app.use(requireServiceAuth)");
    expect(guard).toBeGreaterThan(0);
    for (const path of [
      'app.post("/build/previews/start"',
      'app.post("/build/previews/:previewId/fetch"',
      'app.post("/build/previews/:previewId/cancel"',
      'app.post("/build/previews/:previewId/proxy-fetch"',
      'app.post("/build/previews/:previewId/resolve-capability"',
    ]) expect(guard).toBeLessThan(app.indexOf(path));
  });

  it("authenticates owner fetch and cancel with no legacy runtime fallback", () => {
    const fetch = read("./build.previews.fetch.ts");
    const cancel = read("./build.previews.cancel.ts");
    expect(fetch).toContain("getRequiredActorKey(req)");
    expect(fetch).toContain("fetchOwnedTanstackPreview");
    expect(fetch).toContain("sourceVersion: req.body?.sourceVersion");
    expect(fetch).toContain('method !== "GET" && method !== "HEAD" && method !== "POST"');
    expect(cancel).toContain("getRequiredActorKey(req)");
    expect(cancel).toContain("stopAdmittedTanstackPreview(actorKey, previewId)");
    for (const route of [fetch, cancel]) {
      expect(route).not.toContain('from "../services/build/reactPreviewRuntime.js"');
      expect(route).not.toContain("sharedFullStackPreviews.get");
    }
  });

  it("does not accept arbitrary Docker launch controls from preview requests", () => {
    const combined = [
      "build.previews.start.ts", "build.previews.operations.ts", "build.previews.sync.ts",
      "build.previews.fetch.ts", "build.previews.cancel.ts",
    ].map(file => read(`./${file}`)).join("\n");
    for (const forbidden of ["req.body.command", "req.body.argv", "req.body.shell", "req.body.image",
      "req.body.env", "req.body.network", "req.body.port"]) expect(combined).not.toContain(forbidden);
  });
});
