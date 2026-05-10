import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

function stripPythonComments(source: string): string {
    return source
        .split("\n")
        .map((line) => line.replace(/#.*$/, ""))
        .join("\n");
}

function normalizeCodeForCompare(source: unknown): string {
    return stripPythonComments(String(source ?? ""))
        .replace(/\s+/g, "")
        .trim();
}

export function validateStarterCodeDoesNotRevealSolution(args: {
    draft: TopicAuthoringDraft;
    location: string;
}) {
    const failures: string[] = [];

    for (const exercise of args.draft.quizDraft ?? []) {
        if (exercise.kind !== "code_input") continue;

        const starter = normalizeCodeForCompare(exercise.starterCode);
        const solution = normalizeCodeForCompare(exercise.solutionCode);

        if (!starter || !solution) continue;

        if (starter === solution) {
            failures.push(
                `${exercise.id}: starterCode is identical to solutionCode after removing comments and whitespace.`,
            );
        }
    }

    if (failures.length > 0) {
        throw new Error(
            [
                `Starter code reveals solution at ${args.location}`,
                "",
                ...failures.map((failure) => `- ${failure}`),
                "",
                "Starter code should scaffold the task, not contain the completed solution.",
            ].join("\n"),
        );
    }
}