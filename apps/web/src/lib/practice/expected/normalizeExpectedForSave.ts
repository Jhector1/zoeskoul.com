import { PracticeKind } from "@zoeskoul/db";
import { normalizeCodeExpectedForSave } from "./codeExpected";

function toNumberGrid(x: any): number[][] | null {
    if (!x) return null;

    if (typeof x?.toArray === "function") x = x.toArray();
    if (x && Array.isArray(x.data) && Array.isArray(x.data[0])) x = x.data;

    if (!Array.isArray(x) || !Array.isArray(x[0])) return null;

    const grid = x.map((row: any[]) => row.map((v: any) => Number(v)));

    if (!grid.length || !grid[0].length) return null;
    if (grid.some((r) => r.length !== grid[0].length)) return null;
    if (grid.some((r) => r.some((v) => !Number.isFinite(v)))) return null;

    return grid;
}

type ExpectedNormalizer = (expected: any) => any;

function normalizeDragReorderExpected(expected: any) {
    const orderRaw =
        expected?.order ??
        expected?.tokenIds ??
        expected?.ids ??
        expected?.correct ??
        null;

    const order =
        Array.isArray(orderRaw) ? orderRaw.map((x: any) => String(x?.id ?? x)) : [];

    if (!order.length) {
        throw new Error(
            `Generator bug: drag_reorder expected missing order/tokenIds. expected=${JSON.stringify(
                expected,
                null,
                2,
            )}`,
        );
    }

    return {
        ...(expected ?? {}),
        kind: "drag_reorder",
        order,
    };
}

function normalizeMatrixInputExpected(expected: any) {
    const raw =
        expected?.values ??
        expected?.value ??
        expected?.matrix ??
        expected?.A ??
        expected?.grid;

    const grid = toNumberGrid(raw);

    if (!grid) {
        throw new Error(
            `Generator bug: matrix_input expected is missing 2D values. expected=${JSON.stringify(
                expected,
                null,
                2,
            )}`,
        );
    }

    return {
        ...(expected ?? {}),
        kind: "matrix_input",
        values: grid,
    };
}

function normalizeTextualAnswerExpected(kind: PracticeKind, expected: any) {
    const match = expected?.match === "includes" ? "includes" : "exact";

    const rawAnswers = Array.isArray(expected?.answers)
        ? expected.answers
        : Array.isArray(expected?.acceptable)
            ? expected.acceptable
            : typeof expected?.value === "string"
                ? [expected.value]
                : typeof expected?.correct === "string"
                    ? [expected.correct]
                    : null;

    const answers: string[] = [];

    for (const x of rawAnswers ?? []) {
        const s = String(x ?? "").trim();
        if (!s) continue;
        if (answers.some((a) => a.toLowerCase() === s.toLowerCase())) continue;
        answers.push(s);
        if (answers.length >= 12) break;
    }

    if (!answers.length) {
        throw new Error(
            `Generator bug: ${String(kind)} expected missing answers/value. expected=${JSON.stringify(
                expected,
                null,
                2,
            )}`,
        );
    }

    return {
        ...(expected ?? {}),
        kind: String(kind),
        answers,
        match,
        value: typeof expected?.value === "string" ? expected.value : answers[0],
    };
}

const EXPECTED_NORMALIZERS: Partial<Record<PracticeKind, ExpectedNormalizer>> = {
    [PracticeKind.drag_reorder]: normalizeDragReorderExpected,
    [PracticeKind.matrix_input]: normalizeMatrixInputExpected,
    [PracticeKind.code_input]: normalizeCodeExpectedForSave,
    [PracticeKind.text_input]: (expected) =>
        normalizeTextualAnswerExpected(PracticeKind.text_input, expected),
    [PracticeKind.word_bank_arrange]: (expected) =>
        normalizeTextualAnswerExpected(PracticeKind.word_bank_arrange, expected),
    [PracticeKind.listen_build]: (expected) =>
        normalizeTextualAnswerExpected(PracticeKind.listen_build, expected),
    [PracticeKind.fill_blank_choice]: (expected) =>
        normalizeTextualAnswerExpected(PracticeKind.fill_blank_choice, expected),
};

export function normalizeExpectedForSave(kind: PracticeKind, expected: any) {
    const normalizer = EXPECTED_NORMALIZERS[kind];
    return normalizer ? normalizer(expected) : expected;
}

export { EXPECTED_NORMALIZERS };
