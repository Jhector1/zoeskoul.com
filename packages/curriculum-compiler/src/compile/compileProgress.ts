import type { CoursePlan } from "@zoeskoul/curriculum-contracts";

export type CompileProgressInfo = {
    current: number;
    total: number;
    stage: string;
    topicId?: string;
    moduleSlug?: string;
    sectionSlug?: string;
};

export type CompileProgressCallback = (info: CompileProgressInfo) => void;

export function countPlanTopics(plan: CoursePlan): number {
    return plan.modules.reduce((moduleAcc, module) => {
        return (
            moduleAcc +
            module.sections.reduce((sectionAcc, section) => {
                return sectionAcc + section.topics.length;
            }, 0)
        );
    }, 0);
}