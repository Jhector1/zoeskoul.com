import { describe, expect, it, vi } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";
import { applySuspendedTanstackDevelopmentSource } from "./tanstackDevelopmentWorkspaceWriter.js";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { coordinateTanstackDevelopmentWorkspaceUpdate } from "./tanstackDevelopmentWorkspaceBinding.js";

vi.mock("../docker/dockerClient.js", () => ({ docker: { getContainer: vi.fn() } }));
vi.mock("./tanstackDevelopmentWorkspaceWriter.js", () => ({
  applySuspendedTanstackDevelopmentSource: vi.fn(),
}));
vi.mock("./tanstackPreviewSourceAuthorization.js", () => ({
  authorizeTanstackPreviewSource: vi.fn(),
}));

const CID = "a".repeat(64);
const IMAGE = `sha256:${"b".repeat(64)}`;
const BASE_PATH = "/api/build/projects/p/preview/preview_a/content/token/";
const ROOT = "/private/zoebuild-workspaces";
const DIR = `${ROOT}/zoeskoul-run-11111111-2222-4333-8444-555555555555`;
function request(version: number, text: string): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1, operation: "production-build", buildProjectId: "p",
    stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
    sourceVersion: version, files: [
      { path: "package.json", content: '{"private":true}' },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n" },
      { path: "zoebuild-dependency-approval.json", content: '{"signed":true}' },
      { path: "src/routes/index.tsx", content: text },
    ],
  };
}
const previous = request(7, "before");
const next = request(8, "after");
function fixture(mode: "development" | "immutable" = "development") {
  vi.resetAllMocks();
  const registry = new SharedFullStackPreviewRegistry();
  const close = vi.fn(async () => undefined);
  const identity = createTanstackPreviewIdentity(previous, IMAGE);
  registry.register({ id: "preview_a", mode, ownerKey: "actor",
    buildProjectId: "p", sourceVersion: 7, identity, containerId: CID,
    basePath: BASE_PATH, createdAt: Date.now(), lastActivityAt: Date.now(), close });
  const handle = {
    previewId: "preview_a", ownerKey: "actor", buildProjectId: "p",
    sourceVersion: 7, identityFingerprint: identity.fingerprint, containerId: CID,
    workspaceRoot: ROOT, workspaceDir: DIR,
  };
  const resolveTrustedWorkspace = vi.fn(async () => handle);
  const authorizeCurrentSavedSource = vi.fn(async () => undefined);
  const sandbox = { inspect: vi.fn(async () => ({
    Id: CID, State: { Running: true, Paused: false },
    Config: { Labels: { "com.zoeskoul.runner.purpose": "tanstack-start-preview" } },
    HostConfig: { NetworkMode: "none" },
    Mounts: [{ Type: "bind", RW: true, Source: DIR, Destination: "/workspace" }],
  })) };
  vi.mocked(docker.getContainer).mockReturnValue(sandbox as never);
  vi.mocked(applySuspendedTanstackDevelopmentSource).mockResolvedValue(undefined);
  const update = (overrides: Record<string, unknown> = {}) =>
    coordinateTanstackDevelopmentWorkspaceUpdate({
      registry, previewId: "preview_a", actorKey: "actor", previous, next,
      resolveTrustedWorkspace, authorizeCurrentSavedSource,
      ...overrides,
    } as Parameters<typeof coordinateTanstackDevelopmentWorkspaceUpdate>[0]);
  return { registry, close, handle, resolveTrustedWorkspace,
    authorizeCurrentSavedSource, sandbox, update };
}

