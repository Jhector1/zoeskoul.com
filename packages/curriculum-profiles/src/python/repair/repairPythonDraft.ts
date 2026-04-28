import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { getCodeRunner, runLocalCode } from "@zoeskoul/curriculum-runtime";
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

function hasMultilineCodeFence(text: string): boolean {
    const matches = Array.from(text.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g));
    return matches.some((match) => {
        const block = match[1] ?? "";
        const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        return lines.length >= 2;
    });
}

function hasLineByLineExplanation(text: string): boolean {
    return (
        /\bline by line\b/i.test(text) ||
        /\beach line\b/i.test(text) ||
        /\bthis line\b/i.test(text) ||
        /\bfirst line\b/i.test(text) ||
        /\bsecond line\b/i.test(text) ||
        /\bstep by step\b/i.test(text)
    );
}

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
type PythonCodeInputExercise = Extract<PythonDraftExercise, { kind: "code_input" }>;

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

function hasClassDefinition(exercise: PythonCodeInputExercise): boolean {
    return /^class\s+[A-Za-z_]\w*\b/m.test(
        `${exercise.starterCode}\n${exercise.solutionCode}`,
    );
}

function hasTopLevelFunctionDefinition(exercise: PythonCodeInputExercise): boolean {
    return /^def\s+[A-Za-z_]\w*\s*\(/m.test(
        `${exercise.starterCode}\n${exercise.solutionCode}`,
    );
}

function synthesizeMissingTestsForExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (Array.isArray(exercise.tests) && exercise.tests.length > 0) {
        return null;
    }

    const canSafelySynthesize =
        hasInputCalls(exercise) ||
        (!hasClassDefinition(exercise) && hasTopLevelFunctionDefinition(exercise));

    if (!canSafelySynthesize) {
        return null;
    }

    const haystack = `${exercise.title} ${exercise.prompt} ${exercise.solutionCode}`.toLowerCase();

    if (
        /\bpositive\b/.test(haystack) &&
        /\bnegative\b/.test(haystack) &&
        /\bzero\b/.test(haystack)
    ) {
        return {
            ...exercise,
            tests: [
                { stdin: "5\n", stdout: "Positive\n", match: "exact" },
                { stdin: "-2\n", stdout: "Negative\n", match: "exact" },
                { stdin: "0\n", stdout: "Zero\n", match: "exact" },
            ],
        };
    }

    if (/\btruth(y|iness)\b|\bfalsy\b|\bbool\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "''\n", stdout: "False\n", match: "exact" },
                { stdin: "'Hello'\n", stdout: "True\n", match: "exact" },
            ],
        };
    }

    if (/\bgreater than 10\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "15\n", stdout: "True\n", match: "exact" },
                { stdin: "5\n", stdout: "False\n", match: "exact" },
            ],
        };
    }

    if (/\bgreater than 0\b|\bpositive\b/.test(haystack)) {
        return {
            ...exercise,
            tests: [
                { stdin: "5\n", stdout: "True\n", match: "exact" },
                { stdin: "0\n", stdout: "False\n", match: "exact" },
            ],
        };
    }

    return null;
}

function hasOnlyBooleanishOutputs(exercise: PythonCodeInputExercise): boolean {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return false;

    return tests.every((test) => {
        const out = String(test.stdout ?? "").trim().toLowerCase();
        return out === "true" || out === "false";
    });
}

function looksLikePlaceholderStdout(stdout: unknown): boolean {
    const out = String(stdout ?? "").trim();
    if (!out) return false;

    return (
        /\bshould\b/i.test(out) ||
        /^(expected|output|result)\b/i.test(out) ||
        /\bplaceholder\b/i.test(out)
    );
}

function hasOnlyPlaceholderOutputs(exercise: PythonCodeInputExercise): boolean {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length < 1) return false;

    return tests.every((test) => looksLikePlaceholderStdout(test.stdout));
}

function hasNoTests(exercise: PythonCodeInputExercise): boolean {
    return !Array.isArray(exercise.tests) || exercise.tests.length < 1;
}

function hasMissingOrBooleanishTests(exercise: PythonCodeInputExercise): boolean {
    return (
        hasNoTests(exercise) ||
        hasOnlyBooleanishOutputs(exercise) ||
        hasOnlyPlaceholderOutputs(exercise)
    );
}

