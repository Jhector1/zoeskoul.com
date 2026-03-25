import { makeCodeExpected, safeInt, pickName } from "../../_shared";
import {
    defineTopic,
    type Handler,type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut, pickDifferentInt, pickDifferentName,
} from "@/lib/practice/generator/engines/utils";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/input_output_patterns/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M1_IO_POOL = [
    { key: "m1_io_age_next_year", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_io_tip_total", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_io_c_to_f", w: 1, kind: "code_input", purpose: "project" },

    { key: "m1_io_input_returns_str", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_io_tip_integer_math", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_io_c_to_f_formula", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_io_age_next_year_parts", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_io_tip_output_lines", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_io_convert_then_compute_truths", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M1IoKey = (typeof M1_IO_POOL)[number]["key"];

function Q(key: M1IoKey) {
    return `quiz.${key}`;
}




export const M1_IO_HANDLERS = {
    m1_io_age_next_year: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const name1 = pickName(rng);
        const age1 = safeInt(rng, 10, 40);
        const name2 = pickDifferentName(rng, name1);
        const age2 = pickDifferentInt(rng, 10, 40, age1);

        const outputTemplate = i18nText(
            args,
            `${Q("m1_io_age_next_year")}.runtime.outputTemplate`,
            "Hi {name}! Next year you'll be {age_next}."
        );

        const promptText = i18nText(
            args,
            `${Q("m1_io_age_next_year")}.prompt`,
            `Read TWO inputs:
1) name
2) age

Print exactly:
Hi <name>! Next year you'll be <age+1>.`
        );

        const exStdin = `${name1}\n${age1}\n`;
        const exStdout = `${fillTemplate(outputTemplate, {
            name: name1,
            age_next: age1 + 1,
        })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${name1}\n${age1}\n`,
                    stdout: `${fillTemplate(outputTemplate, {
                        name: name1,
                        age_next: age1 + 1,
                    })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${name2}\n${age2}\n`,
                    stdout: `${fillTemplate(outputTemplate, {
                        name: name2,
                        age_next: age2 + 1,
                    })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `name = input()\n` +
                `age = int(input())\n` +
                `age_next = age + 1\n` +
                pyFStringPrint(outputTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_io_age_next_year",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_age_next_year")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_io_age_next_year")}.starterCode`),
            hint: tag(`${Q("m1_io_age_next_year")}.hint`),
            expected,
        });
    },

    m1_io_tip_total: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const bill1 = safeInt(rng, 10, 80);
        const pct1 = safeInt(rng, 10, 25);
        const tip1 = Math.floor((bill1 * pct1) / 100);
        const total1 = bill1 + tip1;

        const bill2 = pickDifferentInt(rng, 10, 80, bill1);
        const pct2 = pickDifferentInt(rng, 10, 25, pct1);
        const tip2 = Math.floor((bill2 * pct2) / 100);
        const total2 = bill2 + tip2;

        const tipLineTemplate = i18nText(
            args,
            `${Q("m1_io_tip_total")}.runtime.tipLineTemplate`,
            "Tip = {tip}"
        );
        const totalLineTemplate = i18nText(
            args,
            `${Q("m1_io_tip_total")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );
        const promptText = i18nText(
            args,
            `${Q("m1_io_tip_total")}.prompt`,
            `Read TWO integers:
1) bill
2) tip percent

Compute:
tip = bill * pct // 100
total = bill + tip