describe("internal TanStack development workspace binding (not routed)", () => {
  it("revalidates saved source and forwards only the admitted source path to the suspended writer", async () => {
    const f = fixture();
    const result = await f.update();
    expect(result).toMatchObject({ action: "updated", sourceVersion: 8 });
    expect(f.authorizeCurrentSavedSource).toHaveBeenCalledTimes(2);
    expect(f.resolveTrustedWorkspace).toHaveBeenCalledTimes(1);
    expect(applySuspendedTanstackDevelopmentSource).toHaveBeenCalledExactlyOnceWith({
      containerId: CID, workspaceRoot: ROOT, workspaceDir: DIR,
      changedPaths: ["src/routes/index.tsx"], next,
    });
    expect(f.registry.get("preview_a")?.sourceVersion).toBe(8);
  });

  it("refuses immutable preview and cross-owner request without consulting workspace handles", async () => {
    const f = fixture("immutable");
    await expect(f.update()).rejects.toThrow("Preview not found.");
    expect(f.resolveTrustedWorkspace).not.toHaveBeenCalled();
    const g = fixture();
    await expect(g.update({actorKey:"other"})).rejects.toThrow("Forbidden.");
    expect(g.resolveTrustedWorkspace).not.toHaveBeenCalled();
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
  });

  it("requires a driver-bound preview, actor, project, revision, identity and container", async () => {
    for (const changed of [
      { previewId: "other" }, { ownerKey: "other" }, { buildProjectId: "other" },
      { sourceVersion: 6 }, { identityFingerprint: "other" },
      { containerId: "f".repeat(64) }, { workspaceDir: "" },
    ]) {
      const f = fixture();
      f.resolveTrustedWorkspace.mockResolvedValueOnce({...f.handle,...changed});
      await expect(f.update()).rejects.toThrow("Preview not found.");
      expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
      expect(f.registry.get("preview_a")?.sourceVersion).toBe(7);
    }
  });

  it("refuses a dead, paused, mislabeled, networked or remounted Docker sandbox", async () => {
    const cases = [
      {State:{Running:false,Paused:false}},
      {State:{Running:true,Paused:true}},
      {Config:{Labels:{"com.zoeskoul.runner.purpose":"other"}}},
      {HostConfig:{NetworkMode:"bridge"}},
      {Mounts:[{Type:"bind",RW:true,Source:"/wrong",Destination:"/workspace"}]},
    ];
    for (const replacement of cases) {
      const f = fixture();
      const original = await f.sandbox.inspect();
      f.sandbox.inspect.mockResolvedValueOnce({...original,...replacement});
      await expect(f.update()).rejects.toThrow("Preview not found.");
      expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
    }
  });

  it("fails closed on a missing private workspace record or Docker inspection failure", async () => {
    const f = fixture();
    f.resolveTrustedWorkspace.mockResolvedValueOnce(null as never);
    await expect(f.update()).rejects.toThrow("Preview not found.");
    const g = fixture();
    g.sandbox.inspect.mockRejectedValueOnce(new Error("Docker offline"));
    await expect(g.update()).rejects.toThrow("Preview not found.");
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
  });

  it("does not consult Docker or write when dependency/config identity requires restart", async () => {
    const f = fixture();
    const dependency = { ...next, files: next.files.map(item => item.path === "package.json"
      ? {...item,content:'{"private":true,"new":"package"}'} : item) };
    await expect(f.update({next: dependency})).resolves.toMatchObject({action:"restart_required"});
    expect(f.resolveTrustedWorkspace).not.toHaveBeenCalled();
    expect(docker.getContainer).not.toHaveBeenCalled();
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
  });

  it("quarantines and closes the lease if the suspended writer fails", async () => {
    const f = fixture();
    vi.mocked(applySuspendedTanstackDevelopmentSource)
      .mockRejectedValueOnce(new Error("private writer failure"));
    await expect(f.update()).rejects.toThrow("Development preview update failed.");
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.registry.get("preview_a")).toBeNull();
  });

  it("quarantines after a successful write if the saved source changes before commit", async () => {
    const f = fixture();
    f.authorizeCurrentSavedSource.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("newer revision"));
    await expect(f.update()).rejects.toThrow("Development preview update failed.");
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.registry.get("preview_a")).toBeNull();
  });
});
