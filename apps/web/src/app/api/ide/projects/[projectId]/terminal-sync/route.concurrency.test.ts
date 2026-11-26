import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findFirst: vi.fn(),
    update: vi.fn(),
    requireProjectCapability: vi.fn(),
    requireRunnerActorKey: vi.fn(),
    runnerPost: vi.fn(),
    mergeWorkspaceWithTerminalSnapshot: vi.fn(),
    validateWorkspaceNodes: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        codeProject: {
            findFirst: mocks.findFirst,
            update: mocks.update,
        },
    },
}));
vi.mock("@/lib/server/runnerActorKey", () => ({
    requireRunnerActorKey: mocks.requireRunnerActorKey,
}));
vi.mock("@/lib/server/runnerClient", () => ({
    runnerPost: mocks.runnerPost,
    RunnerHttpError: class RunnerHttpError extends Error {
        constructor(public readonly status: number, message: string) {
            super(message);
        }
    },
}));
vi.mock("@/lib/projects/workspaceTerminalSync", () => ({
    mergeWorkspaceWithTerminalSnapshot: mocks.mergeWorkspaceWithTerminalSnapshot,
}));
vi.mock("@/lib/projects/projectRouteUtils", () => ({
    jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
    requireProjectCapability: mocks.requireProjectCapability,
    toPrismaJson: (value: unknown) => value,
    toWorkspaceAccessFromProjectGate: () => ({}),
}));
vi.mock("@/components/ide/fsTree", () => ({ pathOf: () => "main.py" }));
vi.mock("@/components/ide/workspaceHook/workspace.policy", () => ({
    resolveWorkspacePolicy: () => ({}),
    validateWorkspaceNodes: mocks.validateWorkspaceNodes,
}));
vi.mock("@zoeskoul/curriculum-contracts", () => ({
    isWorkspaceLanguage: () => true,
}));

import { POST } from "./route";

const project = {
    id: "project-one",
    ownerId: "learner-one",
    title: "Course 2 workspace",
    description: null,
    language: "python",
    scopeKind: "personal",
    visibility: "private",
    currentVersion: 7,
    updatedAt: new Date("2026-11-16T19:00:00.000Z"),
    workspace: { version: 2, language: "python", nodes: [] },
    entryPath: "main.py",
    activePath: "main.py",
    settings: null,
    meta: null,
};

function request(baseVersion?: number) {
    return new Request("http://localhost/api/ide/projects/project-one/terminal-sync", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-one", ...(baseVersion ? {baseVersion} : {}) }),
        headers: { "Content-Type": "application/json" },
    });
}

async function call(baseVersion?: number) {
    return POST(request(baseVersion), { params: Promise.resolve({ projectId: "project-one" }) });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireProjectCapability.mockResolvedValue({
        ok: true,
        actor: { userId: "learner-one" },
        capabilities: { canSaveCloud: true },
    });
    mocks.requireRunnerActorKey.mockResolvedValue("u:learnertest");
    mocks.findFirst.mockResolvedValue(project);
    mocks.runnerPost.mockResolvedValue({ ok: true, files: [{ kind: "file", path: "main.py", content: "safe" }] });
    mocks.mergeWorkspaceWithTerminalSnapshot.mockReturnValue({ version: 2, language: "python", nodes: [] });
    mocks.validateWorkspaceNodes.mockReturnValue(null);
    mocks.update.mockResolvedValue({ ...project, currentVersion: 8 });
});

describe("terminal-sync atomic project version and ownership", () => {
    it("writes only when owner, active state and observed version still match", async () => {
        const response = await call(7);
        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { buildProject: { is: null },
                id: "project-one",
                ownerId: "learner-one",
                archivedAt: null,
                currentVersion: 7,
            },
            data: expect.objectContaining({ currentVersion: 8 }),
        }));
    });

    it("returns a complete actor-scoped version conflict after an intervening cloud save", async () => {
        const latest = {
            ...project,
            currentVersion: 8,
            updatedAt: new Date("2026-11-16T19:02:00.000Z"),
            workspace: { version: 2, language: "python", nodes: [{ id: "newer" }] },
        };
        mocks.findFirst.mockResolvedValueOnce(project).mockResolvedValueOnce(latest);
        mocks.update.mockRejectedValueOnce(Object.assign(new Error("Record not found"), { code: "P2025" }));
        const response = await call(7);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual(expect.objectContaining({
            ok: false,
            code: "PROJECT_CONFLICT",
            conflict: {
                projectId: "project-one",
                clientBaseVersion: 7,
                serverVersion: 8,
                serverUpdatedAt: "2026-11-16T19:02:00.000Z",
                title: "Course 2 workspace",
            },
            project: expect.objectContaining({
                id: "project-one",
                currentVersion: 8,
                workspace: latest.workspace,
                role: "owner",
            }),
        }));
        expect(mocks.findFirst).toHaveBeenCalledTimes(2);
        expect(mocks.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: { buildProject: { is: null }, id: "project-one", ownerId: "learner-one", archivedAt: null },
        }));
        expect(mocks.runnerPost).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });

    it("fails closed if a project becomes inaccessible during a snapshot", async () => {
        mocks.findFirst.mockResolvedValueOnce(project).mockResolvedValueOnce(null);
        mocks.update.mockRejectedValueOnce(Object.assign(new Error("Record not found"), { code: "P2025" }));
        const response = await call(7);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ ok: false, error: "Project not found." });
        expect(mocks.findFirst).toHaveBeenCalledTimes(2);
        expect(mocks.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: { buildProject: { is: null }, id: "project-one", ownerId: "learner-one", archivedAt: null },
        }));
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });

    it("rejects an already-stale version before reaching Runner", async () => {
        const response = await call(6);
        expect(response.status).toBe(409);
        expect(mocks.runnerPost).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("enforces the version predicate even for clients omitting baseVersion", async () => {
        const response = await call();
        expect(response.status).toBe(200);
        expect(mocks.update.mock.calls[0]?.[0]?.where?.currentVersion).toBe(7);
    });

    it("does not ask Runner for a project outside the signed-in owner's scope", async () => {
        mocks.findFirst.mockResolvedValueOnce(null);
        const response = await call(7);
        expect(response.status).toBe(404);
        expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { buildProject: { is: null }, id: "project-one", ownerId: "learner-one", archivedAt: null },
        }));
        expect(mocks.runnerPost).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