Print exactly:
Tip = <tip>
Total = <total>`
        );

        const exStdin = `${bill1}\n${pct1}\n`;
        const exStdout =
            `${fillTemplate(tipLineTemplate, { tip: tip1 })}\n` +
            `${fillTemplate(totalLineTemplate, { total: total1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${bill1}\n${pct1}\n`,
                    stdout:
                        `${fillTemplate(tipLineTemplate, { tip: tip1 })}\n` +
                        `${fillTemplate(totalLineTemplate, { total: total1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${bill2}\n${pct2}\n`,
                    stdout:
                        `${fillTemplate(tipLineTemplate, { tip: tip2 })}\n` +
                        `${fillTemplate(totalLineTemplate, { total: total2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `bill = int(input())\n` +
                `pct = int(input())\n` +
                `tip = bill * pct // 100\n` +
                `total = bill + tip\n` +
                pyFStringPrint(tipLineTemplate) +
                pyFStringPrint(totalLineTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_io_tip_total",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_tip_total")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_io_tip_total")}.starterCode`),
            hint: tag(`${Q("m1_io_tip_total")}.hint`),
            expected,
        });
    },

    m1_io_c_to_f: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const c1 = safeInt(rng, -10, 40);
        const f1 = Math.floor((c1 * 9) / 5 + 32);

        const c2 = pickDifferentInt(rng, -10, 40, c1);
        const f2 = Math.floor((c2 * 9) / 5 + 32);

        const promptText = i18nText(
            args,
            `${Q("m1_io_c_to_f")}.prompt`,
            `Read ONE integer C.

Compute:
F = C * 9/5 + 32

Print ONLY F.`
        );

        const exStdin = `${c1}\n`;
        const exStdout = `${f1}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${c1}\n`, stdout: `${f1}\n`, match: "exact" },
                { stdin: `${c2}\n`, stdout: `${f2}\n`, match: "exact" },
            ],
            solutionCode: `c = int(input())\nf = int(c * 9 / 5 + 32)\nprint(f)\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_io_c_to_f",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_c_to_f")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_io_c_to_f")}.starterCode`),
            hint: tag(`${Q("m1_io_c_to_f")}.hint`),
            expected,
        });
    },

    m1_io_input_returns_str: ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: "m1_io_input_returns_str",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_input_returns_str")}.title`),
            prompt: tag(`${Q("m1_io_input_returns_str")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_input_returns_str")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_input_returns_str")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_input_returns_str")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_input_returns_str")}.options.d`) },
            ],
            answerOptionId: "c",
            hint: tag(`${Q("m1_io_input_returns_str")}.hint`),
        }),

    m1_io_tip_integer_math: ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: "m1_io_tip_integer_math",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_tip_integer_math")}.title`),
            prompt: tag(`${Q("m1_io_tip_integer_math")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_tip_integer_math")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_tip_integer_math")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_tip_integer_math")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_tip_integer_math")}.options.d`) },
            ],
            answerOptionId: "b",
            hint: tag(`${Q("m1_io_tip_integer_math")}.hint`),
        }),

    m1_io_c_to_f_formula: ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: "m1_io_c_to_f_formula",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_c_to_f_formula")}.title`),
            prompt: tag(`${Q("m1_io_c_to_f_formula")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_c_to_f_formula")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_c_to_f_formula")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_c_to_f_formula")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_c_to_f_formula")}.options.d`) },
            ],
            answerOptionId: "a",
            hint: tag(`${Q("m1_io_c_to_f_formula")}.hint`),
        }),

    m1_io_age_next_year_parts: ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: "m1_io_age_next_year_parts",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_age_next_year_parts")}.title`),
            prompt: tag(`${Q("m1_io_age_next_year_parts")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_age_next_year_parts")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_age_next_year_parts")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_age_next_year_parts")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_age_next_year_parts")}.options.d`) },
                { id: "e", text: tag(`${Q("m1_io_age_next_year_parts")}.options.e`) },
            ],
            answerOptionIds: ["a", "b", "c"],
            hint: tag(`${Q("m1_io_age_next_year_parts")}.hint`),
        }),

    m1_io_tip_output_lines: ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: "m1_io_tip_output_lines",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_tip_output_lines")}.title`),
            prompt: tag(`${Q("m1_io_tip_output_lines")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_tip_output_lines")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_tip_output_lines")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_tip_output_lines")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_tip_output_lines")}.options.d`) },
            ],
            answerOptionIds: ["a", "b"],
            hint: tag(`${Q("m1_io_tip_output_lines")}.hint`),
        }),

    m1_io_convert_then_compute_truths: ({ diff, id, topic }: HandlerArgs) =>
        makeMultiChoiceOut({
            archetype: "m1_io_convert_then_compute_truths",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_io_convert_then_compute_truths")}.title`),
            prompt: tag(`${Q("m1_io_convert_then_compute_truths")}.prompt`),
            options: [
                { id: "a", text: tag(`${Q("m1_io_convert_then_compute_truths")}.options.a`) },
                { id: "b", text: tag(`${Q("m1_io_convert_then_compute_truths")}.options.b`) },
                { id: "c", text: tag(`${Q("m1_io_convert_then_compute_truths")}.options.c`) },
                { id: "d", text: tag(`${Q("m1_io_convert_then_compute_truths")}.options.d`) },
                { id: "e", text: tag(`${Q("m1_io_convert_then_compute_truths")}.options.e`) },
            ],
            answerOptionIds: ["a", "b", "d"],
            hint: tag(`${Q("m1_io_convert_then_compute_truths")}.hint`),
        }),
} satisfies Record<M1IoKey, AnyHandler>;

export const M1_IO_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_IO_POOL,
    M1_IO_HANDLERS,
);