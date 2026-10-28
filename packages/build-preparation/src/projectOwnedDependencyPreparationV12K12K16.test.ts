import { describe, expect, it } from "vitest";
import {
  PROJECT_DEPENDENCY_APPROVAL_PATH,
  ProjectDependencyApprovalError,
  inspectProjectOwnedDependencyPreparation,
  sealProjectDependencies,
} from "./projectDependencyApproval";

const projectId = "project-with-own-dependencies";
const secret = "k16-server-only-approval-secret-long-enough-123456";
const manifest = (extra: Record<string,string> = {}) => JSON.stringify({
  name: "saved-project", packageManager: "pnpm@10.33.0",
  scripts: {build:"vite build"},
  dependencies:{react:"19.2.3","react-dom":"19.2.3",...extra},
  devDependencies:{vite:"8.1.5"},
});
const files = (packageJson: string, lockfile?:string, approval?:string) => {
  const result = new Map<string,string>([["package.json",packageJson]]);
  if (lockfile !== undefined) result.set("pnpm-lock.yaml",lockfile);
  if (approval !== undefined) result.set(PROJECT_DEPENDENCY_APPROVAL_PATH,approval);
  return result;
};

describe("K16 project-owned dependency preparation", () => {
  it("accepts two different pinned manifests independently of starter packages", () => {
    const v1=manifest();
    const v2=manifest({"lucide-react":"0.468.0"});
    for (const pkg of [v1,v2]) {
      expect(inspectProjectOwnedDependencyPreparation({projectId,files:files(pkg),secret}))
        .toBe("resolve-lock");
    }
    const lock1="lockfileVersion: '9.0'\n# v1\n";
    const lock2="lockfileVersion: '9.0'\n# v2\n";
    for (const [pkg,lock] of [[v1,lock1],[v2,lock2]]) {
      const approval=sealProjectDependencies({projectId,packageJson:pkg,lockfile:lock,secret});
      expect(inspectProjectOwnedDependencyPreparation({projectId,files:files(pkg,lock,approval),secret}))
        .toBe("already-approved");
    }
  });

  it("never treats an unsigned existing lock as approved", () => {
    expect(inspectProjectOwnedDependencyPreparation({
      projectId, files:files(manifest(),"lockfileVersion: '9.0'\n"), secret,
    })).toBe("resolve-lock");
  });

  it("fails closed on an altered seal, a mismatched lock, or a cross-project signature", () => {
    const pkg=manifest(); const lock="lockfileVersion: '9.0'\n";
    const approval=sealProjectDependencies({projectId,packageJson:pkg,lockfile:lock,secret});
    for (const attempt of [
      {projectId,files:files(manifest({"lucide-react":"0.468.0"}),lock,approval)},
      {projectId,files:files(pkg,lock+"tampered",approval)},
      {projectId:"another-project",files:files(pkg,lock,approval)},
    ]) expect(() => inspectProjectOwnedDependencyPreparation({...attempt,secret}))
      .toThrow(ProjectDependencyApprovalError);
  });

  it("rejects unpinned packages, install controls and package-manager changes", () => {
    for (const pkg of [manifest({"lucide-react":"^0.468.0"}),
      manifest({"plugin":"file:../plugin"}),
      manifest().replace("pnpm@10.33.0","npm@11.0.0")]) {
      expect(() => inspectProjectOwnedDependencyPreparation({projectId,files:files(pkg),secret}))
        .toThrow(ProjectDependencyApprovalError);
    }
    const config=files(manifest()); config.set(".npmrc","registry=https://untrusted.invalid");
    expect(() => inspectProjectOwnedDependencyPreparation({projectId,files:config,secret}))
      .toThrow(ProjectDependencyApprovalError);
  });
});
