import type {
    ProgrammingCodeTest,
    ProgrammingExpected,
    ProgrammingExpectedInput,
} from "./types.js";
import { makeProgrammingExpected } from "./types.js";

export function toProgrammingCodeTests(
    expected: ProgrammingExpectedInput | ProgrammingExpected | unknown,
): ProgrammingCodeTest[] {
    const normalized = makeProgrammingExpected(expected as ProgrammingExpectedInput);
    return normalized.checkMode === "stdout" ? normalized.tests : [];
}
