// src/lib/practice/generator/engines/python/python_part1_mod2/topics/functions_basics.ts
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
import { TOPIC_ID } from "@/lib/subjects/python/modules/module2/topics/functions_basics/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M2_FUNCTIONS_POOL = [
    { key: "m2_func_total_with_tip_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_func_shipping_rule_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_func_sum_list_code", w: 1, kind: "code_input", purpose: "project" },

    { key: "m2_func_return_vs_print_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_func_parameters_vs_arguments_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_func_def_keyword_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_func_scope_rule_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m2_func_return_stops_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_func_calls_and_arguments_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_func_sum_list_steps_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M2FunctionsKey = (typeof M2_FUNCTIONS_POOL)[number]["key"];

function Q(key: M2FunctionsKey) {
    return `quiz.${key}`;
}

type OptId3 = "a" | "b" | "c";
type OptId4 = "a" | "b" | "c" | "d";

function buildOptions3(
    key: Extract<
        M2FunctionsKey,
        | "m2_func_return_vs_print_sc"
        | "m2_func_parameters_vs_arguments_sc"
        | "m2_func_def_keyword_sc"
        | "m2_func_scope_rule_sc"
    >
) {
    return (["a", "b", "c"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function buildOptions4(
    key: Extract<
        M2FunctionsKey,
        | "m2_func_return_stops_mc"
        | "m2_func_calls_and_arguments_mc"
        | "m2_func_sum_list_steps_mc"
    >
) {
    return (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M2FunctionsKey,
        | "m2_func_return_vs_print_sc"
        | "m2_func_parameters_vs_arguments_sc"
        | "m2_func_def_keyword_sc"
        | "m2_func_scope_rule_sc"
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
        M2FunctionsKey,
        | "m2_func_return_stops_mc"
        | "m2_func_calls_and_arguments_mc"
        | "m2_func_sum_list_steps_mc"
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

export const M2_FUNCTIONS_HANDLERS = {
    m2_func_total_with_tip_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const bill1 = safeInt(rng, 10, 120);
        const pct1 = safeInt(rng, 5, 25);
        const tip1 = Math.floor((bill1 * pct1) / 100);
        const total1 = bill1 + tip1;

        const bill2 = pickDifferentInt(rng, 10, 120, bill1);
        const pct2 = pickDifferentInt(rng, 5, 25, pct1);
        const tip2 = Math.floor((bill2 * pct2) / 100);
        const total2 = bill2 + tip2;

        const totalLineTemplate = i18nText(
            args,
            `${Q("m2_func_total_with_tip_code")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );

        const promptText = i18nText(
            args,
            `${Q("m2_func_total_with_tip_code")}.prompt`,
            `Write a function total_with_tip(bill, pct).

Rules:
- bill and pct are integers
- tip = bill * pct // 100
- return bill + tip

Then read bill and pct and print:
Total = <total>`
        );

        const exStdin = `${bill1}\n${pct1}\n`;
        const exStdout = `${fillTemplate(totalLineTemplate, { total: total1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${bill1}\n${pct1}\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: total1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${bill2}\n${pct2}\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: total2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `def total_with_tip(bill, pct):\n` +
                `    tip = bill * pct // 100\n` +
                `    return bill + tip\n` +
                `\n` +
                `bill = int(input())\n` +
                `pct = int(input())\n` +
                `total = total_with_tip(bill, pct)\n` +
                pyFStringPrint(totalLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_func_total_with_tip_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_func_total_with_tip_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_func_total_with_tip_code")}.starterCode`),
            hint: tag(`${Q("m2_func_total_with_tip_code")}.hint`),
            expected,
        });
    },

    m2_func_shipping_rule_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const t1 = safeInt(rng, 10, 49);
        const t2 = safeInt(rng, 50, 150);
        const ship = (total: number) => (total >= 50 ? 0 : 7);

        const shippingLineTemplate = i18nText(
            args,
            `${Q("m2_func_shipping_rule_code")}.runtime.shippingLineTemplate`,
            "Shipping = {cost}"
        );

        const promptText = i18nText(
            args,
            `${Q("m2_func_shipping_rule_code")}.prompt`,
            `Write a function shipping_cost(total).

Rule:
- if total >= 50 return 0
- else return 7

Then read total and print:
Shipping = <cost>`
        );

        const exStdin = `${t1}\n`;
        const exStdout = `${fillTemplate(shippingLineTemplate, { cost: ship(t1) })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${t1}\n`,
                    stdout: `${fillTemplate(shippingLineTemplate, { cost: ship(t1) })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${t2}\n`,
                    stdout: `${fillTemplate(shippingLineTemplate, { cost: ship(t2) })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `def shipping_cost(total):\n` +
                `    return 0 if total >= 50 else 7\n` +
                `\n` +
                `total = int(input())\n` +
                `cost = shipping_cost(total)\n` +
                pyFStringPrint(shippingLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_func_shipping_rule_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_func_shipping_rule_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_func_shipping_rule_code")}.starterCode`),
            hint: tag(`${Q("m2_func_shipping_rule_code")}.hint`),
            expected,
        });
    },

    m2_func_sum_list_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 1, 30);
        const b1 = safeInt(rng, 1, 30);
        const c1 = safeInt(rng, 1, 30);
        const s1 = a1 + b1 + c1;

        const a2 = pickDifferentInt(rng, 1, 30, a1);
        const b2 = pickDifferentInt(rng, 1, 30, b1);
        const c2 = pickDifferentInt(rng, 1, 30, c1);
        const s2 = a2 + b2 + c2;

        const sumLineTemplate = i18nText(
            args,
            `${Q("m2_func_sum_list_code")}.runtime.sumLineTemplate`,
            "sum = {value}"
        );

        const promptText = i18nText(
            args,
            `${Q("m2_func_sum_list_code")}.prompt`,
            `Write a function sum_list(xs).

Rules:
- xs is a list of integers
- return the sum using a loop

Then read THREE integers, store them in a list, call sum_list, and print:
sum = <value>`
        );

        const exStdin = `${a1}\n${b1}\n${c1}\n`;
        const exStdout = `${fillTemplate(sumLineTemplate, { value: s1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${a1}\n${b1}\n${c1}\n`,
                    stdout: `${fillTemplate(sumLineTemplate, { value: s1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${a2}\n${b2}\n${c2}\n`,
                    stdout: `${fillTemplate(sumLineTemplate, { value: s2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `def sum_list(xs):\n` +
                `    total = 0\n` +
                `    for v in xs:\n` +
                `        total += v\n` +
                `    return total\n` +
                `\n` +
                `a = int(input())\n` +
                `b = int(input())\n` +
                `c = int(input())\n` +
                `xs = [a, b, c]\n` +
                `value = sum_list(xs)\n` +
                pyFStringPrint(sumLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_func_sum_list_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_func_sum_list_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_func_sum_list_code")}.starterCode`),
            hint: tag(`${Q("m2_func_sum_list_code")}.hint`),
            expected,
        });
    },

    m2_func_return_vs_print_sc: sc("m2_func_return_vs_print_sc", "b"),
    m2_func_parameters_vs_arguments_sc: sc("m2_func_parameters_vs_arguments_sc", "c"),
    m2_func_def_keyword_sc: sc("m2_func_def_keyword_sc", "a"),
    m2_func_scope_rule_sc: sc("m2_func_scope_rule_sc", "b"),

    m2_func_return_stops_mc: mc("m2_func_return_stops_mc", ["a", "c"]),
    m2_func_calls_and_arguments_mc: mc("m2_func_calls_and_arguments_mc", ["a", "b", "d"]),
    m2_func_sum_list_steps_mc: mc("m2_func_sum_list_steps_mc", ["a", "c", "d"]),
} satisfies Record<M2FunctionsKey, AnyHandler>;

export const M2_FUNCTIONS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M2_FUNCTIONS_POOL,
    M2_FUNCTIONS_HANDLERS
);