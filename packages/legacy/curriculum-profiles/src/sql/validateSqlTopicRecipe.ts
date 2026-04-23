import type {
    SqlTopicExerciseRecipe,
    SqlTopicRecipe,
} from "@zoeskoul/curriculum-contracts";

export type SqlTopicRecipeIssue = {
    severity: "error" | "warn";
    code: string;
    message: string;
};

function normalize(text: unknown): string {
    if (typeof text !== "string") return "";
    return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashLike(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return String(h);
}

function ensureNonEmptyString(
    value: unknown,
    label: string,
    issues: SqlTopicRecipeIssue[],
) {
    if (typeof value !== "string" || !value.trim()) {
        issues.push({
            severity: "error",
            code: "empty_string",
            message: `${label} must be a non-empty string`,
        });
    }
}

function validateExerciseLinks(
    exercise: SqlTopicExerciseRecipe,
    conceptIds: Set<string>,
    objectiveIds: Set<string>,
    issues: SqlTopicRecipeIssue[],
) {
    if (!exercise.targetConceptIds.length) {
        issues.push({
            severity: "error",
            code: "missing_target_concepts",
            message: `exercise "${exercise.id}" is missing targetConceptIds`,
        });
    }

    if (!exercise.targetObjectiveIds.length) {
        issues.push({
            severity: "error",
            code: "missing_target_objectives",
            message: `exercise "${exercise.id}" is missing targetObjectiveIds`,
        });
    }

    for (const conceptId of exercise.targetConceptIds) {
        if (!conceptIds.has(conceptId)) {
            issues.push({
                severity: "error",
                code: "unknown_target_concept",
                message: `exercise "${exercise.id}" targets unknown concept "${conceptId}"`,
            });
        }
    }

    for (const objectiveId of exercise.targetObjectiveIds) {
        if (!objectiveIds.has(objectiveId)) {
            issues.push({
                severity: "error",
                code: "unknown_target_objective",
                message: `exercise "${exercise.id}" targets unknown objective "${objectiveId}"`,
            });
        }
    }
}

function exerciseFingerprint(exercise: SqlTopicExerciseRecipe): string {
    const base = {
        kind: exercise.kind,
        prompt: normalize(exercise.prompt),
        title: normalize(exercise.title),
        targetConceptIds: [...exercise.targetConceptIds].sort(),
        targetObjectiveIds: [...exercise.targetObjectiveIds].sort(),
    };

    switch (exercise.kind) {
        case "code_input":
            return hashLike(
                JSON.stringify({
                    ...base,
                    datasetId: normalize(exercise.datasetId),
                    starterCode: normalize(exercise.starterCode),
                    solutionCode: normalize(exercise.solutionCode),
                }),
            );

        case "single_choice":
            return hashLike(
                JSON.stringify({
                    ...base,
                    options: Object.values(exercise.options).map(normalize),
                    correct: exercise.correct,
                }),
            );

        case "multi_choice":
            return hashLike(
                JSON.stringify({
                    ...base,
                    options: Object.values(exercise.options).map(normalize),
                    correct: [...exercise.correct].sort(),
                }),
            );

        case "drag_reorder":
            return hashLike(
                JSON.stringify({
                    ...base,
                    tokens: Object.values(exercise.tokens).map(normalize),
                    correct: exercise.correct,
                }),
            );

        case "fill_blank_choice":
            return hashLike(
                JSON.stringify({
                    ...base,
                    template: normalize(exercise.template),
                    choices: exercise.choices.map(normalize),
                    correct: normalize(exercise.correct),
                }),
            );
    }
}

function looksGenericFallback(exercise: SqlTopicExerciseRecipe): boolean {
    const joined = normalize(
        [
            exercise.title,
            exercise.prompt,
            exercise.kind === "fill_blank_choice" ? exercise.template : "",
            exercise.kind === "code_input" ? exercise.starterCode : "",
        ].join(" | "),
    );

    const badPatterns = [
        "a very common sql query starts with",
        "show id, name, and price",
        "select id, name, price from products limit 5",
        "workflow for",
        "think understand -> write -> verify",
        "starter keyword",
    ];

    return badPatterns.some((x) => joined.includes(x));
}

export function validateSqlTopicRecipe(recipe: SqlTopicRecipe): SqlTopicRecipeIssue[] {
    const issues: SqlTopicRecipeIssue[] = [];

    ensureNonEmptyString(recipe.topicId, "topicId", issues);
    ensureNonEmptyString(recipe.title, "title", issues);
    ensureNonEmptyString(recipe.summary, "summary", issues);

    if (!Number.isFinite(recipe.minutes) || recipe.minutes <= 0) {
        issues.push({
            severity: "error",
            code: "invalid_minutes",
            message: "minutes must be a positive number",
        });
    }

    const conceptIds = new Set(Object.keys(recipe.sketches));
    const objectiveIds = new Set(Object.keys(recipe.objectives));

    if (!conceptIds.size) {
        issues.push({
            severity: "error",
            code: "missing_sketches",
            message: "recipe must contain at least one sketch concept",
        });
    }

    if (!objectiveIds.size) {
        issues.push({
            severity: "error",
            code: "missing_objectives",
            message: "recipe must contain at least one objective",
        });
    }

    for (const [sketchId, sketch] of Object.entries(recipe.sketches)) {
        ensureNonEmptyString(sketchId, "sketch id", issues);
        ensureNonEmptyString(sketch.cardTitle, `sketches.${sketchId}.cardTitle`, issues);
        ensureNonEmptyString(sketch.title, `sketches.${sketchId}.title`, issues);
        ensureNonEmptyString(sketch.bodyMarkdown, `sketches.${sketchId}.bodyMarkdown`, issues);
    }

    for (const [objectiveId, objective] of Object.entries(recipe.objectives)) {
        ensureNonEmptyString(objectiveId, "objective id", issues);
        ensureNonEmptyString(
            objective.statement,
            `objectives.${objectiveId}.statement`,
            issues,
        );
    }

    const fingerprints = new Map<string, string>();

    for (const exercise of recipe.exercises) {
        ensureNonEmptyString(exercise.id, "exercise.id", issues);
        ensureNonEmptyString(exercise.title, `exercise.${exercise.id}.title`, issues);
        ensureNonEmptyString(exercise.prompt, `exercise.${exercise.id}.prompt`, issues);

        validateExerciseLinks(exercise, conceptIds, objectiveIds, issues);

        if (exercise.kind === "code_input") {
            ensureNonEmptyString(
                exercise.datasetId,
                `exercise.${exercise.id}.datasetId`,
                issues,
            );
            ensureNonEmptyString(
                exercise.starterCode,
                `exercise.${exercise.id}.starterCode`,
                issues,
            );
            ensureNonEmptyString(
                exercise.solutionCode,
                `exercise.${exercise.id}.solutionCode`,
                issues,
            );
        }

        if (exercise.kind === "fill_blank_choice") {
            ensureNonEmptyString(
                exercise.template,
                `exercise.${exercise.id}.template`,
                issues,
            );
        }

        const fp = exerciseFingerprint(exercise);
        const previous = fingerprints.get(fp);
        if (previous) {
            issues.push({
                severity: "error",
                code: "duplicate_exercise",
                message: `exercise "${exercise.id}" duplicates "${previous}"`,
            });
        } else {
            fingerprints.set(fp, exercise.id);
        }

        if (looksGenericFallback(exercise)) {
            issues.push({
                severity: "warn",
                code: "generic_fallback",
                message: `exercise "${exercise.id}" appears to use generic fallback content`,
            });
        }
    }

    return issues;
}

export function assertValidSqlTopicRecipe(
    recipe: SqlTopicRecipe,
    args?: { failOnWarnings?: boolean },
): void {
    const failOnWarnings = args?.failOnWarnings ?? false;
    const issues = validateSqlTopicRecipe(recipe);

    const blocking = issues.filter(
        (issue) => issue.severity === "error" || failOnWarnings,
    );

    if (blocking.length) {
        throw new Error(
            [
                `Invalid SQL topic recipe for "${recipe.topicId}"`,
                ...issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`),
            ].join("\n"),
        );
    }
}