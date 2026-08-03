import { describe, expect, it } from "vitest";

import { shouldShowFinalCertificateCta } from "./certificateNavigation";

const finalState = {
    navLoading: false,
    navError: null,
    nextModuleId: null,
    nextTopicId: null,
    activeCardIndex: 2,
    cardCount: 3,
    topicComplete: true,
    atEndOfPublishedTrack: true,
};

describe("shouldShowFinalCertificateCta", () => {
    it("shows the certificate only after the final card of the final topic is complete", () => {
        expect(shouldShowFinalCertificateCta(finalState)).toBe(true);
    });

    it("keeps normal Next navigation on earlier capstone cards", () => {
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                activeCardIndex: 0,
            }),
        ).toBe(false);
    });

    it("does not replace final project-step navigation before completion", () => {
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                topicComplete: false,
            }),
        ).toBe(false);
    });

    it("does not show while another topic or module remains", () => {
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                nextTopicId: "next-topic",
            }),
        ).toBe(false);
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                nextModuleId: "next-module",
            }),
        ).toBe(false);
    });

    it("waits for final-track navigation state to resolve", () => {
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                navLoading: true,
            }),
        ).toBe(false);
        expect(
            shouldShowFinalCertificateCta({
                ...finalState,
                navError: new Error("navigation failed"),
            }),
        ).toBe(false);
    });
});
