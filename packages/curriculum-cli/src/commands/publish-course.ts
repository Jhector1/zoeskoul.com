import {
    publishDraftToLive,
    resolveAuthoringCompileTarget,
} from "@zoeskoul/curriculum-compiler";

export function parsePublishCourseArgs(args: string[]) {
    const liveSubjectIndex = args.indexOf("--live-subject");
    const liveSubjectSlug =
        liveSubjectIndex >= 0 ? args[liveSubjectIndex + 1] : undefined;

    if (liveSubjectIndex >= 0 && !liveSubjectSlug) {
        throw new Error("--live-subject requires a live subject slug");
    }

    return {
        liveSubjectSlug,
        force: args.includes("--force"),
        forceLiveOverwrite: args.includes("--force-live-overwrite"),
    };
}

export async function runPublishCourse(
    subjectSlug: string,
    courseSlug: string,
    args: string[] = [],
) {
    const options = parsePublishCourseArgs(args);
    const liveTarget = await resolveAuthoringCompileTarget({
        subjectSlug,
        courseSlug,
        options: {
            liveSubjectSlug: options.liveSubjectSlug,
            forceLiveOverwrite: options.forceLiveOverwrite || options.force,
        },
    });
    const checkedDraftTarget = await resolveAuthoringCompileTarget({
        subjectSlug,
        courseSlug,
        options: {
            draftOnly: true,
        },
    });

    if (liveTarget.courseSlug !== courseSlug) {
        throw new Error(
            `Course publish resolved the wrong course: requested ${courseSlug} but resolved ${liveTarget.courseSlug}. Aborting.`,
        );
    }

    if (liveTarget.authoringSubjectSlug !== subjectSlug) {
        throw new Error(
            `Course publish resolved the wrong subject: requested ${subjectSlug} but resolved ${liveTarget.authoringSubjectSlug}. Aborting.`,
        );
    }

    if (checkedDraftTarget.courseSlug !== courseSlug) {
        throw new Error(
            `Checked draft resolved the wrong course: requested ${courseSlug} but resolved ${checkedDraftTarget.courseSlug}. Aborting.`,
        );
    }

    if (checkedDraftTarget.authoringSubjectSlug !== subjectSlug) {
        throw new Error(
            `Checked draft resolved the wrong subject: requested ${subjectSlug} but resolved ${checkedDraftTarget.authoringSubjectSlug}. Aborting.`,
        );
    }

    if (checkedDraftTarget.liveSubjectSlug === liveTarget.liveSubjectSlug) {
        throw new Error(
            `Checked draft for ${subjectSlug}/${courseSlug} unexpectedly resolves to live subject ${liveTarget.liveSubjectSlug}. Aborting.`,
        );
    }

    console.log(
        `Publishing course ${subjectSlug}/${courseSlug} from checked draft ${checkedDraftTarget.liveSubjectSlug} to live subject ${liveTarget.liveSubjectSlug}...`,
    );

    await publishDraftToLive({
        draftSubjectSlug: checkedDraftTarget.liveSubjectSlug,
        liveSubjectSlug: liveTarget.liveSubjectSlug,
    });

    console.log(
        `Published ${subjectSlug}/${courseSlug} to live subject ${liveTarget.liveSubjectSlug}`,
    );
}
