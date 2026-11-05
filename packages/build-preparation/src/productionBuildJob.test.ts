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
