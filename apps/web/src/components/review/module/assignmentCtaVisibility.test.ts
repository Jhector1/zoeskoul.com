import { describe, expect, it } from "vitest";

import { resolveCompactAssignmentCtaVisibility } from "./assignmentCtaVisibility";

const topics = [
    {
        id: "topic-1",
        label: "Intro",
        summary: "",
        cards: [{ id: "read-1", type: "text", title: "Read 1", markdown: "" }],
    },
    {
        id: "topic-2",
        label: "Project",
        summary: "",
        cards: [
            {
                id: "project-1",
                type: "project",
                title: "Project 1",
                spec: {
                    mode: "project",
                    subject: "python-v2",
                    moduleSlug: "module-1",
                    steps: [],
                },
            },
        ],
    },
];

describe("resolveCompactAssignmentCtaVisibility", () => {
    it("hides the idle assignment CTA during unfinished normal topics in compact mode", () => {
        expect(
            resolveCompactAssignmentCtaVisibility({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                topics,
                progress: { topics: {} },
                assignmentPhase: "idle",
                activeCard: topics[0].cards[0],
                moduleComplete: false,
            }),
        ).toBe(false);
    });

    it("shows the assignment CTA when the learner is on the module project", () => {
        expect(
            resolveCompactAssignmentCtaVisibility({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                topics,
                progress: { topics: {} },
                assignmentPhase: "idle",
                activeCard: topics[1].cards[0],
                moduleComplete: false,
            }),
        ).toBe(true);
    });

    it("shows the assignment CTA after prerequisite topics are complete", () => {
        expect(
            resolveCompactAssignmentCtaVisibility({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                topics,
                progress: {
                    topics: {
                        "topic-1": {
                            completed: "2026-06-26T00:00:00.000Z",
                            readingDone: { "read-1": true },
                        },
                    },
                },
                assignmentPhase: "idle",
                activeCard: topics[0].cards[0],
                moduleComplete: false,
            }),
        ).toBe(true);
    });

    it("keeps the CTA visible once the assignment has started", () => {
        expect(
            resolveCompactAssignmentCtaVisibility({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                topics,
                progress: { topics: {} },
                assignmentPhase: "in_progress",
                activeCard: topics[0].cards[0],
                moduleComplete: false,
            }),
        ).toBe(true);
    });
});
