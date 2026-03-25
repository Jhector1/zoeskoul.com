// src/lib/practice/generator/engines/python/python_part1_mod1/topics/operators_expressions.ts
import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, safeInt } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/operators_expressions/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M1_OPERATORS_POOL = [
    // projects
    { key: "m1_ops_precedence_sc", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_ops_mod_evenodd_sc", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_ops_checkout_code", w: 1, kind: "code_input", purpose: "project" },

    // quizzes
    { key: "m1_ops_precedence_rule_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_ops_mod_result_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_ops_checkout_formula_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_ops_precedence_parts_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_ops_evenodd_truths_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_ops_checkout_outputs_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M1OperatorsKey = (typeof M1_OPERATORS_POOL)[number]["key"];

function Q(key: M1OperatorsKey) {
    return `quiz.${key}`;
}

type OptId3 = "a" | "b" | "c";
type OptId4 = "a" | "b" | "c" | "d";

function buildOptions3(
    key: Extract<
        M1OperatorsKey,
        | "m1_ops_precedence_rule_sc"
        | "m1_ops_mod_result_sc"
        | "m1_ops_checkout_formula_sc"
    >
) {
    return (["a", "b", "c"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function buildOptions4(
    key: Extract<
        M1OperatorsKey,
        | "m1_ops_precedence_parts_mc"
        | "m1_ops_evenodd_truths_mc"
        | "m1_ops_checkout_outputs_mc"
    >
) {
    return (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function pickDifferentInt(rng: any, lo: number, hi: number, avoid: number) {
    let x = safeInt(rng, lo, hi);
    for (let i = 0; i < 6 && x === avoid; i++) x = safeInt(rng, lo, hi);
    return x;
}

function sc(
    key: Extract<
        M1OperatorsKey,
        | "m1_ops_precedence_rule_sc"
        | "m1_ops_mod_result_sc"
        | "m1_ops_checkout_formula_sc"
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
        M1OperatorsKey,
        | "m1_ops_precedence_parts_mc"
        | "m1_ops_evenodd_truths_mc"
        | "m1_ops_checkout_outputs_mc"
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

export const M1_OPERATORS_HANDLERS = {
    // =========================
    // QUIZZES
    // =========================
    m1_ops_precedence_rule_sc: sc("m1_ops_precedence_rule_sc", "b"),
    m1_ops_mod_result_sc: sc("m1_ops_mod_result_sc", "c"),
    m1_ops_checkout_formula_sc: sc("m1_ops_checkout_formula_sc", "a"),

    m1_ops_precedence_parts_mc: mc("m1_ops_precedence_parts_mc", ["a", "c"]),
    m1_ops_evenodd_truths_mc: mc("m1_ops_evenodd_truths_mc", ["a", "d"]),
    m1_ops_checkout_outputs_mc: mc("m1_ops_checkout_outputs_mc", ["a", "b"]),

    // =========================
    // PROJECTS
    // =========================
    m1_ops_precedence_sc: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 1, 9);
        const b1 = safeInt(rng, 1, 9);
        const c1 = safeInt(rng, 1, 9);
        const r1 = a1 + b1 * c1;

        const a2 = pickDifferentInt(rng, 1, 9, a1);
        const b2 = pickDifferentInt(rng, 1, 9, b1);
        const c2 = pickDifferentInt(rng, 1, 9, c1);
        const r2 = a2 + b2 * c2;

        const promptText = i18nText(
            args,
            `${Q("m1_ops_precedence_sc")}.prompt`,
            `Read THREE integers (a, b, c).

Compute and print:
a + b * c

Print ONLY the number (one line).`
        );

        const exStdin = `${a1}\n${b1}\n${c1}\n`;
        const exStdout = `${r1}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${a1}\n${b1}\n${c1}\n`, stdout: `${r1}\n`, match: "exact" },
                { stdin: `${a2}\n${b2}\n${c2}\n`, stdout: `${r2}\n`, match: "exact" },
            ],
            solutionCode:
                `a = int(input())\n` +
                `b = int(input())\n` +
                `c = int(input())\n` +
                `print(a + b * c)\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_ops_precedence_sc",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_ops_precedence_sc")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_ops_precedence_sc")}.starterCode`),
            hint: tag(`${Q("m1_ops_precedence_sc")}.hint`),
            expected,
        });
    },

    m1_ops_mod_evenodd_sc: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const n1 = safeInt(rng, 1, 99);
        const out1 = n1 % 2 === 0 ? "even" : "odd";

        const n2 = pickDifferentInt(rng, 1, 99, n1);
        const out2 = n2 % 2 === 0 ? "even" : "odd";

        const evenText = i18nText(args, `${Q("m1_ops_mod_evenodd_sc")}.runtime.evenText`, "even");
        const oddText = i18nText(args, `${Q("m1_ops_mod_evenodd_sc")}.runtime.oddText`, "odd");

        const promptText = i18nText(
            args,
            `${Q("m1_ops_mod_evenodd_sc")}.prompt`,
            `Read ONE integer n.

If n is even, print:
even

Otherwise print:
odd`
        );

        const exStdin = `${n1}\n`;
        const exStdout = `${out1 === "even" ? evenText : oddText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${n1}\n`,
                    stdout: `${out1 === "even" ? evenText : oddText}\n`,
                    match: "exact",
                },
                {
                    stdin: `${n2}\n`,
                    stdout: `${out2 === "even" ? evenText : oddText}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `n = int(input())\n` +
                `print(${JSON.stringify(evenText)} if n % 2 == 0 else ${JSON.stringify(oddText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_ops_mod_evenodd_sc",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_ops_mod_evenodd_sc")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_ops_mod_evenodd_sc")}.starterCode`),
            hint: tag(`${Q("m1_ops_mod_evenodd_sc")}.hint`),
            expected,
        });
    },

    m1_ops_checkout_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const subtotal1 = safeInt(rng, 10, 120);
        const taxPct1 = safeInt(rng, 3, 11);
        const tax1 = Math.floor((subtotal1 * taxPct1) / 100);
        const total1 = subtotal1 + tax1;

        const subtotal2 = pickDifferentInt(rng, 10, 120, subtotal1);
        const taxPct2 = pickDifferentInt(rng, 3, 11, taxPct1);
        const tax2 = Math.floor((subtotal2 * taxPct2) / 100);
        const total2 = subtotal2 + tax2;

        const taxLineTemplate = i18nText(
            args,
            `${Q("m1_ops_checkout_code")}.runtime.taxLineTemplate`,
            "Tax = {tax}"
        );
        const totalLineTemplate = i18nText(
            args,
            `${Q("m1_ops_checkout_code")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );

        const promptText = i18nText(
            args,
            `${Q("m1_ops_checkout_code")}.prompt`,
            `Read TWO integers:
1) subtotal
2) tax percent

