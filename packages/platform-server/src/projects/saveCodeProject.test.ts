import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul/db", () => ({
    CodeProjectScopeKind: {personal: "personal"},
    CodeProjectVisibility: {private: "private"},
}));
vi.mock("@zoeskoul/platform-server/prisma", () => ({
    Prisma: {JsonNull: {__jsonNull: true}},
}));

import { ProjectVersionConflictError, saveCodeProjectInTransaction } from "./saveCodeProject";

const date = new Date("2026-11-09T00:00:00.000Z");
function row(version = 4) {
    return {
        id: "p1", ownerId: "u1", title: "Original", description: null,
        language: "python", scopeKind: "personal", subjectId: null,
        moduleId: null, assignmentId: null, scopeKey: null,
        visibility: "private", shareToken: null, currentVersion: version,
        entryPath: null, activePath: null, workspaceHash: "old",
        workspace: {files: ["old"]}, settings: null, meta: null,
        updatedAt: date, archivedAt: null,
    };
}
function input(baseVersion: number) {
    return {
        projectId: "p1", ownerId: "u1", title: "Changed", language: "python",
        workspace: {files: ["new"]}, baseVersion, createRevision: true,
    };
}

describe("code project atomic version guard", () => {
    it("rejects an already stale save before attempting an update", async () => {
        const updateMany = vi.fn();
        const tx = {
            codeProject: {findFirst: vi.fn().mockResolvedValueOnce(row(5)), updateMany},
            codeProjectRevision: {create: vi.fn()},
        };
        await expect(saveCodeProjectInTransaction(tx as any, input(4)))
            .rejects.toBeInstanceOf(ProjectVersionConflictError);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("rejects a racing write that commits after the preflight read", async () => {
        const latest = {...row(5), title: "Other tab"};
        const updateMany = vi.fn().mockResolvedValue({count: 0});
        const createRevision = vi.fn();
        const tx = {
            codeProject: {
                findFirst: vi.fn().mockResolvedValueOnce(row()).mockResolvedValueOnce(latest),
                updateMany,
            },
            codeProjectRevision: {create: createRevision},
        };
        const saved = saveCodeProjectInTransaction(tx as any, input(4));
        await expect(saved).rejects.toMatchObject({
            code: "PROJECT_CONFLICT", projectId: "p1", serverVersion: 5,
        });
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({id: "p1", ownerId: "u1", currentVersion: 4, archivedAt: null}),
        }));
        expect(createRevision).not.toHaveBeenCalled();
    });

    it("acknowledges only a conditional update and creates one revision", async () => {
        const next = {...row(5), title: "Changed", workspace: {files: ["new"]}};
        const updateMany = vi.fn().mockResolvedValue({count: 1});
        const createRevision = vi.fn().mockResolvedValue({id: "r5"});
        const tx = {
            codeProject: {
                findFirst: vi.fn().mockResolvedValueOnce(row()).mockResolvedValueOnce(next),
                updateMany,
            },
            codeProjectRevision: {create: createRevision},
        };
        const result = await saveCodeProjectInTransaction(tx as any, input(4));
        expect(result.version).toBe(5);
        expect(result.project.currentVersion).toBe(5);
        expect(updateMany).toHaveBeenCalledTimes(1);
        expect(createRevision).toHaveBeenCalledTimes(1);
        expect(createRevision).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({projectId: "p1", version: 5}),
        }));
    });
});

describe("idempotent cloud project creation", () => {
    const idempotencyKey = "create-6defd617-f283-439c-9960-aa392828baf4";
    const creation = () => ({
        ownerId:"u1", title:"New", language:"python",
        workspace:{files:["first"]}, creationRequestKey:idempotencyKey,
        createRevision:true,
    });
    it("creates one project and one revision on the first attempt",async()=>{
        const created={...row(1),id:"new", creationRequestKey:idempotencyKey};
        const create=vi.fn().mockResolvedValue(created);
        const revision=vi.fn().mockResolvedValue({id:"rev"});
        const tx={codeProject:{findFirst:vi.fn().mockResolvedValue(null),create},codeProjectRevision:{create:revision}};
        const result=await saveCodeProjectInTransaction(tx as any,creation());
        expect(result.project.id).toBe("new");
        expect(create).toHaveBeenCalledTimes(1);
        expect(revision).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].data.creationRequestHash).toMatch(/^[0-9a-f]{64}$/);
    });
    it("returns an existing creation without creating a second revision", async()=>{
        const fresh={codeProject:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn()},codeProjectRevision:{create:vi.fn()}};
        const first=await saveCodeProjectInTransaction({...fresh,codeProject:{...fresh.codeProject,create:vi.fn().mockImplementation(async({data}:any)=>({...row(1),...data,id:"new"}))}} as any,creation());
        const tx={codeProject:{findFirst:vi.fn().mockResolvedValue(first.project),create:vi.fn()},codeProjectRevision:{create:vi.fn()}};
        const replay=await saveCodeProjectInTransaction(tx as any,creation());
        expect(replay.project.id).toBe("new");
        expect(tx.codeProject.create).not.toHaveBeenCalled();
        expect(tx.codeProjectRevision.create).not.toHaveBeenCalled();
    });
    it("refuses to reuse the same key for different contents",async()=>{
        const firstTx={codeProject:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn().mockImplementation(async({data}:any)=>({...row(1),...data,id:"new"}))},codeProjectRevision:{create:vi.fn()}};
        const first=await saveCodeProjectInTransaction(firstTx as any,creation());
        const tx={codeProject:{findFirst:vi.fn().mockResolvedValue(first.project),create:vi.fn()},codeProjectRevision:{create:vi.fn()}};
        await expect(saveCodeProjectInTransaction(tx as any,{...creation(),workspace:{files:["different"]}})).rejects.toMatchObject({code:"CREATE_REQUEST_REUSED"});
        expect(tx.codeProject.create).not.toHaveBeenCalled();
    });
});
