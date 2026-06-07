import { describe, expect, it } from "vitest";
import {
    buildJudge0Headers,
    buildRunnerHeaders,
} from "./serviceAuthHeaders.js";

describe("service auth headers", () => {
    it("sends Judge0 edge secret when configured", () => {
        expect(
            buildJudge0Headers({
                json: true,
                env: {
                    JUDGE0_EDGE_SECRET: "edge-secret",
                    JUDGE0_AUTHN_HEADER: "X-Judge0-Token",
                    JUDGE0_AUTHN_TOKEN: "direct-token",
                },
            }),
        ).toEqual({
            "Content-Type": "application/json",
            "X-Judge0-Edge-Secret": "edge-secret",
        });
    });

    it("sends direct Judge0 auth when no edge secret is configured", () => {
        expect(
            buildJudge0Headers({
                json: true,
                env: {
                    JUDGE0_AUTHN_HEADER: "X-Judge0-Token",
                    JUDGE0_AUTHN_TOKEN: "direct-token",
                },
            }),
        ).toEqual({
            "Content-Type": "application/json",
            "X-Judge0-Token": "direct-token",
        });
    });

    it("sends runner edge and shared secrets", () => {
        expect(
            buildRunnerHeaders({
                actorKey: "u:123",
                env: {
                    RUNNER_EDGE_SECRET: "edge-secret",
                    RUNNER_SHARED_SECRET: "runner-secret",
                },
            }),
        ).toEqual({
            "content-type": "application/json",
            "x-runner-edge-secret": "edge-secret",
            "x-runner-secret": "runner-secret",
            "x-actor-key": "u:123",
        });
    });

    it("requires the runner shared secret", () => {
        expect(() =>
            buildRunnerHeaders({
                actorKey: "u:123",
                env: {},
            }),
        ).toThrow("Missing RUNNER_SHARED_SECRET");
    });
});