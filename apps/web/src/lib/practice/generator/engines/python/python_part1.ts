// src/lib/practice/generator/engines/python/python_part1.ts
import type { TopicContext } from "../../generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
import { makeNoGenerator, parseTopicSlug } from "@/lib/practice/generator/engines/utils";

import { makeGenPythonStatementsPart1Mod0 } from "./python_part1_mod0/handlers";
import { makeGenPythonStatementsPart1Mod1 } from "./python_part1_mod1/handlers";
import { makeGenPythonStatementsPart1Mod2 } from "./python_part1_mod2/handlers";

// Base slugs (no prefix)
const MOD0_BASE = new Set<string>([
  "editor_workspace_overview",
  "syntax_intro",
  "programming_intro",
  "computer_intro",
  "comments_intro",
]);

const MOD1_BASE = new Set<string>([
  "variables_intro",
  "data_types_intro",
  "errors_intro",
  "operators_expressions",
  "string_basics",
  "input_output_patterns",
]);

const MOD2_BASE = new Set<string>([
  "conditionals_basics",
  "loops_basics",
  "lists_basics",
  "functions_basics",
]);

// Prefixes your app uses
const MOD0_PREFIX = "py0";
const MOD1_PREFIX = "py1";
const MOD2_PREFIX = "py2";

export function makeGenPythonStatementsPart1(
    ctx: TopicContext,
): SubjectModuleGenerator {
  const { raw, base, prefix } = parseTopicSlug(String(ctx.topicSlug ?? ""));

  // Prefer explicit prefix routing if present
  if (prefix === MOD0_PREFIX) return makeGenPythonStatementsPart1Mod0(ctx);
  if (prefix === MOD1_PREFIX) return makeGenPythonStatementsPart1Mod1(ctx);
  if (prefix === MOD2_PREFIX) return makeGenPythonStatementsPart1Mod2(ctx);

  // Fallback: route by base slug
  if (MOD0_BASE.has(base)) return makeGenPythonStatementsPart1Mod0(ctx);
  if (MOD1_BASE.has(base)) return makeGenPythonStatementsPart1Mod1(ctx);
  if (MOD2_BASE.has(base)) return makeGenPythonStatementsPart1Mod2(ctx);

  return makeNoGenerator("python_part1", raw);
}