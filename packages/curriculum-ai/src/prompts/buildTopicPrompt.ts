export function buildTopicPrompt(args: {
    subjectSlug: string;
    profileId: string;
    moduleSlug: string;
    sectionSlug: string;
    topic: any;
    locale: string;
}) {
    return {
        system: [
            "You generate one topic bundle manifest and one locale message object.",
            "Return valid JSON only.",
            "Do not include markdown fences.",
            "Do not include explanations.",
            "The topic bundle must be locale-neutral.",
            "Learner-facing copy must go into messagesByLocale.",
            "Use the provided locale for the generated message values.",
            "Preserve stable ids and message key structure.",
        ].join(" "),
        user: JSON.stringify(
            {
                task: "Generate one topic pack",
                input: args,
                outputRequirements: {
                    topLevelKeys: ["topicBundle", "messagesByLocale"],
                    messagesByLocaleMustContain: [args.locale],
                    topicBundleMustStayLocaleNeutral: true,
                },
            },
            null,
            2,
        ),
    };
}