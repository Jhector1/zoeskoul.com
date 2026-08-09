import {
    publishDraft,
    resolveSubjectPublishTarget,
    rebuildRegistries,
} from "@zoeskoul/curriculum-compiler";

export async function runPublishSubject(subjectSlug: string) {
    const target = await resolveSubjectPublishTarget(subjectSlug);

    await publishDraft({
        subjectSlug: target.liveSubjectSlug,
    });

    await rebuildRegistries();

    console.log(
        `Published ${subjectSlug}/${target.courseSlug} to live subject ${target.liveSubjectSlug}`,
    );
}
