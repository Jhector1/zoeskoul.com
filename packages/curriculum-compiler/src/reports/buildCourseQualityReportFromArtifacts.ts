import type {
    CourseBlueprint,
    CoursePlan,
    CourseSpec,
    TopicAuthoringDraft,
    TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";
import type { CurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import { buildCurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { readSubjectTopicReports } from "./readTopicReports.js";

function reportKey(moduleSlug: string, topicId: string) {
    return `${moduleSlug}:${topicId}`;
}

export async function buildCourseQualityReportFromArtifacts(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    spec?: CourseSpec | null;
}): Promise<CurriculumQualityReport> {
    const reportBundles = await readSubjectTopicReports({
        subjectSlug: args.blueprint.subjectSlug,
    });
    const reportMap = new Map<string, (typeof reportBundles)[number]>();

    for (const bundle of reportBundles) {
        const moduleSlug =
            (bundle.topicBundle as { moduleSlug?: unknown } | undefined)?.moduleSlug ??
            (bundle.attemptMetadata as { seed?: { moduleSlug?: unknown } } | undefined)?.seed?.moduleSlug;

        if (typeof moduleSlug !== "string" || moduleSlug.length === 0) {
            continue;
        }

        reportMap.set(reportKey(moduleSlug, bundle.topicId), bundle);
    }

    const topics = listTopicPlanNodes({ plan: args.plan }).map((node) => {
        const bundle = reportMap.get(
            reportKey(node.module.moduleSlug, node.topic.topicId),
        );
        const seed = buildTopicSeedFromPlanNode({
            blueprint: args.blueprint,
            spec: args.spec ?? null,
            module: node.module,
            section: node.section,
            topic: node.topic,
        });

        return {
            seed,
            draft: (bundle?.repairedDraft ??
                bundle?.normalizedDraft ??
                bundle?.rawDraft ??
                undefined) as TopicAuthoringDraft | undefined,
            topicBundle: bundle?.topicBundle as TopicBundleManifest | undefined,
        };
    });

    return buildCurriculumQualityReport({
        profileId: args.blueprint.profileId,
        subjectSlug: args.blueprint.subjectSlug,
        courseSlug: args.blueprint.courseSlug,
        topics,
        requireFinalCapstone:
            args.spec?.policy?.projectPolicy?.capstoneRequired ??
            args.blueprint.level === "beginner",
        spec: args.spec ?? null,
    });
}
