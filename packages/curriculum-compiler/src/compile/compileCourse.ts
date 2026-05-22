import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { publishDraft } from "../write/publishDraft.js";
import {
    countPlanTopics,
    type CompileProgressCallback,
} from "./compileProgress.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import { resolveAuthoringCompileTarget } from "./resolveAuthoringCompileTarget.js";

export async function compileCourse(args: {
    subjectSlug: string;
    courseSlug: string;
    provider: AiProvider;
    liveSubjectSlug?: string;
    forceLiveOverwrite?: boolean;
    onProgress?: CompileProgressCallback;
    resume?: boolean;
    publish?: boolean;
}) {
    const target = await resolveAuthoringCompileTarget({
        subjectSlug: args.subjectSlug,
        courseSlug: args.courseSlug,
        options: {
            liveSubjectSlug: args.liveSubjectSlug,
            forceLiveOverwrite: args.forceLiveOverwrite,
        },
    });

    const plan = buildPlanFromSpec({
        blueprint: target.blueprint,
        spec: target.spec,
    });

    args.onProgress?.({
        current: 0,
        total: countPlanTopics(plan),
        stage: `loaded course spec ${args.subjectSlug}/${args.courseSlug}`,
    });

    const out = await compileSubjectPipeline({
        blueprint: target.blueprint,
        plan,
        spec: target.spec,
        provider: args.provider,
        onProgress: args.onProgress,
        resume: args.resume,
    });

    if (args.publish !== false && target.publishToLive) {
        await publishDraft({
            subjectSlug: target.liveSubjectSlug,
        });
    }

    return {
        ...out,
        authoringSubjectSlug: target.authoringSubjectSlug,
        sourceCourseSlug: target.courseSlug,
        liveSubjectSlug: target.liveSubjectSlug,
    };
}
