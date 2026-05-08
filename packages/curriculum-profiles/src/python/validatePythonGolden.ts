import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    makeEmptyGoldenValidationReport,
} from "../shared/noopReports.js";
import type { GoldenValidationReport } from "../shared/profileServices.js";
import { validateCodeProfileGolden } from "../shared/validateCodeProfileGolden.js";
import { validateGoldenTopicBundle } from "../shared/validateGoldenTopicBundle.js";

export async function validatePythonGolden(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const shared = await validateGoldenTopicBundle(args);
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);
    const codeGolden = await validateCodeProfileGolden({
        profileId: "python",
        expectedLanguage: "python",
        allowedRecipeTypes: ["fixed_tests", "template_io", "semantic"],
        topicBundle: args.topicBundle,
    });

    report.issues.push(...shared.issues);
    report.issues.push(...codeGolden);

    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
