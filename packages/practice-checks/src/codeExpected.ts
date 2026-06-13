import { z } from "zod";

import { ProgrammingExpectedSchema } from "./programming/schemas.js";
import { SqlExpectedSchema } from "./sql/schemas.js";

export const CodeExpectedSchema = z.union([
    ProgrammingExpectedSchema,
    SqlExpectedSchema,
]);

export type CodeExpected = z.infer<typeof CodeExpectedSchema>;
export type CodeExpectedInput = z.input<typeof CodeExpectedSchema>;

export function prepareCodeExpectedForSchema(expectedCanon: unknown): {
    expectedForSchema: unknown;
    sourceChecks: unknown[];
} {
    if (
        !expectedCanon ||
        typeof expectedCanon !== "object" ||
        Array.isArray(expectedCanon)
    ) {
        return { expectedForSchema: expectedCanon, sourceChecks: [] };
    }

    const raw = expectedCanon as Record<string, unknown>;
    const sourceChecks = Array.isArray(raw.sourceChecks)
        ? raw.sourceChecks.filter(Boolean)
        : [];
    const { sourceChecks: _sourceChecks, ...expectedWithoutSourceChecks } = raw;

    return {
        expectedForSchema: expectedWithoutSourceChecks,
        sourceChecks,
    };
}

export function parseCodeExpected(
    expectedCanon: unknown,
): z.SafeParseReturnType<unknown, CodeExpected> {
    const { expectedForSchema } = prepareCodeExpectedForSchema(expectedCanon);
    return CodeExpectedSchema.safeParse(expectedForSchema);
}
