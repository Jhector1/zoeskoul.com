import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import type {
    CritiqueReport,
    ProfileServices,
    RepairReport,
    SemanticValidationReport,
} from "@zoeskoul/curriculum-profiles";
import { repairIncompleteExercises } from "../normalize/repairIncompleteExercises.js";
import { normalizeTopicAuthoringDraft } from "../normalize/normalizeTopicAuthoringDraft.js";
import { repairTopicAuthoringDraft } from "../normalize/repairTopicAuthoringDraft.js";
import { sanitizeHintLeaksInDraft } from "../normalize/sanitizeHintLeaksInDraft.js";
import { validateExerciseHints } from "../validate/validateExerciseHints.js";
import { buildHintCritiqueIssues } from "./buildHintCritiqueIssues.js";
import { mergeCritiqueReports } from "./mergeCritiqueReports.js";
import { buildExercisePolicyCritiqueIssues } from "./buildExercisePolicyCritiqueIssues.js";
import { buildMultiChoiceCompletenessIssues } from "./buildMultiChoiceCompletenessIssues.js";
import { buildFillBlankSingleBlankIssues } from "./buildFillBlankSingleBlankIssues.js";
import { buildSharedPracticeCompletenessIssues } from "./buildSharedPracticeCompletenessIssues.js";

function makeBaseRepairReport(topicId: string): RepairReport {
    return {
        topicId,
        repairs: [],
    };
}

function mergeRepairReports(topicId: string, reports: RepairReport[]): RepairReport {
    return {
        topicId,
        repairs: reports.flatMap((report) => report.repairs ?? []),
    };
}

export async function evaluateTopicDraft(args: {
    provider: AiProvider;
    seed: TopicSeed;
    rawDraft: TopicAuthoringDraft;
    profileServices: ProfileServices;
    skipSemantic?: boolean;
}): Promise<{
    normalizedDraft: TopicAuthoringDraft;
    draft: TopicAuthoringDraft;
    repairReport: RepairReport;
    critiqueReport: CritiqueReport;
    semanticReport: SemanticValidationReport;
    hintWarnings: string[];
}> {
    let draft = normalizeTopicAuthoringDraft(args.rawDraft, {
        profileId: args.seed.profileId,
    });
    const normalizedDraft = draft;

    draft = await repairIncompleteExercises({
        provider: args.provider,
        seed: args.seed,
        draft,
    });

    draft = repairTopicAuthoringDraft(draft, args.seed);
    draft = sanitizeHintLeaksInDraft(draft, args.seed);

    const profileRepairResult = await args.profileServices.repairDraft({
        seed: args.seed,
        draft,
    });

    draft = await repairIncompleteExercises({
        provider: args.provider,
        seed: args.seed,
        draft: profileRepairResult.draft,
    });

    draft = repairTopicAuthoringDraft(draft, args.seed);
    draft = sanitizeHintLeaksInDraft(draft, args.seed);

    const hintWarnings = validateExerciseHints(draft);
    const hintCritiqueIssues = buildHintCritiqueIssues(hintWarnings);

    const policyCritiqueIssues =    buildExercisePolicyCritiqueIssues({
        draft,
        policy: args.seed.exercisePolicy,
        plannedCounts: args.seed.plannedExerciseCounts,
        generationTargets: args.seed.generationTargets,
        sectionRole: args.seed.sectionRole,
    });


    const multiChoiceCompletenessIssues = buildMultiChoiceCompletenessIssues({
        draft,
    });

    const fillBlankSingleBlankIssues = buildFillBlankSingleBlankIssues({
        draft,
    });
    const sharedPracticeCompletenessIssues = buildSharedPracticeCompletenessIssues({
        draft,
        seed: args.seed,
    });

    const profileCritiqueReport = await args.profileServices.critiqueDraft({
        seed: args.seed,
        draft,
    });

    const critiqueReport = mergeCritiqueReports({
        topicId: args.seed.topicId,
        reports: [profileCritiqueReport],
        extraIssues: [
            ...hintCritiqueIssues,
            ...policyCritiqueIssues,
            ...multiChoiceCompletenessIssues,
            ...fillBlankSingleBlankIssues,
            ...sharedPracticeCompletenessIssues,
        ],
    });

    const semanticReport = args.skipSemantic
        ? {
              topicId: args.seed.topicId,
              ok: true,
              issues: [],
          }
        : await args.profileServices.validateSemantic({
              seed: args.seed,
              draft,
          });

    const repairReport = mergeRepairReports(args.seed.topicId, [
        makeBaseRepairReport(args.seed.topicId),
        profileRepairResult.report,
    ]);

    return {
        normalizedDraft,
        draft,
        repairReport,
        critiqueReport,
        semanticReport,
        hintWarnings,
    };
}
