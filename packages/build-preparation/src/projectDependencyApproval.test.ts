import { describe, expect, it } from "vitest";
import {
  PROJECT_DEPENDENCY_APPROVAL_PATH,
  assertRegisteredDependencyBootstrapFiles,
} from "./index";
import { TANSTACK_START_TEMPLATE_V1 } from "@zoeskoul/build-template-registry";
import {
  assertNoUntrustedInstallControls,
  canonicalProjectDependencyManifest,
  sealProjectDependencies,
  verifyProjectDependencies,
} from "./projectDependencyApproval";

const secret = "v12k12-test-secret-must-be-at-least-32-characters";
const templatePackageJson = TANSTACK_START_TEMPLATE_V1.files.find(
  (file) => file.path === "package.json",
);
if (!templatePackageJson) throw new Error("TanStack template package.json is required by this test.");
const packageJson = templatePackageJson.content;
const lockfile = "lockfileVersion: '9.0'\n";
const projectId = "project-forma-v13";

function bootstrapFiles() {
  return [
    { path: "package.json", content: packageJson },
    { path: PROJECT_DEPENDENCY_APPROVAL_PATH, content: sealProjectDependencies({ projectId, packageJson, secret }) },
  ];
}

function productionFiles() {
  return [
    { path: "package.json", content: packageJson },
    { path: "pnpm-lock.yaml", content: lockfile },
    { path: PROJECT_DEPENDENCY_APPROVAL_PATH, content: sealProjectDependencies({ projectId, packageJson, lockfile, secret }) },
  ];
}

describe("V12K12 immutable project-owned dependency approval", () => {
  it("verifies a project-owned dependency snapshot independently of registry lookup", () => {
    const approval = sealProjectDependencies({ projectId, packageJson, lockfile, secret });
    expect(() => verifyProjectDependencies({ projectId, packageJson, lockfile, approval, secret })).not.toThrow();
    expect(() => canonicalProjectDependencyManifest(packageJson)).not.toThrow();
  });

  it("validates TanStack bootstrap and production source using the same project authorization", () => {
    const previous = process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET;
    process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET = secret;
    try {
      expect(() => assertRegisteredDependencyBootstrapFiles({
        buildProjectId: projectId, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1", files: bootstrapFiles(),
      })).not.toThrow();
      const approved = new Map(productionFiles().map((file) => [file.path, file.content]));
      expect(() => verifyProjectDependencies({
        projectId, packageJson, lockfile,
        approval: approved.get(PROJECT_DEPENDENCY_APPROVAL_PATH) ?? "", secret,
      })).not.toThrow();
      const bootstrapApproval = new Map(bootstrapFiles().map((file) => [file.path, file.content]));
      expect(() => verifyProjectDependencies({
        projectId, packageJson, lockfile,
        approval: bootstrapApproval.get(PROJECT_DEPENDENCY_APPROVAL_PATH) ?? "", secret,
      })).toThrow(/changed after approval/i);
    } finally {
      if (previous === undefined) delete process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET;
      else process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET = previous;
    }
  });

  it("refuses cross-project replay, modified locks, forged signatures, and unpinned packages", () => {
    const approval = sealProjectDependencies({ projectId, packageJson, lockfile, secret });
    for (const mismatch of [
      { projectId: "another-project", packageJson, lockfile, approval, secret },
      { projectId, packageJson, lockfile: "corrupted lock", approval, secret },
      { projectId, packageJson, lockfile, approval, secret: "different-secret-12345678901234567890" },
    ]) {
      expect(() => verifyProjectDependencies(mismatch)).toThrow();
    }
    expect(() => canonicalProjectDependencyManifest(packageJson.replace('"19.2.3"', '"^19.2.3"'))).toThrow();
    expect(() => canonicalProjectDependencyManifest(packageJson.replace('"vite": "8.1.5"', '"vite": "file:../local"'))).toThrow();
  });

  it("refuses install behavior overrides even for otherwise pinned source", () => {
    expect(() => assertNoUntrustedInstallControls(new Map([[".npmrc", "registry=http://malicious"]]))).toThrow();
    expect(() => assertNoUntrustedInstallControls(new Map([["node_modules/postinstall.js", "code"]]))).toThrow();
  });
});
