import { describe, expect, it } from "vitest";
import {
    canPollReviewRemoteProgress,
    shouldApplyRemoteReviewWorkspace,
    shouldTrackReviewRuntimeMutation,
} from "./reviewProgressRemoteSyncPolicy";

describe("review progress remote sync policy", () => {
    it("does not treat runtime mount churn as learner work in a read-only tutor workspace", () => {
        expect(
            shouldTrackReviewRuntimeMutation({
                readOnly: true,
                applyingRemote: false,
            }),
        ).toBe(false);
    });

    it("continues polling a read-only tutor workspace even if stale dirty state exists", () => {
        expect(
            canPollReviewRemoteProgress({
                readOnly: true,
                localDirty: true,
                remoteSyncInFlight: false,
                saveInFlight: false,
                hasPendingSave: true,
            }),
        ).toBe(true);
    });

    it("protects real editable workspace changes until their save finishes", () => {
        expect(
            canPollReviewRemoteProgress({
                readOnly: false,
                localDirty: true,
                remoteSyncInFlight: false,
                saveInFlight: false,
                hasPendingSave: false,
            }),
        ).toBe(false);
    });

    it("treats the newest server snapshot as authoritative in a read-only live view", () => {
        expect(
            shouldApplyRemoteReviewWorkspace({
                readOnly: true,
                reason: "poll",
                looksLikeBetterCandidate: false,
            }),
        ).toBe(true);
    });

    it("keeps conservative restore protection for an editable learner workspace", () => {
        expect(
            shouldApplyRemoteReviewWorkspace({
                readOnly: false,
                reason: "poll",
                looksLikeBetterCandidate: false,
            }),
        ).toBe(false);
    });

    it("never overlaps a remote poll with an in-flight request", () => {
        expect(
            canPollReviewRemoteProgress({
                readOnly: true,
                localDirty: false,
                remoteSyncInFlight: true,
                saveInFlight: false,
                hasPendingSave: false,
            }),
        ).toBe(false);
    });
});
