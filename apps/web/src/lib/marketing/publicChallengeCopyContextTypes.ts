export type PublicChallengeCopyResource = {
  kind: string;
  name: string;
  data: unknown;
};

export type PublicChallengeStoryFrame = {
  id: string;
  guidance: string;
  fallbackLead: string;
};

export type PublicChallengeCopyContext = {
  locale: string;
  language: string | null;
  runtimeKind: string | null;
  coursePath: {
    catalog: string;
    subject: string;
    module: string;
    section: string;
    topic: string;
  };
  exercise: {
    key: string;
    kind: string;
    purpose: string;
    originalTitle: string;
    originalPrompt: string;
  };
  starterCode: string | null;
  privateSolutionContext: string | null;
  validation: unknown;
  semanticChecks: unknown;
  tests: unknown;
  manifestContext: {
    runtime: unknown;
    workspace: unknown;
    recipe: unknown;
  };
  environment: Record<string, unknown>;
  resources: PublicChallengeCopyResource[];
  requiredFacts: string[];
  technicalFallbackLead: string | null;
  storyFrame: PublicChallengeStoryFrame;
};

export type PublicChallengeCopyAdapterState = {
  context: PublicChallengeCopyContext;
  records: {
    exercise: Record<string, unknown>;
    runtime: Record<string, unknown> | null;
    workspace: Record<string, unknown> | null;
    recipe: Record<string, unknown> | null;
    runtimeDefaults: Record<string, unknown> | null;
  };
};

export type PublicChallengeCopyContextEnrichment = {
  environment?: Record<string, unknown>;
  resources?: PublicChallengeCopyResource[];
  requiredFacts?: string[];
  technicalFallbackLead?: string | null;
};

export type PublicChallengeCopyContextAdapter = {
  id: string;
  supports: (state: PublicChallengeCopyAdapterState) => boolean;
  enrich: (
    state: PublicChallengeCopyAdapterState,
  ) => PublicChallengeCopyContextEnrichment | Promise<PublicChallengeCopyContextEnrichment>;
};
