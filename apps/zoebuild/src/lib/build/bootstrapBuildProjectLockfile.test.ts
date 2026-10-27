import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BuildSourceConflictError,
  type BuildProjectReadPort,
  type BuildProjectSourceWritePort,
} from "@zoeskoul/build-application";

import {
  bootstrapOwnedBuildProjectDependencyLock,
  type BuildDependencyLockExecutor,
} from "./bootstrapBuildProjectLockfile";

type OwnedBuildProject = NonNullable<
  Awaited<ReturnType<BuildProjectReadPort["getOwnedBuildProject"]>>
>;
type SourceWriteInput =
  Parameters<BuildProjectSourceWritePort["saveOwnedBuildProjectSource"]>[0];

const packageJson = `{
  "name": "zoe-build-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "typescript": "6.0.3",
    "vite": "8.1.5"
  }
}
`;

const workspace = {
  version: 2,
  language: "web",
  nodes: [{
    id: "package.json",
    kind: "file",
    name: "package.json",
    parentId: null,
    content: packageJson,
    createdAt: 1,
    updatedAt: 1,
  }],
  openTabs: ["package.json"],
  activeFileId: "package.json",
  entryFileId: "package.json",
  stdin: "",
  expanded: [],
  leftPct: 26,
};

const project = {
  buildProjectId: "build_1",
  codeProjectId: "code_1",
  title: "Example",
  description: null,
  status: "draft",
  stackId: "react-vite-v1",
  sourceVersion: 4,
  language: "web",
  updatedAt: "2026-10-14T00:00:00.000Z",
  entryPath: "package.json",
  activePath: "package.json",
  workspace,
  specification: {
    version: 1,
    name: "Bootstrap orchestration",
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
  },
} as unknown as OwnedBuildProject;

function reader(
  value: OwnedBuildProject | null = project,
): BuildProjectReadPort {
  return {
    listOwnedBuildProjects: vi.fn(async () => []),
    getOwnedBuildProject: vi.fn(async () => value),
  };
}

function executor(): BuildDependencyLockExecutor {
  const run: BuildDependencyLockExecutor = vi.fn(async ({ request }) => ({
    ok: true as const,
    result: {
      protocolVersion: 1 as const,
      operation: "dependency-lock-bootstrap" as const,
      buildProjectId: request.buildProjectId,
      sourceVersion: request.sourceVersion,
      output: {
        path: "pnpm-lock.yaml" as const,
        content: "lockfileVersion: '9.0'\n",
      },
    },
  }));
  return run;
}

