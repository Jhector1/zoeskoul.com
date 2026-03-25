// src/lib/practice/generator/engines/python/python_part1_mod2/topics/conditionals_basics.ts
import {
    defineTopic,
    type Handler,type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, safeInt, pickName } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module2/topics/conditionals_basics/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M2_CONDITIONALS_POOL = [
    { key: "m2_cond_age_gate_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_cond_member_discount_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_cond_password_check_code", w: 1, kind: "code_input", purpose: "project" },

    { key: "m2_cond_elif_meaning_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_cond_indent_matters_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_cond_elif_order_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_cond_comparison_vs_assignment_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_cond_and_or_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m2_cond_falsey_values_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_cond_logical_ops_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M2ConditionalsKey = (typeof M2_CONDITIONALS_POOL)[number]["key"];

function Q(key: M2ConditionalsKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c" | "d";

function buildOptions(key: M2ConditionalsKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M2ConditionalsKey,
        | "m2_cond_elif_meaning_sc"
        | "m2_cond_indent_matters_sc"
        | "m2_cond_elif_order_sc"
        | "m2_cond_comparison_vs_assignment_sc"
        | "m2_cond_and_or_sc"
    >,
    answerOptionId: OptId,
    optionIds: OptId[] = ["a", "b", "c"]
): Handler<"single_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: tag(`${Q(key)}.title`),
            prompt: tag(`${Q(key)}.prompt`),
            options: buildOptions(key, optionIds),
            answerOptionId,
            hint: tag(`${Q(key)}.hint`),
        });
}

function mc(
    key: Extract<
        M2ConditionalsKey,
        | "m2_cond_falsey_values_mc"
        | "m2_cond_logical_ops_mc"
    >,
    answerOptionIds: OptId[],
    optionIds: OptId[] = ["a", "b", "c", "d"]
): Handler<"multi_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: tag(`${Q(key)}.title`),
            prompt: tag(`${Q(key)}.prompt`),
            options: buildOptions(key, optionIds),
            answerOptionIds,
            hint: tag(`${Q(key)}.hint`),
        });
}

function pickDifferentInt(rng: any, lo: number, hi: number, avoid: number) {
    let x = safeInt(rng, lo, hi);
    for (let i = 0; i < 6 && x === avoid; i++) x = safeInt(rng, lo, hi);
    return x;
}

