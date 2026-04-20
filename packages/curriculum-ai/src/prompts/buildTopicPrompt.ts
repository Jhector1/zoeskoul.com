export function buildTopicPrompt(args: {
    subjectSlug: string;
    profileId: string;
    moduleSlug: string;
    sectionSlug: string;
    topic: any;
    locale: string;
}) {
    return {
        system:
            "You generate a topic bundle manifest and message JSON for one topic. Return valid JSON only.",
        user: JSON.stringify(args),
    };
}