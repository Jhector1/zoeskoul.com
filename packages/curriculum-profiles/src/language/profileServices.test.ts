import { describe, expect, it } from "vitest";
import { getProfileServices } from "../profileServicesRegistry.js";

describe("language profile services", () => {
    it("registers the generic non-code language service with a fail-closed trust policy", async () => {
        const services = getProfileServices("language");

        expect(services.profileId).toBe("language");
        expect(services.getTrustPolicy()).toEqual({
            profileId: "language",
            autoPublishEnabled: false,
            requiresCritiquePass: true,
            requiresSemanticValidation: false,
            maxHintWarnings: 0,
            maxMediumRepairs: 0,
            allowHighSeverityRepairs: false,
        });

        const draft = {
            title: "Bonjou",
            summary: "Beginner language practice.",
            minutes: 10,
            sketchBlocks: [],
            quizDraft: [],
        } as any;

        const repaired = await services.repairDraft({
            seed: {
                profileId: "language",
                topicId: "bonjou",
            } as any,
            draft,
        });

        expect(repaired.draft).toBe(draft);
        expect(repaired.report.topicId).toBe("bonjou");
        expect(repaired.report.repairs).toEqual([]);
    });

    it("keeps unknown profile ids fail-closed", () => {
        expect(() => getProfileServices("not-a-real-profile")).toThrow(
            /No profile services registered/,
        );
    });
});
