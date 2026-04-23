import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationReport } from "../../shared/profileServices.js";
import { makeEmptySemanticValidationReport } from "../../shared/noopReports.js";

export async function validatePythonSemantic(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<SemanticValidationReport> {
    return makeEmptySemanticValidationReport(args.seed.topicId);
}