export const M2_CONDITIONALS_HANDLERS = {
    m2_cond_age_gate_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 12, 17);
        const a2 = safeInt(rng, 18, 30);

        const allowedText = i18nText(
            args,
            `${Q("m2_cond_age_gate_code")}.runtime.allowedText`,
            "ALLOWED"
        );
        const deniedText = i18nText(
            args,
            `${Q("m2_cond_age_gate_code")}.runtime.deniedText`,
            "DENIED"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_cond_age_gate_code")}.prompt`,
            `Story: you’re building a kiosk at a snack shop. Some items are 18+.

Read ONE integer age.

If age >= 18 print:
ALLOWED

Else print:
DENIED`
        );

        const exStdin = `${a2}\n`;
        const exStdout = `${allowedText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${a1}\n`, stdout: `${deniedText}\n`, match: "exact" },
                { stdin: `${a2}\n`, stdout: `${allowedText}\n`, match: "exact" },
            ],
            solutionCode:
                `age = int(input())\n` +
                `print(${JSON.stringify(allowedText)} if age >= 18 else ${JSON.stringify(deniedText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m2_cond_age_gate_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_cond_age_gate_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            hint: tag(`${Q("m2_cond_age_gate_code")}.hint`),
            language: "python",
            starterCode: tag(`${Q("m2_cond_age_gate_code")}.starterCode`),
            expected,
            editorHeight: 360,
        });
    },

    m2_cond_member_discount_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const subtotal1 = safeInt(rng, 10, 200);
        const subtotal2 = pickDifferentInt(rng, 10, 200, subtotal1);
        const totalMember = (s: number) => s - Math.floor((s * 10) / 100);

        const totalLineTemplate = i18nText(
            args,
            `${Q("m2_cond_member_discount_code")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_cond_member_discount_code")}.prompt`,
            `Story: the snack shop gives members a 10% discount.

Read TWO inputs:
1) subtotal (integer dollars)
2) member flag (y/n)

Rules:
- if member is y (or Y), apply 10% discount using integer math
- otherwise no discount

Print exactly:
Total = <total>`
        );

        const exStdin = `${subtotal1}\ny\n`;
        const exStdout = `${fillTemplate(totalLineTemplate, { total: totalMember(subtotal1) })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${subtotal1}\ny\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: totalMember(subtotal1) })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${subtotal2}\nn\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: subtotal2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `subtotal = int(input())\n` +
                `member = input().strip().lower()\n` +
                `total = subtotal\n` +
                `if member == "y":\n` +
                `    total = subtotal - (subtotal * 10 // 100)\n` +
                pyFStringPrint(totalLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m2_cond_member_discount_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_cond_member_discount_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            hint: tag(`${Q("m2_cond_member_discount_code")}.hint`),
            language: "python",
            starterCode: tag(`${Q("m2_cond_member_discount_code")}.starterCode`),
            expected,
            editorHeight: 420,
        });
    },

    m2_cond_password_check_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const correct = "letmein";
        const wrong = pickName(rng);

        const loggedInText = i18nText(
            args,
            `${Q("m2_cond_password_check_code")}.runtime.loggedInText`,
            "Logged in"
        );
        const wrongPasswordText = i18nText(
            args,
            `${Q("m2_cond_password_check_code")}.runtime.wrongPasswordText`,
            "Wrong password"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_cond_password_check_code")}.prompt`,
            `Story: the kiosk has an admin mode.

Read ONE input password.

If password == "letmein" print:
Logged in

Else print:
Wrong password`
        );

        const exStdin = `${correct}\n`;
        const exStdout = `${loggedInText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${correct}\n`, stdout: `${loggedInText}\n`, match: "exact" },
                { stdin: `${wrong}\n`, stdout: `${wrongPasswordText}\n`, match: "exact" },
            ],
            solutionCode:
                `pw = input().strip()\n` +
                `print(${JSON.stringify(loggedInText)} if pw == "letmein" else ${JSON.stringify(wrongPasswordText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m2_cond_password_check_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_cond_password_check_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            hint: tag(`${Q("m2_cond_password_check_code")}.hint`),
            language: "python",
            starterCode: tag(`${Q("m2_cond_password_check_code")}.starterCode`),
            expected,
            editorHeight: 360,
        });
    },

    m2_cond_elif_meaning_sc: sc("m2_cond_elif_meaning_sc", "b", ["a", "b", "c"]),
    m2_cond_indent_matters_sc: sc("m2_cond_indent_matters_sc", "c", ["a", "b", "c", "d"]),
    m2_cond_elif_order_sc: sc("m2_cond_elif_order_sc", "b", ["a", "b", "c"]),
    m2_cond_comparison_vs_assignment_sc: sc("m2_cond_comparison_vs_assignment_sc", "a", ["a", "b", "c", "d"]),
    m2_cond_and_or_sc: sc("m2_cond_and_or_sc", "b", ["a", "b", "c"]),

    m2_cond_falsey_values_mc: mc("m2_cond_falsey_values_mc", ["a", "b", "c"], ["a", "b", "c", "d"]),
    m2_cond_logical_ops_mc: mc("m2_cond_logical_ops_mc", ["a", "b", "c"], ["a", "b", "c", "d"]),
} satisfies Record<M2ConditionalsKey, AnyHandler>;

export const M2_CONDITIONALS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M2_CONDITIONALS_POOL,
    M2_CONDITIONALS_HANDLERS
);