import type { TopicSeed } from "@zoeskoul/curriculum-contracts";

function hasPath(obj: unknown, path: string[]) {
    let cursor = obj;

    for (const key of path) {
        if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
            return false;
        }

        cursor = (cursor as Record<string, unknown>)[key];
    }

    return true;
}

export function validateTopicMessagesIdentity(args: {
    seed: TopicSeed;
    messages: Record<string, unknown>;
    location: string;
}) {
    const topicPath = [
        "topics",
        args.seed.subjectSlug,
        args.seed.moduleSlug,
        args.seed.topicId,
    ];

    const sketchPath = [
        "sketches",
        args.seed.subjectSlug,
        args.seed.moduleSlug,
        args.seed.topicId,
    ];

    const failures: string[] = [];

    if (!hasPath(args.messages, topicPath)) {
        failures.push(`Missing topic messages path: ${topicPath.join(".")}`);
    }

    if (!hasPath(args.messages, sketchPath)) {
        failures.push(`Missing sketch messages path: ${sketchPath.join(".")}`);
    }

    if (failures.length > 0) {
        throw new Error(
            [
                `Topic message identity mismatch at ${args.location}`,
                "",
                ...failures.map((failure) => `- ${failure}`),
                "",
                "Messages must use the resolved TopicSeed moduleSlug, not profile fallback slugs.",
            ].join("\n"),
        );
    }
}