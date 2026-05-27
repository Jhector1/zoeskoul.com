import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotWorkspaceRoute } from "./sessions.snapshotWorkspace.js";
import { createSession, deleteSession } from "../services/sessions/sessionStore.js";

function makeReq(sessionId: string, actorKey = "actor") {
    return {
        params: {
            sessionId,
        },
        header: vi.fn((name: string) => {
            const key = String(name).toLowerCase();

            if (key === "x-actor-key") {
                return actorKey;
            }

            if (key === "x-runner-secret") {
                return "test-secret";
            }

            return "";
        }),
    } as any;
}

function makeRes() {
    const res: any = {
        statusCode: 200,
        body: null,
        status: vi.fn((code: number) => {
            res.statusCode = code;
            return res;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            return res;
        }),
    };

    return res;
}

describe("snapshotWorkspaceRoute", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-route-test-"));
    });

    afterEach(async () => {
        deleteSession("session-route-ok");
        deleteSession("session-route-expired");
        deleteSession("session-route-forbidden");

        await fs.rm(root, {
            recursive: true,
            force: true,
        });

        vi.restoreAllMocks();
    });

    it("returns files for an existing completed workspace", async () => {
        const workspaceDir = path.join(root, "workspace");

        await fs.mkdir(workspaceDir, { recursive: true });
        await fs.writeFile(path.join(workspaceDir, "output.txt"), "Hello");

        createSession({
            id: "session-route-ok",
            ownerKey: "actor",
            containerId: "container",
            workspaceDir,
        });

        const req = makeReq("session-route-ok");
        const res = makeRes();

        await snapshotWorkspaceRoute(req, res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                ok: true,
                files: expect.arrayContaining([
                    {
                        kind: "file",
                        path: "output.txt",
                        content: "Hello",
                    },
                ]),
            }),
        );
    });

    it("returns 410 when the workspace directory is already expired", async () => {
        const workspaceDir = path.join(root, "expired-workspace");

        createSession({
            id: "session-route-expired",
            ownerKey: "actor",
            containerId: "container",
            workspaceDir,
        });

        const req = makeReq("session-route-expired");
        const res = makeRes();

        await snapshotWorkspaceRoute(req, res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(410);
        expect(res.body).toEqual(
            expect.objectContaining({
                ok: false,
                error: expect.stringContaining("Workspace expired"),
            }),
        );
    });

    it("returns 403 for another actor", async () => {
        const workspaceDir = path.join(root, "workspace");

        await fs.mkdir(workspaceDir, { recursive: true });

        createSession({
            id: "session-route-forbidden",
            ownerKey: "owner-a",
            containerId: "container",
            workspaceDir,
        });

        const req = makeReq("session-route-forbidden", "owner-b");
        const res = makeRes();

        await snapshotWorkspaceRoute(req, res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.body).toEqual(
            expect.objectContaining({
                ok: false,
                error: "Forbidden.",
            }),
        );
    });
});