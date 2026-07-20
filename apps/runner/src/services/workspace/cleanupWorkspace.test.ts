import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    cancelScheduledWorkspaceCleanup,
    runScheduledWorkspaceCleanupNow,
    scheduleWorkspaceCleanup,
} from "./cleanupWorkspace.js";
import {
    createSession,
    deleteSession,
    getSession,
} from "../sessions/sessionStore.js";

async function expectPathExists(filePath: string) {
    await expect(fs.access(filePath)).resolves.toBeUndefined();
}

async function expectPathMissing(filePath: string) {
    await expect(fs.access(filePath)).rejects.toThrow();
}

describe("workspace cleanup TTL", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-cleanup-test-"));
    });

    afterEach(async () => {
        cancelScheduledWorkspaceCleanup("session-ttl-test");
        cancelScheduledWorkspaceCleanup("session-cancel-cleanup");
        cancelScheduledWorkspaceCleanup("session-shared-a");
        cancelScheduledWorkspaceCleanup("session-shared-b");
        deleteSession("session-ttl-test");
        deleteSession("session-cancel-cleanup");
        deleteSession("session-shared-a");
        deleteSession("session-shared-b");

        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    });

    it("keeps a completed workspace available until cleanup runs", async () => {
        const sessionId = "session-ttl-test";
        const workspaceDir = path.join(root, "workspace");

        await fs.mkdir(workspaceDir, { recursive: true });
        await fs.writeFile(path.join(workspaceDir, "output.txt"), "Hello");

        createSession({
            id: sessionId,
            ownerKey: "actor",
            containerId: "container",
            workspaceDir,
        });

        const scheduled = scheduleWorkspaceCleanup(
            sessionId,
            workspaceDir,
            10_000,
        );

        expect(scheduled.ttlMs).toBe(10_000);
        expect(getSession(sessionId)?.expiresAt).toBeTypeOf("number");

        // The important behavior: scheduled cleanup does not delete immediately.
        await expectPathExists(workspaceDir);
        expect(getSession(sessionId)).not.toBeNull();

        // Deterministically simulate the scheduled cleanup firing.
        await runScheduledWorkspaceCleanupNow(sessionId);

        await expectPathMissing(workspaceDir);
        expect(getSession(sessionId)).toBeNull();
    });

    it("can cancel a scheduled cleanup", async () => {
        const sessionId = "session-cancel-cleanup";
        const workspaceDir = path.join(root, "workspace-cancel");

        await fs.mkdir(workspaceDir, { recursive: true });

        createSession({
            id: sessionId,
            ownerKey: "actor",
            containerId: "container",
            workspaceDir,
        });

        scheduleWorkspaceCleanup(sessionId, workspaceDir, 1_000);
        cancelScheduledWorkspaceCleanup(sessionId);

        await expectPathExists(workspaceDir);
        expect(getSession(sessionId)).not.toBeNull();
    });

    it("keeps a shared IDE workspace until the final terminal closes", async () => {
        const workspaceDir = path.join(root, "workspace-shared");
        await fs.mkdir(workspaceDir, { recursive: true });
        await fs.writeFile(path.join(workspaceDir, "shared.txt"), "shared");

        createSession({
            id: "session-shared-a",
            ownerKey: "actor",
            kind: "shell",
            workspaceKey: "host-a::project-a",
            containerId: "container-a",
            workspaceDir,
        });
        createSession({
            id: "session-shared-b",
            ownerKey: "actor",
            kind: "shell",
            workspaceKey: "host-a::project-a",
            containerId: "container-b",
            workspaceDir,
        });

        scheduleWorkspaceCleanup("session-shared-a", workspaceDir, 10_000);
        await runScheduledWorkspaceCleanupNow("session-shared-a");

        await expectPathExists(workspaceDir);
        expect(getSession("session-shared-a")).toBeNull();
        expect(getSession("session-shared-b")).not.toBeNull();

        scheduleWorkspaceCleanup("session-shared-b", workspaceDir, 10_000);
        await runScheduledWorkspaceCleanupNow("session-shared-b");

        await expectPathMissing(workspaceDir);
        expect(getSession("session-shared-b")).toBeNull();
    });
});
