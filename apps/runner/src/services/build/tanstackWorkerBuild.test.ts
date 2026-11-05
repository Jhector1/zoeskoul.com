import { describe, expect, it } from "vitest";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
const base: ProductionBuildJobRequestV1 = {
  protocolVersion: 1, operation: "production-build", buildProjectId: "test-project",
  sourceVersion: 1, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
  files: [
    { path: "package.json", content: JSON.stringify({packageManager:"pnpm@10.33.0",scripts:{build:"vite build && tsc --noEmit"}}) },
    { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
    { path: "vite.config.ts", content: "export default {}" },
    { path: "wrangler.jsonc", content: "{}" },
    { path: "src/router.tsx", content: "export {}" },
    { path: "src/routes/__root.tsx", content: "export {}" },
  ],
};
describe("staged TanStack isolated build entry", () => {
  it("accepts only canonical server-capable requests", () => {
    expect(() => assertTanstackWorkerBuildRequest(base)).not.toThrow();
    expect(() => assertTanstackWorkerBuildRequest({...base,stackId:"react-vite-v1"})).toThrow(/canonical/);
    expect(() => assertTanstackWorkerBuildRequest({...base,templateId:"react-vite-v1"})).toThrow(/canonical/);
  });
  it("requires SSR sources and known build scripts", () => {
    expect(() => assertTanstackWorkerBuildRequest({...base,files:base.files.filter(f=>f.path!=="src/router.tsx")})).toThrow(/router/);
    expect(() => assertTanstackWorkerBuildRequest({...base,files:base.files.map(f=>f.path==="package.json"?{...f,content:'{"scripts":{"build":"sh ./malicious.sh"}}'}:f)})).toThrow(/canonical/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("isolated Worker compiler ownership", () => {
  const source = readFileSync(resolve(process.cwd(), "src/services/build/tanstackWorkerBuild.ts"), "utf8");
  const sandbox = readFileSync(resolve(process.cwd(), "src/services/build/executeProductionBuild.ts"), "utf8");
  it("runs trusted direct argv only and requires strict cleanup on every build step", () => {
    expect(source.match(/strictCleanup: true/g)).toHaveLength(3);
    expect(source.match(/tanstackRunId: runId/g)).toHaveLength(3);
    expect(source).toContain('command: ["pnpm", "exec", "vite", "build"]');
    expect(source).toContain('command: ["pnpm", "exec", "tsc", "--noEmit"]');
    expect(source).toContain('command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"]');
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("request.command");
  });
  it("cleans workspace even when permission setup, compilation, or artifact check fails", () => {
    const start = source.indexOf("  try {", source.indexOf("const runId"));
    const permissions = source.indexOf("ensureWorkspaceWritableForShellUser(workspaceDir)");
    const finallyPos = source.indexOf("  } finally {", start);
    expect(start).toBeGreaterThan(-1);
    expect(permissions).toBeGreaterThan(start);
    expect(finallyPos).toBeGreaterThan(permissions);
    expect(source.slice(finallyPos)).toContain("await cleanupWorkspaceNow(workspaceDir)");
  });
  it("runs build containers without network or elevated sandbox privileges", () => {
    expect(sandbox).toContain('args.step ===');
    expect(sandbox).toContain('"build"');
    expect(sandbox).toContain('"none"');
    expect(sandbox).toContain('Privileged:');
    expect(sandbox).toContain('false,');
  });
});
