import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairReport } from "../../shared/profileServices.js";
import { makeEmptyRepairReport } from "../../shared/noopReports.js";

const PYTHON_TEXT_REPAIRS: Array<{
    from: RegExp;
    to: string;
    fieldLabel: string;
}> = [
    {
        from: /^Focus on the SQL task being asked for, not on copying final query text\.$/i,
        to: "Focus on the programming task being asked for, not on copying the final answer text.",
        fieldLabel: "hint",
    },
    {
        from: /^Build the query from the operation the exercise is testing\.$/i,
        to: "Build the program from the behavior the exercise is testing.",
        fieldLabel: "help.concept",
    },
    {
        from: /^Think about which clauses or functions are required for the task\.$/i,
        to: "Think about which Python statements, functions, or commands are required for the task.",
        fieldLabel: "help.hint_1",
    },
    {
        from: /^Construct the query based on what result the exercise expects, not by repeating exact solution wording\.$/i,
        to: "Construct the code based on the behavior the exercise expects, not by repeating exact solution wording.",
        fieldLabel: "help.hint_2",
    },
];

function rewritePythonLeakText(value: string): {
    next: string;
    changed: boolean;
    fieldLabel?: string;
} {
    for (const repair of PYTHON_TEXT_REPAIRS) {
        if (!repair.from.test(value)) continue;
        return {
            next: repair.to,
            changed: true,
            fieldLabel: repair.fieldLabel,
        };
    }

    return {
        next: value,
        changed: false,
    };
}

type PythonDraftExercise = TopicAuthoringDraft["quizDraft"][number];

function countKinds(draft: TopicAuthoringDraft) {
    return draft.quizDraft.reduce(
        (counts, exercise) => {
            counts[exercise.kind] += 1;
            return counts;
        },
        {
            single_choice: 0,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 0,
            code_input: 0,
        },
    );
}

function looksLikeConditionalTopic(seed: TopicSeed) {
    const haystack = `${seed.topicId} ${seed.title} ${seed.summary}`.toLowerCase();
    return /\bif\b|\belif\b|\belse\b|\bcondition/.test(haystack);
}

function looksLikeTruthinessTopic(seed: TopicSeed) {
    const haystack = `${seed.topicId} ${seed.title} ${seed.summary}`.toLowerCase();
    return /\btruth(y|iness)\b|\bfalsy\b|\bempty\b/.test(haystack);
}

function buildConditionalFillBlankExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Choose the missing conditional keyword",
        prompt: "Fill in the missing Python keyword to continue the conditional chain correctly.",
        template:
            "if score >= 90:\n    print('A')\n___ score >= 80:\n    print('B')\nelse:\n    print('C')",
        choices: ["elif", "for", "def", "while"],
        correctValue: "elif",
        hint: "Choose the Python keyword used for another condition after an if block.",
        help: {
            concept:
                "Python uses `elif` to check another condition after an earlier `if` condition.",
            hint_1:
                "The missing word should continue the same conditional chain.",
            hint_2:
                "It is the keyword that means 'else if' in Python.",
        },
    };
}

function buildGenericFillBlankExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Choose the missing Python keyword",
        prompt: "Fill in the missing Python keyword so the statement is valid.",
        template: "___ value > 0:\n    print('positive')",
        choices: ["if", "for", "def", "class"],
        correctValue: "if",
        hint: "Think about which keyword starts a condition in Python.",
        help: {
            concept:
                "An `if` statement starts a conditional check in Python.",
            hint_1: "This keyword asks Python to test whether a condition is true.",
            hint_2: "It appears before the condition and a colon.",
        },
    };
}

function buildTruthinessCodeInputExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "code_input",
        title: "Check whether a list has items",
        prompt:
            "Read a line of text. Print `True` when the line is not empty and `False` when it is empty.",
        starterCode: "text = input()\n# Your code here\n",
        solutionCode:
            "text = input()\nif text:\n    print(True)\nelse:\n    print(False)\n",
        tests: [
            { stdin: "hello\n", stdout: "True\n", match: "exact" },
            { stdin: "\n", stdout: "False\n", match: "exact" },
        ],
        hint: "Use Python truthiness to decide whether the list has any items.",
        help: {
            concept:
                "In Python, an empty string is falsy and a non-empty string is truthy.",
            hint_1:
                "You can test the text directly in an if statement.",
            hint_2:
                "Print True for non-empty input and False for empty input.",
        },
    };
}

