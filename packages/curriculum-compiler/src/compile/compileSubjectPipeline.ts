import type {
  CourseBlueprint,
  CoursePlan,
  CourseSpec,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
  generateTopicAuthoringDraft,
  translateMessages,
} from "@zoeskoul/curriculum-ai";
import {
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
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";

export async function compileSubjectPipeline(args: {
  blueprint: CourseBlueprint;
  plan: CoursePlan;
  spec?: CourseSpec | null;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
}) {
  const shape = getSubjectShape(
      args.blueprint.profileId as "sql" | "python",
  );
  const profileServices = getProfileServices(args.blueprint.profileId);

  const topicNodes = listTopicPlanNodes({ plan: args.plan });
  const totalTopics = topicNodes.length;
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

  for (const node of topicNodes) {
    const seed = buildTopicSeedFromPlanNode({
      blueprint: args.blueprint,
      spec: args.spec ?? null,
      module: node.module,
      section: node.section,
      topic: node.topic,
    });

    args.onProgress?.({
      current: completedTopics,
      total: totalTopics,
      stage: "generating topic draft",
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
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
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
    });

    const evaluation = await evaluateTopicDraft({
      provider: args.provider,
      seed,
      rawDraft,
      profileServices,
    });

    const draft = evaluation.draft;

    await writeTopicReports({
      subjectSlug: args.blueprint.subjectSlug,
      moduleOrder: node.moduleIndex,
      topicId: node.topic.topicId,
      rawDraft,
      repairedDraft: draft,
      repairReport: evaluation.repairReport,
      critiqueReport: evaluation.critiqueReport,
      semanticReport: evaluation.semanticReport,
    });

    args.onProgress?.({
      current: completedTopics,
      total: totalTopics,
      stage: "validating draft",
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
    });

    assertTopicAuthoringDraft(draft);

    if (!evaluation.critiqueReport.ok) {
      const critiqueErrors = evaluation.critiqueReport.issues.filter(
          (issue) => issue.severity === "error",
      );

      if (critiqueErrors.length) {
        throw new Error(
            [
              `Critique failed for topic "${node.topic.topicId}"`,
              `Module: ${node.module.moduleSlug}`,
              `Section: ${node.section.sectionSlug}`,
              `Report dir: .curriculum-drafts/reports/${args.blueprint.subjectSlug}/module${node.moduleIndex}/${node.topic.topicId}`,
              ...critiqueErrors.map((x) => `- ${x.message}`),
            ].join("\n"),
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
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
    });

    const topicBundle = buildTopicBundleFromDraft({
      shape,
      seed,
      draft,
      moduleOrder: node.moduleIndex,
      sectionOrder: node.sectionOrder,
    });

    const sourceMessages = buildMessagesFromDraft({
      shape,
      seed,
      draft,
      moduleOrder: node.moduleIndex,
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
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
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
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
    });

    await writeTopicArtifacts({
      subjectSlug: args.blueprint.subjectSlug,
      moduleOrder: node.moduleIndex,
      topicId: node.topic.topicId,
      topicBundle,
      messagesByLocale,
    });

    await writeTopicReports({
      subjectSlug: args.blueprint.subjectSlug,
      moduleOrder: node.moduleIndex,
      topicId: node.topic.topicId,
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
      topicId: node.topic.topicId,
      moduleSlug: node.module.moduleSlug,
      sectionSlug: node.section.sectionSlug,
    });
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