import { describe, expect, it } from "vitest";

import type { ReviewCard } from "@/lib/subjects/types";

import {
    getAssessmentDisplayKind,
    isTryItProjectCard,
} from "./tryItProjectCard";

function projectCard(
    overrides: Partial<Extract<ReviewCard, { type: "project" }>> = {},
): Extract<ReviewCard, { type: "project" }> {
    return {
        ...overrides,
        type: "project",
        id: overrides.id ?? "project-card",
        title: overrides.title ?? "Project card",
        spec: overrides.spec ?? {
            mode: "project",
            subject: "python-v2",
            moduleSlug: "module-1",
            steps: [
                {
                    id: "step-1",
                    topic: "python-v2.topic-1",
                },
            ],
        },
    };
}

describe("tryItProjectCard", () => {
    it("detects a one-step project with a try- id prefix", () => {
        const card = projectCard({ id: "try-write-mode-basics" });
        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects a one-step project with a try_ id prefix", () => {
        const card = projectCard({ id: "try_write_mode_basics" });
        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects a one-step project with -try- inside the id", () => {
        const card = projectCard({ id: "write-try-mode-basics" });
        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("does not detect a normal one-step project as try it", () => {
        const card = projectCard({ id: "write-mode-basics" });
        expect(isTryItProjectCard(card)).toBe(false);
    });

    it("does not detect a multi-step project even with a try- id prefix", () => {
        const card = projectCard({
            id: "try-write-mode-basics",
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [
                    { id: "step-1", topic: "python-v2.topic-1" },
                    { id: "step-2", topic: "python-v2.topic-2" },
                ],
            },
        });

        expect(isTryItProjectCard(card)).toBe(false);
    });

    it("accepts a trimmed, case-insensitive try- id marker", () => {
        const card = projectCard({ id: "  TRY-write-mode-basics  " });
        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects explicit spec.uiKind try_it", () => {
        const card = projectCard({
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [{ id: "step-1", topic: "python-v2.topic-1" }],
                uiKind: "try_it",
            } as Extract<ReviewCard, { type: "project" }>["spec"] & { uiKind: "try_it" },
        });

        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects explicit spec.displayKind try_it", () => {
        const card = projectCard({
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [{ id: "step-1", topic: "python-v2.topic-1" }],
                displayKind: " TRY_IT ",
            },
        });

        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects explicit spec.tryIt true", () => {
        const card = projectCard({
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [{ id: "step-1", topic: "python-v2.topic-1" }],
                tryIt: true,
            },
        });

        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("detects explicit top-level tryIt true", () => {
        const card = projectCard({
            tryIt: true,
        });

        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("accepts string true metadata markers", () => {
        const card = projectCard({
            tryIt: " true ",
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [{ id: "step-1", topic: "python-v2.topic-1" }],
                tryIt: "TRUE",
            },
        });

        expect(isTryItProjectCard(card)).toBe(true);
    });

    it("does not throw for malformed non-array steps", () => {
        const card = projectCard({
            id: "try-write-mode-basics",
            spec: {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: "not-an-array",
            } as unknown as Extract<ReviewCard, { type: "project" }>["spec"],
        });

        expect(() => isTryItProjectCard(card)).not.toThrow();
        expect(isTryItProjectCard(card)).toBe(false);
    });

    it("returns tryIt from getAssessmentDisplayKind only for matching project cards", () => {
        const tryCard = projectCard({ id: "try-write-mode-basics" });
        const normalCard = projectCard({ id: "write-mode-basics" });

        expect(getAssessmentDisplayKind(tryCard, "project")).toBe("tryIt");
        expect(getAssessmentDisplayKind(normalCard, "project")).toBe("project");
    });

    it("never returns tryIt when the fallback is quiz", () => {
        const tryCard = projectCard({ id: "try-write-mode-basics" });

        expect(getAssessmentDisplayKind(tryCard, "quiz")).toBe("quiz");
    });

    it("never classifies a quiz card as try it", () => {
        const quizCard: Extract<ReviewCard, { type: "quiz" }> = {
            type: "quiz",
            id: "try-write-mode-basics",
            title: "Quiz card",
            spec: {
                subject: "python-v2",
                moduleSlug: "module-1",
            },
        };

        expect(isTryItProjectCard(quizCard)).toBe(false);
        expect(getAssessmentDisplayKind(quizCard, "quiz")).toBe("quiz");
    });
});
