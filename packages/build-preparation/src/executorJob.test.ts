import { describe, expect, it } from "vitest";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { parseTrustedBuildJobRequest } from "@zoeskoul/build-executor-contracts";
import { materializeRegisteredBuildProject } from "@zoeskoul/build-materializer";
import { BuildPreparationError, createRegisteredDependencyLockBootstrapJob } from "./index";

const requirements = {
  backend: false, database: false, auth: false, storage: false,
  payments: false, email: false, commerce: false,
} as const;

function spec(stackId: "static-html-v1" | "react-vite-v1"): ProjectSpecification {
  return {
    version: 1,
    name: "Executor job",
    projectType: stackId === "static-html-v1" ? "static-site" : "frontend-app",
    targets: ["web"],
    requirements,
    pages: ["Home"],
    stackId,
    deployment: { preference: "static" },
  };
}

function workspace(stackId: "static-html-v1" | "react-vite-v1") {
  return materializeRegisteredBuildProject({ specification: spec(stackId), createdAt: 1 }).workspace;
}

describe("dependency-lock bootstrap job creation", () => {
  it("creates a shell-free shared executor request from registered React source", () => {
    const job = createRegisteredDependencyLockBootstrapJob({
      buildProjectId: " build_1 ",
      specification: spec("react-vite-v1"),
      workspace: workspace("react-vite-v1"),
      sourceVersion: 1,
    });

    expect(parseTrustedBuildJobRequest(job)).toEqual(job);
    expect(job).toMatchObject({
      protocolVersion: 1,
      operation: "dependency-lock-bootstrap",
      buildProjectId: "build_1",
      stackId: "react-vite-v1",
      templateId: "react-vite-v1",
    });

    const raw = job as unknown as Record<string, unknown>;
    for (const key of ["command", "argv", "shell", "cwd", "env", "network"]) {
      expect(raw[key]).toBeUndefined();
    }
  });

  it("refuses dependency-free static source", () => {
    expect(() => createRegisteredDependencyLockBootstrapJob({
      buildProjectId: "build_static",
      specification: spec("static-html-v1"),
      workspace: workspace("static-html-v1"),
      sourceVersion: 1,
    })).toThrow(BuildPreparationError);
  });
});
