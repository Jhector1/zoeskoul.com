import {
    defineTopic,

    type Handler,type AnyHandler,
    type TopicBundle,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeCodeInputOut,
    pickDifferentName,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, pickName } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/string_basics/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M1_STRINGS_POOL = [
    { key: "m1_str_concat_vs_comma_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_str_fstring_placeholder_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_str_strip_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_str_lower_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_str_username_steps_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_str_concat_truths_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m1_str_indexing_first_char_mc", w: 1, kind: "multi_choice", purpose: "quiz" },

    { key: "m1_str_fstring_greeting_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m1_str_username_code", w: 1, kind: "code_input", purpose: "project" },
] as const;

export type M1StringsKey = (typeof M1_STRINGS_POOL)[number]["key"];
export const M1_STRINGS_VALID_KEYS = M1_STRINGS_POOL.map((p) => p.key) as M1StringsKey[];

function Q(key: M1StringsKey) {
    return `quiz.${key}`;
}

type OptId3 = "a" | "b" | "c";
type OptId4 = "a" | "b" | "c" | "d";

function buildOptions3(
    key: Extract<
        M1StringsKey,
        | "m1_str_concat_vs_comma_sc"
        | "m1_str_fstring_placeholder_sc"
        | "m1_str_strip_sc"
        | "m1_str_lower_sc"
    >,
) {
    return (["a", "b", "c"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function buildOptions4(
    key: Extract<
        M1StringsKey,
        | "m1_str_username_steps_mc"
        | "m1_str_concat_truths_mc"
        | "m1_str_indexing_first_char_mc"
    >,
) {
    return (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M1StringsKey,
        | "m1_str_concat_vs_comma_sc"
        | "m1_str_fstring_placeholder_sc"
        | "m1_str_strip_sc"
        | "m1_str_lower_sc"
    >,
    answerOptionId: OptId3,
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
        M1StringsKey,
        | "m1_str_username_steps_mc"
        | "m1_str_concat_truths_mc"
        | "m1_str_indexing_first_char_mc"
    >,
    answerOptionIds: OptId4[],
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

export const M1_STRINGS_HANDLERS = {
    m1_str_concat_vs_comma_sc: sc("m1_str_concat_vs_comma_sc", "b"),

    m1_str_fstring_placeholder_sc: sc("m1_str_fstring_placeholder_sc", "b"),
    m1_str_strip_sc: sc("m1_str_strip_sc", "a"),
    m1_str_lower_sc: sc("m1_str_lower_sc", "c"),

    m1_str_username_steps_mc: mc("m1_str_username_steps_mc", ["a", "c", "d"]),
    m1_str_concat_truths_mc: mc("m1_str_concat_truths_mc", ["a", "b"]),
    m1_str_indexing_first_char_mc: mc("m1_str_indexing_first_char_mc", ["b", "d"]),

    m1_str_fstring_greeting_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const name1 = pickName(rng);
        const name2 = pickDifferentName(rng, name1);

        const outputTemplate = i18nText(
            args,
            `${Q("m1_str_fstring_greeting_code")}.runtime.outputTemplate`,
            "Hello, {name}!",
        );

        const promptText = i18nText(
            args,
            `${Q("m1_str_fstring_greeting_code")}.prompt`,
            `Read ONE input (name).

Print EXACTLY:
Hello, <name>!`,
        );

        const exStdin = `${name1}\n`;
        const exStdout = `${fillTemplate(outputTemplate, { name: name1 })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${name1}\n`,
                    stdout: `${fillTemplate(outputTemplate, { name: name1 })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${name2}\n`,
                    stdout: `${fillTemplate(outputTemplate, { name: name2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode: `name = input()\n` + pyFStringPrint(outputTemplate),
        });

        return makeCodeInputOut({
            archetype: "m1_str_fstring_greeting_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_str_fstring_greeting_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_str_fstring_greeting_code")}.starterCode`),
            hint: tag(`${Q("m1_str_fstring_greeting_code")}.hint`),
            expected,
        });
    },

    m1_str_username_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const first1 = pickName(rng);
        const last1 = pickName(rng);
        const first2 = pickDifferentName(rng, first1);
        const last2 = pickDifferentName(rng, last1);

        const stdinFirst1 = `  ${first1.toUpperCase()}  `;
        const stdinLast1 = ` ${last1.toUpperCase()} `;
        const out1 = ((first1.trim()[0] ?? "") + last1.trim()).toLowerCase();

        const stdinFirst2 = ` ${first2} `;
        const stdinLast2 = `  ${last2}  `;
        const out2 = ((first2.trim()[0] ?? "") + last2.trim()).toLowerCase();

        const promptText = i18nText(
            args,
            `${Q("m1_str_username_code")}.prompt`,
            `Read TWO inputs (first, last).

Rules:
- strip spaces
- username = first letter of first + last
- lowercase
Print ONLY the username.`,
        );

        const exStdin = `${stdinFirst1}\n${stdinLast1}\n`;
        const exStdout = `${out1}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${stdinFirst1}\n${stdinLast1}\n`,
                    stdout: `${out1}\n`,
                    match: "exact",
                },
                {
                    stdin: `${stdinFirst2}\n${stdinLast2}\n`,
                    stdout: `${out2}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `first = input().strip()\n` +
                `last = input().strip()\n` +
                `username = (first[0] + last).lower()\n` +
                `print(username)\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_str_username_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_str_username_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_str_username_code")}.starterCode`),
            hint: tag(`${Q("m1_str_username_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M1StringsKey, AnyHandler>;

export const M1_STRINGS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_STRINGS_POOL,
    M1_STRINGS_HANDLERS,
);