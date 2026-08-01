import { describe, expect, it } from "vitest";
import { gradePseudocodeInput } from "./pseudocodeInput";

const expected = {
    kind: "pseudocode_input" as const,
    dialect: "zoeskoul-v1" as const,
    mode: "write" as const,
    strategy: "semantic_rules" as const,
    solution: [
        "PROCEDURE SEARCH(root, key)",
        "    current <- root",
        "    WHILE current != NULL",
        "        IF key = current.key",
        "            RETURN current",
        "        IF key < current.key",
        "            current <- current.left",
        "        ELSE",
        "            current <- current.right",
        "    RETURN NULL",
    ].join("\n"),
    rules: [
        { id: "loop", kind: "structure" as const, structure: "while" as const },
        { id: "left", kind: "operation" as const, operation: "move_left" as const },
        { id: "right", kind: "operation" as const, operation: "move_right" as const },
        { id: "not-found", kind: "operation" as const, operation: "return_null" as const },
    ],
};

describe("gradePseudocodeInput", () => {
    it("accepts equivalent pseudocode and variable names", () => {
        const result = gradePseudocodeInput({
            instance: {} as any,
            expectedCanon: expected,
            answer: {
                kind: "pseudocode_input",
                value: [
                    "PROCEDURE SEARCH(tree, target)",
                    "    node <- tree",
                    "    WHILE node != NULL",
                    "        IF target = node.key",
                    "            RETURN node",
                    "        IF target < node.key",
                    "            node <- node.left",
                    "        ELSE",
                    "            node <- node.right",
                    "    RETURN NULL",
                ].join("\n"),
            },
        });

        expect(result.ok).toBe(true);
        expect(result.explanation).toMatch(/satisfies/i);
    });

    it("returns deterministic rule-level feedback", () => {
        const result = gradePseudocodeInput({
            instance: {} as any,
            expectedCanon: expected,
            answer: {
                kind: "pseudocode_input",
                value: "PROCEDURE SEARCH(root, key)\nRETURN NULL",
            },
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toMatch(/loop|left|right/i);
    });

    it("rejects malformed server contracts without grading", () => {
        const result = gradePseudocodeInput({
            instance: {} as any,
            expectedCanon: {
                kind: "pseudocode_input",
                mode: "write",
                strategy: "semantic_rules",
                solution: "RETURN NULL",
                rules: [],
            },
            answer: {
                kind: "pseudocode_input",
                value: "RETURN NULL",
            },
        });

        expect(result).toEqual({
            ok: false,
            explanation: "Server bug: invalid pseudocode validation contract.",
        });
    });
});
