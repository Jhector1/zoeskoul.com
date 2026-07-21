import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelSessionRoute } from "./sessions.cancel.js";
import { docker } from "../services/docker/dockerClient.js";
import {
    countActiveSessionsForActor,
    createSession,
    getSession,
    pushEvent,
} from "../services/sessions/sessionStore.js";
import { runScheduledWorkspaceCleanupNow } from "../services/workspace/cleanupWorkspace.js";

const SESSION_ID = "cancel-route-immediate-release";
const ACTOR_KEY = "actor-cancel-route";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

function makeReq() {
    return {
        params: { sessionId: SESSION_ID },
        header: vi.fn((name: string) =>
            String(name).toLowerCase() === "x-actor-key" ? ACTOR_KEY : "",
        ),
    } as any;
}

function makeRes() {
    const res: any = {
        body: null,
        statusCode: 200,
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

afterEach(async () => {
    vi.restoreAllMocks();
    await runScheduledWorkspaceCleanupNow(SESSION_ID);
});

describe("cancelSessionRoute", () => {
    it("releases actor capacity before Docker teardown finishes", async () => {
        const kill = deferred();
        const containerKill = vi.fn(() => kill.promise);
        vi.spyOn(docker, "getContainer").mockReturnValue({
            kill: containerKill,
        } as any);

        createSession({
            id: SESSION_ID,
            ownerKey: ACTOR_KEY,
            kind: "shell",
            containerId: "container-cancel-route",
            workspaceDir: "/tmp/cancel-route-immediate-release",
        });
        pushEvent(SESSION_ID, { type: "status", state: "waiting_for_input" });

        expect(countActiveSessionsForActor(ACTOR_KEY)).toBe(1);

        const res = makeRes();
        await cancelSessionRoute(makeReq(), res, vi.fn());

        expect(res.body).toEqual({ ok: true });
        expect(getSession(SESSION_ID)?.state).toBe("canceled");
        expect(countActiveSessionsForActor(ACTOR_KEY)).toBe(0);
        expect(containerKill).toHaveBeenCalledTimes(1);

        // The HTTP response and capacity release do not wait for Docker.
        kill.resolve();
        await kill.promise;
    });
});
