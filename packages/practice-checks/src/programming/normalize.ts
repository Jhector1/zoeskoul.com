import type {
    ProgrammingCodeTest,
    ProgrammingExpected,
    ProgrammingExpectedInput,
} from "./types";
import { makeProgrammingExpected } from "./types";

export function toProgrammingCodeTests(
    expected: ProgrammingExpectedInput | ProgrammingExpected | unknown,
): ProgrammingCodeTest[] {
    const normalized = makeProgrammingExpected(expected as ProgrammingExpectedInput);
    return normalized.checkMode === "stdout" ? normalized.tests : [];
}
