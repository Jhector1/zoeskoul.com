import { describe, expect, it } from "vitest";

import { parseCodeExpected } from "./codeExpected.js";

describe("parseCodeExpected", () => {
    it("accepts semantic programming payloads that still use expectedKind value", () => {
        const parsed = parseCodeExpected({
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [
                {
                    type: "method_returns",
                    className: "Lamp",
                    constructorArgs: ["green"],
                    constructorArgKinds: [],
                    methodName: "describe",
                    methodArgs: [],
                    methodArgKinds: [],
                    expected: "Lamp color: green",
                    expectedKind: "value",
                },
            ],
        });

        expect(parsed.success).toBe(true);

        if (!parsed.success) {
            throw new Error(JSON.stringify(parsed.error.format(), null, 2));
        }

        expect(parsed.data.strategy).toBe("programming");
        expect((parsed.data as any).checkMode).toBe("semantic");
        expect(((parsed.data as any).semanticChecks[0] as any).expectedKind).toBe("value");
    });
});
