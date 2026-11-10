import {beforeEach, describe, expect, it, vi} from "vitest";

const {findFirst, updateMany, sameOrigin, actorMock, capabilityMock, transactionMock} = vi.hoisted(() => ({
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    sameOrigin: vi.fn(),
    actorMock: vi.fn(),
    capabilityMock: vi.fn(),
    transactionMock: vi.fn(),
}));

vi.mock("next/server", () => ({
    NextResponse: {
        json: (body: unknown, init?: {status?: number; headers?: HeadersInit}) =>
            new Response(JSON.stringify(body), {
                status: init?.status ?? 200,
                headers: {"Content-Type": "application/json"},
            }),
    },
}));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        codeProject: {findFirst, updateMany},
        $transaction: transactionMock,
    },
}));
vi.mock("@/lib/access/ideCapabilityServer", () => ({
    checkIdeCapability: capabilityMock,
}));
vi.mock("@/lib/practice/actor", () => ({
    getActor: actorMock,
}));
vi.mock("@/lib/practice/api/shared/http", () => ({
    enforceSameOriginPost: sameOrigin,
}));

import {PATCH} from "./route";
const updatedAt = new Date("2026-11-09T12:00:00.000Z");
const original = {
    id: "p1", title: "Old title", description: null,
    currentVersion: 4, updatedAt,
};
function request() {
    return new Request("http://localhost/api/ide/projects/p1/meta", {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({title: "New title", baseVersion: 4}),
    });
}
const ctx = {params: Promise.resolve({projectId: "p1"})};

describe("project rename atomic version guard", () => {
    beforeEach(() => {
        // Reinstall each dependency for every case. Reset-enabled suites or
        // external setup can clear module-level mock implementations.
        vi.resetAllMocks();
        sameOrigin.mockReturnValue(true);
        actorMock.mockResolvedValue({userId: "u1"});
        capabilityMock.mockResolvedValue({ok: true});
        transactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({codeProject: {findFirst, updateMany}}));
    });

    it("rejects missing owner identity before any project lookup or write", async () => {
        actorMock.mockResolvedValue({userId: null});
        const response = await PATCH(request(), ctx);
        expect(response.status).toBe(401);
        expect(findFirst).not.toHaveBeenCalled();
        expect(updateMany).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it("does not attempt a write across origins", async () => {
        sameOrigin.mockReturnValue(false);
        const response = await PATCH(request(), ctx);
        expect(response.status).toBe(403);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("returns the newer revision when a different tab won the race", async () => {
        const latest = {...original, title: "Other tab", currentVersion: 5};
        findFirst.mockResolvedValueOnce(original).mockResolvedValueOnce(latest);
        updateMany.mockResolvedValueOnce({count: 0});
        const response = await PATCH(request(), ctx);
        const diagnostic = await response.clone().json();
        expect(response.status, JSON.stringify(diagnostic)).toBe(409);
        const data = await response.json() as any;
        expect(data.code).toBe("PROJECT_CONFLICT");
        expect(data.conflict.serverVersion).toBe(5);
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ownerId: "u1", id: "p1", currentVersion: 4}),
            data: expect.objectContaining({currentVersion: {increment: 1}}),
        }));
    });

    it("returns success only after an atomic conditional write", async () => {
        findFirst.mockResolvedValueOnce(original).mockResolvedValueOnce({
            ...original, title: "New title", currentVersion: 5,
        });
        updateMany.mockResolvedValueOnce({count: 1});
        const response = await PATCH(request(), ctx);
        const diagnostic = await response.clone().json();
        expect(response.status, JSON.stringify(diagnostic)).toBe(200);
        const data = await response.json() as any;
        expect(data.project.currentVersion).toBe(5);
        expect(updateMany).toHaveBeenCalledTimes(1);
    });
});
