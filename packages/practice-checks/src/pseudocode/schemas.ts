import { z } from "zod";
import {
    PSEUDOCODE_MODES,
    PSEUDOCODE_OPERATIONS,
    PSEUDOCODE_STRUCTURES,
    type PseudocodeExpected,
} from "./types.js";

const PseudocodeRuleSchema = z.discriminatedUnion("kind", [
    z.object({
        id: z.string().min(1),
        kind: z.literal("structure"),
        structure: z.enum(PSEUDOCODE_STRUCTURES),
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional(),
        message: z.string().min(1).optional(),
    }),
    z.object({
        id: z.string().min(1),
        kind: z.literal("operation"),
        operation: z.enum(PSEUDOCODE_OPERATIONS),
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional(),
        message: z.string().min(1).optional(),
    }),
    z.object({
        id: z.string().min(1),
        kind: z.literal("pattern"),
        pattern: z.string().min(1),
        flags: z.string().optional(),
        min: z.number().int().min(1).optional(),
        message: z.string().min(1).optional(),
    }),
    z.object({
        id: z.string().min(1),
        kind: z.literal("forbidden_pattern"),
        pattern: z.string().min(1),
        flags: z.string().optional(),
        message: z.string().min(1).optional(),
    }),
    z.object({
        id: z.string().min(1),
        kind: z.literal("ordered_operations"),
        operations: z.array(z.enum(PSEUDOCODE_OPERATIONS)).min(2),
        message: z.string().min(1).optional(),
    }),
]);

export const PseudocodeExpectedSchema = z
    .object({
        kind: z.literal("pseudocode_input"),
        dialect: z.literal("zoeskoul-v1").default("zoeskoul-v1"),
        mode: z.enum(PSEUDOCODE_MODES),
        strategy: z.enum([
            "required_structure",
            "semantic_rules",
            "trace_output",
            "hybrid",
        ]),
        solution: z.string().min(1),
        rules: z.array(PseudocodeRuleSchema).default([]),
        scenarios: z
            .array(
                z.object({
                    id: z.string().min(1),
                    expectedLines: z.array(z.string().min(1)).min(1),
                    match: z.enum(["exact", "contains"]).optional(),
                    message: z.string().min(1).optional(),
                }),
            )
            .optional(),
        ignoreFormatting: z.boolean().optional().default(true),
        allowEquivalentNames: z.boolean().optional().default(true),
    })
    .superRefine((value, ctx) => {
        if (
            (value.strategy === "required_structure" ||
                value.strategy === "semantic_rules" ||
                value.strategy === "hybrid") &&
            value.rules.length < 1
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["rules"],
                message: `${value.strategy} pseudocode validation requires at least one deterministic rule.`,
            });
        }

        if (
            (value.strategy === "trace_output" || value.strategy === "hybrid") &&
            value.mode === "trace" &&
            (!value.scenarios || value.scenarios.length < 1)
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["scenarios"],
                message: "trace pseudocode validation requires scenarios[].",
            });
        }

        const ids = [
            ...value.rules.map((rule) => rule.id),
            ...(value.scenarios ?? []).map((scenario) => scenario.id),
        ];
        if (new Set(ids).size !== ids.length) {
            ctx.addIssue({
                code: "custom",
                path: ["rules"],
                message: "pseudocode validation rule/scenario ids must be unique.",
            });
        }
    }) as z.ZodType<PseudocodeExpected>;
