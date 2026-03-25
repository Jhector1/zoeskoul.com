import type { Difficulty, GenKey } from "../types";
import type { TopicContext } from "./generatorTypes";
import type { RNG } from "./shared/rng";
import type {
    GeneratorOut,
    SubjectModuleGenerator,
} from "@/lib/practice/generator/engines/utils";

import { makeGenPythonStatementsPart1 } from "./engines/python/python_part1";

export type TopicGeneratorFactory = (ctx: TopicContext) => SubjectModuleGenerator;

export type GenFn = (
    rng: RNG,
    diff: Difficulty,
    id: string,
    opts?: {
        variant?: string | null;
        topicSlug?: string;
        subject?: string | null;
        seed?: unknown;
    },
) => { exercise: unknown; expected: unknown; archetype?: string };

function wrapGenFn(fn: GenFn): TopicGeneratorFactory {
    return (ctx) => (rng, diff, id): GeneratorOut => {
        const out = fn(rng, diff, id, {
            variant: (ctx as { variant?: string | null }).variant ?? null,
            topicSlug: String((ctx as { topicSlug?: string }).topicSlug ?? ""),
            subject: (ctx as { subjectSlug?: string | null }).subjectSlug ?? null,
        });

        return {
            archetype: String(out.archetype ?? "default"),
            exercise: out.exercise,
            expected: out.expected,
        } as GeneratorOut;
    };
}

export const TOPIC_GENERATORS: Record<GenKey, TopicGeneratorFactory> = {
    python_part1: (ctx) => makeGenPythonStatementsPart1(ctx),
};