// packages/curriculum-compiler/src/compile/compileSubjectPipeline.ts

import type {
  CourseBlueprint,
  CoursePlan,
  CourseSpec,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateTopicAuthoringDraft } from "@zoeskoul/curriculum-ai";
import {
  getProfileServices,
  getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import {
  assertNonEmptyMessages,
  translateNonEmptyMessages,
} from "../emit/translateNonEmptyMessages.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import {getDraftTopicBundlePath, getDraftTopicMessagesPath} from "@zoeskoul/curriculum-core";
import fs from "node:fs/promises";
import {validateWorkspacePolicy} from "../validate/validateWorkspacePolicy.js";
import {resolveWorkspacePolicy} from "../policy/resolveWorkspacePolicy.js";
import {validateTopicBundleIdentity} from "../validate/validateTopicBundleIdentity.js";
import {validateTopicMessagesIdentity} from "../validate/validateTopicMessagesIdentity.js";
import {validateGenericExerciseHelp} from "../validate/validateGenericExerciseHelp.js";
import {validateStarterCodeDoesNotRevealSolution} from "../validate/validateStarterCodeDoesNotRevealSolution.js";
async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isTopicAlreadyCompiled(args: {
  subjectSlug: string;
  moduleOrder: number;
  topicId: string;
  locales: string[];
}) {
  const moduleDir = `module${args.moduleOrder}`;

  const bundlePath = getDraftTopicBundlePath(
      args.subjectSlug,
      moduleDir,
      args.topicId,
  );

  if (!(await fileExists(bundlePath))) {
    return false;
  }

  for (const locale of args.locales) {
    const messagesPath = getDraftTopicMessagesPath(
        locale,
        args.subjectSlug,
        moduleDir,
        args.topicId,
    );

    if (!(await fileExists(messagesPath))) {
      return false;
    }
  }

  return true;
}
export async function compileSubjectPipeline(args: {
  blueprint: CourseBlueprint;
  plan: CoursePlan;
  spec?: CourseSpec | null;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
  resume?: boolean;
}){
  const shape = getSubjectShape(args.blueprint.profileId as "sql" | "python");
  const profileServices = getProfileServices(args.blueprint.profileId);

  const topicNodes = listTopicPlanNodes({ plan: args.plan });
  const totalTopics = topicNodes.length;
  let completedTopics = 0;

  const sourceLocale = args.blueprint.sourceLocale;
  const extraLocales = (args.blueprint.targetLocales ?? []).filter(
      (locale) => locale !== sourceLocale,
  );

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

  assertNonEmptyMessages({
    locale: sourceLocale,
    label: `${args.blueprint.subjectSlug} subject messages`,
    messages: sourceSubjectMessages,
  });

  const subjectMessagesByLocale: Record<string, Record<string, unknown>> = {
    [sourceLocale]: sourceSubjectMessages,
  };

  for (const locale of extraLocales) {
    args.onProgress?.({
      current: completedTopics,
      total: totalTopics,
      stage: `translating subject messages (${locale})`,
    });

    subjectMessagesByLocale[locale] = await translateNonEmptyMessages({
      provider: args.provider,
      shape,
      sourceLocale,
      locale,
      sourceMessages: sourceSubjectMessages,
      label: `${args.blueprint.subjectSlug} subject messages`,
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
    if (args.resume) {
      const alreadyCompiled = await isTopicAlreadyCompiled({
        subjectSlug: args.blueprint.subjectSlug,
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
        locales: [sourceLocale, ...extraLocales],
      });

      if (alreadyCompiled) {
        completedTopics += 1;

        args.onProgress?.({
          current: completedTopics,
          total: totalTopics,
          stage: "skipped completed topic",
          topicId: node.topic.topicId,
          moduleSlug: node.module.moduleSlug,
          sectionSlug: node.section.sectionSlug,
        });

        continue;
      }
    }
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
      locale: sourceLocale,
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
    const workspacePolicy = resolveWorkspacePolicy({
      blueprint: args.blueprint,
      moduleNumber: node.module.order - 1,
      topicId: node.topic.topicId,
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
    });
    validateWorkspacePolicy({
      text: JSON.stringify(evaluation.draft),
      policy: workspacePolicy,
      location: `${node.module.moduleSlug}/${node.topic.topicId}`,
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
    validateStarterCodeDoesNotRevealSolution({
      draft,
      location: `${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
    });
    validateGenericExerciseHelp({
      draft,
      location: `${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
    });
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
            [
              `Semantic validation failed for topic "${node.topic.topicId}"`,
              `Module: ${node.module.moduleSlug}`,
              `Section: ${node.section.sectionSlug}`,
              `Report dir: .curriculum-drafts/reports/${args.blueprint.subjectSlug}/module${node.moduleIndex}/${node.topic.topicId}`,
              ...semanticErrors.map((x) => `- ${x.message}`),
            ].join("\n"),
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
    });
    validateTopicBundleIdentity({
      seed,
      topicBundle,
      location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
    });
    const goldenReport = await profileServices.validateGolden({
      seed,
      draft,
      topicBundle,
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
      goldenReport,
      topicBundle,
    });

    if (!goldenReport.ok) {
      const goldenErrors = goldenReport.issues.filter(
          (issue) => issue.severity === "error",
      );

      if (goldenErrors.length) {
        throw new Error(
            [
              `Golden validation failed for topic "${node.topic.topicId}"`,
              `Module: ${node.module.moduleSlug}`,
              `Section: ${node.section.sectionSlug}`,
              `Report dir: .curriculum-drafts/reports/${args.blueprint.subjectSlug}/module${node.moduleIndex}/${node.topic.topicId}`,
              ...goldenErrors.map((x) => `- ${x.message}`),
            ].join("\n"),
        );
      }
    }

    const sourceMessages = buildMessagesFromDraft({
      shape,
      seed,
      draft,

    });

    validateTopicMessagesIdentity({
      seed,
      messages: sourceMessages,
      location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
    });

    assertNonEmptyMessages({
      locale: sourceLocale,
      label: `${args.blueprint.subjectSlug}/${node.topic.topicId} topic messages`,
      messages: sourceMessages,
    });

    const messagesByLocale: Record<string, Record<string, unknown>> = {
      [sourceLocale]: sourceMessages,
    };

    for (const locale of extraLocales) {
      args.onProgress?.({
        current: completedTopics,
        total: totalTopics,
        stage: `translating topic messages (${locale})`,
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
      });

      messagesByLocale[locale] = await translateNonEmptyMessages({
        provider: args.provider,
        shape,
        sourceLocale,
        locale,
        sourceMessages,
        label: `${args.blueprint.subjectSlug}/${node.topic.topicId} topic messages`,
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
import {
  isRetryableTopicValidationError,
} from "../validate/RetryableTopicValidationError.js";
import { writeTopicAttemptReport } from "../reports/writeTopicAttemptReport.js";
import { writeTopicCompileStatus } from "../reports/writeTopicCompileStatus.js";

const MAX_TOPIC_RETRIES = 2;

async function compileTopicWithRetries(args: {
  node: ResolvedTopicNode;
  reportDir: string;
  compileOnce: (retry?: {
    attempt: number;
    maxRetries: number;
    previousErrorCode: string;
    previousErrorMessage: string;
  }) => Promise<{
    rawDraft?: unknown;
    repairedDraft?: unknown;
    repairReport?: unknown;
    critiqueReport?: unknown;
    semanticReport?: unknown;
    goldenReport?: unknown;
    result: unknown;
  }>;
}) {
  let previousError: unknown = null;

  for (let attempt = 0; attempt <= MAX_TOPIC_RETRIES; attempt += 1) {
    const retryContext =
        attempt > 0 && previousError instanceof Error
            ? {
              attempt,
              maxRetries: MAX_TOPIC_RETRIES,
              previousErrorCode: (previousError as any).code ?? "UNKNOWN",
              previousErrorMessage: previousError.message,
            }
            : undefined;

    try {
      const result = await args.compileOnce(retryContext);

      await writeTopicAttemptReport({
        reportDir: args.reportDir,
        attempt,
        status: "success",
        rawDraft: result.rawDraft,
        repairedDraft: result.repairedDraft,
        repairReport: result.repairReport,
        critiqueReport: result.critiqueReport,
        semanticReport: result.semanticReport,
        goldenReport: result.goldenReport,
      });

      await writeTopicCompileStatus({
        reportDir: args.reportDir,
        status: "success",
        attempts: attempt + 1,
        finalAttempt: attempt,
      });

      return result.result;
    } catch (error) {
      previousError = error;

      await writeTopicAttemptReport({
        reportDir: args.reportDir,
        attempt,
        status: "failed",
        error,
      });

      const canRetry =
          attempt < MAX_TOPIC_RETRIES &&
          isRetryableTopicValidationError(error);

      if (canRetry) {
        continue;
      }

      await writeTopicCompileStatus({
        reportDir: args.reportDir,
        status: "failed",
        attempts: attempt + 1,
        finalAttempt: attempt,
        errorCode:
            typeof error === "object" && error !== null
                ? String((error as any).code ?? "UNKNOWN")
                : "UNKNOWN",
        errorMessage:
            error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  throw previousError;
}