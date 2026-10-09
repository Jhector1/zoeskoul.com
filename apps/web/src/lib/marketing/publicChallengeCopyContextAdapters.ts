import "server-only";

import type {
  PublicChallengeCopyAdapterState,
  PublicChallengeCopyContext,
  PublicChallengeCopyContextAdapter,
  PublicChallengeCopyContextEnrichment,
} from "./publicChallengeCopyContextTypes";
import { sqlPublicChallengeCopyContextAdapter } from "./publicChallengeCopyContextSql";

const adapters: readonly PublicChallengeCopyContextAdapter[] = [
  sqlPublicChallengeCopyContextAdapter,
];

function uniqueFacts(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeEnrichment(
  context: PublicChallengeCopyContext,
  enrichment: PublicChallengeCopyContextEnrichment,
): PublicChallengeCopyContext {
  return {
    ...context,
    environment: { ...context.environment, ...(enrichment.environment ?? {}) },
    resources: [...context.resources, ...(enrichment.resources ?? [])],
    requiredFacts: uniqueFacts([
      ...context.requiredFacts,
      ...(enrichment.requiredFacts ?? []),
    ]),
    technicalFallbackLead:
      enrichment.technicalFallbackLead === undefined
        ? context.technicalFallbackLead
        : enrichment.technicalFallbackLead,
  };
}

export async function enrichPublicChallengeCopyContext(
  state: PublicChallengeCopyAdapterState,
) {
  let context = state.context;

  for (const adapter of adapters) {
    const current = { ...state, context };
    if (!adapter.supports(current)) continue;
    context = mergeEnrichment(context, await adapter.enrich(current));
  }

  return context;
}
