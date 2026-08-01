import { describe, expect, it } from "vitest";
import { validatePseudocodeSubmission } from "./validate.js";
import type { PseudocodeExpected } from "./types.js";

const bstExpected: PseudocodeExpected = {
    kind: "pseudocode_input",
    dialect: "zoeskoul-v1",
    mode: "write",
    strategy: "hybrid",
    solution: "PROCEDURE SEARCH(root, key)\n    current <- root\n    WHILE current != NULL\n        IF key = current.key\n            RETURN current\n        IF key < current.key\n            current <- current.left\n        ELSE\n            current <- current.right\n    RETURN NULL",
    rules: [
        { id: "loop", kind: "structure", structure: "while" },
        { id: "equal", kind: "operation", operation: "compare_equal" },
        { id: "left", kind: "operation", operation: "move_left" },
        { id: "right", kind: "operation", operation: "move_right" },
        { id: "not-found", kind: "operation", operation: "return_null" },
    ],
};

describe("validatePseudocodeSubmission", () => {
    it("accepts equivalent variable names and arrow syntax", () => {
        const result = validatePseudocodeSubmission({
            answer: `PROCEDURE SEARCH(tree, target)
                node ← tree
                WHILE node != NULL
                    IF target = node.key
                        RETURN node
                    IF target < node.key
                        node ← node.left
                    ELSE
                        node ← node.right
                RETURN NULL`,
            expected: bstExpected,
        });

        expect(result.ok).toBe(true);
        expect(result.failures).toEqual([]);
    });

    it("returns rule-level feedback", () => {
        const result = validatePseudocodeSubmission({
            answer: "PROCEDURE SEARCH(root, key)\nRETURN NULL",
            expected: bstExpected,
        });

        expect(result.ok).toBe(false);
        expect(result.failures.map((failure) => failure.id)).toEqual(
            expect.arrayContaining(["loop", "equal", "left", "right"]),
        );
    });

    it("validates a deterministic trace", () => {
        const result = validatePseudocodeSubmission({
            answer: "30 -> 20 -> 25 -> NULL",
            expected: {
                kind: "pseudocode_input",
                dialect: "zoeskoul-v1",
                mode: "trace",
                strategy: "trace_output",
                solution: "30 -> 20 -> 25 -> NULL",
                rules: [],
                scenarios: [
                    {
                        id: "search-21",
                        expectedLines: ["30", "20", "25", "NULL"],
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
    });
});
