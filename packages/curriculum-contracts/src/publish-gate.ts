export type PublishGateStats = {
    topicsTotal: number;
    critiqueErrors: number;
    critiqueWarnings: number;
    repairsLow: number;
    repairsMedium: number;
    repairsHigh: number;
    hintWarnings: number;
    semanticFailures: number;
};

export type PublishGateResult = {
    ok: boolean;
    subjectSlug: string;
    profileId: string;
    reasons: string[];
    stats: PublishGateStats;
};