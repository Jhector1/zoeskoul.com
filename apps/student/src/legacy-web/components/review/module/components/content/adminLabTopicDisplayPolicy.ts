/**
 * Client-side DISPLAY policy only; never treats a topic slug as authorization.
 * The Web server independently checks session identity, enrollment, published
 * curriculum, practice entitlement, signed grant, and both feature gates.
 */
export const ADMIN_TOPIC_DISPLAY_SUBJECT = "linux-files-permissions-users" as const;

const moduleByTopic: Readonly<Record<string, string>> = Object.freeze({
    "sudo-root-concepts": "linux-module-3-users-groups-troubleshooting",
    "ownership-administration-concepts": "linux-module-3-users-groups-troubleshooting",
    "final-capstone-secure-project": "linux-module-4-secure-project-capstone",
});

export type AdminLabTopicTarget = Readonly<{
    moduleSlug: string;
    topicSlug: string;
}>;

export function adminLabTopicForDisplay(args: {
    subjectSlug: string;
    moduleSlug: string;
    topicId: string;
}): AdminLabTopicTarget | null {
    if (args.subjectSlug !== ADMIN_TOPIC_DISPLAY_SUBJECT) return null;
    if (!Object.prototype.hasOwnProperty.call(moduleByTopic, args.topicId)) return null;
    if (moduleByTopic[args.topicId] !== args.moduleSlug) return null;
    return { moduleSlug: args.moduleSlug, topicSlug: args.topicId };
}
