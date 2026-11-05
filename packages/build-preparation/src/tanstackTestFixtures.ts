import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { materializeRegisteredBuildProject } from "@zoeskoul/build-materializer";
import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";
import { sealProjectDependencies, PROJECT_DEPENDENCY_APPROVAL_PATH } from "./projectDependencyApproval";

export const projectId = "build_test_tanstack";
export const secret = "tanstack-dev-test-approval-secret-0123456789abcdef";
export const specification: ProjectSpecification = {
  version: 1,
  name: "TanStack test project",
  projectType: "fullstack-app",
  targets: ["web"],
  requirements: { backend: true, database: false, auth: false, storage: false,
    payments: false, email: false, commerce: false },
  pages: ["Home", "About"],
  stackId: "tanstack-start-v1",
  deployment: { preference: "managed-runtime" },
};

export function fresh(): WorkspaceStateV2 {
  return materializeRegisteredBuildProject({ specification, createdAt: 1 }).workspace;
}

function rootFile(id: string, name: string, content: string) {
  return { id, name, content, kind: "file" as const,
    parentId: null, createdAt: 2, updatedAt: 2 };
}
export function withLock(workspace = fresh(), lock = "lockfileVersion: '9.0'\n") {
  return { ...workspace, nodes: [...workspace.nodes,
    rootFile("test-lock", "pnpm-lock.yaml", lock)] };
}
export function withSignedLock(workspace = fresh(), lock = "lockfileVersion: '9.0'\n") {
  const pkg = workspace.nodes.find(n => n.parentId === null && n.kind === "file" && n.name === "package.json");
  if (!pkg || pkg.kind !== "file") throw new Error("Test package.json unavailable");
  const signed = sealProjectDependencies({projectId, packageJson:pkg.content, lockfile:lock, secret});
  const locked = withLock(workspace,lock);
  return { ...locked, nodes: [...locked.nodes,
    rootFile("test-approval", PROJECT_DEPENDENCY_APPROVAL_PATH, signed)] };
}
