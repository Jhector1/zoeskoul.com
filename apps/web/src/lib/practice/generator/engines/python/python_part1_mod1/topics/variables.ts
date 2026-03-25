// src/lib/practice/generator/engines/python/python_part1_mod1/topics/variables.ts
import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeCodeInputOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, pickName, safeInt } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/variables/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M1_VARS_POOL = [
    { key: "m1_vars_what_is_variable_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_vars_assignment_operator_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_vars_valid_name_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_vars_update_value_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_vars_boxes_print_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_vars_swap_values_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_vars_running_total_code", w: 1, kind: "code_input", purpose: "project" },
] as const;

export type M1VarsKey = (typeof M1_VARS_POOL)[number]["key"];

function Q(key: M1VarsKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";

function buildOptions(
    key: Extract<
        M1VarsKey,
        | "m1_vars_what_is_variable_sc"
        | "m1_vars_assignment_operator_sc"
        | "m1_vars_valid_name_sc"
        | "m1_vars_update_value_sc"
    >,
    ids: OptId[]
) {
    return ids.map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M1VarsKey,
        | "m1_vars_what_is_variable_sc"
        | "m1_vars_assignment_operator_sc"
        | "m1_vars_valid_name_sc"
        | "m1_vars_update_value_sc"
    >,
    answerOptionId: OptId
): Handler<"single_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: tag(`${Q(key)}.title`),
            prompt: tag(`${Q(key)}.prompt`),
            options: buildOptions(key, ["a", "b", "c"]),
            answerOptionId,
            hint: tag(`${Q(key)}.hint`),
        });
}

function pickDifferentName(rng: any, avoid: string) {
    let x = pickName(rng);
    for (let i = 0; i < 6 && x === avoid; i++) x = pickName(rng);
    return x;
}

function pickDifferentInt(rng: any, lo: number, hi: number, avoid: number) {
    let x = safeInt(rng, lo, hi);
    for (let i = 0; i < 6 && x === avoid; i++) x = safeInt(rng, lo, hi);
    return x;
}

export const M1_VARS_HANDLERS = {
    m1_vars_what_is_variable_sc: sc("m1_vars_what_is_variable_sc", "a"),
    m1_vars_assignment_operator_sc: sc("m1_vars_assignment_operator_sc", "b"),
    m1_vars_valid_name_sc: sc("m1_vars_valid_name_sc", "c"),
    m1_vars_update_value_sc: sc("m1_vars_update_value_sc", "a"),

    m1_vars_boxes_print_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const name1 = pickName(rng);
        const age1 = safeInt(rng, 10, 40);
        const name2 = pickDifferentName(rng, name1);
        const age2 = pickDifferentInt(rng, 10, 40, age1);

        const promptText = i18nText(
            args,
            `${Q("m1_vars_boxes_print_code")}.prompt`,
            `Read TWO inputs:
1) name
2) age

Store them in variables and print EXACTLY:
name = <name>
age = <age>`
        );

        const nameLineTemplate = i18nText(
            args,
            `${Q("m1_vars_boxes_print_code")}.runtime.nameLineTemplate`,
            "name = {name}"
        );

        const ageLineTemplate = i18nText(
            args,
            `${Q("m1_vars_boxes_print_code")}.runtime.ageLineTemplate`,
            "age = {age}"
        );

        const exStdin = `${name1}\n${age1}\n`;
        const exStdout =
            `${fillTemplate(nameLineTemplate, { name: name1 })}\n` +
            `${fillTemplate(ageLineTemplate, { age: age1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${name1}\n${age1}\n`,
                    stdout:
                        `${fillTemplate(nameLineTemplate, { name: name1 })}\n` +
                        `${fillTemplate(ageLineTemplate, { age: age1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${name2}\n${age2}\n`,
                    stdout:
                        `${fillTemplate(nameLineTemplate, { name: name2 })}\n` +
                        `${fillTemplate(ageLineTemplate, { age: age2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `name = input()\n` +
                `age = input()\n` +
                pyFStringPrint(nameLineTemplate) +
                pyFStringPrint(ageLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_vars_boxes_print_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_vars_boxes_print_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_vars_boxes_print_code")}.starterCode`),
            hint: tag(`${Q("m1_vars_boxes_print_code")}.hint`),
            expected,
        });
    },

    m1_vars_swap_values_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 1, 9);
        const b1 = safeInt(rng, 1, 9);
        const a2 = safeInt(rng, 10, 99);
        const b2 = safeInt(rng, 10, 99);

        const promptText = i18nText(
            args,
            `${Q("m1_vars_swap_values_code")}.prompt`,
            `Read TWO integers a and b.

Swap their values, then print:
- the new value of a
- the new value of b

Each on its own line.`
        );

        const exStdin = `${a1}\n${b1}\n`;
        const exStdout = `${b1}\n${a1}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${a1}\n${b1}\n`, stdout: `${b1}\n${a1}\n`, match: "exact" },
                { stdin: `${a2}\n${b2}\n`, stdout: `${b2}\n${a2}\n`, match: "exact" },
            ],
            solutionCode:
                `a = int(input())\n` +
                `b = int(input())\n` +
                `a, b = b, a\n` +
                `print(a)\n` +
                `print(b)\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_vars_swap_values_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_vars_swap_values_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_vars_swap_values_code")}.starterCode`),
            hint: tag(`${Q("m1_vars_swap_values_code")}.hint`),
            expected,
        });
    },

    m1_vars_running_total_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const d1 = safeInt(rng, 1000, 12000);
        const d2 = safeInt(rng, 1000, 12000);
        const d3 = safeInt(rng, 1000, 12000);

        const e1 = safeInt(rng, 1000, 12000);
        const e2 = safeInt(rng, 1000, 12000);
        const e3 = safeInt(rng, 1000, 12000);

        const promptText = i18nText(
            args,
            `${Q("m1_vars_running_total_code")}.prompt`,
            `Read THREE integers:
day1
day2
day3

Store them in variables, compute the total, and print:
Total = <total>`
        );

        const totalLineTemplate = i18nText(
            args,
            `${Q("m1_vars_running_total_code")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );

        const exStdin = `${d1}\n${d2}\n${d3}\n`;
        const exStdout = `${fillTemplate(totalLineTemplate, { total: d1 + d2 + d3 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${d1}\n${d2}\n${d3}\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: d1 + d2 + d3 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${e1}\n${e2}\n${e3}\n`,
                    stdout: `${fillTemplate(totalLineTemplate, { total: e1 + e2 + e3 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `day1 = int(input())\n` +
                `day2 = int(input())\n` +
                `day3 = int(input())\n` +
                `total = day1 + day2 + day3\n` +
                pyFStringPrint(totalLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_vars_running_total_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_vars_running_total_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_vars_running_total_code")}.starterCode`),
            hint: tag(`${Q("m1_vars_running_total_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M1VarsKey, AnyHandler>;

export const VARS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_VARS_POOL,
    M1_VARS_HANDLERS
);