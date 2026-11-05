import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sealProjectDependencies } from "@zoeskoul/build-preparation";
import { authorizeTanstackPreviewSource, assertTanstackPreviewStartupEnabled } from "./tanstackPreviewSourceAuthorization.js";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";

const secret = "A".repeat(64);
const projectId = "project_test_1";
const packageJson = JSON.stringify({
  name: "test-tanstack-project", private: true, type: "module", packageManager: "pnpm@10.33.0",
  scripts: { build: "vite build && tsc --noEmit" },
  dependencies: { "@tanstack/react-start": "1.169.4", "@tanstack/react-router": "1.170.46" },
  devDependencies: { vite: "8.1.5", wrangler: "4.156.1" },
});
const lockfile = "lockfileVersion: '9.0'\nimporters: {}\n";
function validRequest(): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1, operation: "production-build", buildProjectId: projectId,
    sourceVersion: 3, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
    files: [
      { path: "package.json", content: packageJson },
      { path: "pnpm-lock.yaml", content: lockfile },
      { path: "vite.config.ts", content: "export default {};" },
      { path: "wrangler.jsonc", content: "{}" },
      { path: "src/router.tsx", content: "export {}" },
      { path: "src/routes/__root.tsx", content: "export {}" },
      { path: "zoebuild-dependency-approval.json", content: sealProjectDependencies({ projectId, packageJson, lockfile, secret }) },
    ],
  };
}
function withFile(request: ProductionBuildJobRequestV1, path: string, content: string): ProductionBuildJobRequestV1 {
  return {...request, files: request.files.map(f => f.path === path ? {...f, content} : f)};
}

describe("TanStack authenticated startup source gate", () => {
  it("permits a sealed, pinned, frozen project identity", () => {
    expect(() => authorizeTanstackPreviewSource(validRequest(), secret)).not.toThrow();
  });
  it("rejects lockfile tampering, mismatched project identity, and changed manifests", () => {
    const request = validRequest();
    expect(() => authorizeTanstackPreviewSource(withFile(request, "pnpm-lock.yaml", lockfile + "modified\n"), secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource({...request, buildProjectId: "other_project"}, secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource(withFile(request, "package.json", packageJson.replace("8.1.5", "8.3.1")), secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource(request, "B".repeat(64))).toThrow();
  });
  it("refuses unsigned dependencies, unpinned packages and untrusted install controls", () => {
    const request = validRequest();
    expect(() => authorizeTanstackPreviewSource({...request,
      files: request.files.filter(f => f.path !== "zoebuild-dependency-approval.json")}, secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource({...request,
      files: request.files.filter(f => f.path !== "pnpm-lock.yaml")}, secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource({...request,
      files: [...request.files, {path: ".npmrc", content: "ignore-scripts=false"}]}, secret)).toThrow();
    const unpinned = packageJson.replace("4.156.1", "^4.0.0");
    expect(() => authorizeTanstackPreviewSource(withFile(request, "package.json", unpinned), secret)).toThrow();
    expect(() => authorizeTanstackPreviewSource(request, "short")).toThrow();
  });
  it("rejects duplicate source paths rather than trusting Map's overwrite", () => {
    const request = validRequest();
    expect(() => authorizeTanstackPreviewSource({...request,files:[...request.files,
      {path:"pnpm-lock.yaml",content:lockfile}]},secret)).toThrow();
  });
  it("fails closed on legacy and mismatched framework IDs even with a signed lock", () => {
    const request = validRequest();
    for (const identity of [
      { stackId: "react-vite-v1", templateId: "react-vite-v1" },
      { stackId: "static-html-v1", templateId: "tanstack-start-v1" },
      { stackId: "tanstack-start-v1", templateId: "react-vite-v1" },
    ]) {
      expect(() => authorizeTanstackPreviewSource({ ...request, ...identity }, secret))
        .toThrow("canonical registered stack");
    }
  });
  it("rejects non-TanStack requests on both start routes before reserving resources", () => {
    const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    const direct = read("../../routes/build.previews.start.ts");
    const operations = read("../../routes/build.previews.operations.ts");
    for (const route of [direct, operations]) {
      expect(route).toContain('request.stackId !== "tanstack-start-v1"');
      expect(route).toContain('request.templateId !== "tanstack-start-v1"');
      expect(route).toContain('Unsupported preview project stack.');
      expect(route).not.toContain("startReactPreview");
      expect(route).not.toContain("stopReactPreview");
    }
    expect(operations.indexOf('request.stackId !== "tanstack-start-v1"', operations.indexOf('export const startBuildPreviewOperationRoute')))
      .toBeLessThan(operations.indexOf('operations.start(actorKey, request)'));
  });
  it("keeps the runtime disabled unless explicitly enabled", () => {
    expect(() => assertTanstackPreviewStartupEnabled("true")).not.toThrow();
    for (const value of [undefined, "false", "1", "TRUE", "yes"]) {
      expect(() => assertTanstackPreviewStartupEnabled(value)).toThrow("not activated");
    }
  });
  it("wires both preview entry points through the same gate before execution", () => {
    function read(relative: string) {
      return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    }
    const direct = read("../../routes/build.previews.start.ts");
    const operations = read("../../routes/build.previews.operations.ts");
    const shared = read("./tanstackPreviewSharedLifecycle.ts");
    for (const file of [direct,operations]) {
      expect(file).toContain("assertTanstackPreviewStartupEnabled()");
      expect(file).toContain("authorizeTanstackPreviewSource(request)");
      expect(file).toContain("startAdmittedTanstackPreview");
      expect(file).not.toContain("startReactPreview");
      expect(file).not.toContain("stopReactPreview");
      expect(file).not.toContain("req.body.command");
      expect(file).not.toContain("req.body.env");
      expect(file).not.toContain("req.body.port");
    }
    expect(operations.indexOf("authorizeTanstackPreviewSource(request);", operations.indexOf("export const startBuildPreviewOperationRoute")))
      .toBeLessThan(operations.indexOf("operations.start(actorKey, request)"));
    expect(operations).toContain("stopAdmittedTanstackPreview");
    expect(shared).toContain("sharedPreviewStartCoordinator.run");
    expect(shared).toContain("sharedFullStackPreviews.register");
    expect(shared).toContain("onPhase:input.onPhase");
  });
});
