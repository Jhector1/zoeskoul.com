import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { validateCodeProfileGolden } from "../shared/validateCodeProfileGolden.js";
import { validateGoldenTopicBundle } from "../shared/validateGoldenTopicBundle.js";
import { makeEmptyGoldenValidationReport } from "../shared/noopReports.js";
import type { GoldenValidationReport } from "../shared/profileServices.js";

export async function validateCGolden(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);
    const shared = await validateGoldenTopicBundle(args);
    const codeGolden = await validateCodeProfileGolden({
        profileId: "c",
        expectedLanguage: "c",
        allowedRecipeTypes: ["fixed_tests"],
        draft: args.draft,
        topicBundle: args.topicBundle,
    });

    report.issues.push(...shared.issues, ...codeGolden);
    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
