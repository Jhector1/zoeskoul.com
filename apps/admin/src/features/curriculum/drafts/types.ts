export type DraftDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
  exerciseId?: string;
};

export type DraftTopicSummary = {
  catalog: string;
  subject: string;
  moduleDir: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicDir: string;
  topicSlug: string;
  topicId?: string | null;
  title?: string | null;
  bundlePath: string;
  messagesPath?: string | null;
};

export type DraftModuleSummary = {
  moduleDir: string;
  moduleSlug: string;
  topics: DraftTopicSummary[];
};

export type DraftSubjectSummary = {
  subject: string;
  modules: DraftModuleSummary[];
};

export type DraftCatalogSummary = {
  catalog: string;
  subjects: DraftSubjectSummary[];
};

export type DraftRootCandidate = {
  path: string;
  source: string;
  exists: boolean;
};

export type DraftListDebug = {
  cwd: string;
  repoRoot: string;
  draftRoot: string;
  candidates: DraftRootCandidate[];
  warnings: string[];
};

export type ExerciseSummary = {
  id: string;
  kind: string;
  purpose?: string | null;
  referencedBy: string[];
  starterFileCount: number;
  solutionFileCount: number;
  checkCount: number;
  diagnostics: DraftDiagnostic[];
};

export type FilePairSummary = {
  exerciseId: string;
  path: string;
  language?: string | null;
  starterContent?: string | null;
  solutionContent?: string | null;
  starterMessageKey?: string | null;
  solutionMessageKey?: string | null;
};

export type ProjectFlowStep = {
  cardId: string;
  index: number;
  stepId: string;
  exerciseKey?: string | null;
  carryFromPrev: boolean;
  matchesPreviousSolution: boolean | null;
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
};

export type LoadedTopic = {
  catalog: string;
  subject: string;
  module: string;
  topic: string;
  locale: string;
  moduleDir: string;
  topicDir: string;
  paths: {
    bundle: string;
    messages: string;
  };
  bundleJson: unknown;
  messagesJson: unknown | null;
  diagnostics: DraftDiagnostic[];
  exercises: ExerciseSummary[];
  filePairs: FilePairSummary[];
  projectFlow: ProjectFlowStep[];
  resolvedReferences: Record<string, string>;
};
