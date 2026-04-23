import { makeTopicDef } from "@zoeskoul/curriculum-core";
import {
  makeProjectCard,
  makeProjectSpec,
  makeProjectStep,
  makeQuizCard,
  makeQuizSpec,
  makeSketchCard,
} from "./reviewBuilders.js";
import { tag } from "../i18n/resolveManifestMessages.js";

export function buildReviewFromManifest(args: {
  manifest: any;
  pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
  const { manifest, pool } = args;
  const topicSlug = `${manifest.prefix}.${manifest.topicId}`;

  const topic = {
    id: manifest.topicId,
    label: tag(manifest.topic.labelKey),
    minutes: manifest.minutes,
    summary: tag(manifest.topic.summaryKey),
    meta: {
      runtimeDefaults: manifest.runtimeDefaults ?? null,
    },
    cards: manifest.cards.map((card: any, index: number) => {
      if (card.kind === "sketch") {
        return makeSketchCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          sketchId: `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${card.sketchId}`,
          height: card.height ?? 520,
        });
      }

      if (card.kind === "quiz") {
        return makeQuizCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          spec: makeQuizSpec({
            subject: manifest.subjectSlug,
            module: manifest.moduleSlug,
            section: manifest.sectionSlug,
            topic: topicSlug,
            difficulty: card.quiz.difficulty,
            n: card.quiz.n,
            allowReveal: card.quiz.allowReveal ?? true,
            preferKind: card.quiz.preferKind ?? null,
            maxAttempts: card.quiz.maxAttempts ?? 10,
            runtime: manifest.runtimeDefaults ?? null,
          }),
        });
      }

      if (card.kind === "project") {
        return makeProjectCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          spec: makeProjectSpec({
            subject: manifest.subjectSlug,
            module: manifest.moduleSlug,
            section: manifest.sectionSlug,
            topic: topicSlug,
            difficulty: card.project.difficulty,
            allowReveal: card.project.allowReveal ?? true,
            preferKind: card.project.preferKind ?? null,
            maxAttempts: card.project.maxAttempts ?? 10,
            runtime: manifest.runtimeDefaults ?? null,
            steps: card.project.steps.map((step: any) =>
              makeProjectStep({
                id: step.id,
                title: tag(step.titleKey),
                topic: topicSlug,
                difficulty: step.difficulty ?? card.project.difficulty,
                preferKind: step.preferKind ?? card.project.preferKind ?? null,
                exerciseKey: step.exerciseKey,
                seedPolicy: step.seedPolicy === "step" ? "actor" : (step.seedPolicy ?? "global"),
                maxAttempts: step.maxAttempts ?? card.project.maxAttempts ?? 10,
              }),
            ),
          }),
        });
      }

      throw new Error(`Unsupported card kind: ${String(card?.kind)}`);
    }),
  };

  const baseDef = makeTopicDef({
    id: manifest.topicId,
    label: tag(manifest.topic.labelKey),
    minutes: manifest.minutes,
    pool,
  });

  const def = {
    ...baseDef,
    meta: {
      ...(baseDef.meta ?? {}),
      runtimeDefaults: manifest.runtimeDefaults ?? null,
    },
  };

  return { topic, def };
}
