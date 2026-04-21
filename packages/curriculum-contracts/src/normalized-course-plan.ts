
export type NormalizedPlanTopic = {
    topicId: string;
    order: number;
    title: string;
    sourceTopicCode?: string;
};

export type NormalizedPlanSection = {
    sectionSlug: string;
    order: number;
    title: string;
    sourceSectionCode?: string;
    topics: NormalizedPlanTopic[];
};

export type NormalizedPlanModule = {
    moduleSlug: string;
    order: number;
    title: string;
    purpose: string;
    learningObjectives: string[];
    guidedExercises: string[];
    quizFocus: string[];
    moduleProject: string;
    sections: NormalizedPlanSection[];
};

export type NormalizedCoursePlan = {
    subjectSlug: string;
    title: string;
    description?: string;
    source: {
        kind: "pdf";
        filePath?: string;
        originalTitle?: string;
    };
    modules: NormalizedPlanModule[];
};