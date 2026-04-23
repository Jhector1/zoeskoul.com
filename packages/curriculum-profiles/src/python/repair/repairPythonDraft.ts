import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairReport } from "../../shared/profileServices.js";
import { makeEmptyRepairReport } from "../../shared/noopReports.js";

export async function repairPythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    return {
        draft: args.draft,
        report: makeEmptyRepairReport(args.seed.topicId),
    };
}