Compute:
- tax = subtotal * taxPct // 100
- total = subtotal + tax

Print EXACTLY two lines:
Tax = <tax>
Total = <total>`
        );

        const exStdin = `${subtotal1}\n${taxPct1}\n`;
        const exStdout =
            `${fillTemplate(taxLineTemplate, { tax: tax1 })}\n` +
            `${fillTemplate(totalLineTemplate, { total: total1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${subtotal1}\n${taxPct1}\n`,
                    stdout:
                        `${fillTemplate(taxLineTemplate, { tax: tax1 })}\n` +
                        `${fillTemplate(totalLineTemplate, { total: total1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${subtotal2}\n${taxPct2}\n`,
                    stdout:
                        `${fillTemplate(taxLineTemplate, { tax: tax2 })}\n` +
                        `${fillTemplate(totalLineTemplate, { total: total2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `subtotal = int(input())\n` +
                `taxPct = int(input())\n` +
                `tax = subtotal * taxPct // 100\n` +
                `total = subtotal + tax\n` +
                pyFStringPrint(taxLineTemplate) +
                pyFStringPrint(totalLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_ops_checkout_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_ops_checkout_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_ops_checkout_code")}.starterCode`),
            hint: tag(`${Q("m1_ops_checkout_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M1OperatorsKey, AnyHandler>;

export const M1_GENERATOR_OPERATORS_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_OPERATORS_POOL,
    M1_OPERATORS_HANDLERS,
);