describe("owner-authorized dependency-lock bootstrap orchestration", () => {
  beforeEach(() => { vi.stubEnv("ZOEBUILD_DEPENDENCY_APPROVAL_SECRET", "local-test-key-for-project-approval-123456789"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("executes the owner source version then persists through the canonical Build writer", async () => {
    const store = reader();
    const run = executor();
    const saveOwnedBuildProjectSource = vi.fn(
      async (input: SourceWriteInput) => ({
        sourceVersion: input.baseVersion + 1,
        changed: true,
        workspaceChanged: true,
        updatedAt: "2026-10-14T00:00:01.000Z",
      }),
    );
    const writer: BuildProjectSourceWritePort = {
      saveOwnedBuildProjectSource,
    };

    const result = await bootstrapOwnedBuildProjectDependencyLock({
      access: { userId: "user_1", entitlements: [] },
      buildProjectId: "build_1",
      actorKey: "u:actor",
      reader: store,
      writer,
      execute: run,
      nodeId: "lock_node",
      now: 10,
    });

    expect(store.getOwnedBuildProject).toHaveBeenCalledWith("user_1", "build_1");
    expect(run).toHaveBeenCalledTimes(1);
    expect(saveOwnedBuildProjectSource).toHaveBeenCalledTimes(1);

    const saved = saveOwnedBuildProjectSource.mock.calls[0]?.[0];
    expect(saved?.baseVersion).toBe(4);

    const savedNodes = (saved?.workspace.nodes ?? []) as Array<{
      kind: string;
      name: string;
      content?: string;
    }>;
    expect(
      savedNodes.some(
        (node) =>
          node.kind === "file" &&
          node.name === "pnpm-lock.yaml" &&
          node.content?.includes("lockfileVersion") === true,
      ),
    ).toBe(true);

    expect(savedNodes.some(node => node.name === "zoebuild-dependency-approval.json" &&
      node.content?.includes('"lockSha256"') === true)).toBe(true);
    expect(result).toMatchObject({
      bootstrappedFromVersion: 4,
      outputPath: "pnpm-lock.yaml",
      source: {
        sourceVersion: 5,
        changed: true,
        workspaceChanged: true,
      },
    });
  });

  it("reconciles existing saved dependencies and a new package in one versioned write", async () => {
    const savedProject = {
      ...project,
      workspace: {
        ...workspace,
        openTabs: ["package.json", "old-lock"],
        activeFileId: "old-lock",
        nodes: [
          ...workspace.nodes,
          { id: "old-lock", kind: "file", name: "pnpm-lock.yaml", parentId: null,
            content: "lockfileVersion: '9.0'\nold-lock\n", createdAt: 1, updatedAt: 1 },
        ],
      },
    } as unknown as OwnedBuildProject;
    const sourceWrites: SourceWriteInput[] = [];
    const writer: BuildProjectSourceWritePort = {
      saveOwnedBuildProjectSource: vi.fn(async (input) => {
        sourceWrites.push(input);
        return { sourceVersion: 5, changed: true, workspaceChanged: true, updatedAt: "2026-10-14T00:00:01.000Z" };
      }),
    };
    await bootstrapOwnedBuildProjectDependencyLock({
      access: { userId: "user_1", entitlements: [] },
      buildProjectId: "build_1",
      actorKey: "u:actor",
      reader: reader(savedProject),
      writer,
      execute: executor(),
      nodeId: "new-lock",
      now: 10,
      reconcileExisting: true,
      expectedSourceVersion: 4,
      desiredDependencies: {
        dependencies: { react: "19.2.3", "react-dom": "19.2.3", "react-router": "7.18.4" },
        devDependencies: { "@types/react": "19.2.14", "@types/react-dom": "19.2.3", "@vitejs/plugin-react": "6.0.4", typescript: "6.0.3", vite: "8.1.5" },
      },
    });
    expect(sourceWrites).toHaveLength(1);
    expect(sourceWrites[0]?.baseVersion).toBe(4);
    const nodes = sourceWrites[0]?.workspace.nodes ?? [];
    expect(nodes.filter(n => n.kind === "file" && n.name === "pnpm-lock.yaml")).toHaveLength(1);
    expect(sourceWrites[0]?.workspace.activeFileId).toBe("new-lock");
    expect(sourceWrites[0]?.workspace.openTabs).toContain("new-lock");
    expect(sourceWrites[0]?.workspace.openTabs).not.toContain("old-lock");
    const pkg = nodes.find(n => n.kind === "file" && n.name === "package.json");
    expect(pkg?.kind === "file" && pkg.content.includes("react-router")).toBe(true);
    const approval = nodes.find(n => n.kind === "file" && n.name === "zoebuild-dependency-approval.json");
    expect(approval?.kind === "file" && approval.content.includes('"lockSha256"')).toBe(true);
  });

  it("rejects stale owner approval before contacting the runner", async () => {
    const run = executor();
    const writer: BuildProjectSourceWritePort = { saveOwnedBuildProjectSource: vi.fn() };
    await expect(bootstrapOwnedBuildProjectDependencyLock({
      access: { userId: "user_1", entitlements: [] },
      buildProjectId: "build_1", actorKey: "u:actor",
      reader: reader(), writer, execute: run, nodeId: "lock_node", now: 10,
      reconcileExisting: true, expectedSourceVersion: 3,
    })).rejects.toThrow(/current saved source version/);
    expect(run).not.toHaveBeenCalled();
  });

  it("never executes the runner for a missing or foreign project", async () => {
    const run = executor();
    const writer: BuildProjectSourceWritePort = {
      saveOwnedBuildProjectSource: vi.fn(),
    };

    await expect(
      bootstrapOwnedBuildProjectDependencyLock({
        access: { userId: "user_1", entitlements: [] },
        buildProjectId: "build_missing",
        actorKey: "u:actor",
        reader: reader(null),
        writer,
        execute: run,
        nodeId: "lock_node",
        now: 10,
      }),
    ).resolves.toBeNull();

    expect(run).not.toHaveBeenCalled();
    expect(writer.saveOwnedBuildProjectSource).not.toHaveBeenCalled();
  });

  it("rejects a lockfile result when source changed during execution", async () => {
    const conflict = new BuildSourceConflictError({
      serverVersion: 5,
      serverUpdatedAt: "2026-10-14T00:00:02.000Z",
      title: "Example",
    });

    const writer: BuildProjectSourceWritePort = {
      saveOwnedBuildProjectSource: vi.fn(async () => {
        throw conflict;
      }),
    };

    await expect(
      bootstrapOwnedBuildProjectDependencyLock({
        access: { userId: "user_1", entitlements: [] },
        buildProjectId: "build_1",
        actorKey: "u:actor",
        reader: reader(),
        writer,
        execute: executor(),
        nodeId: "lock_node",
        now: 10,
      }),
    ).rejects.toBe(conflict);

    expect(writer.saveOwnedBuildProjectSource).toHaveBeenCalledWith(
      expect.objectContaining({ baseVersion: 4 }),
    );
  });
});
