import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    signKey: vi.fn(() => "fresh-signed-history-key"),
}));

vi.mock("server-only", () => ({}));
vi.mock("../mappers/key.mapper", () => ({
    signKey: mocks.signKey,
}));

import { historyRowToQItem } from "../../../runtime/helpers";
import { buildInteractiveHistoryPracticeKey } from "./getStatus";

describe("server-backed Practice resume authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("issues a real signed key for an unanswered resumed instance", () => {
        const key = buildInteractiveHistoryPracticeKey({
            instanceId: "instance-current",
            answeredAt: null,
            sessionId: "session-1",
            actor: { userId: "user-1", guestId: null },
            allowReveal: true,
        });

        expect(key).toBe("fresh-signed-history-key");
        expect(mocks.signKey).toHaveBeenCalledWith({
            instanceId: "instance-current",
            sessionId: "session-1",
            userId: "user-1",
            guestId: null,
            allowReveal: true,
        });
    });

    it("does not issue an interactive key for completed history", () => {
        expect(
            buildInteractiveHistoryPracticeKey({
                instanceId: "instance-complete",
                answeredAt: "2026-08-20T05:00:00.000Z",
                sessionId: "session-1",
                actor: { userId: "user-1", guestId: null },
                allowReveal: true,
            }),
        ).toBeNull();

        expect(mocks.signKey).not.toHaveBeenCalled();
    });

    it("hydrates an unanswered current item with the signed key returned by status", () => {
        const item = historyRowToQItem({
            instanceId: "instance-current",
            key: "fresh-signed-history-key",
            answeredAt: null,
            topic: "input-and-type-conversion",
            kind: "code_input",
            attempts: 1,
            publicPayload: {
                id: "code_double_price",
                exerciseKey: "code_double_price",
                kind: "code_input",
            },
        });

        expect(item.key).toBe("fresh-signed-history-key");
        expect(item.submitted).toBe(false);
    });

    it("retains a non-interactive history identity when no signed key is supplied", () => {
        const item = historyRowToQItem({
            instanceId: "instance-complete",
            answeredAt: "2026-08-20T05:00:00.000Z",
            topic: "input-and-type-conversion",
            kind: "code_input",
        });

        expect(item.key).toBe("history:instance-complete");
        expect(item.submitted).toBe(true);
    });
});
