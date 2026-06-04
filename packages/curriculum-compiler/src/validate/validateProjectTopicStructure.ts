type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

export function validateProjectTopicStructure(args: {
    topicBundle: JsonObject;
    filePath: string;
    sectionRole?: string | null;
    moduleRole?: string | null;
}) {
    const { topicBundle, filePath, sectionRole, moduleRole } = args;
    const issues: string[] = [];
    const effectiveRole =
        sectionRole === "capstone" || moduleRole === "capstone"
            ? "capstone"
            : sectionRole === "module_project"
                ? "module_project"
                : null;

    if (!effectiveRole) {
        return issues;
    }

    const cards = Array.isArray(topicBundle.cards) ? topicBundle.cards : [];
    const exercises = Array.isArray(topicBundle.exercises) ? topicBundle.exercises : [];

    const projectCards = cards.filter((card) => asObject(card)?.kind === "project");
    const quizCards = cards.filter((card) => asObject(card)?.kind === "quiz");
    const quizExercises = exercises.filter((exercise) => asObject(exercise)?.purpose === "quiz");

    if (projectCards.length === 0) {
        issues.push(`${filePath}: ${effectiveRole} topic must include a project card`);
    }

    if (quizCards.length > 0) {
        issues.push(`${filePath}: ${effectiveRole} topic must not include a quiz card`);
    }

    if (quizExercises.length > 0) {
        issues.push(`${filePath}: ${effectiveRole} topic must not include quiz-purpose exercises`);
    }

    for (const card of projectCards) {
        const cardObj = asObject(card);
        const project = asObject(cardObj?.project);
        const displayKind = project?.displayKind;
        const uiKind = project?.uiKind;

        if (effectiveRole === "capstone") {
            if (displayKind !== "capstone" || uiKind !== "capstone") {
                issues.push(
                    `${filePath}: capstone topic project card must use capstone display/ui kinds`,
                );
            }
        } else {
            if (displayKind === "capstone" || uiKind === "capstone") {
                issues.push(
                    `${filePath}: module_project topic must not use capstone display/ui kinds`,
                );
            }
        }
    }

    return issues;
}