function hasInputCalls(exercise: PythonCodeInputExercise): boolean {
    const haystack = `${exercise.starterCode}\n${exercise.solutionCode}`;
    return /\binput\s*\(/.test(haystack);
}

async function rewritePlaceholderTestsFromSolutionExecution(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasOnlyBooleanishOutputs(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) return null;

    const runner = getCodeRunner() ?? runLocalCode;
    const run = await runner({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;

    const stdout = String(run.stdout ?? "");
    if (!stdout.trim()) return null;

    const normalized = stdout.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return null;

    return {
        ...exercise,
        tests: [
            {
                stdin: "",
                stdout,
                match: "exact",
            },
        ],
    };
}

function rewriteHardcodedPromptAlignedExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (!hasOnlyBooleanishOutputs(exercise)) return null;

    const haystack = `${exercise.title} ${exercise.prompt} ${exercise.solutionCode}`.toLowerCase();

    if (/\beligible\b/.test(haystack) && /\bnot eligible\b/.test(haystack)) {
        return {
            ...exercise,
            starterCode:
                "age = int(input())\nis_citizen = input().strip().lower() == 'true'\n# Your code here",
            solutionCode:
                "age = int(input())\nis_citizen = input().strip().lower() == 'true'\nif age >= 18 and is_citizen:\n    print('Eligible')\nelse:\n    print('Not eligible')",
            tests: [
                { stdin: "20\ntrue\n", stdout: "Eligible\n", match: "exact" },
                { stdin: "16\ntrue\n", stdout: "Not eligible\n", match: "exact" },
                { stdin: "20\nfalse\n", stdout: "Not eligible\n", match: "exact" },
            ],
        };
    }

    if (
        /\bgrade\b/.test(haystack) &&
        /print\('a'\)|print\("a"\)|print\('b'\)|print\("b"\)|print\('c'\)|print\("c"\)|print\('f'\)|print\("f"\)/i.test(
            exercise.solutionCode,
        )
    ) {
        return {
            ...exercise,
            starterCode: "grade = int(input())\n# Your code here",
            solutionCode:
                "grade = int(input())\nif grade >= 90:\n    print('A')\nelif grade >= 80:\n    print('B')\nelif grade >= 70:\n    print('C')\nelse:\n    print('F')",
            tests: [
                { stdin: "95\n", stdout: "A\n", match: "exact" },
                { stdin: "85\n", stdout: "B\n", match: "exact" },
                { stdin: "72\n", stdout: "C\n", match: "exact" },
                { stdin: "50\n", stdout: "F\n", match: "exact" },
            ],
        };
    }

    return null;
}

function extractFunctionSignature(exercise: PythonCodeInputExercise): {
    name: string;
    params: string[];
} | null {
    const sources = [exercise.starterCode, exercise.solutionCode, exercise.prompt];

    for (const source of sources) {
        const match = String(source ?? "").match(
            /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/,
        );
        if (!match) continue;

        const name = match[1]?.trim();
        const params = String(match[2] ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => part.split("=")[0]?.trim() ?? "")
            .map((part) => part.split(":")[0]?.trim() ?? "")
            .filter(Boolean);

        if (!name) continue;
        return { name, params };
    }

    return null;
}

function looksLikeFunctionReturnExercise(exercise: PythonCodeInputExercise): boolean {
    const prompt = String(exercise.prompt ?? "").toLowerCase();
    const starterCode = String(exercise.starterCode ?? "");
    const solutionCode = String(exercise.solutionCode ?? "");
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    const looksLikeFunctionExercise =
        /\b(create|write|define)\s+a?\s*function\b/.test(prompt) ||
        /\breturn\b/.test(prompt) ||
        starterCode.trimStart().startsWith("def ");
    const usesStdoutTests = tests.some(
        (test) =>
            typeof test.stdout === "string" &&
            test.stdout.trim().length > 0 &&
            !looksLikePlaceholderStdout(test.stdout),
    );
    const solutionPrints = /\bprint\s*\(/.test(solutionCode);

    return looksLikeFunctionExercise && usesStdoutTests && !solutionPrints;
}

function buildFunctionStdoutWrapper(args: {
    functionName: string;
    params: string[];
}): string {
    const assignments =
        args.params.length > 0
            ? args.params
                  .map(
                      (param, index) =>
                          `${param} = _parse_arg(_inputs[${index}]) if len(_inputs) > ${index} else ""`,
                  )
                  .join("\n")
            : "";
    const invocation =
        args.params.length > 0
            ? `${args.functionName}(${args.params.join(", ")})`
            : `${args.functionName}()`;

    return [
        "",
        "import ast",
        "",
        "def _parse_arg(raw):",
        "    try:",
        "        return ast.literal_eval(raw)",
        "    except Exception:",
        "        return raw",
        "",
        "_inputs = []",
        "try:",
        "    while True:",
        "        _inputs.append(input())",
        "except EOFError:",
        "    pass",
        ...(assignments ? [assignments, ""] : []),
        `print(${invocation})`,
        "",
    ].join("\n");
}

function rewriteFunctionReturnExercise(
    exercise: PythonCodeInputExercise,
): PythonCodeInputExercise | null {
    if (!looksLikeFunctionReturnExercise(exercise)) return null;

    const signature = extractFunctionSignature(exercise);
    if (!signature) return null;

    const wrapper = buildFunctionStdoutWrapper({
        functionName: signature.name,
        params: signature.params,
    });
    const prompt = String(exercise.prompt ?? "").trim();
    const needsPromptAppend = !/\bprint\b/i.test(prompt);
    const helperSentence =
        signature.params.length === 1
            ? " Then read the input value, call the function, and print the returned result."
            : " Then read the input values, call the function, and print the returned result.";

    return {
        ...exercise,
        prompt: needsPromptAppend ? `${prompt}${helperSentence}` : prompt,
        starterCode: `${String(exercise.starterCode ?? "").trimEnd()}\n${wrapper}`,
        solutionCode: `${String(exercise.solutionCode ?? "").trimEnd()}\n${wrapper}`,
    };
}

function looksLikeEmbeddedPythonHarness(stdin: string): boolean {
    const lines = String(stdin ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 1) return false;

    return lines.some(
        (line) =>
            /^[A-Za-z_]\w*\s*=/.test(line) ||
            /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\(.*\)$/.test(line),
    );
}

function looksLikeBareClassInstantiationLine(line: string): boolean {
    return /^[A-Z][A-Za-z_]\w*\s*\(.*\)$/.test(String(line ?? "").trim());
}

function wrapFinalHarnessExpression(lines: string[]): string[] {
    if (lines.length < 1) return lines;

    const next = [...lines];
    const lastIndex = next.length - 1;
    const last = next[lastIndex]?.trim() ?? "";

    if (!last) return next;
    if (/^print\s*\(/.test(last)) return next;
    if (/^[A-Za-z_]\w*\s*=/.test(last)) return next;
    if (looksLikeBareClassInstantiationLine(last)) return next;
    if (/^(if|elif|else|for|while|def|class|return|import|from)\b/.test(last)) {
        return next;
    }

    next[lastIndex] = `print(${last})`;
    return next;
}

function normalizePythonLineForHarnessCompare(line: string): string {
    return String(line ?? "")
        .replace(/\s+#.*$/, "")
        .trim();
}

function sourceAlreadyContainsHarnessLine(source: string, harnessLine: string): boolean {
    const normalizedHarnessLine = normalizePythonLineForHarnessCompare(harnessLine);
    if (!normalizedHarnessLine) return true;

    return String(source ?? "")
        .split("\n")
        .some(
            (line) =>
                normalizePythonLineForHarnessCompare(line) === normalizedHarnessLine,
        );
}

function appendMissingHarness(source: string, harnessLines: string[]): string {
    const missingLines = harnessLines.filter(
        (line) => !sourceAlreadyContainsHarnessLine(source, line),
    );

    if (missingLines.length < 1) return String(source ?? "").trimEnd();

    return `${String(source ?? "").trimEnd()}\n\n${missingLines.join("\n")}`;
}

async function rewriteEmbeddedHarnessStyleExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
    if (tests.length !== 1) return null;
    if (hasInputCalls(exercise)) return null;

    const stdin = String(tests[0]?.stdin ?? "");
    if (!looksLikeEmbeddedPythonHarness(stdin)) return null;

    const harnessLines = wrapFinalHarnessExpression(
        stdin
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0),
    );
    if (harnessLines.length < 1) return null;

    const withHarness: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Use the provided object creation code to print the final result.`,
        starterCode: appendMissingHarness(
            String(exercise.starterCode ?? ""),
            harnessLines,
        ),
        solutionCode: appendMissingHarness(
            String(exercise.solutionCode ?? ""),
            harnessLines,
        ),
        tests: [
            {
                stdin: "",
                stdout: String(tests[0]?.stdout ?? ""),
                match: tests[0]?.match ?? "exact",
            },
        ],
    };

    return (await makeTestsFromNoInputSolution(withHarness)) ?? withHarness;
}

function insertClassMethodIfMissing(args: {
    source: string;
    className: string;
    methodName: string;
    methodLines: string[];
}): string {
    const source = String(args.source ?? "");
    const methodPattern = new RegExp(`^    def\\s+${args.methodName}\\b`, "m");
    if (methodPattern.test(source)) return source;

    const lines = source.split("\n");
    const classIndex = lines.findIndex((line) =>
        new RegExp(`^class\\s+${args.className}\\b.*:\\s*$`).test(line),
    );
    if (classIndex < 0) return source;

    let insertAt = lines.length;

    for (let index = classIndex + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line.trim() && !/^\s/.test(line)) {
            insertAt = index;
            break;
        }
    }

    const before = lines.slice(0, insertAt);
    const after = lines.slice(insertAt);
    const spacer =
        before.length > 0 && String(before[before.length - 1] ?? "").trim()
            ? [""]
            : [];

    return [...before, ...spacer, ...args.methodLines, "", ...after].join("\n").trimEnd();
}

async function rewriteMissingOopSupportMethods(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    const solutionCode = String(exercise.solutionCode ?? "");

    if (!/\.get_balance\s*\(/.test(solutionCode)) return null;
    if (/^    def\s+get_balance\b/m.test(solutionCode)) return null;
    if (!/self\.__balance\b/.test(solutionCode)) return null;

    const classMatch = solutionCode.match(/^class\s+([A-Za-z_]\w*)\b.*:\s*$/m);
    const className = classMatch?.[1];
    if (!className) return null;

    const starterCode = insertClassMethodIfMissing({
        source: String(exercise.starterCode ?? ""),
        className,
        methodName: "get_balance",
        methodLines: [
            "    def get_balance(self):",
            "        return self.__balance",
        ],
    });
    const repairedSolutionCode = insertClassMethodIfMissing({
        source: solutionCode,
        className,
        methodName: "get_balance",
        methodLines: [
            "    def get_balance(self):",
            "        return self.__balance",
        ],
    });

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        starterCode,
        solutionCode: repairedSolutionCode,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

type PythonClassDefinition = {
    name: string;
    header: string;
    methods: Map<string, string[]>;
};

function extractPythonClassDefinitions(source: string): PythonClassDefinition[] {
    const lines = String(source ?? "").split("\n");
    const definitions: PythonClassDefinition[] = [];

    for (let i = 0; i < lines.length; i += 1) {
        const header = lines[i] ?? "";
        const match = header.match(/^class\s+([A-Za-z_]\w*)\b.*:\s*$/);
        if (!match) continue;

        const blockLines = [header];
        let j = i + 1;

        while (j < lines.length) {
            const line = lines[j] ?? "";
            if (line.trim() && !/^\s/.test(line)) break;
            blockLines.push(line);
            j += 1;
        }

        const methods = new Map<string, string[]>();

        for (let k = 1; k < blockLines.length; k += 1) {
            const methodMatch = (blockLines[k] ?? "").match(/^    def\s+([A-Za-z_]\w*)\b/);
            if (!methodMatch) continue;

            const methodName = methodMatch[1]!;
            const methodLines = [blockLines[k] ?? ""];
            let m = k + 1;

            while (m < blockLines.length) {
                const line = blockLines[m] ?? "";
                if (/^    def\s+[A-Za-z_]\w*\b/.test(line)) break;
                if (line.trim() && !/^ {5,}|\t/.test(line)) break;
                methodLines.push(line);
                m += 1;
            }

            methods.set(methodName, methodLines);
        }

        definitions.push({
            name: match[1]!,
            header,
            methods,
        });
        i = j - 1;
    }

    return definitions;
}

function mergeClassDefinitions(
    exercises: readonly PythonDraftExercise[],
): Map<string, PythonClassDefinition> {
    const merged = new Map<string, PythonClassDefinition>();

    for (const exercise of exercises) {
        if (exercise.kind !== "code_input") continue;

        for (const definition of extractPythonClassDefinitions(exercise.solutionCode)) {
            const existing = merged.get(definition.name);

            if (!existing) {
                merged.set(definition.name, {
                    name: definition.name,
                    header: definition.header,
                    methods: new Map(definition.methods),
                });
                continue;
            }

            for (const [methodName, methodLines] of definition.methods) {
                existing.methods.set(methodName, methodLines);
            }
        }
    }

    return merged;
}

function renderClassDefinition(definition: PythonClassDefinition): string {
    const methodBlocks = Array.from(definition.methods.values())
        .map((lines) => lines.join("\n").trimEnd())
        .filter(Boolean);

    if (methodBlocks.length < 1) {
        return `${definition.header}\n    pass`;
    }

    return `${definition.header}\n${methodBlocks.join("\n\n")}`;
}

function referencesClass(source: string, className: string): boolean {
    return new RegExp(`\\b${className}\\s*\\(`).test(source);
}

function referencesName(source: string, name: string): boolean {
    return new RegExp(`\\b${name}\\b`).test(source);
}

function definesTopLevelName(source: string, name: string): boolean {
    return new RegExp(`^${name}\\s*=`, "m").test(source);
}

function extractTopLevelSetupDefinitions(source: string): Map<string, string[]> {
    const lines = String(source ?? "").split("\n");
    const definitions = new Map<string, string[]>();
    const setupLines: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";

        if (/^(class|def)\s+[A-Za-z_]\w*/.test(line)) {
            index += 1;
            while (index < lines.length) {
                const nextLine = lines[index] ?? "";
                if (nextLine.trim() && !/^\s/.test(nextLine)) {
                    index -= 1;
                    break;
                }
                index += 1;
            }
            continue;
        }

        const assignmentMatch = line.match(/^([A-Za-z_]\w*)\s*=/);
        if (!assignmentMatch) continue;

        setupLines.push(line);
        definitions.set(assignmentMatch[1]!, [...setupLines]);
    }

    return definitions;
}

function mergeTopLevelSetupDefinitions(
    exercises: readonly PythonDraftExercise[],
): Map<string, string[]> {
    const merged = new Map<string, string[]>();

    for (const exercise of exercises) {
        if (exercise.kind !== "code_input") continue;

        for (const [name, lines] of extractTopLevelSetupDefinitions(exercise.solutionCode)) {
            if (!merged.has(name)) {
                merged.set(name, lines);
            }
        }
    }

    return merged;
}

async function makeTestsFromNoInputSolution(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "").trim();
    if (!solutionCode) return null;

    const runner = getCodeRunner() ?? runLocalCode;
    const run = await runner({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;

    const stdout = String(run.stdout ?? "");
    if (!stdout.trim()) return null;

    return {
        ...exercise,
        tests: [
            {
                stdin: "",
                stdout,
                match: "exact",
            },
        ],
    };
}

function rewriteLastTopLevelExpressionAsPrint(source: string): string | null {
    const lines = String(source ?? "").split("\n");

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index] ?? "";
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;
        if (/^\s/.test(line)) return null;

        const wrapped = wrapFinalHarnessExpression([trimmed])[0] ?? trimmed;
        if (wrapped === trimmed || !wrapped.startsWith("print(")) return null;

        lines[index] = wrapped;
        return lines.join("\n").trimEnd();
    }

    return null;
}

async function rewriteNoInputFinalExpressionExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = rewriteLastTopLevelExpressionAsPrint(
        String(exercise.solutionCode ?? ""),
    );
    if (!solutionCode) return null;

    const starterCode =
        rewriteLastTopLevelExpressionAsPrint(String(exercise.starterCode ?? "")) ??
        String(exercise.starterCode ?? "");

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Print the final result so it can be checked.`,
        starterCode,
        solutionCode,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? null;
}

function findLastListAssignmentName(source: string): string | null {
    const matches = Array.from(
        String(source ?? "").matchAll(/^([A-Za-z_]\w*)\s*=\s*\[/gm),
    );
    const last = matches[matches.length - 1];
    return last?.[1] ?? null;
}

function pythonLiteralForConstructorParam(paramName: string): string {
    const normalized = paramName.toLowerCase();

    if (/\b(age|count|quantity|amount|balance|score|grade)\b/.test(normalized)) {
        return "1";
    }

    if (/\byear\b/.test(normalized)) return "2020";
    if (/\bpages?\b/.test(normalized)) return "328";
    if (/\b(active|enabled|citizen|valid)\b/.test(normalized)) {
        return "True";
    }
    if (/\btitle\b/.test(normalized)) return "'1984'";
    if (/\bauthor\b/.test(normalized)) return "'George Orwell'";
    if (/\bmake|brand\b/.test(normalized)) return "'Toyota'";
    if (/\bmodel\b/.test(normalized)) {
        return "'Corolla'";
    }
    if (/\bname\b/.test(normalized)) {
        return "'Alex'";
    }

    return "'Example'";
}

function variableNameForClass(className: string): string {
    const base = `${className.charAt(0).toLowerCase()}${className.slice(1)}`;
    return /^[A-Za-z_]\w*$/.test(base) ? base : "obj";
}

function extractInitParams(source: string, className: string): string[] {
    const classPattern = new RegExp(
        `class\\s+${className}\\b[\\s\\S]*?def\\s+__init__\\s*\\(([^)]*)\\)\\s*:`,
    );
    const match = String(source ?? "").match(classPattern);
    if (!match) return [];

    return String(match[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.split("=")[0]?.trim() ?? "")
        .map((part) => part.split(":")[0]?.trim() ?? "")
        .filter((part) => part && part !== "self");
}

function buildNoInputClassMethodHarness(source: string): string[] | null {
    const classMatch = String(source ?? "").match(
        /^class\s+([A-Za-z_]\w*)\b.*:\s*$/m,
    );

    const className = classMatch?.[1];
    if (!className) return null;

    const constructorParams = extractInitParams(source, className);
    const publicZeroArgMethods = Array.from(
        String(source ?? "").matchAll(
            /^    def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/gm,
        ),
    )
        .map((match) => {
            const name = match[1] ?? "";
            const params = String(match[2] ?? "")
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part) => part.split("=")[0]?.trim() ?? "")
                .map((part) => part.split(":")[0]?.trim() ?? "");

            return { name, params };
        })
        .filter((method) => method.name !== "__init__")
        .filter((method) => !method.name.startsWith("_"))
        .filter((method) => {
            const nonSelfParams = method.params.filter((param) => param !== "self");
            return nonSelfParams.length === 0;
        });

    if (publicZeroArgMethods.length < 1) return null;

    const varName = variableNameForClass(className);
    const args = constructorParams.map(pythonLiteralForConstructorParam);

    return [
        `${varName} = ${className}(${args.join(", ")})`,
        ...publicZeroArgMethods.map(
            (method) => `print(${varName}.${method.name}())`,
        ),
    ];
}

async function rewriteNoOutputClassMethodExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const solutionCode = String(exercise.solutionCode ?? "");
    const run = await (getCodeRunner() ?? runLocalCode)({
        language: "python",
        code: solutionCode,
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;
    if (String(run.stdout ?? "").trim()) return null;

    const harnessLines = buildNoInputClassMethodHarness(solutionCode);
    if (!harnessLines) return null;

    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Then create an instance and print the method result.`,
        starterCode: appendMissingHarness(
            String(exercise.starterCode ?? ""),
            harnessLines,
        ),
        solutionCode: appendMissingHarness(
            String(exercise.solutionCode ?? ""),
            harnessLines,
        ),
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

async function rewriteNoOutputListConstructionExercise(
    exercise: PythonCodeInputExercise,
): Promise<PythonCodeInputExercise | null> {
    if (!hasMissingOrBooleanishTests(exercise)) return null;
    if (hasInputCalls(exercise)) return null;

    const haystack = `${exercise.title} ${exercise.prompt}`.toLowerCase();
    if (!/\blists?\b|\bcollection\b/.test(haystack)) return null;

    const listName = findLastListAssignmentName(exercise.solutionCode);
    if (!listName) return null;

    const run = await (getCodeRunner() ?? runLocalCode)({
        language: "python",
        code: String(exercise.solutionCode ?? ""),
        stdin: "",
        limits: { timeoutMs: 4000 },
    });

    if (!run.ok) return null;
    if (String(run.stdout ?? "").trim()) return null;

    const observableLine = `print(len(${listName}))`;
    const repaired: PythonCodeInputExercise = {
        ...exercise,
        prompt: `${String(exercise.prompt ?? "").trim()} Then print the number of items in the list.`,
        starterCode: `${String(exercise.starterCode ?? "").trimEnd()}\n${observableLine}`,
        solutionCode: `${String(exercise.solutionCode ?? "").trimEnd()}\n${observableLine}`,
    };

    return (await makeTestsFromNoInputSolution(repaired)) ?? repaired;
}

async function repairCrossExerciseClassDependencies(args: {
    draft: TopicAuthoringDraft;
    report: RepairReport;
}): Promise<TopicAuthoringDraft> {
    const classDefinitions = mergeClassDefinitions(args.draft.quizDraft);
    const setupDefinitions = mergeTopLevelSetupDefinitions(args.draft.quizDraft);
    if (classDefinitions.size < 1 && setupDefinitions.size < 1) return args.draft;

    const quizDraft = await Promise.all(
        args.draft.quizDraft.map(async (exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            let nextExercise = exercise;
            const classPrefixes: string[] = [];
            const setupPrefixLines: string[] = [];

            for (const [className, definition] of classDefinitions) {
                if (!referencesClass(nextExercise.solutionCode, className)) continue;
                if (new RegExp(`^class\\s+${className}\\b`, "m").test(nextExercise.solutionCode)) {
                    continue;
                }

                classPrefixes.push(renderClassDefinition(definition));
            }

            for (const [name, lines] of setupDefinitions) {
                if (!referencesName(nextExercise.solutionCode, name)) continue;
                if (definesTopLevelName(nextExercise.solutionCode, name)) continue;

                for (const line of lines) {
                    if (!setupPrefixLines.includes(line)) {
                        setupPrefixLines.push(line);
                    }
                }
            }

            const setupPrefixSource = setupPrefixLines.join("\n");
            for (const [className, definition] of classDefinitions) {
                if (!referencesClass(setupPrefixSource, className)) continue;
                if (new RegExp(`^class\\s+${className}\\b`, "m").test(nextExercise.solutionCode)) {
                    continue;
                }

                const rendered = renderClassDefinition(definition);
                if (!classPrefixes.includes(rendered)) {
                    classPrefixes.push(rendered);
                }
            }

            if (classPrefixes.length < 1 && setupPrefixLines.length < 1) {
                return nextExercise;
            }

            const prefixParts = [
                ...classPrefixes,
                setupPrefixLines.length > 0 ? setupPrefixLines.join("\n") : "",
            ].filter(Boolean);
            const prefix = `${prefixParts.join("\n\n")}\n\n`;

            nextExercise = {
                ...nextExercise,
                starterCode: `${prefix}${String(nextExercise.starterCode ?? "").trimStart()}`,
                solutionCode: `${prefix}${String(nextExercise.solutionCode ?? "").trimStart()}`,
            };

            args.report.repairs.push({
                code: "PYTHON_CROSS_EXERCISE_CLASS_CONTEXT_REPAIRED",
                category: "recipe",
                severity: "high",
                field: exercise.id,
                message:
                    "Prepended shared class/setup context needed by this code_input exercise so it can run independently.",
            });

            if (hasMissingOrBooleanishTests(nextExercise)) {
                const testRepair =
                    (await makeTestsFromNoInputSolution(nextExercise)) ??
                    (await rewriteNoInputFinalExpressionExercise(nextExercise));
                if (testRepair) {
                    nextExercise = testRepair;
                    args.report.repairs.push({
                        code: "PYTHON_CROSS_EXERCISE_TESTS_REPAIRED",
                        category: "recipe",
                        severity: "high",
                        field: exercise.id,
                        message:
                            "Regenerated placeholder tests from the self-contained Python solution.",
                    });
                }
            }

            return nextExercise;
        }),
    );

    return {
        ...args.draft,
        quizDraft,
    };
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
        sketchBlocks: args.draft.sketchBlocks.map((block) => {
            const bodyMarkdown = String(block.bodyMarkdown ?? "");

            if (!hasMultilineCodeFence(bodyMarkdown) || hasLineByLineExplanation(bodyMarkdown)) {
                return block;
            }

            report.repairs.push({
                code: "PYTHON_SKETCH_LINE_BY_LINE_EXPLANATION_ADDED",
                category: "text",
                severity: "medium",
                field: `sketchBlocks.${block.id}.bodyMarkdown`,
                message:
                    "Added a short line-by-line explanation after a multi-line code example.",
            });

            return {
                ...block,
                bodyMarkdown: `${bodyMarkdown}\n\nLine by line: read the first statement to see which value is stored or checked, then follow each conditional branch in order to see which path prints the final result.`,
            };
        }),
        quizDraft: await Promise.all(args.draft.quizDraft.map(async (exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            const missingTestsRepair = synthesizeMissingTestsForExercise(exercise);
            const hasAuthoredTests =
                Array.isArray(exercise.tests) && exercise.tests.length > 0;
            const derivedMissingTestsRepair =
                !missingTestsRepair && !hasAuthoredTests
                    ? await makeTestsFromNoInputSolution(exercise)
                    : null;
            const withTests =
                missingTestsRepair ?? derivedMissingTestsRepair ?? exercise;

            if (missingTestsRepair) {
                report.repairs.push({
                    code: "PYTHON_TESTS_SYNTHESIZED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Added fallback stdin/stdout tests to an input-driven or top-level-function Python code_input exercise after real execution could not derive them.",
                });
            }

            if (derivedMissingTestsRepair) {
                report.repairs.push({
                    code: "PYTHON_TESTS_DERIVED_FROM_SOLUTION",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Derived stdin/stdout tests by running a no-input Python solution that already prints output.",
                });
            }

            const placeholderTestRepair =
                rewriteHardcodedPromptAlignedExercise(withTests);
            const afterPromptAlignedRepair = placeholderTestRepair ?? withTests;

            if (placeholderTestRepair) {
                report.repairs.push({
                    code: "PYTHON_PLACEHOLDER_TESTS_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced placeholder boolean tests with prompt-aligned stdin/stdout cases and converted the exercise to read real input.",
                });
            }

            const executedPlaceholderRepair =
                await rewritePlaceholderTestsFromSolutionExecution(afterPromptAlignedRepair);
            const withAlignedTests =
                executedPlaceholderRepair ?? afterPromptAlignedRepair;

            if (executedPlaceholderRepair) {
                report.repairs.push({
                    code: "PYTHON_PLACEHOLDER_TESTS_EXECUTION_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Replaced placeholder boolean tests with the real stdout produced by the no-input Python solution.",
                });
            }

            const functionRuntimeRepair = rewriteFunctionReturnExercise(withAlignedTests);
            const afterFunctionRuntimeRepair =
                functionRuntimeRepair ?? withAlignedTests;

            if (functionRuntimeRepair) {
                report.repairs.push({
                    code: "PYTHON_FUNCTION_STDOUT_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Rewrote a function-return code_input exercise into a runnable stdin/stdout task so it matches fixed-tests grading.",
                });
            }

            const harnessRepair =
                await rewriteEmbeddedHarnessStyleExercise(afterFunctionRuntimeRepair);
            const afterHarnessRepair =
                harnessRepair ?? afterFunctionRuntimeRepair;

            if (harnessRepair) {
                report.repairs.push({
                    code: "PYTHON_EMBEDDED_HARNESS_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Converted Python code stuffed into tests.stdin into visible runnable harness code so class exercises match fixed-tests grading.",
                });
            }

            const supportMethodRepair =
                await rewriteMissingOopSupportMethods(afterHarnessRepair);
            const afterSupportMethodRepair =
                supportMethodRepair ?? afterHarnessRepair;

            if (supportMethodRepair) {
                report.repairs.push({
                    code: "PYTHON_MISSING_OOP_SUPPORT_METHOD_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Added a missing support method needed by this object-oriented code_input exercise and regenerated its expected output.",
                });
            }

            const noOutputClassMethodRepair =
                await rewriteNoOutputClassMethodExercise(afterSupportMethodRepair);
            const afterClassMethodRepair =
                noOutputClassMethodRepair ?? afterSupportMethodRepair;

            if (noOutputClassMethodRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_OUTPUT_CLASS_METHOD_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Made a no-output class/method code_input exercise observable by adding an instance-method print harness and regenerating expected output.",
                });
            }

            const noOutputListRepair =
                await rewriteNoOutputListConstructionExercise(afterClassMethodRepair);
            const repairedExercise =
                noOutputListRepair ?? afterClassMethodRepair;

            if (noOutputListRepair) {
                report.repairs.push({
                    code: "PYTHON_NO_OUTPUT_LIST_TASK_REPAIRED",
                    category: "recipe",
                    severity: "high",
                    field: exercise.id,
                    message:
                        "Made a list-construction code_input exercise observable by printing the list length and regenerating its expected output.",
                });
            }

            const hintRepair = rewritePythonLeakText(repairedExercise.hint);
            const conceptRepair = rewritePythonLeakText(repairedExercise.help.concept);
            const hint1Repair = rewritePythonLeakText(repairedExercise.help.hint_1);
            const hint2Repair = rewritePythonLeakText(repairedExercise.help.hint_2);

            const changed =
                hintRepair.changed ||
                conceptRepair.changed ||
                hint1Repair.changed ||
                hint2Repair.changed;

            if (!changed) return repairedExercise;

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
                ...repairedExercise,
                hint: hintRepair.next,
                help: {
                    ...repairedExercise.help,
                    concept: conceptRepair.next,
                    hint_1: hint1Repair.next,
                    hint_2: hint2Repair.next,
                },
            };
        })),
    };

    nextDraft = await repairCrossExerciseClassDependencies({
        draft: nextDraft,
        report,
    });

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
