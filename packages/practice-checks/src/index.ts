import { z } from "zod";

import { ProgrammingExpectedSchema } from "./programming/schemas";
import { SqlExpectedSchema } from "./sql/schemas";

export * from "./programming/types";
export * from "./programming/schemas";
export * from "./programming/stdout";
export * from "./programming/normalize";
export * from "./programming/semantic/pythonHarness";

export * from "./sql/types";
export * from "./sql/schemas";
export * from "./sql/normalize";

export const CodeExpectedSchema = z.union([
    ProgrammingExpectedSchema,
    SqlExpectedSchema,
]);

export type CodeExpected = z.infer<typeof CodeExpectedSchema>;
export type CodeExpectedInput = z.input<typeof CodeExpectedSchema>;
