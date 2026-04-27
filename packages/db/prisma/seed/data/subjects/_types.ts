import { z } from "zod";
import { PracticeKind } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type SubjectSlug = string;
export type ModuleSlug = string;
export type SectionSlug = string;
export type TopicSlug = string;
export type GenKey = string;

export type SubjectStatus = "active" | "coming_soon" | "disabled";

export type SeedJson = Prisma.InputJsonValue;
export type SeedJsonObject = Prisma.InputJsonObject;

export const ModuleMetaSchema = z.object({
  outcomes: z.array(z.string().min(1)).optional(),
  why: z.array(z.string().min(1)).optional(),
  prereqs: z.array(z.string().min(1)).optional(),
  videoUrl: z.string().url().nullable().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});

export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;

export type TopicPoolItem = {
  key: string;
  w: number;
  kind?: PracticeKind;
};

export type TopicMeta = {
  label: string;
  minutes: number;
  preferKind?: PracticeKind | null;
  pool?: TopicPoolItem[];
};

export type SubjectSeed = {
  slug: SubjectSlug;
  order: number;
  title: string;
  description?: string | null;
  imagePublicId?: string | null;
  imageAlt?: string | null;
  meta?: SeedJsonObject | null;

  accessPolicy?: "free" | "paid";
  status?: SubjectStatus;
  entitlementKey?: string | null;
};

export type ModuleSeed = {
  slug: ModuleSlug;
  subjectSlug: SubjectSlug;
  order: number;
  title: string;
  description?: string | null;
  weekStart?: number | null;
  weekEnd?: number | null;
  meta?: ModuleMeta;

  accessOverride?: "inherit" | "free" | "paid";
  entitlementKey?: string | null;
};

export type TopicSeed = {
  slug: TopicSlug;
  subjectSlug: SubjectSlug;
  moduleSlug: ModuleSlug;
  order: number;
  titleKey: string;
  description?: string | null;
  genKey: GenKey;
  variant: string | null;
  meta?: TopicMeta;
};

export type SectionSeed = {
  slug: SectionSlug;
  subjectSlug: SubjectSlug;
  moduleSlug: ModuleSlug;
  order: number;
  title: string;
  description?: string | null;
  meta?: SeedJsonObject | null;
  topicSlugs: TopicSlug[];
};

export type TopicDef = {
  id: string;
  order?: number;
  variant?: string | null;
  titleKey?: string;
  description?: string | null;
  meta: TopicMeta;
};

export type SectionDef = {
  moduleSlug: ModuleSlug;
  prefix: string;
  genKey: GenKey;
  topics: TopicDef[];

  section: {
    slug: SectionSlug;
    order: number;
    title: string;
    description?: string | null;
    meta?: SeedJsonObject | null;
  };
};

export type PoolItem = {
  key: string;
  w: number;
};

export type TopicDefCompat = Omit<TopicDef, "meta"> & {
  meta: TopicMeta;
};