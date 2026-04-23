import type {
  CourseBlueprint,
  CoursePlan,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
  generateTopicAuthoringDraft,
  translateMessages,
} from "@zoeskoul/curriculum-ai";
import {
  getProfileAdapter,
  getProfileServices,
  getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import {
  countPlanTopics,
  type CompileProgressCallback,
} from "./compileProgress.js";

export async function compileSubjectPipeline(args: {
  blueprint: CourseBlueprint;
  plan: CoursePlan;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
}) {
  const shape = getSubjectShape(
      args.blueprint.profileId as "sql" | "python",
  );
  const adapter = getProfileAdapter(args.blueprint.profileId);
  const profileServices = getProfileServices(args.blueprint.profileId);

  const totalTopics = countPlanTopics(args.plan);
  let completedTopics = 0;

  args.onProgress?.({
    current: completedTopics,
    total: totalTopics,
    stage: "building subject manifest",
  });

  const subjectManifest = buildSubjectManifestFromPlan({
    blueprint: args.blueprint,
    plan: args.plan,
    shape,
  });

  const sourceSubjectMessages = buildSubjectMessagesFromPlan({
    blueprint: args.blueprint,
    plan: args.plan,
    shape,
  });

  const subjectMessagesByLocale: Record<string, Record<string, unknown>> = {
    [args.blueprint.sourceLocale]: sourceSubjectMessages,
  };

  for (const locale of args.blueprint.targetLocales ?? []) {
    if (locale === args.blueprint.sourceLocale) continue;

    args.onProgress?.({
      current: completedTopics,
      total: totalTopics,
      stage: `translating subject messages (${locale})`,
    });

    subjectMessagesByLocale[locale] = await translateMessages(args.provider, {
      shape,
      sourceLocale: args.blueprint.sourceLocale,
      locale,
      sourceMessages: sourceSubjectMessages,
    });
  }

  args.onProgress?.({
    current: completedTopics,
    total: totalTopics,
    stage: "writing subject artifacts",
  });

  await writeSubjectArtifacts({
    subjectSlug: args.blueprint.subjectSlug,
    subjectManifest,
    subjectMessagesByLocale,
  });

  for (const module of args.plan.modules) {
    const moduleOrder = module.order - 1;

    for (const section of module.sections) {
      const sectionOrder = section.order;

      for (const topic of section.topics) {
        const seed = adapter.buildTopicSeed({
          blueprint: args.blueprint,
          module: {
            slug: module.moduleSlug,
            title: module.title,
            order: module.order,
            purpose: undefined,
            learningObjectives: topic.learningGoals,
            guidedExercises: [],
            quizFocus: [],
            moduleProject: undefined,
          },
          section: {
            slug: section.sectionSlug,
            title: section.title,
            order: section.order,
          },
          topic: {
            topicId: topic.topicId,
            order: topic.order,
            title: topic.title,
            summary: topic.summary,
            minutes: topic.minutes,
          },
        });

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "generating topic draft",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });

        const rawDraft = await generateTopicAuthoringDraft(args.provider, {
          seed,
          locale: args.blueprint.sourceLocale,
          shape,
        });

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "evaluating topic draft",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });

        const evaluation = await evaluateTopicDraft({
          provider: args.provider,
          seed,
          rawDraft,
          profileServices,
        });

        const draft = evaluation.draft;

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "validating draft",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });

        assertTopicAuthoringDraft(draft);

        if (!evaluation.critiqueReport.ok) {
          const critiqueErrors = evaluation.critiqueReport.issues.filter(
              (issue) => issue.severity === "error",
          );
          if (critiqueErrors.length) {
            throw new Error(
                `Critique failed:\n${critiqueErrors.map((x) => `- ${x.message}`).join("\n")}`,
            );
          }
        }

        if (!evaluation.semanticReport.ok) {
          const semanticErrors = evaluation.semanticReport.issues.filter(
              (issue) => issue.severity === "error",
          );
          if (semanticErrors.length) {
            throw new Error(
                `Semantic validation failed:\n${semanticErrors
                    .map((x) => `- ${x.message}`)
                    .join("\n")}`,
            );
          }
        }

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "building topic bundle",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });

        const topicBundle = buildTopicBundleFromDraft({
          shape,
          seed,
          draft,
          moduleOrder,
          sectionOrder,
        });

        const sourceMessages = buildMessagesFromDraft({
          shape,
          seed,
          draft,
          moduleOrder,
        });

        const messagesByLocale: Record<string, Record<string, unknown>> = {
          [args.blueprint.sourceLocale]: sourceMessages,
        };

        for (const locale of args.blueprint.targetLocales ?? []) {
          if (locale === args.blueprint.sourceLocale) continue;

          args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: `translating topic messages (${locale})`,
            topicId: topic.topicId,
            moduleSlug: module.moduleSlug,
            sectionSlug: section.sectionSlug,
          });

          messagesByLocale[locale] = await translateMessages(args.provider, {
            shape,
            sourceLocale: args.blueprint.sourceLocale,
            locale,
            sourceMessages,
          });
        }

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "writing topic artifacts",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });

        await writeTopicArtifacts({
          subjectSlug: args.blueprint.subjectSlug,
          moduleOrder,
          topicId: topic.topicId,
          topicBundle,
          messagesByLocale,
        });

        await writeTopicReports({
          subjectSlug: args.blueprint.subjectSlug,
          moduleOrder,
          topicId: topic.topicId,
          rawDraft,
          repairedDraft: draft,
          repairReport: evaluation.repairReport,
          critiqueReport: evaluation.critiqueReport,
          semanticReport: evaluation.semanticReport,
          topicBundle,
        });

        completedTopics += 1;

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "completed topic",
          topicId: topic.topicId,
          moduleSlug: module.moduleSlug,
          sectionSlug: section.sectionSlug,
        });
      }
    }
  }

  args.onProgress?.({
    current: totalTopics,
    total: totalTopics,
    stage: "done",
  });

  return {
    shape,
    subjectManifest,
  };
}