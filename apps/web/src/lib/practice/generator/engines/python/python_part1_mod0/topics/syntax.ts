import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import {TOPIC_ID} from "@/lib/subjects/python/modules/module0/topics/syntax_intro/meta";

export const M0_SYNTAX_POOL = [
    { key: "m0_syntax_definition", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_syntax_syntaxerror", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_syntax_indentation_rule", w: 1, kind: "single_choice", purpose: "quiz" },
] as const;

export type M0SyntaxKey = (typeof M0_SYNTAX_POOL)[number]["key"];

function Q(key: M0SyntaxKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";

function buildOptions(key: M0SyntaxKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: `@:${Q(key)}.options.${id}`,
    }));
}

function sc(
    key: M0SyntaxKey,
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

export const M0_SYNTAX_HANDLERS= {
    m0_syntax_definition: sc("m0_syntax_definition", "a"),
    m0_syntax_syntaxerror: sc("m0_syntax_syntaxerror", "a"),
    m0_syntax_indentation_rule: sc("m0_syntax_indentation_rule", "b"),
};

// Legacy export: keep only if older code still depends on it.
export const M0_SYNTAX_GENERATOR_TOPIC: TopicBundle = defineTopic(
  TOPIC_ID,
    M0_SYNTAX_POOL as any,
    M0_SYNTAX_HANDLERS as any
);