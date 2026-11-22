import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPreparationError, createRegisteredProductionBuildJob } from "./index";
import { fresh, withLock, withSignedLock, specification, projectId, secret } from "./tanstackTestFixtures";

afterEach(() => vi.unstubAllEnvs());
const run = (workspace: ReturnType<typeof fresh>, buildProjectId = projectId) =>
  createRegisteredProductionBuildJob({ buildProjectId, specification, workspace, sourceVersion: 4 });

describe("trusted TanStack Start preview build request", () => {
  it("emits a command-free authenticated request for the canonical Worker stack", () => {
    vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET",secret);
    const request=run(withSignedLock());
    expect(request).toMatchObject({operation:"production-build",stackId:"tanstack-start-v1",
      templateId:"tanstack-start-v1",sourceVersion:4,buildProjectId:projectId});
    expect(request.files.map(f=>f.path)).toContain("zoebuild-dependency-approval.json");
    expect(JSON.stringify(request)).not.toContain('"command":');
  });
  it("rejects an unsealed lockfile, even when it matches the trusted starter", () => {
    vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET",secret);
    expect(()=>run(withLock())).toThrow(BuildPreparationError);
    expect(()=>run(fresh())).toThrow(BuildPreparationError);
  });
  it("rejects a signed source changed after approval or signed for another project", () => {
    vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET",secret);
    expect(()=>run(withSignedLock(fresh(),"lockfileVersion: '9.0'\n"), "another-project"))
      .toThrow(BuildPreparationError);
    const signed=withSignedLock();
    const changed={...signed,nodes:signed.nodes.map(n=>
      n.kind==="file" && n.name==="pnpm-lock.yaml" ? {...n,content:n.content+"tampered\n"} : n)};
    expect(()=>run(changed)).toThrow(BuildPreparationError);
  });
});

describe("managed image source is materialized as binary bytes", () => {
  const image = {
    encoding:"base64" as const, data:"YWJj",mimeType:"image/png",
    sizeBytes:3,checksum:`sha256:${"a".repeat(64)}`,
  };
  it("keeps verified images separate from text and preserves original path", () => {
    vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET",secret);
    const workspace=withSignedLock();
    const withImage={...workspace,nodes:[...workspace.nodes,{
      id:"png-node",kind:"file" as const,name:"pilot-red.png",parentId:null,
      content:"",binary:image,createdAt:2,updatedAt:2,
    }]};
    const request=run(withImage);
    expect(request.binaryFiles).toMatchObject([{path:"pilot-red.png",data:"YWJj"}]);
    expect(request.files.some(file=>file.path==="pilot-red.png")).toBe(false);
  });
  it("rejects an unhydrated PNG instead of creating an empty text file", () => {
    vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET",secret);
    const workspace=withSignedLock();
    const withImage={...workspace,nodes:[...workspace.nodes,{
      id:"png-node",kind:"file" as const,name:"pilot-red.png",parentId:null,
      content:"",createdAt:2,updatedAt:2,
    }]};
    expect(()=>run(withImage)).toThrow(BuildPreparationError);
  });
});
