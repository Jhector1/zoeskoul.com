import "server-only";
import type { ReviewModule, ReviewModuleSection, ReviewTopicShape } from "@/lib/subjects/types";
import {
  getResolvedReviewModule,
  getResolvedReviewModuleRows,
} from "@/lib/subjects/server/resolveSubjectPresentation";

export type TutoringSelection = {
  scope: "course" | "module" | "section" | "topic";
  moduleSlug?: string | null;
  sectionSlug?: string | null;
  topicId?: string | null;
};

export type TutoringSnapshot = {
  version: 1;
  subjectSlug: string;
  sourceUpdatedAt: string;
  modules: Array<{
    sourceModuleSlug: string;
    sessionModuleSlug: string;
    module: ReviewModule;
  }>;
};

function filterModule(
  source: ReviewModule,
  selection: TutoringSelection,
): ReviewModule | null {
  if (selection.scope === "course" || selection.scope === "module") return source;

  let topics = source.topics;
  let sections = source.sections ?? [];

  if (selection.scope === "section") {
    const wanted = sections.find(
      (section) =>
        section.slug === selection.sectionSlug || section.id === selection.sectionSlug,
    );
    if (!wanted) return null;
    const topicIds = new Set(wanted.topics.map((topic) => topic.id));
    topics = topics.filter((topic) => topicIds.has(topic.id));
    sections = [{ ...wanted, topics }];
  }

  if (selection.scope === "topic") {
    const topic = topics.find((item) => item.id === selection.topicId);
    if (!topic) return null;
    topics = [topic] as ReviewTopicShape[];
    sections = sections
      .map((section) =>
        section.topics.some((item) => item.id === topic.id)
          ? { ...section, topics: [topic] }
          : null,
      )
      .filter((section): section is ReviewModuleSection => section !== null);
  }

  if (!topics.length) return null;
  return { ...source, topics, sections };
}

export async function buildTutoringSnapshot(args: {
  sessionId: string;
  subjectSlug: string;
  selection: TutoringSelection;
}): Promise<TutoringSnapshot> {
  const rows = await getResolvedReviewModuleRows(args.subjectSlug);
  if (!rows?.length) throw new Error("The selected course has no published modules.");

  const selectedRows =
    args.selection.scope === "course"
      ? rows
      : rows.filter((row) => row.slug === args.selection.moduleSlug);

  if (!selectedRows.length) throw new Error("The selected module was not found.");

  const modules = [];
  for (const row of selectedRows) {
    const resolved = await getResolvedReviewModule(args.subjectSlug, row.slug);
    if (!resolved) continue;
    const filtered = filterModule(resolved, args.selection);
    if (!filtered) continue;
    const sessionModuleSlug = `tutoring-${args.sessionId}-${row.slug}`;
    modules.push({
      sourceModuleSlug: row.slug,
      sessionModuleSlug,
      module: {
        ...filtered,
        id: sessionModuleSlug,
        contentVersion: null,
      },
    });
  }

  if (!modules.length) {
    throw new Error("The selected section or topic was not found in the published course.");
  }

  return {
    version: 1,
    subjectSlug: args.subjectSlug,
    sourceUpdatedAt: new Date().toISOString(),
    modules,
  };
}
