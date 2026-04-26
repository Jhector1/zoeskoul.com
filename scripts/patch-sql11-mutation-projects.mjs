import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(
    "apps/web/src/lib/subjects/sql/modules/module11/topics",
);

function isMutationSql(sql) {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .trim()
        .toLowerCase()
        .match(/^(insert|update|delete|replace|create|drop|alter)\b/) !== null;
}

function stepIdForExerciseId(id) {
    return String(id)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

async function listTopicBundles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const candidate = path.join(full, "topic.bundle.json");
            try {
                await fs.access(candidate);
                files.push(candidate);
            } catch {}
        }
    }

    return files;
}

function ensureProjectCard(bundle, mutationExercises) {
    const topicId = bundle.topicId;

    const steps = mutationExercises.map((exercise) => {
        const stepId = stepIdForExerciseId(exercise.id);

        return {
            id: stepId,
            titleKey: `topics.sql.sql_module_11.${topicId}.projectSteps.${stepId}.title`,
            exerciseKey: exercise.id,
            difficulty: "easy",
            preferKind: "code_input",
            seedPolicy: "global",
            maxAttempts: 10,
        };
    });

    const projectCard = bundle.cards.find((card) => card.kind === "project");

    if (projectCard) {
        projectCard.titleKey =
            projectCard.titleKey ??
            `topics.sql.sql_module_11.${topicId}.cards.project.title`;

        projectCard.project = {
            difficulty: projectCard.project?.difficulty ?? "easy",
            allowReveal: projectCard.project?.allowReveal ?? true,
            preferKind: "code_input",
            maxAttempts: projectCard.project?.maxAttempts ?? 10,
            steps,
        };

        return;
    }

    const newProjectCard = {
        id: "project",
        kind: "project",
        titleKey: `topics.sql.sql_module_11.${topicId}.cards.project.title`,
        project: {
            difficulty: "easy",
            allowReveal: true,
            preferKind: "code_input",
            maxAttempts: 10,
            steps,
        },
    };

    const quizIndex = bundle.cards.findIndex((card) => card.kind === "quiz");

    if (quizIndex >= 0) {
        bundle.cards.splice(quizIndex + 1, 0, newProjectCard);
    } else {
        bundle.cards.push(newProjectCard);
    }
}

function fixQuizCardCount(bundle) {
    const quizCard = bundle.cards.find((card) => card.kind === "quiz");
    if (!quizCard?.quiz) return;

    const quizExercises = bundle.exercises.filter(
        (exercise) => exercise.purpose === "quiz",
    );

    if (quizExercises.length === 0) {
        bundle.cards = bundle.cards.filter((card) => card.kind !== "quiz");
        return;
    }

    quizCard.quiz.n = Math.min(quizCard.quiz.n ?? 2, quizExercises.length);
}

async function patchFile(file) {
    const raw = await fs.readFile(file, "utf8");
    const bundle = JSON.parse(raw);

    if (!Array.isArray(bundle.exercises)) return null;

    const mutationExercises = bundle.exercises.filter((exercise) => {
        return (
            exercise.kind === "code_input" &&
            exercise.recipe?.type === "sql_query" &&
            isMutationSql(exercise.recipe.solutionCode)
        );
    });

    if (mutationExercises.length === 0) return null;

    for (const exercise of mutationExercises) {
        exercise.purpose = "project";

        if (!exercise.recipe.checkSql) {
            console.warn(
                `WARNING: ${bundle.topicId}/${exercise.id} is mutation SQL but has no checkSql`,
            );
        }
    }

    ensureProjectCard(bundle, mutationExercises);
    fixQuizCardCount(bundle);

    await fs.writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`);

    return {
        topicId: bundle.topicId,
        mutations: mutationExercises.map((x) => x.id),
    };
}

const files = await listTopicBundles(ROOT);
const changed = [];

for (const file of files) {
    const result = await patchFile(file);
    if (result) changed.push(result);
}

console.log("Patched SQL module 11 mutation topics:");
console.log(JSON.stringify(changed, null, 2));