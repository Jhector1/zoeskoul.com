import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { authorizeTanstackPreviewSource } from "./tanstackPreviewSourceAuthorization.js";
import { assessTanstackDevelopmentPreviewUpdate } from "./tanstackDevelopmentPreviewAdmission.js";

vi.mock("./tanstackPreviewSourceAuthorization.js", () => ({
  authorizeTanstackPreviewSource: vi.fn(),
}));

const runtimeImageId = `sha256:${"a".repeat(64)}`;
const approval = JSON.stringify({ approval: "signed-during-real-runner-admission" });
function request(sourceVersion: number, heading: string): ProductionBuildJobRequestV1 {
  return {
    operation: "production-build", protocolVersion: 1, buildProjectId: "project-a",
    stackId: "tanstack-start-v1", templateId: "tanstack-start-v1", sourceVersion,
    files: [
      {path: "package.json", content: '{"private":true}'},
      {path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n"},
      {path: "zoebuild-dependency-approval.json", content: approval},
      {path: "src/routes/index.tsx", content: heading},
    ],
  };
}
const previous = request(8, "old heading");
const next = request(9, "new heading");
const lease = {
  mode: "development" as const, ownerKey: "actor-a", buildProjectId: "project-a",
  sourceVersion: 8, identity: createTanstackPreviewIdentity(previous, runtimeImageId),
  basePath: "/api/build/projects/project-a/preview/preview_a/content/token/",
};
function assess(overrides: Record<string,unknown> = {}) {
  return assessTanstackDevelopmentPreviewUpdate({
    lease, actorKey: "actor-a", previous, next, ...overrides,
  } as Parameters<typeof assessTanstackDevelopmentPreviewUpdate>[0]);
}

beforeEach(() => vi.clearAllMocks());

describe("Runner development preview source admission (no mutations)", () => {
  it("admits a bounded source-only candidate on exact authenticated state", () => {
    const result = assess();
    expect(result).toMatchObject({
      action: "live_candidate", reason: "eligible_source_change",
      changedPaths: ["src/routes/index.tsx"], expectedSourceVersion: 8,
      nextSourceVersion: 9,
    });
    expect(result.nextSourceFingerprint).toBe(
      createTanstackPreviewIdentity(next,runtimeImageId).sourceFingerprint);
    expect(authorizeTanstackPreviewSource).toHaveBeenCalledOnce();
    expect(authorizeTanstackPreviewSource).toHaveBeenCalledWith(next);
    expect(lease.sourceVersion).toBe(8);
  });
  it("refuses missing, quarantined, immutable and cross-owner leases", () => {
    expect(() => assess({ lease: null })).toThrow("Preview not found.");
    expect(() => assess({ lease: {...lease,basePath:"/quarantined/bad/"} }))
      .toThrow("Preview not found.");
    expect(() => assess({ lease: {...lease,mode:"immutable"} }))
      .toThrow("Development preview lease required.");
    expect(() => assess({ actorKey:"actor-b" })).toThrow("Forbidden.");
    expect(() => assess({ actorKey:"" })).toThrow("Forbidden.");
    expect(authorizeTanstackPreviewSource).not.toHaveBeenCalled();
  });
  it("accepts a newer full snapshot but still checks its exact previous lease", () => {
    const later=request(12,"latest");
    expect(assess({next:later})).toMatchObject({action:"live_candidate",expectedSourceVersion:8,nextSourceVersion:12,changedPaths:["src/routes/index.tsx"]});
    expect(authorizeTanstackPreviewSource).toHaveBeenCalledExactlyOnceWith(later);
  });
  it("blocks stale, same-version and cross-project source", () => {
    for (const change of [
      {...next,sourceVersion:7}, {...next,sourceVersion:8}, {...next,sourceVersion:9.5},
      {...next,buildProjectId:"other"}, {...next,sourceVersion:0},
    ]) expect(() => assess({next:change})).toThrow("Preview source is stale.");
    expect(() => assess({previous:{...previous,sourceVersion:7}}))
      .toThrow("Preview source is stale.");
  });
  it("blocks fabricated previous source even with valid next request", () => {
    expect(() => assess({ previous: request(8,"fabricated") }))
      .toThrow("Preview source identity mismatch.");
    expect(() => assess({ lease:{...lease,identity:{...lease.identity,
      runtimeImageId:`sha256:${"b".repeat(64)}`}} }))
      .toThrow("Preview source identity mismatch.");
    expect(authorizeTanstackPreviewSource).not.toHaveBeenCalled();
  });
  it("enforces server-signed dependency authorization rather than trusting an edit", () => {
    vi.mocked(authorizeTanstackPreviewSource).mockImplementationOnce(() => {
      throw new Error("Invalid project dependency approval.");
    });
    expect(() => assess()).toThrow("Invalid project dependency approval.");
  });
  it("routes dependency and configuration edits to restart, never live-candidate", () => {
    const dependencyChange = {...next,files:next.files.map(file =>
      file.path === "package.json" ? {...file,content:'{"newdep":true}'} : file)};
    expect(assess({next:dependencyChange})).toMatchObject({
      action:"restart",reason:"dependencies_changed",
    });
    const protectedChange = {...next,files:[...next.files,
      {path:"vite.config.ts",content:"export default {}"}]};
    expect(assess({next:protectedChange})).toMatchObject({
      action:"restart",reason:"protected_files_changed",
    });
  });
  it("rejects ambiguous file paths and identity mismatch without write", () => {
    const duplicate = {...next,files:[...next.files,
      {path:"SRC/routes/index.tsx",content:"collision"}]};
    expect(() => assess({next:duplicate})).toThrow("Invalid development preview transition.");
    expect(lease.sourceVersion).toBe(8);
  });
});
