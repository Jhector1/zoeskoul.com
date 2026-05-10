import { z } from "zod";

import { ProgrammingExpectedSchema } from "./programming/schemas.js";
import { SqlExpectedSchema } from "./sql/schemas.js";

export * from "./programming/types.js";
export * from "./programming/schemas.js";
export * from "./programming/stdout.js";
export * from "./programming/normalize.js";
export * from "./programming/semantic/pythonHarness.js";

export * from "./sql/types.js";
export * from "./sql/schemas.js";
export * from "./sql/normalize.js";

export const CodeExpectedSchema = z.union([
    ProgrammingExpectedSchema,
    SqlExpectedSchema,
]);

export type CodeExpected = z.infer<typeof CodeExpectedSchema>;
export type CodeExpectedInput = z.input<typeof CodeExpectedSchema>;
