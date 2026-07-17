import { describe, expect, it } from "vitest";
import { repairGeneratedDragReorderCorrectOrder } from "./sanitizeGeneratedTopicAuthoringDraft.js";

describe("repairGeneratedDragReorderCorrectOrder", () => {
    it("maps letter markers to the exact token strings", () => {
        const exercise = {
            kind: "drag_reorder",
            tokens: ["FROM clause", "JOIN operation", "ON condition"],
            correctOrder: ["a", "b", "c"],
        };

        expect(repairGeneratedDragReorderCorrectOrder(exercise)).toEqual({
            ...exercise,
            correctOrder: ["FROM clause", "JOIN operation", "ON condition"],
        });
    });

    it("maps one-based numeric positions to token strings", () => {
        const exercise = {
            kind: "drag_reorder",
            tokens: ["Identify the parent key", "Find the matching foreign key", "Trace the relationship"],
            correctOrder: ["2", "1", "3"],
        };

        expect(repairGeneratedDragReorderCorrectOrder(exercise)).toEqual({
            ...exercise,
            correctOrder: ["Find the matching foreign key", "Identify the parent key", "Trace the relationship"],
        });
    });

    it("preserves an already-valid text permutation", () => {
        const exercise = {
            kind: "drag_reorder",
            tokens: ["parent", "child", "relationship"],
            correctOrder: ["parent", "relationship", "child"],
        };

        expect(repairGeneratedDragReorderCorrectOrder(exercise)).toBe(exercise);
    });

    it("preserves valid literal numeric tokens instead of remapping them", () => {
        const exercise = {
            kind: "drag_reorder",
            tokens: ["1", "2", "3", "4"],
            correctOrder: ["2", "1", "3", "4"],
        };

        expect(repairGeneratedDragReorderCorrectOrder(exercise)).toBe(exercise);
    });

    it("does not guess when invalid values are not unambiguous markers", () => {
        const exercise = {
            kind: "drag_reorder",
            tokens: ["parent", "child", "relationship"],
            correctOrder: ["first", "second", "third"],
        };

        expect(repairGeneratedDragReorderCorrectOrder(exercise)).toBe(exercise);
    });
});
