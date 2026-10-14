import type {
    CourseBlueprint,
    CoursePlan,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import { getSubjectShape } from "@zoeskoul/curriculum-profiles";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { normalizeTopicAuthoringDraft } from "../normalize/normalizeTopicAuthoringDraft.js";
import { buildTopicSeedsFromPlan } from "../seeds/buildTopicSeedsFromPlan.js";

/**
 * Compile one canonical authoring draft into the exact runtime artifacts used
 * by learner/review surfaces, without reading or writing generated build files.
 */
export function buildTopicPreviewFromSource(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    topicId: string;
    draft: TopicAuthoringDraft;
}) {
    // Some saved course plans predate the required 1-based `order` fields and
    // carry `moduleNumber` plus array order instead. Normalize that legacy
    // representation locally; canonical source and authoring inputs stay
    // untouched.
    const plan: CoursePlan = {
        ...args.plan,
        modules: args.plan.modules.map((module, moduleIndex) => ({
            ...module,
            order:
                typeof module.order === "number" && Number.isFinite(module.order)
                    ? module.order
                    : moduleIndex + 1,
            sections: module.sections.map((section, sectionIndex) => ({
                ...section,
                order:
                    typeof section.order === "number" && Number.isFinite(section.order)
                        ? section.order
                        : sectionIndex + 1,
                topics: section.topics.map((topic, topicIndex) => ({
                    ...topic,
                    order:
                        typeof topic.order === "number" && Number.isFinite(topic.order)
                            ? topic.order
                            : topicIndex + 1,
                })),
            })),
        })),
    };
    const seed = buildTopicSeedsFromPlan({
        blueprint: args.blueprint,
        plan,
    }).find((candidate) => candidate.topicId === args.topicId);

    if (!seed) {
        throw new Error(`Topic not found in course plan: ${args.topicId}`);
    }

    const shape = getSubjectShape(args.blueprint.profileId);
    const normalizedDraft = normalizeTopicAuthoringDraft(args.draft, {
        profileId: seed.profileId,
    });

    return {
        profileId: args.blueprint.profileId,
        seed,
        normalizedDraft,
        topicBundle: buildTopicBundleFromDraft({
            shape,
            seed,
            draft: normalizedDraft,
        }),
        messages: buildMessagesFromDraft({
            shape,
            seed,
            draft: normalizedDraft,
        }),
    };
}
