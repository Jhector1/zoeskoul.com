import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("project drain boundary", () => {
  it("routes drain behind global runner service auth, derives actor on the server", () => {
    const app = read("../app.ts");
    const route = read("./build.previews.projectDrain.ts");
    expect(app.indexOf("app.use(requireServiceAuth)")).toBeLessThan(app.indexOf('/build/previews/project/drain'));
    expect(route).toContain("getRequiredActorKey(req)");
    expect(route).not.toContain("req.body.actorKey");
    expect(route).toContain("releaseReactPreviewProjectDrain");
  });
  it("prevents deletion while a preview is starting, and checks cleanup", () => {
    const runtime = read("../services/build/reactPreviewRuntime.ts");
    expect(runtime).toContain("projectDrains.beginStart");
    expect(runtime).toContain("projectDrains.beginDrain");
    expect(runtime).toContain("Preview container removal could not be verified");
    expect(runtime).toContain("Preview workspace cleanup could not be verified");
  });
});
