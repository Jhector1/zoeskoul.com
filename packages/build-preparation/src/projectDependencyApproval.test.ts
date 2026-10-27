import { describe, expect, it } from "vitest";
import {
  PROJECT_DEPENDENCY_APPROVAL_PATH,
  assertRegisteredDependencyBootstrapFiles,
  assertRegisteredProductionBuildFiles,
} from "./index";
import {
  assertNoUntrustedInstallControls,
  canonicalProjectDependencyManifest,
  sealProjectDependencies,
  verifyProjectDependencies,
} from "./projectDependencyApproval";

const secret = "v12k12-test-secret-must-be-at-least-32-characters";
const packageJson = JSON.stringify({
  name: "saved-forma-app",
  packageManager: "pnpm@10.33.0",
  scripts: { build: "vite build" },
  dependencies: { react: "19.2.3", "react-dom": "19.2.3" },
  devDependencies: { vite: "8.1.5", typescript: "6.0.3" },
}, null, 2);
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
  it("admits a saved old React project independently of the starter's current packages", () => {
    const approval = sealProjectDependencies({ projectId, packageJson, lockfile, secret });
    expect(() => verifyProjectDependencies({ projectId, packageJson, lockfile, approval, secret })).not.toThrow();
    expect(() => canonicalProjectDependencyManifest(packageJson)).not.toThrow();
  });

  it("validates runner bootstrap and production paths using the same project authorization", () => {
    const previous = process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET;
    process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET = secret;
    try {
      expect(() => assertRegisteredDependencyBootstrapFiles({
        buildProjectId: projectId, stackId: "react-vite-v1", templateId: "react-vite-v1", files: bootstrapFiles(),
      })).not.toThrow();
      expect(() => assertRegisteredProductionBuildFiles({
        buildProjectId: projectId, stackId: "react-vite-v1", templateId: "react-vite-v1", files: productionFiles(),
      })).not.toThrow();
      expect(() => assertRegisteredProductionBuildFiles({
        buildProjectId: projectId, stackId: "react-vite-v1", templateId: "react-vite-v1", files: [
          ...bootstrapFiles(), { path: "pnpm-lock.yaml", content: lockfile },
        ],
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
