import { describe, expect, it } from "vitest";
import {
    countFillBlanks,
    countStandaloneUnderscoreBlanks,
    replaceStandaloneUnderscoreBlanks,
} from "./fillBlankText";

describe("fillBlankText", () => {
    it("counts bracket blanks", () => {
        expect(countFillBlanks("print([blank1])", "Choose the missing value.")).toBe(1);
    });

    it("counts visible standalone underscore blanks", () => {
        expect(countFillBlanks("print(___)", "Choose the missing value.")).toBe(1);
        expect(countFillBlanks("print(____)", "Choose the missing value.")).toBe(1);
    });

    it("does not count Python dunder method names as blanks", () => {
        expect(
            countFillBlanks(
                "class Person:\n    def __init__(self, name):\n        self.[blank1] = name",
                "Complete the __init__ method.",
            ),
        ).toBe(1);

        expect(countStandaloneUnderscoreBlanks("__init__")).toBe(0);
        expect(countStandaloneUnderscoreBlanks("__str__")).toBe(0);
        expect(countStandaloneUnderscoreBlanks("self.__dict__")).toBe(0);
    });

    it("replaces standalone underscore blanks but preserves dunder names", () => {
        expect(
            replaceStandaloneUnderscoreBlanks(
                "def __init__(self):\n    value = ___",
                "[blank1]",
            ),
        ).toBe("def __init__(self):\n    value = [blank1]");
    });

    it("uses replacement callback only for real blanks", () => {
        let count = 0;

        const result = replaceStandaloneUnderscoreBlanks(
            "__init__ ___ __str__ ___",
            () => {
                count += 1;
                return `[blank${count}]`;
            },
        );

        expect(result).toBe("__init__ [blank1] __str__ [blank2]");
        expect(count).toBe(2);
    });
});