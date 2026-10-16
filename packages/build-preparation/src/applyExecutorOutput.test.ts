import { describe, expect, it } from "vitest";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { materializeRegisteredBuildProject } from "@zoeskoul/build-materializer";

import {
  BuildBootstrapOutputError,
  applyDependencyLockBootstrapExecution,
} from "./index";

const specification: ProjectSpecification = {
  version: 1,
  name: "Lock output test",
  projectType: "frontend-app",
  targets: ["web"],
  requirements: {
    backend: false,
    database: false,
    auth: false,
    storage: false,
    payments: false,
    email: false,
    commerce: false,
  },
  pages: ["Home"],
  stackId: "react-vite-v1",
  deployment: { preference: "static" },
};

function workspace() {
  return materializeRegisteredBuildProject({
    specification,
    createdAt: 1,
  }).workspace;
}

function execution(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    result: {
      protocolVersion: 1 as const,
      operation: "dependency-lock-bootstrap" as const,
      buildProjectId: "build_1",
      sourceVersion: 4,
      output: {
        path: "pnpm-lock.yaml" as const,
        content: "lockfileVersion: '9.0'\n",
      },
      ...overrides,
    },
  };
}

describe("dependency-lock bootstrap output application", () => {
  it("adds exactly one root pnpm-lock.yaml without changing active editor state", () => {
    const before = workspace();

    const after = applyDependencyLockBootstrapExecution({
      workspace: before,
      buildProjectId: "build_1",
      sourceVersion: 4,
      execution: execution(),
      nodeId: "lock_node",
      now: 25,
    });

    expect(after.nodes).toHaveLength(before.nodes.length + 1);
    expect(after.nodes.at(-1)).toEqual({
      id: "lock_node",
      kind: "file",
      name: "pnpm-lock.yaml",
      parentId: null,
      content: "lockfileVersion: '9.0'\n",
      createdAt: 25,
      updatedAt: 25,
    });
    expect(after.activeFileId).toBe(before.activeFileId);
    expect(after.entryFileId).toBe(before.entryFileId);
    expect(after.openTabs).toEqual(before.openTabs);
  });

  it("rejects stale or mismatched runner results", () => {
    expect(() =>
      applyDependencyLockBootstrapExecution({
        workspace: workspace(),
        buildProjectId: "build_1",
        sourceVersion: 4,
        execution: execution({ sourceVersion: 3 }),
        nodeId: "lock_node",
        now: 25,
      }),
    ).toThrow(BuildBootstrapOutputError);

    expect(() =>
      applyDependencyLockBootstrapExecution({
        workspace: workspace(),
        buildProjectId: "build_1",
        sourceVersion: 4,
        execution: execution({ buildProjectId: "build_other" }),
        nodeId: "lock_node",
        now: 25,
      }),
    ).toThrow(BuildBootstrapOutputError);
  });

  it("refuses to overwrite an existing lockfile", () => {
    const base = workspace();
    const withLock = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "existing-lock",
          kind: "file" as const,
          name: "pnpm-lock.yaml",
          parentId: null,
          content: "existing",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    expect(() =>
      applyDependencyLockBootstrapExecution({
        workspace: withLock,
        buildProjectId: "build_1",
        sourceVersion: 4,
        execution: execution(),
        nodeId: "new-lock",
        now: 25,
      }),
    ).toThrow(/cannot overwrite/i);
  });
});
