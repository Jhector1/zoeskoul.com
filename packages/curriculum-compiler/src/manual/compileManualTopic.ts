import type { AiProvider } from "@zoeskoul/curriculum-ai";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { CompileProgressCallback } from "../compile/compileProgress.js";
import { compileTopic } from "../compile/compileTopic.js";
import { loadManualTopicDraft } from "./loadManualTopicDraft.js";

const noExternalAiProvider: AiProvider = {
    async generateJson() {
        throw new Error(
            "Manual topic compilation forbids external AI generation. " +
                "The course must have a saved/spec plan and no untranslated target locales.",
        );
    },
};

export async function compileManualTopic(args: {
    /**
     * Canonical authoring blueprint used to locate checked-in manual JSON.
     * Its subjectSlug remains the authoring subject identity.
     */
    blueprint: CourseBlueprint;
    /**
     * Optional output subject identity only.
     *
     * Manual compilation must preserve the authoring blueprint's locale,
     * profile, workspace, exercise, and generation policy. Course-scoped
     * callers may override only the subject slug so emitted artifacts/reports
     * land in the checked draft namespace used by publish-course.
     */
    outputSubjectSlug?: string;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    const courseSlug = args.blueprint.courseSlug;
    if (!courseSlug) {
        throw new Error(
            `Manual topic compilation requires blueprint.courseSlug for subject "${args.blueprint.subjectSlug}".`,
        );
    }

    const { draft, sourcePath } = await loadManualTopicDraft({
        subjectSlug: args.blueprint.subjectSlug,
        courseSlug,
        topicId: args.topicId,
    });

    const result = await compileTopic({
        blueprint: args.blueprint,
        outputSubjectSlug: args.outputSubjectSlug,
        provider: noExternalAiProvider,
        topicId: args.topicId,
        onProgress: args.onProgress,
        manualDraft: draft,
    });

    return { ...result, source: "manual-json" as const, sourcePath };
}
