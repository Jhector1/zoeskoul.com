// src/lib/practice/generator/engines/python/python_part1_mod0/topics/programming.ts
import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import {TOPIC_ID} from "@/lib/subjects/python/modules/module0/topics/programming_intro/meta";

export const M0_PROGRAMMING_POOL = [
    { key: "m0_prog_language_definition", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_prog_python_is_language", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_prog_instructions_precise", w: 1, kind: "single_choice", purpose: "quiz" },
] as const;

export type M0ProgrammingKey = (typeof M0_PROGRAMMING_POOL)[number]["key"];

function Q(key: M0ProgrammingKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";

function buildOptions(key: M0ProgrammingKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: `@:${Q(key)}.options.${id}`,
    }));
}

function sc(
    key: M0ProgrammingKey,
    answerOptionId: OptId,
    optionIds: OptId[] = ["a", "b", "c"]
): Handler<"single_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: `@:${Q(key)}.title`,
            prompt: `@:${Q(key)}.prompt`,
            options: buildOptions(key, optionIds),
            answerOptionId,
            hint: `@:${Q(key)}.hint`,
        });
}

export const M0_PROGRAMMING_HANDLERS= {
    m0_prog_language_definition: sc("m0_prog_language_definition", "a"),
    m0_prog_python_is_language: sc("m0_prog_python_is_language", "a"),
    m0_prog_instructions_precise: sc("m0_prog_instructions_precise", "b"),
};

// Legacy export only if some old loader still needs it
export const M0_PROGRAMMING_GENERATOR_TOPIC: TopicBundle = defineTopic(
   TOPIC_ID,
    M0_PROGRAMMING_POOL as any,
    M0_PROGRAMMING_HANDLERS as any
);