function buildGenericCodeInputExercise(id: string): PythonDraftExercise {
    return {
        id,
        kind: "code_input",
        title: "Print whether a number is positive",
        prompt:
            "Read one integer. Print `True` when the number is greater than 0 and `False` otherwise.",
        starterCode: "n = int(input())\n# Your code here\n",
        solutionCode:
            "n = int(input())\nif n > 0:\n    print(True)\nelse:\n    print(False)\n",
        tests: [
            { stdin: "5\n", stdout: "True\n", match: "exact" },
            { stdin: "0\n", stdout: "False\n", match: "exact" },
        ],
        hint: "Use a conditional check and return a boolean result.",
        help: {
            concept:
                "A conditional can decide which boolean value to print based on a comparison.",
            hint_1:
                "Compare the number with zero inside an if statement.",
            hint_2:
                "Print True when the condition passes; otherwise print False.",
        },
    };
}

function buildFallbackExercise(args: {
    seed: TopicSeed;
    kind: "fill_blank_choice" | "code_input";
    index: number;
}): PythonDraftExercise {
    const id = `policy_${args.kind}_${args.index}`;

    if (args.kind === "fill_blank_choice") {
        if (looksLikeConditionalTopic(args.seed)) {
            return buildConditionalFillBlankExercise(id);
        }

        return buildGenericFillBlankExercise(id);
    }

    if (looksLikeTruthinessTopic(args.seed)) {
        return buildTruthinessCodeInputExercise(id);
    }

    return buildGenericCodeInputExercise(id);
}

function appendPolicyFallbackExercises(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): TopicAuthoringDraft {
    const planned = args.seed.plannedExerciseCounts;
    if (!planned) return args.draft;

    const counts = countKinds(args.draft);
    const nextExercises = [...args.draft.quizDraft];

    let fillBlankIndex = 1;
    let codeInputIndex = 1;

    while (counts.fill_blank_choice < (planned.counts.fill_blank_choice ?? 0)) {
        const exercise = buildFallbackExercise({
            seed: args.seed,
            kind: "fill_blank_choice",
            index: fillBlankIndex,
        });
        fillBlankIndex += 1;
        nextExercises.push(exercise);
        counts.fill_blank_choice += 1;
        args.report.repairs.push({
            code: "PYTHON_POLICY_FILL_BLANK_SYNTHESIZED",
            category: "other",
            severity: "medium",
            field: exercise.id,
            message:
                `Added a fallback fill_blank_choice exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
        });
    }

    while (counts.code_input < (planned.counts.code_input ?? 0)) {
        const exercise = buildFallbackExercise({
            seed: args.seed,
            kind: "code_input",
            index: codeInputIndex,
        });
        codeInputIndex += 1;
        nextExercises.push(exercise);
        counts.code_input += 1;
        args.report.repairs.push({
            code: "PYTHON_POLICY_CODE_INPUT_SYNTHESIZED",
            category: "other",
            severity: "medium",
            field: exercise.id,
            message:
                `Added a fallback code_input exercise to satisfy the planned exercise mix for "${args.seed.topicId}".`,
        });
    }

    return {
        ...args.draft,
        quizDraft: nextExercises,
    };
}

export async function repairPythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const report = makeEmptyRepairReport(args.seed.topicId);

    let nextDraft: TopicAuthoringDraft = {
        ...args.draft,
        quizDraft: args.draft.quizDraft.map((exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            const hintRepair = rewritePythonLeakText(exercise.hint);
            const conceptRepair = rewritePythonLeakText(exercise.help.concept);
            const hint1Repair = rewritePythonLeakText(exercise.help.hint_1);
            const hint2Repair = rewritePythonLeakText(exercise.help.hint_2);

            const changed =
                hintRepair.changed ||
                conceptRepair.changed ||
                hint1Repair.changed ||
                hint2Repair.changed;

            if (!changed) return exercise;

            if (hintRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HINT_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.hint`,
                    message:
                        "Rewrote a SQL-flavored stock hint into Python-specific guidance.",
                });
            }

            if (conceptRepair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.concept`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            if (hint1Repair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.hint_1`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            if (hint2Repair.changed) {
                report.repairs.push({
                    code: "PYTHON_SQL_HELP_LEAK_REPAIRED",
                    category: "text",
                    severity: "medium",
                    field: `${exercise.id}.help.hint_2`,
                    message:
                        "Rewrote SQL-flavored help text into Python-specific guidance.",
                });
            }

            return {
                ...exercise,
                hint: hintRepair.next,
                help: {
                    ...exercise.help,
                    concept: conceptRepair.next,
                    hint_1: hint1Repair.next,
                    hint_2: hint2Repair.next,
                },
            };
        }),
    };

    nextDraft = appendPolicyFallbackExercises({
        seed: args.seed,
        draft: nextDraft,
        report,
    });

    return {
        draft: nextDraft,
        report,
    };
}
