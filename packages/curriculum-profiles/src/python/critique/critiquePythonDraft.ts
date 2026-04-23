import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueReport } from "../../shared/profileServices.js";
import { makeEmptyCritiqueReport } from "../../shared/noopReports.js";

export async function critiquePythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<CritiqueReport> {
    return makeEmptyCritiqueReport(args.seed.topicId);
}