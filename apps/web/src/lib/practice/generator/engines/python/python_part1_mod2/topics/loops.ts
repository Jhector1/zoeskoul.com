// src/lib/practice/generator/engines/python/python_part1_mod2/topics/loops_basics.ts
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
import { TOPIC_ID } from "@/lib/subjects/python/modules/module2/topics/loops_basics/meta";
import {
    i18nText,
    terminalFenceI18n,
    fillTemplate,
    tag,
} from "@/lib/practice/generator/shared/i18n";

export const M2_LOOPS_POOL = [
    { key: "m2_loop_guess_until_secret_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_loop_keep_asking_valid_code", w: 1, kind: "code_input", purpose: "project" },
    { key: "m2_loop_echo_until_quit_code", w: 1, kind: "code_input", purpose: "project" },

    { key: "m2_loop_while_meaning_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_loop_break_sc", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m2_loop_range_five_sc", w: 1, kind: "single_choice", purpose: "quiz" },

    { key: "m2_loop_continue_truths_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_loop_validation_pattern_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
    { key: "m2_loop_menu_loop_parts_mc", w: 1, kind: "multi_choice", purpose: "quiz" },
] as const;

export type M2LoopsKey = (typeof M2_LOOPS_POOL)[number]["key"];

function Q(key: M2LoopsKey) {
    return `quiz.${key}`;
}

type OptId3 = "a" | "b" | "c";
type OptId4 = "a" | "b" | "c" | "d";

function buildOptions3(
    key: Extract<
        M2LoopsKey,
        | "m2_loop_while_meaning_sc"
        | "m2_loop_break_sc"
        | "m2_loop_range_five_sc"
    >
) {
    return (["a", "b", "c"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function buildOptions4(
    key: Extract<
        M2LoopsKey,
        | "m2_loop_continue_truths_mc"
        | "m2_loop_validation_pattern_mc"
        | "m2_loop_menu_loop_parts_mc"
    >
) {
    return (["a", "b", "c", "d"] as const).map((id) => ({
        id,
        text: tag(`${Q(key)}.options.${id}`),
    }));
}

function sc(
    key: Extract<
        M2LoopsKey,
        | "m2_loop_while_meaning_sc"
        | "m2_loop_break_sc"
        | "m2_loop_range_five_sc"
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
        M2LoopsKey,
        | "m2_loop_continue_truths_mc"
        | "m2_loop_validation_pattern_mc"
        | "m2_loop_menu_loop_parts_mc"
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

export const M2_LOOPS_HANDLERS = {
    m2_loop_while_meaning_sc: sc("m2_loop_while_meaning_sc", "b"),
    m2_loop_break_sc: sc("m2_loop_break_sc", "a"),
    m2_loop_range_five_sc: sc("m2_loop_range_five_sc", "c"),

    m2_loop_continue_truths_mc: mc("m2_loop_continue_truths_mc", ["a", "c"]),
    m2_loop_validation_pattern_mc: mc("m2_loop_validation_pattern_mc", ["a", "b", "d"]),
    m2_loop_menu_loop_parts_mc: mc("m2_loop_menu_loop_parts_mc", ["a", "b", "c"]),

    m2_loop_guess_until_secret_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const wrong1 = safeInt(rng, 1, 9);
        const wrong2 = pickDifferentInt(rng, 1, 9, wrong1);
        const secret = 7;

        const successText = i18nText(
            args,
            `${Q("m2_loop_guess_until_secret_code")}.runtime.successText`,
            "You got it!"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_loop_guess_until_secret_code")}.prompt`,
            `The secret number is 7.

Read guesses until the guess equals 7.

When correct, print exactly:
You got it!`
        );

        const exStdin = `${wrong1}\n${secret}\n`;
        const exStdout = `${successText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                { stdin: `${wrong1}\n${secret}\n`, stdout: `${successText}\n`, match: "exact" },
                { stdin: `${wrong1}\n${wrong2}\n${secret}\n`, stdout: `${successText}\n`, match: "exact" },
            ],
            solutionCode:
                `guess = int(input())\n` +
                `while guess != 7:\n` +
                `    guess = int(input())\n` +
                `print(${JSON.stringify(successText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m2_loop_guess_until_secret_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_loop_guess_until_secret_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_loop_guess_until_secret_code")}.starterCode`),
            hint: tag(`${Q("m2_loop_guess_until_secret_code")}.hint`),
            expected,
        });
    },

    m2_loop_keep_asking_valid_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const bad1 = safeInt(rng, -10, 0);
        const bad2 = safeInt(rng, 11, 25);
        const good = safeInt(rng, 1, 10);
        const good2 = pickDifferentInt(rng, 1, 10, good);

        const okLineTemplate = i18nText(
            args,
            `${Q("m2_loop_keep_asking_valid_code")}.runtime.okLineTemplate`,
            "OK: {value}"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_loop_keep_asking_valid_code")}.prompt`,
            `Read integers until you get one in the range 1..10 inclusive.

When valid, print:
OK: <value>`
        );

        const exStdin = `${bad1}\n${bad2}\n${good}\n`;
        const exStdout = `${fillTemplate(okLineTemplate, { value: good })}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${bad1}\n${bad2}\n${good}\n`,
                    stdout: `${fillTemplate(okLineTemplate, { value: good })}\n`,
                    match: "exact",
                },
                {
                    stdin: `${bad2}\n${good2}\n`,
                    stdout: `${fillTemplate(okLineTemplate, { value: good2 })}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `n = int(input())\n` +
                `while n < 1 or n > 10:\n` +
                `    n = int(input())\n` +
                `value = n\n` +
                `print(f${JSON.stringify(okLineTemplate)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m2_loop_keep_asking_valid_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_loop_keep_asking_valid_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_loop_keep_asking_valid_code")}.starterCode`),
            hint: tag(`${Q("m2_loop_keep_asking_valid_code")}.hint`),
            expected,
        });
    },

    m2_loop_echo_until_quit_code: (args: HandlerArgs) => {
        const { rng, diff, id, topic } = args;

        const w1 = "hello";
        const w2 = "menu";
        const w3 = rng.pick(["status", "help", "snack"] as const);
        const q = "quit";

        const echoTemplate = i18nText(
            args,
            `${Q("m2_loop_echo_until_quit_code")}.runtime.echoTemplate`,
            "You typed: {command}"
        );
        const byeText = i18nText(
            args,
            `${Q("m2_loop_echo_until_quit_code")}.runtime.byeText`,
            "Bye!"
        );
        const promptText = i18nText(
            args,
            `${Q("m2_loop_echo_until_quit_code")}.prompt`,
            `Read command lines until you read quit.

For each non-quit command, print:
You typed: <command>

When you read quit, print:
Bye!`
        );

        const exStdin = `${w1}\n${w2}\n${q}\n`;
        const exStdout =
            `${fillTemplate(echoTemplate, { command: w1 })}\n` +
            `${fillTemplate(echoTemplate, { command: w2 })}\n` +
            `${byeText}\n`;

        const expected = makeCodeExpected({
            language: "python",
            tests: [
                {
                    stdin: `${w1}\n${w2}\n${q}\n`,
                    stdout:
                        `${fillTemplate(echoTemplate, { command: w1 })}\n` +
                        `${fillTemplate(echoTemplate, { command: w2 })}\n` +
                        `${byeText}\n`,
                    match: "exact",
                },
                {
                    stdin: `${w3}\n${q}\n`,
                    stdout:
                        `${fillTemplate(echoTemplate, { command: w3 })}\n` +
                        `${byeText}\n`,
                    match: "exact",
                },
            ],
            solutionCode:
                `cmd = input().strip()\n` +
                `while cmd != "quit":\n` +
                `    command = cmd\n` +
                `    print(f${JSON.stringify(echoTemplate)})\n` +
                `    cmd = input().strip()\n` +
                `print(${JSON.stringify(byeText)})\n`,
        });

        return makeCodeInputOut({
            archetype: "m2_loop_echo_until_quit_code",
            id,
            topic,
            diff,
            title: tag(`${Q("m2_loop_echo_until_quit_code")}.title`),
            prompt: `${promptText}\n\n${terminalFenceI18n(args, exStdin, exStdout)}`.trim(),
            language: "python",
            starterCode: tag(`${Q("m2_loop_echo_until_quit_code")}.starterCode`),
            hint: tag(`${Q("m2_loop_echo_until_quit_code")}.hint`),
            expected,
        });
    },
} satisfies Record<M2LoopsKey, AnyHandler>;

export const M2_LOOPS_GENERATOR_TOPIC: TopicBundle = defineTopic(
    TOPIC_ID,
    M2_LOOPS_POOL,
    M2_LOOPS_HANDLERS
);