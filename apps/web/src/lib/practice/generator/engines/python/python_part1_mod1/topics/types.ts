import type { CodeInputExercise } from "../../../../../types";
import {
    defineTopic,
    type Handler,type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, pickName, safeInt } from "../../_shared";
import type { ExerciseKind } from "@/lib/practice/types";
import type { GenOut } from "@/lib/practice/generator/shared/expected";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/data_types_intro/meta";

export const M1_TYPES_POOL = [
    { key: "m1_types_string_vs_int_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_types_int_vs_float_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_types_bool_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_types_none_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_types_convert_next_year_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_types_tip_total_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_types_c_to_f_code", w: 1, kind: "code_input", purpose: "project" },
] as const;

export type M1TypesKey = (typeof M1_TYPES_POOL)[number]["key"];

function Q(key: M1TypesKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";



function buildOptions(
    key: Extract<
        M1TypesKey,
        | "m1_types_string_vs_int_sc"
        | "m1_types_int_vs_float_sc"
        | "m1_types_bool_sc"
        | "m1_types_none_sc"
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
        M1TypesKey,
        | "m1_types_string_vs_int_sc"
        | "m1_types_int_vs_float_sc"
        | "m1_types_bool_sc"
        | "m1_types_none_sc"
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
        }) ;
}

export const M1_TYPES_HANDLERS = {
    m1_types_string_vs_int_sc: sc("m1_types_string_vs_int_sc", "b"),
    m1_types_int_vs_float_sc: sc("m1_types_int_vs_float_sc", "b"),
    m1_types_bool_sc: sc("m1_types_bool_sc", "a"),
    m1_types_none_sc: sc("m1_types_none_sc", "c"),

    m1_types_convert_next_year_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const name1 = pickName(rng);
        const age1 = safeInt(rng, 10, 40);
        const name2 = pickName(rng);
        const age2 = safeInt(rng, 10, 40);

        const outputTemplate = i18nText(
            args,
            `${Q("m1_types_convert_next_year_code")}.outputTemplate`,
            "Hi {name}! Next year you'll be {age_next}."
        );

        const promptText = i18nText(
            args,
            `${Q("m1_types_convert_next_year_code")}.prompt`,
            `A signup form collects:
1) name
2) age

Read TWO inputs:
- name (text)
- age (text, but it represents a number)

Convert age to an integer, then print EXACTLY:
Hi <name>! Next year you'll be <age+1>.`
        );

        const exStdin = `${name1}\n${age1}\n`;
        const exStdout = `${fillTemplate(outputTemplate, {
            name: name1,
            age_next: age1 + 1,
        })}\n`;

        return {
            archetype: "m1_types_convert_next_year_code",
            exercise: {
                id,
                topic,
                difficulty: diff,
                kind: "code_input",
                title: tag(`${Q("m1_types_convert_next_year_code")}.title`),
                prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`,
                language: "python",
                starterCode: String.raw`name = input()
age = input()
# TODO: convert age
# TODO: print message
`,
                hint: tag(`${Q("m1_types_convert_next_year_code")}.hint`),
            } satisfies CodeInputExercise,
            expected: makeCodeExpected({
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
            }),
        } ;
    },

    m1_types_tip_total_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const bill1 = safeInt(rng, 10, 80);
        const pct1 = safeInt(rng, 10, 25);
        const tip1 = Math.floor((bill1 * pct1) / 100);
        const total1 = bill1 + tip1;

        const bill2 = safeInt(rng, 10, 80);
        const pct2 = safeInt(rng, 10, 25);
        const tip2 = Math.floor((bill2 * pct2) / 100);
        const total2 = bill2 + tip2;

        const promptText = i18nText(
            args,
            `${Q("m1_types_tip_total_code")}.prompt`,
            `A restaurant app asks for:
1) bill (integer)
2) tip percent (integer)

Compute:
tip = bill * pct // 100
total = bill + tip

Print EXACTLY:
Tip = <tip>
Total = <total>`
        );

        const tipLineTemplate = i18nText(
            args,
            `${Q("m1_types_tip_total_code")}.runtime.tipLineTemplate`,
            "Tip = {tip}"
        );

        const totalLineTemplate = i18nText(
            args,
            `${Q("m1_types_tip_total_code")}.runtime.totalLineTemplate`,
            "Total = {total}"
        );

        const exStdin = `${bill1}\n${pct1}\n`;
        const exStdout =
            `${fillTemplate(tipLineTemplate, { tip: tip1 })}\n` +
            `${fillTemplate(totalLineTemplate, { total: total1 })}\n`;

        return {
            archetype: "m1_types_tip_total_code",
            exercise: {
                id,
                topic,
                difficulty: diff,
                kind: "code_input",
                title: tag(`${Q("m1_types_tip_total_code")}.title`),
                prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`,
                language: "python",
                starterCode: String.raw`bill = int(input())
pct = int(input())
# TODO
`,
                hint: tag(`${Q("m1_types_tip_total_code")}.hint`),
            } satisfies CodeInputExercise,
            expected: makeCodeExpected({
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
            }),
        } ;
    },

    m1_types_c_to_f_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const c1 = safeInt(rng, -10, 40);
        const f1 = Math.floor((c1 * 9) / 5 + 32);

        const c2 = safeInt(rng, -10, 40);
        const f2 = Math.floor((c2 * 9) / 5 + 32);

        const promptText = i18nText(
            args,
            `${Q("m1_types_c_to_f_code")}.prompt`,
            `A weather station gives Celsius as an integer C.

Read ONE integer C.
Compute:
F = C * 9/5 + 32

Print ONLY F.`
        );

        const exStdin = `${c1}\n`;
        const exStdout = `${f1}\n`;

        return {
            archetype: "m1_types_c_to_f_code",
            exercise: {
                id,
                topic,
                difficulty: diff,
                kind: "code_input",
                title: tag(`${Q("m1_types_c_to_f_code")}.title`),
                prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`,
                language: "python",
                starterCode: String.raw`c = int(input())
# TODO
`,
                hint: tag(`${Q("m1_types_c_to_f_code")}.hint`),
            } satisfies CodeInputExercise,
            expected: makeCodeExpected({
                language: "python",
                tests: [
                    { stdin: `${c1}\n`, stdout: `${f1}\n`, match: "exact" },
                    { stdin: `${c2}\n`, stdout: `${f2}\n`, match: "exact" },
                ],
                solutionCode: `c = int(input())\nf = int(c * 9 / 5 + 32)\nprint(f)\n`,
            }),
        } ;
    },
};

export const M1_TYPES_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_TYPES_POOL as any,
    M1_TYPES_HANDLERS as any
);