import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { createOwnedReactPreviewBuildRequestFromSavedSource } from "./reactPreviewServer";
import { attestCurrentTanstackSavedPreviewSource } from "./reactPreviewSourceAttestationServer";

vi.mock("server-only", () => ({}));
vi.mock("@zoeskoul/platform-server/prisma", () => ({
  prisma: { buildProject: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/server/runnerActorKey", () => ({ requireRunnerActorKey: vi.fn() }));
vi.mock("./reactPreviewServer", () => ({
  createOwnedReactPreviewBuildRequestFromSavedSource: vi.fn(),
}));

const actorKey = `u:${"a".repeat(64)}`;
const request = {
  protocolVersion: 1 as const, operation: "production-build" as const,
  buildProjectId: "project-1", sourceVersion: 8,
  stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
  files: [
    {path:"package.json",content:"{}"},
    {path:"pnpm-lock.yaml",content:"lock"},
    {path:"src/routes/index.tsx",content:"saved"},
  ],
};
const invoke = (input: {actorKey:unknown;request:unknown} = {actorKey,request}) =>
  attestCurrentTanstackSavedPreviewSource(input);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.buildProject.findFirst).mockResolvedValue({ codeProject: { ownerId:"owner-1" } } as never);
  vi.mocked(requireRunnerActorKey).mockResolvedValue(actorKey);
  vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockResolvedValue(request as never);
});

describe("Phase 4B database-authoritative Runner attestation", () => {
  it("derives the owner from Prisma and reads authoritative saved bytes", async () => {
    await expect(invoke()).resolves.toBe(true);
    expect(prisma.buildProject.findFirst).toHaveBeenCalledWith({
      where: { id:"project-1", status: {not:"archived"}, codeProject:{archivedAt:null} },
      select: { codeProject:{select:{ownerId:true}} },
    });
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).toHaveBeenCalledWith({
      access: {userId:"owner-1",entitlements:[]},
      buildProjectId:"project-1",sourceVersion:8,
    });
  });
  it("rejects a foreign actor before reading saved project source", async () => {
    await expect(invoke({actorKey:`u:${"b".repeat(64)}`,request})).resolves.toBe(false);
    expect(createOwnedReactPreviewBuildRequestFromSavedSource).not.toHaveBeenCalled();
  });
  it("rejects missing/archived projects and invalid actors", async () => {
    vi.mocked(prisma.buildProject.findFirst).mockResolvedValueOnce(null);
    await expect(invoke()).resolves.toBe(false);
    await expect(invoke({actorKey:"user-1",request})).resolves.toBe(false);
  });
  it("rejects stale revision, modified source bytes and missing approvals", async () => {
    for (const variant of [ {...request,sourceVersion:7}, {...request,files:request.files.map(f=>f.path.startsWith("src/") ? {...f,content:"tampered"} : f)} ])
      await expect(invoke({actorKey,request:variant})).resolves.toBe(false);
    vi.mocked(createOwnedReactPreviewBuildRequestFromSavedSource).mockRejectedValueOnce(new Error("approval revoked"));
    await expect(invoke()).resolves.toBe(false);
  });
  it("refuses malformed requests without querying the database", async () => {
    await expect(invoke({actorKey,request:{...request, sourceVersion:"8"}})).resolves.toBe(false);
    await expect(invoke({actorKey,request:{...request,buildProjectId:"../other"}})).resolves.toBe(false);
    expect(prisma.buildProject.findFirst).not.toHaveBeenCalled();
  });
});
