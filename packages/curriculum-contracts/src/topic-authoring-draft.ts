export type ExerciseHelpDraft = {
    concept: string;
    hint_1: string;
    hint_2: string;
};

export type ProgrammingCodeInputTestDraft = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
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

    /**
     * Authoring input still uses quizDraft as the general exercise pool.
     *
     * Final publishing rule:
     * - code_input becomes project practice.
     * - non-code exercises become quiz practice.
     */
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
        tests?: ProgrammingCodeInputTestDraft[];
        datasetId?: string;
        recipeType?: "sql_query" | "template_io" | "fixed_tests";

        /**
         * SQL mutation post-check.
         *
         * Required for SQL mutation statements when the compiler cannot infer it.
         * Examples:
         * - INSERT => SELECT inserted row or final table state
         * - UPDATE => SELECT changed rows
         * - DELETE => SELECT final table state
         * - CREATE TABLE => SELECT name, sql FROM sqlite_master
         */
        checkSql?: string;
    })
    >;

    /**
     * Optional authoring hint.
     *
     * The compiler will auto-create a project card for all code_input exercises,
     * even if this is missing.
     */
    projectDraft?: {
        title: string;
        stepIds: string[];
    };
};
