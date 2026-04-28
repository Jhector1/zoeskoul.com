import { PracticePurpose } from "@zoeskoul/db";

import type {
    CodeInputExercise,
    WorkspaceLanguage,
    SingleChoiceExercise,
} from "../../../types";
import type { TopicContext } from "../../generatorTypes";
import type { RNG } from "../../shared/rng";
import {
    makeSubjectModuleGenerator,
    type SubjectModuleGenerator,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import {
    makeCodeExpected,
    terminalFence,
    type CodeExpected,
    type CodeTest,
    type ProgrammingCodeTest,
    type SqlCell,
    type SqlCodeTest,
    type SqlExpectedTable,
    type SqlRuntimeSpec,
} from "@/lib/practice/expected/codeExpected";

/* -------------------------------- random helpers -------------------------------- */

export function pickWord(rng: RNG) {
    return rng.pick(["piano", "tacos", "coding", "soccer", "mystery", "coffee"] as const);
}

export function pickName(rng: RNG) {
    return rng.pick(["alex", "sam", "jordan", "taylor", "maria", "leo", "maya"] as const);
}

export function safeInt(rng: RNG, lo: number, hi: number) {
    return rng.int(lo, hi);
}

export function pickSnakeCandidate(rng: RNG) {
    return rng.pick(["user_name", "total_score", "my_var", "age_years", "first_name"] as const);
}

/* -------------------------------- module wrapper -------------------------------- */

export function makePythonModuleGenerator(args: {
    engineName: string;
    ctx: TopicContext;
    topics: readonly TopicBundle[];
    defaultPurpose?: PracticePurpose;
    enablePurpose?: boolean;
}): SubjectModuleGenerator {
    return makeSubjectModuleGenerator(args);
}

/* -------------------------------- re-exports -------------------------------- */

export type {
    SingleChoiceExercise,
    CodeInputExercise,
    WorkspaceLanguage,
    TopicBundle,
};
