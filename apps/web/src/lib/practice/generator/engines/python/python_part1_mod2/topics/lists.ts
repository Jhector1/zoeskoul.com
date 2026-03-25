// src/lib/practice/generator/engines/python/python_part1_mod2/topics/lists_basics.ts
import {
    defineTopic,
    type Handler,type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, safeInt } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module2/topics/lists_basics/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M2_LISTS_POOL = [
    { key: "m2_list_three_prices_sum_avg_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_list_max_of_four_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_list_build_names_print_code", w: 1, kind: "code_input", purpose: "project" },

    { key: "m2_list_index_zero_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_list_len_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_list_append_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m2_list_indexing_truths_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_list_append_remove_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_list_loop_sum_steps_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M2ListsKey = (typeof M2_LISTS_POOL)[number]["key"];

function Q(key: M2ListsKey) {
    return `quiz.${key}`;
}

type OptId3 = "a" | "b" | "c";
type OptId4 = "a" | "b" | "c" | "d";

function buildOptions3(
    key: Extract<
        M2ListsKey,
        | "m2_list_index_zero_sc"
        | "m2_list_len_sc"
        | "m2_list_append_sc"
    >
) {
    return (["a", "b", "c"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function buildOptions4(
    key: Extract<
        M2ListsKey,
        | "m2_list_indexing_truths_mc"
        | "m2_list_append_remove_mc"
        | "m2_list_loop_sum_steps_mc"
    >
) {
    return (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M2ListsKey,
        | "m2_list_index_zero_sc"
        | "m2_list_len_sc"
        | "m2_list_append_sc"
    >,
    answerOptionId: OptId3
): Handler<"single_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: tag(`${Q(key)}.title`),
            prompt: tag(`${Q(key)}.prompt`),
            options: buildOptions3(key),
            answerOptionId,
            hint: tag(`${Q(key)}.hint`),
        });
}

function mc(
    key: Extract<
        M2ListsKey,
        | "m2_list_indexing_truths_mc"
        | "m2_list_append_remove_mc"
        | "m2_list_loop_sum_steps_mc"
    >,
    answerOptionIds: OptId4[]
): Handler<"multi_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: tag(`${Q(key)}.title`),
            prompt: tag(`${Q(key)}.prompt`),
            options: buildOptions4(key),
            answerOptionIds,
            hint: tag(`${Q(key)}.hint`),
        });
}

function pickDifferentInt(rng: any, lo: number, hi: number, avoid: number) {
    let x = safeInt(rng, lo, hi);
    for (let i = 0; i < 6 && x === avoid; i++) x = safeInt(rng, lo, hi);
    return x;
}

