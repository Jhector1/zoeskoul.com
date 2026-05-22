import {
    publishDraft,
    resolveSubjectPublishTarget,
} from "@zoeskoul/curriculum-compiler";

export async function runPublishSubject(subjectSlug: string) {
    const target = await resolveSubjectPublishTarget(subjectSlug);

    await publishDraft({
        subjectSlug: target.liveSubjectSlug,
    });

    console.log(
        `Published ${subjectSlug}/${target.courseSlug} to live subject ${target.liveSubjectSlug}`,
    );
}
