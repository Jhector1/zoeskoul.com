import {
    defineTopic,
    type Handler, type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut, SubjectModuleGenerator,
} from "@/lib/practice/generator/engines/utils";

import { makeCodeExpected } from "../../_shared";
import type { ExerciseKind } from "@/lib/practice/types";
import type { GenOut } from "@/lib/practice/generator/shared/expected";
import {TOPIC_ID} from "@/lib/subjects/python/modules/module0/topics/comments_intro/meta";

// -----------------------------
// Pool
// -----------------------------
export const M0_COMMENTS_POOL = [
    { key: "m0_comments_symbol", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_comments_ignored_by_python", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_comments_best_reason", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_comments_multiline_true", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m0_comments_docstring_vs_comment", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_comments_inline_comment", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m0_comments_multiline_valid_ways", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m0_comments_which_lines_are_comments", w: 1, kind: "multi_choice", purpose: "quiz" },

    { key: "m0_comments_disable_error_line", w: 1, kind: "code_input", purpose: "quiz" },
    { key: "m0_comments_disable_wrong_math_line", w: 1, kind: "code_input", purpose: "quiz" },
] as const;

export type M0CommentsKey = (typeof M0_COMMENTS_POOL)[number]["key"];

function Q(key: M0CommentsKey) {
    return `quiz.${key}`;
}

// -----------------------------
// Helpers
// -----------------------------
type OptId = "a" | "b" | "c" | "d";



function buildOptions(key: M0CommentsKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: `@:${Q(key)}.options.${id}`,
    }));
}

function sc(
    key: M0CommentsKey,
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
        }) ; // ✅ cast fixes invariant GenOut
}

function mc(
    key: M0CommentsKey,
    answerOptionIds: OptId[],
    optionIds: OptId[] = ["a", "b", "c", "d"]
): Handler<"multi_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: `@:${Q(key)}.title`,
            prompt: `@:${Q(key)}.prompt`,
            options: buildOptions(key, optionIds),
            answerOptionIds,
            hint: `@:${Q(key)}.hint`,
        }) ; // ✅ cast fixes invariant GenOut
}

// -----------------------------
// Handlers
// -----------------------------
export const M0_COMMENTS_HANDLERS = {
    m0_comments_symbol: sc("m0_comments_symbol", "b", ["a", "b", "c"]),
    m0_comments_ignored_by_python: sc("m0_comments_ignored_by_python", "a", ["a", "b", "c"]),
    m0_comments_best_reason: sc("m0_comments_best_reason", "b", ["a", "b", "c"]),
    m0_comments_multiline_true: sc("m0_comments_multiline_true", "b", ["a", "b", "c"]),

    m0_comments_docstring_vs_comment: sc("m0_comments_docstring_vs_comment", "c", ["a", "b", "c", "d"]),
    m0_comments_inline_comment: sc("m0_comments_inline_comment", "a", ["a", "b", "c", "d"]),

    m0_comments_multiline_valid_ways: mc("m0_comments_multiline_valid_ways", ["a", "b"], ["a", "b", "c", "d"]),
    m0_comments_which_lines_are_comments: mc("m0_comments_which_lines_are_comments", ["a", "c", "d"], ["a", "b", "c", "d"]),

    m0_comments_disable_error_line: ({ diff, id, topic }: HandlerArgs) =>
        makeCodeInputOut({
            archetype: "m0_comments_disable_error_line",
            id,
            topic,
            diff,
            title: `@:${Q("m0_comments_disable_error_line")}.title`,
            prompt: `@:${Q("m0_comments_disable_error_line")}.prompt`,
            hint: `@:${Q("m0_comments_disable_error_line")}.hint`,
            language: "python",
            starterCode: String.raw`
print("Start")
print(not_defined)  # TODO: comment out this line so the program runs
print("End")
`.trim(),
            expected: makeCodeExpected({
                language: "python",
                tests: [{ stdin: "", stdout: "Start\nEnd\n", match: "exact" }],
                solutionCode: `print("Start")\n# print(not_defined)\nprint("End")\n`,
            }),
            editorHeight: 360,
        }) , // ✅ cast

    m0_comments_disable_wrong_math_line: ({ diff, id, topic }: HandlerArgs) =>
        makeCodeInputOut({
            archetype: "m0_comments_disable_wrong_math_line",
            id,
            topic,
            diff,
            title: `@:${Q("m0_comments_disable_wrong_math_line")}.title`,
            prompt: `@:${Q("m0_comments_disable_wrong_math_line")}.prompt`,
            hint: `@:${Q("m0_comments_disable_wrong_math_line")}.hint`,
            language: "python",
            starterCode: String.raw`
price = 4
qty = 3

total = price * qty
total = total + 100  # TODO: this line is wrong — comment it out

print(total)
`.trim(),
            expected: makeCodeExpected({
                language: "python",
                tests: [{ stdin: "", stdout: "12\n", match: "exact" }],
                solutionCode:
                    `price = 4\n` +
                    `qty = 3\n` +
                    `total = price * qty\n` +
                    `# total = total + 100\n` +
                    `print(total)\n`,
            }),
            editorHeight: 420,
        }) , // ✅ cast
};

export const M0_COMMENTS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M0_COMMENTS_POOL as any,
    M0_COMMENTS_HANDLERS as any
);