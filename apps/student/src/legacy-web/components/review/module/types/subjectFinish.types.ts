export type SubjectFinishState = {
    subjectSlug: string;
    currentModuleSlug: string | null;
    curriculumState: "growing" | "complete";
    curriculumComplete: boolean;
    publishedModuleCount: number;
    plannedModuleCount: number | null;
    lastPublishedModuleSlug: string | null;
    atEndOfPublishedTrack: boolean;
    completedPublishedModuleCount: number;
    remainingPublishedModuleCount: number;
    rewardEnabled: boolean;
    certificateEnabled: boolean;
    rewardEligible: boolean;
    certificateEligible: boolean;
    certificateIssued: boolean;
    status:
        | "in_progress"
        | "more_coming"
        | "reward_ready"
        | "certificate_ready"
        | "certificate_issued";
    message: string | null;
};