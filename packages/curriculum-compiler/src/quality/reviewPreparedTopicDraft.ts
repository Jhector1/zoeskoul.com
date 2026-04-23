import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type {
    CritiqueReport,
    ProfileServices,
    SemanticValidationReport,
} from "@zoeskoul/curriculum-profiles";
import { validateExerciseHints } from "../validate/validateExerciseHints.js";
import { buildHintCritiqueIssues } from "./buildHintCritiqueIssues.js";
import { mergeCritiqueReports } from "./mergeCritiqueReports.js";

export async function reviewPreparedTopicDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    profileServices: ProfileServices;
}): Promise<{
    critiqueReport: CritiqueReport;
    semanticReport: SemanticValidationReport;
    hintWarnings: string[];
}> {
    const hintWarnings = validateExerciseHints(args.draft);
    const hintCritiqueIssues = buildHintCritiqueIssues(hintWarnings);

    const profileCritiqueReport = await args.profileServices.critiqueDraft({
        seed: args.seed,
        draft: args.draft,
    });

    const critiqueReport = mergeCritiqueReports({
        topicId: args.seed.topicId,
        reports: [profileCritiqueReport],
        extraIssues: hintCritiqueIssues,
    });

    const semanticReport = await args.profileServices.validateSemantic({
        seed: args.seed,
        draft: args.draft,
    });

    return {
        critiqueReport,
        semanticReport,
        hintWarnings,
    };
}