import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { loadTutoringParticipants } from "./sessionParticipants";
import {
  TUTORING_PROGRESS_TOOL_ID,
  getTutoringWorkspaceMeta,
  tutoringReferenceOwnerKey,
} from "./sessionWorkspace";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(body: string | null | undefined): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function fileMapFromProgress(value: unknown) {
  const files = new Map<string, string>();
  const seen = new WeakSet<object>();

  function visit(node: unknown, path: string) {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (
      isRecord(node) &&
      node.version === 2 &&
      Array.isArray(node.nodes)
    ) {
      for (const entry of node.nodes) {
        if (!isRecord(entry) || entry.kind !== "file") continue;
        const name = String(entry.path ?? entry.name ?? entry.id ?? "file");
        const content = typeof entry.content === "string" ? entry.content : "";
        files.set(`${path}:${name}`, content);
      }
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "root");
  return files;
}

function summarizeProgress(value: unknown) {
  let completedTopics = 0;
  let quizAnswered = 0;
  let quizCorrect = 0;
  let exercisesCompleted = 0;
  let projectsCompleted = 0;
  const seen = new WeakSet<object>();

  function visit(node: unknown, keyHint = "") {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, keyHint));
      return;
    }

    const record = node as Record<string, unknown>;
    if (record.completed === true && keyHint.includes("topic")) completedTopics += 1;
    if (
      record.submitted === true ||
      record.answered === true ||
      (Array.isArray(record.answers) && record.answers.length > 0) ||
      record.selectedAnswer != null
    ) {
      quizAnswered += 1;
      if (record.correct === true || Number(record.score ?? 0) >= 1) quizCorrect += 1;
    }
    if (
      record.status === "completed" ||
      record.status === "correct" ||
      record.passed === true
    ) {
      if (keyHint.includes("project")) projectsCompleted += 1;
      else if (keyHint.includes("exercise") || keyHint.includes("practice")) {
        exercisesCompleted += 1;
      }
    }

    for (const [key, child] of Object.entries(record)) {
      visit(child, `${keyHint}.${key}`.toLowerCase());
    }
  }

  visit(value);
  return {
    completedTopics,
    quizAnswered,
    quizCorrect,
    exercisesCompleted,
    projectsCompleted,
  };
}

export type TutoringLearnerDashboardRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "learner" | "observer";
  completedTopics: number;
  quizAnswered: number;
  quizCorrect: number;
  exercisesCompleted: number;
  projectsCompleted: number;
  changedFiles: number;
  addedFiles: number;
  lastActivity: string | null;
};

export async function loadTutoringLearnerDashboard(
  prisma: PrismaClient,
  args: { sessionId: string; moduleKeys: readonly string[] },
): Promise<TutoringLearnerDashboardRow[]> {
  const participants = await loadTutoringParticipants(prisma, args.sessionId);
  const meta = await getTutoringWorkspaceMeta(prisma, args);
  const referenceOwner =
    meta.publishedVersion > 0
      ? tutoringReferenceOwnerKey(meta.publishedVersion)
      : "shared";

  const [participantDocuments, referenceDocuments] = await Promise.all([
    prisma.tutoringSessionDocument.findMany({
      where: {
        sessionId: args.sessionId,
        ownerKey: { startsWith: "user:" },
        toolId: TUTORING_PROGRESS_TOOL_ID,
      },
      select: { ownerKey: true, moduleKey: true, body: true, updatedAt: true },
    }),
    prisma.tutoringSessionDocument.findMany({
      where: {
        sessionId: args.sessionId,
        ownerKey: referenceOwner,
        toolId: TUTORING_PROGRESS_TOOL_ID,
      },
      select: { moduleKey: true, body: true },
    }),
  ]);

  const referenceByModule = new Map(
    referenceDocuments.map((document) => [document.moduleKey, parseJson(document.body)]),
  );

  return participants.map((participant) => {
    const ownerKey = `user:${participant.id}`;
    const documents = participantDocuments.filter(
      (document) => document.ownerKey === ownerKey,
    );
    const aggregate = {
      completedTopics: 0,
      quizAnswered: 0,
      quizCorrect: 0,
      exercisesCompleted: 0,
      projectsCompleted: 0,
      changedFiles: 0,
      addedFiles: 0,
    };

    for (const document of documents) {
      const progress = parseJson(document.body);
      const summary = summarizeProgress(progress);
      aggregate.completedTopics += summary.completedTopics;
      aggregate.quizAnswered += summary.quizAnswered;
      aggregate.quizCorrect += summary.quizCorrect;
      aggregate.exercisesCompleted += summary.exercisesCompleted;
      aggregate.projectsCompleted += summary.projectsCompleted;

      const learnerFiles = fileMapFromProgress(progress);
      const referenceFiles = fileMapFromProgress(referenceByModule.get(document.moduleKey));
      for (const [key, content] of learnerFiles) {
        if (!referenceFiles.has(key)) aggregate.addedFiles += 1;
        else if (referenceFiles.get(key) !== content) aggregate.changedFiles += 1;
      }
    }

    const lastActivity = documents.reduce<Date | null>((latest, document) => {
      const value = new Date(document.updatedAt);
      return !latest || value > latest ? value : latest;
    }, null);

    return {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      role: participant.role,
      ...aggregate,
      lastActivity: lastActivity?.toISOString() ?? null,
    };
  });
}
