import type {
  ManifestCard,
  ManifestExercise,
  ManifestRuntimeDefaults,
  ManifestSketch,
} from "./manifest.js";
import type { ManifestIdeServiceConfig } from "./ide-services.js";

export type SubjectManifest = {
  subject: {
    slug: string;
    catalogSlug?: string | null;
    genKey: string;
    order: number;
    accessPolicy?: "free" | "paid";
    status?: "active" | "coming_soon" | "disabled";
    imagePublicId?: string | null;
    imageAlt?: string | null;
    titleKey: string;
    descriptionKey?: string | null;
    serviceDefaults?: ManifestIdeServiceConfig | null;
    meta?: {
      curriculum?: {
        plannedModuleCount?: number;
        isTerminalRelease?: boolean;
        moreComingMessageKey?: string;
      };
      completionPolicy?: {
        requireAllPublishedModules?: boolean;
        rewardEnabledByDefault?: boolean;
        certificateEnabledByDefault?: boolean;
      };
    };
  };
  modules: SubjectModuleManifest[];
};

export type SubjectModuleManifest = {
  slug: string;
  prefix: string;
  order: number;
  titleKey: string;
  descriptionKey?: string | null;
  weekStart?: number | null;
  weekEnd?: number | null;
  accessOverride?: "free" | "paid" | null;
  serviceDefaults?: ManifestIdeServiceConfig | null;
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  meta?: {
    estimatedMinutes?: number;
    prereqKeys?: string[];
    outcomeKeys?: string[];
    whyKeys?: string[];
  };
  sections: SubjectSectionManifest[];
};

export type SubjectSectionManifest = {
  slug: string;
  order: number;
  titleKey: string;
  descriptionKey?: string | null;
  serviceDefaults?: ManifestIdeServiceConfig | null;
  meta?: {
    module?: number;
    weeksKey?: string;
    bulletKeys?: string[];
  };
  topics: string[];
};

export type ResolvedSubjectCatalogItem = {
  slug: string;
  title: string;
  description: string;
  imagePublicId: string | null;
  imageAlt: string | null;
  defaultModuleSlug: string | null;
};

export type ResolvedSubjectCatalogMap = Record<string, ResolvedSubjectCatalogItem>;

export type ResolvedModuleIntroView = {
  subject: {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
  };
  module: {
    slug: string;
    title: string;
    description: string;
    order: number;
    weekStart: number | null;
    weekEnd: number | null;
    meta: {
      estimatedMinutes: number | null;
      prereqs: string[];
      outcomes: string[];
      why: string[];
    };
  };
};

export type ResolvedSubjectModule = {
  slug: string;
  title: string;
  description: string;
  order: number;
  weekStart: number | null;
  weekEnd: number | null;
};

export type ResolvedSubjectModulesView = {
  subject: {
    slug: string;
    title: string;
    description: string;
  };
  modules: ResolvedSubjectModule[];
};

export type SlimTopicManifest = {
  topicId: string;
  minutes: number;
  topic: {
    labelKey: string;
    summaryKey: string;
  };
  serviceDefaults?: ManifestIdeServiceConfig | null;
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  cards: ManifestCard[];
  sketches: ManifestSketch[];
  exercises: ManifestExercise[];
};

export type FullTopicManifest = SlimTopicManifest & {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
};

export type TopicManifestRefMap = Record<string, SlimTopicManifest>;
