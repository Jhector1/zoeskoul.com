import { compileCourse } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import {
    finishProgressBar,
    renderProgressBar,
} from "../utils/renderProgressBar.js";
import { selectModelFromConsole } from "../utils/selectModel.js";

export function parseCompileCourseArgs(args: string[]) {
    const liveSubjectIndex = args.indexOf("--live-subject");
    const liveSubjectSlug =
        liveSubjectIndex >= 0 ? args[liveSubjectIndex + 1] : undefined;

    if (liveSubjectIndex >= 0 && !liveSubjectSlug) {
        throw new Error("--live-subject requires a live subject slug");
    }

    return {
        liveSubjectSlug,
        resume: args.includes("--resume"),
        forceLiveOverwrite: args.includes("--force-live-overwrite"),
    };
}

export async function runCompileCourse(
    subjectSlug: string,
    courseSlug: string,
    args: string[] = [],
) {
    await selectModelFromConsole();
    const options = parseCompileCourseArgs(args);
    let sawProgress = false;

    console.log(`Compiling course ${subjectSlug}/${courseSlug}...`);

    try {
        const out = await compileCourse({
            subjectSlug,
            courseSlug,
            provider: openAiProvider,
            liveSubjectSlug: options.liveSubjectSlug,
            forceLiveOverwrite: options.forceLiveOverwrite,
            resume: options.resume,
            onProgress: (info) => {
                sawProgress = true;
                renderProgressBar({
                    current: info.current,
                    total: info.total,
                    label: info.topicId
                        ? `${info.stage} - ${info.topicId}`
                        : info.stage,
                });
            },
        });

        if (sawProgress) {
            finishProgressBar(
                `✔ Compiled ${out.authoringSubjectSlug}/${out.sourceCourseSlug} into ${out.liveSubjectSlug}`,
            );
        } else {
            console.log(
                `Compiled ${out.authoringSubjectSlug}/${out.sourceCourseSlug} into ${out.liveSubjectSlug}`,
            );
        }
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Compile failed");
        }
        throw error;
    }
}
