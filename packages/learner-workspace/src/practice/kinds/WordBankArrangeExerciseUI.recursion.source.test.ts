import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/practice/kinds/WordBankArrangeExerciseUI.tsx",
    ),
    "utf8",
);

describe("WordBankArrangeExerciseUI render-loop protection", () => {
    it("keys reset behavior from semantic exercise identity", () => {
        expect(source).toContain(
            "`${exercise.id ?? \"\"}::${exercise.targetText}::${baseTokens.join",
        );

        expect(source).toContain(
            "const baseTokensRef = useRef(baseTokens)",
        );

        expect(source).toContain(
            "const valueRef = useRef(value)",
        );
    });

    it("does not reset from unstable array references", () => {
        expect(source).not.toContain(
            "}, [baseKey, baseTokens, value]);",
        );

        expect(source).not.toContain(
            "}, [value, baseTokens]);",
        );

        expect(source).toContain(
            "}, [baseKey]);",
        );

        expect(source).toContain(
            "}, [value]);",
        );
    });

    it("does not emit from unstable parent callback or value identity", () => {
        expect(source).toContain(
            "const onChangeValueRef = useRef(onChangeValue)",
        );

        expect(source).toContain(
            "onChangeValueRef.current = onChangeValue",
        );

        expect(source).toContain(
            'const cur = String(valueRef.current ?? "");',
        );

        expect(source).toContain(
            "onChangeValueRef.current(nextStr);",
        );

        expect(source).toContain(
            "}, [answer]);",
        );

        expect(source).not.toContain(
            "}, [answer, value, onChangeValue]);",
        );
    });
});
