export type ExerciseHelpDraft = {
    concept: string;
    hint_1: string;
    hint_2: string;
};

type DraftCommon = {
    id: string;
    title: string;
    prompt: string;
    hint: string;
    help: ExerciseHelpDraft;
};

export type TopicAuthoringDraft = {
    title: string;
    summary: string;
    minutes: number;

    sketchBlocks: Array<{
        id: string;
        title: string;
        bodyMarkdown: string;
    }>;

    quizDraft: Array<
        | (DraftCommon & {
        kind: "single_choice";
        options: string[];
        correctOptionIds: string[];
    })
        | (DraftCommon & {
        kind: "multi_choice";
        options: string[];
        correctOptionIds: string[];
    })
        | (DraftCommon & {
        kind: "drag_reorder";
        tokens: string[];
        correctOrder: string[];
    })
        | (DraftCommon & {
        kind: "fill_blank_choice";
        template: string;
        choices: string[];
        correctValue: string;
    })
        | (DraftCommon & {
        kind: "code_input";
        starterCode: string;
        solutionCode: string;
        datasetId?: string;
        recipeType?: "sql_query" | "template_io" | "fixed_tests";
    })
    >;

    projectDraft?: {
        title: string;
        stepIds: string[];
    };
};