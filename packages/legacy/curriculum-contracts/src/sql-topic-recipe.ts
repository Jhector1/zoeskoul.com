export type SqlExerciseLink = {
    targetConceptIds: string[];
    targetObjectiveIds: string[];
};

export type SqlSketchRecipe = {
    cardTitle: string;
    title: string;
    bodyMarkdown: string;
};

export type SqlObjectiveRecipe = {
    statement: string;
};

export type SqlExerciseCommon = SqlExerciseLink & {
    id: string;
    title: string;
    conceptText?: string;
    prompt: string;
    hint?: string;
    hint1?: string;
    hint2?: string;
};

export type SqlPracticeRecipe = SqlExerciseCommon & {
    kind: "code_input";
    datasetId: string;
    starterCode: string;
    solutionCode: string;
};

export type SqlSingleChoiceRecipe = SqlExerciseCommon & {
    kind: "single_choice";
    options: Record<"a" | "b" | "c" | "d", string>;
    correct: "a" | "b" | "c" | "d";
};

export type SqlMultiChoiceRecipe = SqlExerciseCommon & {
    kind: "multi_choice";
    options: Record<"a" | "b" | "c" | "d" | "e", string>;
    correct: Array<"a" | "b" | "c" | "d" | "e">;
};

export type SqlReorderRecipe = SqlExerciseCommon & {
    kind: "drag_reorder";
    tokens: {
        t1: string;
        t2: string;
        t3: string;
    };
    correct: ["t1", "t2", "t3"];
};

export type SqlFillBlankRecipe = SqlExerciseCommon & {
    kind: "fill_blank_choice";
    template: string;
    choices: [string, string, string, string];
    correct: string;
};

export type SqlTopicExerciseRecipe =
    | SqlPracticeRecipe
    | SqlSingleChoiceRecipe
    | SqlMultiChoiceRecipe
    | SqlReorderRecipe
    | SqlFillBlankRecipe;

export type SqlTopicRecipe = {
    topicId: string;
    title: string;
    summary: string;
    minutes: number;
    objectives: Record<string, SqlObjectiveRecipe>;
    sketches: Record<string, SqlSketchRecipe>;
    exercises: SqlTopicExerciseRecipe[];
};