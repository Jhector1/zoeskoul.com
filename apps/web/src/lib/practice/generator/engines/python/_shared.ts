// src/lib/practice/generator/engines/python/python_shared/_shared.ts
import { PracticePurpose } from "@prisma/client";

import type { CodeInputExercise, CodeLanguage, SingleChoiceExercise } from "../../../types";
import type { TopicContext } from "../../generatorTypes";
import type { RNG } from "../../shared/rng";
import {
    makeSubjectModuleGenerator,
    type SubjectModuleGenerator,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";

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

/* -------------------------------- code expected -------------------------------- */

export type CodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

export type CodeExpected = {
    kind: "code_input";
    language?: CodeLanguage;
    tests: CodeTest[];
    stdin?: string;
    stdout?: string;
    solutionCode?: string;
};

export function terminalFence(stdin: string, stdout: string) {
    return String.raw`~~~terminal
$ input
${stdin.trimEnd()}

$ output
${stdout.trimEnd()}
~~~`;
}

export function makeCodeExpected(args: {
    language?: CodeLanguage;
    stdin?: string;
    stdout?: string;
    match?: "exact" | "includes";
    tests?: CodeTest[];
    solutionCode?: string;
}): CodeExpected {
    const language = args.language ?? "python";

    const tests: CodeTest[] =
        Array.isArray(args.tests) && args.tests.length > 0
            ? args.tests.map((t) => ({
                stdin: typeof t.stdin === "string" ? t.stdin : "",
                stdout: String(t.stdout ?? ""),
                match: t.match ?? "exact",
            }))
            : [
                {
                    stdin: typeof args.stdin === "string" ? args.stdin : "",
                    stdout: String(args.stdout ?? ""),
                    match: args.match ?? "exact",
                },
            ];

    return {
        kind: "code_input",
        language,
        tests,
        stdin: typeof args.stdin === "string" ? args.stdin : (tests[0]?.stdin ?? ""),
        stdout: typeof args.stdout === "string" ? args.stdout : (tests[0]?.stdout ?? ""),
        solutionCode: typeof args.solutionCode === "string" ? args.solutionCode : undefined,
    };
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

export type { SingleChoiceExercise, CodeInputExercise, CodeLanguage, TopicBundle };