import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    makeCodeInputOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import { makeCodeExpected, safeInt } from "../../_shared";
import { TOPIC_ID } from "@/lib/subjects/python/modules/module1/topics/errors_intro/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
    pyFStringPrint,
} from "@/lib/practice/generator/shared/i18n";

export const M1_ERRORS_POOL = [
    { key: "m1_types_errors_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_err_nameerror_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_err_typeerror_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_err_valueerror_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m1_err_debug_combo_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m1_err_fix_type_mismatch_code", w: 1, kind: "code_input", purpose: "quiz" },
    { key: "m1_err_parse_age_safely_code", w: 1, kind: "code_input", purpose: "quiz" },
] as const;

export type M1ErrorsKey = (typeof M1_ERRORS_POOL)[number]["key"];

function Q(key: M1ErrorsKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";

function buildOptions(key: M1ErrorsKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M1ErrorsKey,
        | "m1_types_errors_sc"
        | "m1_err_nameerror_sc"
        | "m1_err_typeerror_sc"
        | "m1_err_valueerror_sc"
        | "m1_err_debug_combo_sc"
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

export const M1_ERRORS_HANDLERS = {
    m1_types_errors_sc: sc("m1_types_errors_sc", "b"),
    m1_err_nameerror_sc: sc("m1_err_nameerror_sc", "a"),
    m1_err_typeerror_sc: sc("m1_err_typeerror_sc", "b"),
    m1_err_valueerror_sc: sc("m1_err_valueerror_sc", "c"),
    m1_err_debug_combo_sc: sc("m1_err_debug_combo_sc", "a"),

    m1_err_fix_type_mismatch_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const a1 = safeInt(rng, 1, 50);
        const b1 = safeInt(rng, 1, 50);
        const a2 = safeInt(rng, 1, 50);
        const b2 = safeInt(rng, 1, 50);

        const promptText = i18nText(
            args,
            `${Q("m1_err_fix_type_mismatch_code")}.prompt`,
            `Read TWO inputs.

They come in as text, so convert them to integers and print ONLY their sum.`
        );

        const exStdin = `${a1}\n${b1}\n`;
        const exStdout = `${a1 + b1}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${a1}\n${b1}\n`, stdout: `${a1 + b1}\n`, match: "exact" },
                { stdin: `${a2}\n${b2}\n`, stdout: `${a2 + b2}\n`, match: "exact" },
            ],
            solutionCode: `a = int(input())\nb = int(input())\nprint(a + b)\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_err_fix_type_mismatch_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_err_fix_type_mismatch_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_err_fix_type_mismatch_code")}.starterCode`),
            hint: tag(`${Q("m1_err_fix_type_mismatch_code")}.hint`),
            expected,
        });
    },

    m1_err_parse_age_safely_code: (args: HandlerArgs) => {
        const { diff, id, topic } = args;

        const nextYearTemplate = i18nText(
            args,
            `${Q("m1_err_parse_age_safely_code")}.runtime.nextYearTemplate`,
            "Next year = {age_next}"
        );
        const invalidAgeText = i18nText(
            args,
            `${Q("m1_err_parse_age_safely_code")}.invalidAgeText`,
            "Invalid age"
        );
        const promptText = i18nText(
            args,
            `${Q("m1_err_parse_age_safely_code")}.prompt`,
            `Read ONE input called age text.

If it contains only digits:
- convert it to an integer
- print: Next year = <age+1>

Otherwise print:
Invalid age`
        );

        const ex1In = `16\n`;
        const ex1Out = `${fillTemplate(nextYearTemplate, { age_next: 17 })}\n`;
        const ex2In = `twelve\n`;
        const ex2Out = `${invalidAgeText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: ex1In, stdout: ex1Out, match: "exact" },
                { stdin: ex2In, stdout: ex2Out, match: "exact" },
            ],
            solutionCode:
                `text = input().strip()\n` +
                `if text.isdigit():\n` +
                `    age = int(text)\n` +
                `    age_next = age + 1\n` +
                `    ${pyFStringPrint(nextYearTemplate).trimEnd()}\n` +
                `else:\n` +
                `    print(${JSON.stringify(invalidAgeText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m1_err_parse_age_safely_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m1_err_parse_age_safely_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, ex1In, ex1Out)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m1_err_parse_age_safely_code")}.starterCode`),
            hint: tag(`${Q("m1_err_parse_age_safely_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M1ErrorsKey, AnyHandler>;

export const M1_ERRORS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M1_ERRORS_POOL,
    M1_ERRORS_HANDLERS
);