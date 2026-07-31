import type { ReviewModule } from "@/lib/subjects/types";

const HIDDEN_SOLUTION_KEYS = new Set([
  "solutionCode",
  "solutionFiles",
]);

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_SOLUTION_KEYS.has(key)) continue;
    if (key === "allowReveal") {
      output[key] = false;
      continue;
    }
    output[key] = redactValue(child);
  }
  return output;
}

/**
 * The course renderer stays shared. Delivery policy only removes reveal payloads
 * before a private assigned course crosses the server/client boundary.
 */
export function redactReviewModuleSolutions(module: ReviewModule): ReviewModule {
  return redactValue(module) as ReviewModule;
}