export const M2_LISTS_HANDLERS = {
    m2_list_index_zero_sc: sc("m2_list_index_zero_sc", "b"),
    m2_list_len_sc: sc("m2_list_len_sc", "a"),
    m2_list_append_sc: sc("m2_list_append_sc", "c"),

    m2_list_indexing_truths_mc: mc("m2_list_indexing_truths_mc", ["a", "c"]),
    m2_list_append_remove_mc: mc("m2_list_append_remove_mc", ["a", "b", "d"]),
    m2_list_loop_sum_steps_mc: mc("m2_list_loop_sum_steps_mc", ["a", "c", "d"]),

    m2_list_three_prices_sum_avg_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 1, 50);
        const b1 = safeInt(rng, 1, 50);
        const c1 = safeInt(rng, 1, 50);
        const sum1 = a1 + b1 + c1;
        const avg1 = Math.floor(sum1 / 3);

        const a2 = pickDifferentInt(rng, 1, 50, a1);
        const b2 = pickDifferentInt(rng, 1, 50, b1);
        const c2 = pickDifferentInt(rng, 1, 50, c1);
        const sum2 = a2 + b2 + c2;
        const avg2 = Math.floor(sum2 / 3);

        const sumLineTemplate = i18nText(
            args,
            `${Q("m2_list_three_prices_sum_avg_code")}.runtime.sumLineTemplate`,
            "sum = {sum}"
        );
        const avgLineTemplate = i18nText(
            args,
            `${Q("m2_list_three_prices_sum_avg_code")}.runtime.avgLineTemplate`,
            "avg = {avg}"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_list_three_prices_sum_avg_code")}.prompt`,
            `Read THREE integer prices.
Store them in a list.

Compute:
- sum of prices
- average as floor integer using // 3

Print exactly:
sum = <sum>
avg = <avg>`
        );

        const exStdin = `${a1}\n${b1}\n${c1}\n`;
        const exStdout =
            `${fillTemplate(sumLineTemplate, { sum: sum1 })}\n` +
            `${fillTemplate(avgLineTemplate, { avg: avg1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${a1}\n${b1}\n${c1}\n`,
                    stdout:
                        `${fillTemplate(sumLineTemplate, { sum: sum1 })}\n` +
                        `${fillTemplate(avgLineTemplate, { avg: avg1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${a2}\n${b2}\n${c2}\n`,
                    stdout:
                        `${fillTemplate(sumLineTemplate, { sum: sum2 })}\n` +
                        `${fillTemplate(avgLineTemplate, { avg: avg2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `prices = [int(input()), int(input()), int(input())]\n` +
                `total = sum(prices)\n` +
                `avg = total // 3\n` +
                pyFStringPrint(sumLineTemplate) +
                pyFStringPrint(avgLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_list_three_prices_sum_avg_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_list_three_prices_sum_avg_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_list_three_prices_sum_avg_code")}.starterCode`),
            hint: tag(`${Q("m2_list_three_prices_sum_avg_code")}.hint`),
            expected,
        });
    },

    m2_list_max_of_four_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const x1 = safeInt(rng, -20, 50);
        const x2 = safeInt(rng, -20, 50);
        const x3 = safeInt(rng, -20, 50);
        const x4 = safeInt(rng, -20, 50);
        const m1 = Math.max(x1, x2, x3, x4);

        const y1 = pickDifferentInt(rng, -20, 50, x1);
        const y2 = pickDifferentInt(rng, -20, 50, x2);
        const y3 = pickDifferentInt(rng, -20, 50, x3);
        const y4 = pickDifferentInt(rng, -20, 50, x4);
        const m2 = Math.max(y1, y2, y3, y4);

        const maxLineTemplate = i18nText(
            args,
            `${Q("m2_list_max_of_four_code")}.runtime.maxLineTemplate`,
            "max = {max}"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_list_max_of_four_code")}.prompt`,
            `Read FOUR integers.
Store them in a list.

Print:
max = <value>`
        );

        const exStdin = `${x1}\n${x2}\n${x3}\n${x4}\n`;
        const exStdout = `${fillTemplate(maxLineTemplate, { max: m1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${x1}\n${x2}\n${x3}\n${x4}\n`,
                    stdout: `${fillTemplate(maxLineTemplate, { max: m1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${y1}\n${y2}\n${y3}\n${y4}\n`,
                    stdout: `${fillTemplate(maxLineTemplate, { max: m2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `nums = [int(input()), int(input()), int(input()), int(input())]\n` +
                `best = max(nums)\n` +
                pyFStringPrint(maxLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_list_max_of_four_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_list_max_of_four_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_list_max_of_four_code")}.starterCode`),
            hint: tag(`${Q("m2_list_max_of_four_code")}.hint`),
            expected,
        });
    },

    m2_list_build_names_print_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const n1 = rng.pick(["Maya", "Ayo", "Sam"] as const);
        const n2 = rng.pick(["Leo", "Taylor", "Jordan"] as const);
        const a1 = rng.pick(["Nina", "Omar", "Kai"] as const);
        const a2 = rng.pick(["Zoe", "Ivy", "Noah"] as const);

        const line0Template = i18nText(
            args,
            `${Q("m2_list_build_names_print_code")}.runtime.line0Template`,
            "names[0] = {first}"
        );
        const line1Template = i18nText(
            args,
            `${Q("m2_list_build_names_print_code")}.runtime.line1Template`,
            "names[1] = {second}"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_list_build_names_print_code")}.prompt`,
            `Read TWO names.
Store them in a list in the same order.

Print exactly:
names[0] = <first>
names[1] = <second>`
        );

        const exStdin = `${n1}\n${n2}\n`;
        const exStdout =
            `${fillTemplate(line0Template, { first: n1 })}\n` +
            `${fillTemplate(line1Template, { second: n2 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${n1}\n${n2}\n`,
                    stdout:
                        `${fillTemplate(line0Template, { first: n1 })}\n` +
                        `${fillTemplate(line1Template, { second: n2 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${a1}\n${a2}\n`,
                    stdout:
                        `${fillTemplate(line0Template, { first: a1 })}\n` +
                        `${fillTemplate(line1Template, { second: a2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `first = input().strip()\n` +
                `second = input().strip()\n` +
                `names = [first, second]\n` +
                pyFStringPrint(line0Template) +
                pyFStringPrint(line1Template),
        });

        return makeCodeInputOut({
            archetype: "m2_list_build_names_print_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_list_build_names_print_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_list_build_names_print_code")}.starterCode`),
            hint: tag(`${Q("m2_list_build_names_print_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M2ListsKey, AnyHandler>;

export const M2_LISTS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M2_LISTS_POOL,
    M2_LISTS_HANDLERS
);