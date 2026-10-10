import { findTopicSourceDraft } from "./topicSourceDraft.js";

export async function getCourseSourceDraftCoverage(args: {
    subjectSlug: string;
    courseSlug: string;
    topicIds: string[];
}) {
    const present: string[] = [];
    const missing: string[] = [];
    for (const topicId of args.topicIds) {
        const found = await findTopicSourceDraft({
            subjectSlug: args.subjectSlug,
            courseSlug: args.courseSlug,
            topicId,
        });
        (found ? present : missing).push(topicId);
    }
    return {
        complete: missing.length === 0,
        present,
        missing,
    };
}
