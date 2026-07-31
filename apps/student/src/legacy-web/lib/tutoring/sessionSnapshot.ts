import "server-only";

import type { ReviewModule, ReviewModuleSection, ReviewTopicShape } from "@/lib/subjects/types";
import {
  getResolvedReviewModule,
  getResolvedReviewModuleRows,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import {
  TUTORING_DOCUMENT_LIMITS,
  boardDocumentKey,
  isValidBoardCardKey,
  utf8Bytes,
} from "./sessionDocumentPolicy";

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

export function parseTutoringSnapshot(value: unknown): TutoringSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TutoringSnapshot>;
  if (
    candidate.version !== 1 ||
    typeof candidate.subjectSlug !== "string" ||
    typeof candidate.sourceUpdatedAt !== "string" ||
    !Array.isArray(candidate.modules) ||
    candidate.modules.length === 0 ||
    candidate.modules.length > TUTORING_DOCUMENT_LIMITS.maxSnapshotModules
  ) {
    return null;
  }

  const seen = new Set<string>();
  for (const entry of candidate.modules) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.sourceModuleSlug !== "string" ||
      typeof entry.sessionModuleSlug !== "string" ||
      !entry.sessionModuleSlug ||
      entry.sessionModuleSlug.length > TUTORING_DOCUMENT_LIMITS.maxKeyLength ||
      !entry.module ||
      typeof entry.module !== "object" ||
      typeof entry.module.id !== "string" ||
      entry.module.id !== entry.sessionModuleSlug ||
      typeof entry.module.title !== "string" ||
      !Array.isArray(entry.module.topics) ||
      seen.has(entry.sessionModuleSlug)
    ) {
      return null;
    }
    seen.add(entry.sessionModuleSlug);
  }

  return candidate as TutoringSnapshot;
}

export function serializeTutoringSnapshot(snapshot: TutoringSnapshot) {
  const serialized = JSON.stringify(snapshot);
  const snapshotBytes = utf8Bytes(serialized);
  if (snapshotBytes > TUTORING_DOCUMENT_LIMITS.maxSnapshotBytes) {
    throw new Error(
      `Tutoring snapshot exceeds the ${TUTORING_DOCUMENT_LIMITS.maxSnapshotBytes} byte limit.`,
    );
  }
  const moduleKeys = snapshot.modules.map((item) => item.sessionModuleSlug);
  if (
    moduleKeys.some(
      (key) => !key || key.length > TUTORING_DOCUMENT_LIMITS.maxKeyLength,
    )
  ) {
    throw new Error("Tutoring snapshot contains an invalid module key.");
  }

  const boardKeys = snapshot.modules.flatMap((item) =>
    item.module.topics.flatMap((topic) => {
      const cardKeys = [
        `card:${topic.id}:general`,
        ...topic.cards.map((card) => `card:${topic.id}:${card.id}`),
      ];
      if (cardKeys.some((key) => !isValidBoardCardKey(key))) {
        throw new Error("Tutoring snapshot contains an invalid board scope.");
      }
      return cardKeys.map((key) => boardDocumentKey(item.sessionModuleSlug, key));
    }),
  );
  if (boardKeys.length > TUTORING_DOCUMENT_LIMITS.maxBoardKeys) {
    throw new Error(
      `Tutoring snapshots support at most ${TUTORING_DOCUMENT_LIMITS.maxBoardKeys} board scopes.`,
    );
  }
  return {
    serialized,
    snapshotBytes,
    moduleKeys,
    boardKeys: [...new Set(boardKeys)],
  };
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
  if (selectedRows.length > TUTORING_DOCUMENT_LIMITS.maxSnapshotModules) {
    throw new Error(
      `Tutoring sessions support at most ${TUTORING_DOCUMENT_LIMITS.maxSnapshotModules} modules.`,
    );
  }

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
