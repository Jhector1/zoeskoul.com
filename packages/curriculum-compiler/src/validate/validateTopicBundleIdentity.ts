import type {
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { resolveLogicalSectionSlug } from "../emit/resolveLogicalSectionSlug.js";

export function validateTopicBundleIdentity(args: {
    seed: TopicSeed;
    topicBundle: TopicBundleManifest;
    location: string;
}) {
    const expectedSectionSlug = resolveLogicalSectionSlug({
        subjectSlug: args.seed.subjectSlug,
        rawSectionSlug: args.seed.sectionSlug,
    });

    const checks: Array<[string, unknown, unknown]> = [
        ["subjectSlug", args.topicBundle.subjectSlug, args.seed.subjectSlug],
        ["moduleSlug", args.topicBundle.moduleSlug, args.seed.moduleSlug],
        ["sectionSlug", args.topicBundle.sectionSlug, expectedSectionSlug],
        ["topicId", args.topicBundle.topicId, args.seed.topicId],
        ["prefix", args.topicBundle.prefix, args.seed.modulePrefix],
        ["minutes", args.topicBundle.minutes, args.seed.minutes],
    ];

    const failures = checks.filter(([, actual, expected]) => actual !== expected);

    if (failures.length > 0) {
        throw new Error(
            [
                `Topic bundle identity mismatch at ${args.location}`,
                "",
                ...failures.map(
                    ([field, actual, expected]) =>
                        `- ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
                ),
                "",
                "The resolved course plan / TopicSeed is the source of truth.",
                "Do not use shape.subjectManifest.moduleSlug(), sectionSlug(), or modulePrefix() while emitting planned courses.",
            ].join("\n"),
        );
    }
}