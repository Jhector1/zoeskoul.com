import type {TopicSeed} from "@zoeskoul/curriculum-contracts";
import { getCurriculumProfile, type SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import {renderExercisePolicyPrompt} from "./renderExercisePolicyPrompt.js";
import { renderExerciseKindPromptRules } from "./exerciseKindPromptRules.js";
import type { TopicRetryContext } from "../types.js";


function renderRetryGuidance(seed: TopicSeed, retry?: TopicRetryContext) {
    if (!retry) return "";

    const qualityIssueLines =
        retry.qualityIssues?.length
            ? [
                "",
                "Specific issues from the previous attempt:",
                ...retry.qualityIssues.map((issue) =>
                    `- ${issue.exerciseId ? `${issue.exerciseId}: ` : ""}${issue.message}`,
                ),
            ]
            : [];

    const thinFixedTestIssues =
        retry.qualityIssues?.filter(
            (issue) => issue.code === "THIN_FIXED_TEST_COVERAGE",
        ) ?? [];
    const unsafeFixedTestIssues =
        retry.qualityIssues?.filter(
            (issue) => issue.code === "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
        ) ?? [];

    const terminalAvailable =
        seed.workspacePolicy?.workspace.capabilities?.terminal.enabled === true;
    const workspaceRetryLines =
        !terminalAvailable
            ? [
                "",
                "Workspace-language retry rules for this topic:",
                "- Forbidden learner-facing workspace terms: Terminal, command line, shell, console.",
                '- Use "code editor", "Run", and "output panel" instead.',
                '- Do not use "Terminal" even as a distractor option.',
                "- If you need an unavailable-tool distractor, use a safe non-workspace distractor such as a notes panel or theme picker.",
            ]
            : [];

    return [
        "",
        "IMPORTANT: This is a retry for the same topic.",
        `Retry attempt: ${retry.attempt} of ${retry.maxRetries}.`,
        `Previous failure code: ${retry.previousErrorCode}`,
        "Previous failure message:",
        retry.previousErrorMessage,
        ...qualityIssueLines,
        "",
        "You must fix the issue above without changing the topic identity.",
        "Do not repeat the same validation mistake.",
        "",
        "If the failure mentions dummy fill_blank_choice questions:",
        "- Every fill_blank_choice must have a meaningful prompt.",
        "- Every template must contain real course-specific context.",
        "- Do not use placeholder templates like `The missing value is [blank1].`",
        "",
        "If the failure mentions generic exercise help:",
        "- Rewrite hints and help so they mention the exact question concept.",
        "",
        "If the failure mentions starterCode revealing solutionCode:",
        "- The previous starterCode was too complete.",
        "- Rewrite every failing code_input so starterCode is incomplete scaffolding only.",
        "- starterCode must not equal solutionCode after comments and whitespace are removed.",
        "- Keep the full runnable answer only in solutionCode.",
        "- Example for Python: starterCode can be `# Write your code below\\n`, while solutionCode contains the actual variables, expression, and print call.",
        "",
        "If the failure mentions workspace policy:",
        "- Do not mention files, .py filenames, terminals, command lines, package installation, or local workflows.",
        '- Do not use "Terminal" even as a distractor option.',
        "- Replace unavailable-tool distractors with safe non-workspace distractors.",
        ...workspaceRetryLines,
        "",
        "If the failure mentions exercise policy targets or over target:",
        "- The previous draft used the wrong exercise-kind counts.",
        "- Regenerate quizDraft so each kind exactly matches the Required exercise counts.",
        "- quizDraft is the authoring source for ALL exercises, including code_input.",
        "- If the failure says expected code_input but draft has 0, add code_input objects directly inside quizDraft.",
        "- Do not put code_input only in projectDraft.",
        "- Do not preserve the same total by replacing missing code_input exercises with extra fill_blank_choice exercises.",
        "- Do not preserve the same total by replacing missing non-code exercises with extra code_input exercises.",
        "- If fill_blank_choice is over target, remove the extras.",
        "- If code_input is over target, remove extra code_input exercises and add the missing non-code exercise kinds.",
        "- For Bash/Linux missing code_input, use fixedLanguage bash, recipeType shell_task, mode terminal_workspace, and workspaceExpectations or terminalExpectations.",
        "",
        "",
        "If the failure mentions PROGRAMMING_TRY_IT_COVERAGE_MISSING, TRY_IT_SKETCH_EXERCISE_MISSING, or missing Try It coverage:",
        "- Make sure the topic includes a real practice exercise that can serve as the embedded try-it activity.",
        "- For all_sketches placement, every sketch must have one distinct matching code_input exercise.",
        "- When exact code_input counts are provided, reduce the number of sketchBlocks to that count instead of adding extra code_input exercises beyond policy.",
        "- Do not add a literal `Try it yourself:` sentence to sketchBlocks just to satisfy practice requirements.",
        "- Keep sketchBlocks focused on explanation and worked examples; the embedded try-it UI comes from practice metadata and exercises.",
        "",
        "If the failure mentions PROGRAMMING_LINE_BY_LINE_EXPLANATION_MISSING or missing a step-by-step explanation:",
        "- Keep the code example, but add explicit prose that walks through it line by line or step by step.",
        "- Name the lines directly with wording such as `First`, `Second`, `This line`, or `Line by line`.",
        "- For shell examples, explain what the command does and what the shown output means.",
        "",
        "If the failure mentions PYTHON_SQL_CLAUSE_LEAKAGE, PYTHON_SQL_QUERY_LEAKAGE, PYTHON_SQL_FENCE_LEAKAGE, PYTHON_SQL_MUTATION_LEAKAGE, or PYTHON_SQL_NAMED_LEAKAGE:",
        "- Remove every SQL/database term from the Python draft.",
        "- Do not mention SELECT, FROM, WHERE, GROUP BY, ORDER BY, SQL, SQLite, database query, table clauses, or query language.",
        "- Rewrite the affected help, hint, prompt, or sketch text using Python vocabulary only.",
        "If the failure mentions THIN_FIXED_TEST_COVERAGE:",
        "- Every fixed_tests Python code_input needs at least 2 meaningful and distinct tests.",
        "- If the exercise reads stdin, use at least two different stdin values.",
        "- Do not duplicate the same test just to increase the count.",
        "- If a code_input exercise cannot support two meaningful fixed tests, replace it with a non-code exercise or rewrite it into a stdin-based task.",
        ...(thinFixedTestIssues.length > 0
            ? [
                "- Failing exercise ids from the previous attempt:",
                ...thinFixedTestIssues.map((issue) => `  - ${issue.exerciseId ?? "unknown"}`),
            ]
            : []),
        ...(unsafeFixedTestIssues.length > 0
            ? [
                "- These exercise ids were invalid as fixed_tests code_input:",
                ...unsafeFixedTestIssues.map((issue) => `  - ${issue.exerciseId ?? "unknown"}`),
                "- For EVERY listed Python class/object/method/multifile exercise, do not keep recipeType as fixed_tests just because the workspace has files.",
                "- If the task asks the learner to define or edit a class, constructor, method, attribute, inheritance relationship, import, or helper module, switch that exercise to recipeType \"semantic\", remove tests[], and add semanticChecks[].",
                "- Use defines_class, constructible, instance_attributes, method_returns, method_sequence_returns, attribute_sequence_equals, created_instances, printed_line_count, and no_stdout as appropriate for the exact object behavior.",
                "- Only keep recipeType \"fixed_tests\" when the task is a normal runnable program with two genuinely different stdin/stdout cases or a true file-reading task with two different tests[].files fixtures and matching stdout.",
                "- Do not fake a second tests[].files case for OOP structure tasks that are really about classes, methods, attributes, or imports; semantic checks are the required repair path.",
                "- Replace them with non-code exercises only if they are conceptual and cannot be graded as runnable/semantic code_input.",
                "- Do not produce static print-only code_input tasks with one test.",
                "- For class/object/method tasks, prefer semantic checks such as defines_class, constructible, instance_attributes, function_returns, method_returns, method_sequence_returns, or attribute_sequence_equals instead of stdout tests.",
            ]
            : []),
        "",
        "If the failure mentions INVALID_FILL_BLANK_STRUCTURE or multiple_blanks:",
        "- Regenerate the fill_blank_choice with exactly ONE blank.",
        "- Use only [blank1]. Do not use [blank2], [blank3], or multiple underscore blanks.",
        "- The template must contain one missing part and enough context to answer it.",
        "- Good example: `age = [blank1]` with choices `18`, `age`, `print`.",
        "- Good example: `[blank1] = 10` with choices `score`, `10`, `print`.",
        "- Bad example: `[blank1] = [blank2]`.",
        "- Bad example: `____ = ____`.",
        "",
        "If the failure mentions stdout must be a non-empty string:",
        "- Do not emit tests with stdout: \"\".",
        "- For code_input fixed_tests, every test must have visible output.",
        "- For Python file-writing exercises, the solutionCode must print something observable after writing the file.",
        "- Good pattern: write to the file, reopen/read it, and print the written contents.",
        "- Alternatively print a clear confirmation message such as `Saved note.txt`.",
    ].join("\n");
}


function renderFinalExerciseCountChecklist(seed: TopicSeed): string {
    const planned = seed.plannedExerciseCounts;
    if (!planned) return "";

    const countLines = Object.entries(planned.counts)
        .filter(([, count]) => typeof count === "number" && count > 0)
        .map(([kind, count]) => `  - ${kind}: exactly ${count}`);

    return [
        "FINAL EXERCISE COUNT GATE — verify this immediately before returning JSON:",
        `- quizDraft must contain exactly ${planned.total} items total.`,
        "- Count quizDraft by kind. The final counts must be:",
        ...countLines,
        `- The counts above must add up to ${planned.total}.`,
        "- Do not return JSON until the array length and every per-kind count match.",
    ].join("\n");
}

function renderWorkspacePolicy(seed: TopicSeed) {
    const policy = seed.workspacePolicy;
    if (!policy) return "";

    const c = policy.workspace.capabilities;
    const ui = policy.workspace.ui;

    return [
        "Learner workspace rules:",
        `- Workspace: ${policy.workspace.name}`,
        `- Editor label: ${ui.editorLabel ?? "editor"}`,
        `- Run button label: ${ui.runButtonLabel ?? "Run"}`,
        `- Output panel label: ${ui.outputPanelLabel ?? "output panel"}`,
        `- Terminal available: ${c.terminal.enabled ? "yes" : "no"}`,
        `- File creation available: ${c.filesystem.enabled ? "yes" : "no"}`,
        `- Multi-file projects available: ${c.multiFileProjects.enabled ? "yes" : "no"}`,
        `- Package installation available: ${c.packageInstall.enabled ? "yes" : "no"}`,
        "",
        "Preferred learner actions:",
        ...policy.preferredActionLanguage.map((x) => `- ${x}`),
        "",
        "Forbidden learner actions/language:",
        ...policy.forbiddenActionLanguage.map((x) => `- ${x}`),
        "",
        "Course notes:",
        ...policy.notes.map((x) => `- ${x}`),
    ].join("\n");
}

function renderAuthoringPolicy(seed: TopicSeed) {
    const policy = seed.authoringPolicy;
    if (!policy) return "";
    const logicalModuleNumber =
        typeof seed.moduleNumber === "number" && Number.isFinite(seed.moduleNumber)
            ? seed.moduleNumber
            : Math.max(0, (seed.moduleOrder ?? 1) - 1);

    const lines: string[] = ["Authoring policy rules:"];

    if ((policy.allowedConcepts ?? []).length > 0) {
        lines.push("- Allowed course concepts:");
        lines.push(...(policy.allowedConcepts ?? []).map((concept) => `  - ${concept}`));
    }

    if ((policy.disallowedConcepts ?? []).length > 0) {
        lines.push("- Disallowed future course concepts:");
        lines.push(...(policy.disallowedConcepts ?? []).map((concept) => `  - ${concept}`));
    }

    const moduleRule = policy.moduleRules?.[String(logicalModuleNumber)];
    if (moduleRule) {
        lines.push(`- Module ${logicalModuleNumber} concept-stage rules:`);
        if ((moduleRule.allowedConcepts ?? []).length > 0) {
            lines.push(...(moduleRule.allowedConcepts ?? []).map((concept) => `  - allowed: ${concept}`));
        }
        if ((moduleRule.disallowedConcepts ?? []).length > 0) {
            lines.push(...(moduleRule.disallowedConcepts ?? []).map((concept) => `  - disallowed: ${concept}`));
        }
        if ((moduleRule.notes ?? []).length > 0) {
            lines.push(...(moduleRule.notes ?? []).map((note) => `  - note: ${note}`));
        }
    }

    return lines.join("\n");
}

function renderStructuredLessonIntent(seed: TopicSeed) {
    const lines: string[] = [];
    const practice = seed.practice;
    const conceptualOnly = practice?.conceptualOnly === true;
    const requiresTryIt = practice?.requiresTryIt === true;
    const projectRequirements = seed.authoringPolicy?.projectRequirements as
        | {
            requireRealWorldStory?: boolean;
            requireCumulativeChaining?: boolean;
            requireCompleteSolutionFiles?: boolean;
            reuseTryItInProjects?: boolean;
            requireUniqueTryItMessages?: boolean;
        }
        | undefined;
    const isProjectTopic =
        seed.sectionRole === "module_project" ||
        seed.sectionRole === "capstone" ||
        seed.moduleRole === "capstone";
    const plannedCodeInputCount =
        seed.plannedExerciseCounts?.counts.code_input ?? 0;

    if (conceptualOnly) {
        lines.push("Structured lesson intent for this topic:");
        lines.push("- This topic is explicitly conceptual-only in authoring.");
        lines.push("- Keep it quiz-friendly and explanatory; do not force code_input or embedded Try It coverage.");
    }

    if (!conceptualOnly && requiresTryIt) {
        lines.push("Structured lesson intent for this topic:");
        lines.push("- This topic should support real embedded Try It practice through quizDraft exercises.");
        if (practice?.tryItPlacement === "all_sketches") {
            lines.push("- Every sketch block must map to its own concrete Try It exercise; do not rely on one exercise for the whole topic.");
            if (!isProjectTopic && plannedCodeInputCount > 0) {
                lines.push(
                    `- Generate exactly ${plannedCodeInputCount} sketchBlocks for this lesson because the required exercise plan contains exactly ${plannedCodeInputCount} code_input Try It exercise(s).`,
                );
                lines.push(
                    `- Generate exactly ${plannedCodeInputCount} matching code_input items with ids try-<topic-id>-sketch0 through try-<topic-id>-sketch${plannedCodeInputCount - 1}.`,
                );
                lines.push("- Do not generate extra teaching sketches that cannot receive their own required code_input Try It.");
            }
            lines.push("- Prefer embedded Try It exercise ids that follow try-<topic-id>-sketch0, try-<topic-id>-sketch1, etc.; do not use ci-* ids for sketch try-it exercises.");
        } else {
            lines.push("- Use sketchBlocks to teach the idea clearly, then make the configured code_input exercise work as the embedded try-it task.");
        }
        lines.push("- Do not add literal `Try it yourself` prose to sketchBlocks unless the topic truly needs it for comprehension.");
        lines.push("- Give every Try It its own concrete instructional message with the real task, expected output, and why it matters in this topic.");
        if (practice?.tryItExerciseId) {
            lines.push(`- Preferred try-it exercise id: ${practice.tryItExerciseId}.`);
        }
        if (typeof practice?.tryItSketchIndex === "number") {
            lines.push(`- Preferred try-it sketch index: ${practice.tryItSketchIndex}.`);
        }
    }

    if (practice?.projectFlow === "progressive") {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- Project-style code_input exercises should flow step to step.");
        lines.push("- Each later starterCode should begin from the previous working solution, then add focused TODO comments for the new change.");
        lines.push("- When the workspace uses multiple files, each later step should start from the previous full working workspace, not only one copied snippet.");
        lines.push("- Do not make project steps feel like unrelated standalone drills.");
    }

    if (seed.sectionRole === "module_project") {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- This topic belongs to a module project section.");
        lines.push("- Use exactly one sketchBlock to introduce the project synopsis, learner role, scenario, and useful deliverable.");
        lines.push("- Put the actual work in project code_input steps, not in extra teaching sketches or embedded Try It cards.");
        lines.push("- Use a small story, one connected build, and step titles that sound like project milestones.");
        lines.push("- Reuse relevant Try It work as project starter state when it fits the scenario.");
    }

    if (seed.sectionRole === "capstone" || seed.moduleRole === "capstone") {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- This topic is the final capstone/final project for the course.");
        lines.push("- Use exactly one sketchBlock to introduce the final capstone synopsis, learner role, scenario, and final handoff deliverable.");
        lines.push("- Put the actual capstone work in final capstone project steps, not in extra teaching sketches or embedded Try It cards.");
        lines.push("- Make it feel like a full project, not a normal practice card.");
        lines.push("- Use stronger project framing, integrated skills, and a polished final-output goal.");
    }

    if (seed.projectBrief) {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        const brief = seed.projectBrief;
        lines.push("- The authored projectBrief is the source of truth for this project.");
        lines.push(`- Generate exactly ${brief.stepCountTarget} project code_input step(s), no more and no fewer.`);
        lines.push(`- projectDraft.stepIds must list exactly ${brief.stepCountTarget} existing quizDraft code_input id(s) in authored order.`);
        if (brief.flow) {
            lines.push(`- Authored project flow: ${brief.flow}.`);
        }
        if (brief.scenario) {
            lines.push(`- Authored scenario: ${brief.scenario}`);
        }
        if (brief.role) {
            lines.push(`- Learner role: ${brief.role}`);
        }
        if (brief.workspace) {
            lines.push(`- Workspace: ${brief.workspace}`);
        }
        if (brief.deliverable) {
            lines.push(`- Final deliverable: ${brief.deliverable}`);
        }
        if ((brief.requirements ?? []).length > 0) {
            lines.push("- Authored project requirements:");
            lines.push(...(brief.requirements ?? []).map((requirement) => `  - ${requirement}`));
        }
        if ((brief.stepLadder ?? []).length > 0) {
            lines.push("- Follow this authored step ladder exactly:");
            lines.push(
                ...(brief.stepLadder ?? []).map(
                    (step) => `  - Step ${step.step}: ${step.title} — ${step.requirement}`,
                ),
            );
        }
    }

    if (projectRequirements?.requireRealWorldStory) {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- Use a believable real-world story with a learner role, concrete files/tables/folders, and a useful final deliverable.");
    }

    if (projectRequirements?.requireCumulativeChaining) {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- In cumulative projects, each later step must start from the prior working output instead of resetting to a disconnected standalone task.");
    }

    if (projectRequirements?.requireCompleteSolutionFiles) {
        if (lines.length === 0) lines.push("Structured lesson intent for this topic:");
        lines.push("- For multi-file exercises, provide complete solutionFiles for every relevant file, not only the visible entry file.");
    }

    return lines.join("\n");
}
export function buildTopicAuthoringDraftPrompt(args: {
    seed: TopicSeed;
    locale: string;
    shape: SubjectShapePack;
    retry?: TopicRetryContext;
}) {
    const profile = getCurriculumProfile(args.seed.profileId);
    const exercisePolicyRules = renderExercisePolicyPrompt({
        policy: args.seed.exercisePolicy,
        plannedCounts: args.seed.plannedExerciseCounts,
        generationTargets: args.seed.generationTargets,
    });
    const exerciseKindRules = renderExerciseKindPromptRules({
        mode: "authoring",
        seed: args.seed,
    });
    const profileAuthoringRules =
        profile.renderAuthoringPromptRules?.({
            seed: args.seed,
            shape: args.shape,
        }) ?? [];
    const structuredLessonIntent = renderStructuredLessonIntent(args.seed);

    return {
        system: [
            "You generate a TopicAuthoringDraft JSON object for ZoeSkoul.",
            "Return JSON only.",
            "Do not wrap the result in markdown.",
            "Do not generate topic.bundle.json directly.",
            "Do not generate subject.manifest.json directly.",
            "Do not generate filesystem paths.",
            "Use the provided shape pack as the contract.",
            "IMPORTANT: quizDraft items are AUTHORING items, not final manifest exercises.",
            "Do not use fields like purpose, weight, messageBase, optionIds, or expected.",
            "Instead use content fields like title, prompt, options, correctOptionIds, starterCode, solutionCode, template, choices, correctValue, tokens, correctOrder.",
            "",
            "Every exercise must include a real solution.",
            "Do not leave any solution field empty.",
            "Every Try It exercise prompt must be unique, specific, and tied to the topic context.",
            "Embedded sketch Try It exercises must use try-* ids, preferably try-<topic-id>-sketch0, try-<topic-id>-sketch1, etc., not ci-* ids.",
            "If a code_input exercise uses multiple files, include complete starterFiles and complete solutionFiles for every relevant file in the finished workspace.",
            "For OOP/class/object/method exercises, use recipeType \"semantic\" with semanticChecks rather than fixed_tests, even when the exercise uses multiple files.",
            "Use fixed_tests for multifile Python only when the learner runs a normal program with two distinct observable stdout cases, or a true file-reading task with two distinct tests[].files fixtures.",
            "Do not use tests[].files as a substitute for semantic class/method/import checks.",
            "For progressive module projects and capstones, each later step must start from the previous step's full working solutionFiles/workspace state.",
            "",
            renderRetryGuidance(args.seed, args.retry),

            "The top-level object must contain exactly:",
            '- "title"',
            '- "summary"',
            '- "minutes"',
            '- "sketchBlocks"',
            '- "quizDraft"',
            '- optional "projectDraft"',
            "",
            "Every sketchBlocks item must contain exactly:",
            '- "id"',
            '- "title"',
            '- "bodyMarkdown"',
            "",
            "Teaching-quality rules for sketchBlocks in every subject:",
            "- Include at least one concrete worked example, not just abstract definitions.",
            "- Explain the main idea clearly in beginner-friendly language.",
            "- Keep sketchBlocks focused on explanation; embedded try-it practice will be rendered separately from exercises when supported.",
            "- For hands-on topics using all_sketches Try It placement, include enough concrete exercises so every sketch can resolve to a unique Try It activity.",
            "",
            "Extra teaching rules for programming-family profiles:",
            "- Show at least one fenced code example in sketchBlocks.",
            "- If a code example spans multiple lines, explain it step by step or line by line.",
            "- Keep code examples aligned with the current topic's learning goals and avoid introducing later-course commands early.",
            "- Do not add a literal 'Try it yourself' sentence to sketchBlocks just because the topic has embedded practice.",
            "",
            "Every quizDraft item must ALWAYS contain:",
            '- "id"',
            '- "kind"',
            '- "title"',
            '- "prompt"',
            '- "hint"',
            '- "help"',
            "",
            'The "help" object must ALWAYS contain exactly:',
            '- "concept"',
            '- "hint_1"',
            '- "hint_2"',
            "",
            "Writing rule for support fields:",
            "- concept = explain the specific underlying idea for this exact question.",
            "- hint = shortest specific nudge tied to this exact question.",
            "- hint_1 = stronger specific hint that points to the relevant concept, syntax, input/output behavior, or misconception.",
            "- hint_2 = strongest specific hint before the answer, but still not the final answer.",
            "",
            "Support fields must be specific, not generic.",
            "Do not use vague test-taking language such as:",
            "- Focus on the main concept.",
            "- Choose the option that matches the core idea.",
            "- Eliminate choices that describe something different.",
            "- Build the solution from the behavior being tested.",
            "- Think about the role or idea being tested.",
            "",
            "For a question about Python use cases, a good hint is: 'Think about tasks where Python can automate repeated steps or process data.'",
            "For a question about the browser runner, a good hint is: 'Look for the answer that uses the editor, Run button, and output panel.'",
            "For a question about print output, a good hint is: 'Check exactly what print sends to the output panel, including spaces and punctuation.'",
            "",
            "Do not reveal the exact final answer in hint, hint_1, or hint_2.",
            "Do not give the final answer, final option letter, final exact filled value, or full code solution in hints.",            "For code_input, hints may describe the target behavior, intermediate reasoning, or relevant inputs, but not the final full solution.",
            "",
            ...exerciseKindRules,

            "",
            "Strict code_input test rules:",
            "- Never produce a code_input fixed test with empty stdout.",
            "- For fixed_tests, every tests item must include a non-empty stdout string.",
            "- If a Python task writes to a file, make the program also print an observable result, such as the written text, a confirmation message, or the file contents after reopening it.",
            "- Pure file-writing tasks that print nothing are not valid fixed_tests authoring items.",
            "- If the task naturally has no stdout, either rewrite it to print an observable result or use a non-code exercise kind.",
            "",
            "Strict fill_blank_choice rules:",
            "- Each fill_blank_choice template must contain exactly ONE blank marker.",
            "- Use `[blank1]` exactly once.",
            "- Do not use `[blank2]`, `[blank3]`, or any second blank marker.",
            "- Do not use multiple underscore blanks such as `____ = ____`.",
            "- Do not create templates where both the variable name and value are missing.",
            "- The template must include enough context to answer the one missing part.",
            "- For variable-assignment topics, choose only ONE missing part:",
            "  Good: `[blank1] = 10` with choices like `age`, `name`, `print`.",
            "  Good: `age = [blank1]` with choices like `10`, `age`, `print`.",
            "  Bad: `[blank1] = [blank2]`.",
            "  Bad: `____ = ____`.",
            "- The `correctValue` must be exactly the value that fills `[blank1]`.",
            "- The choices must include the correctValue and plausible distractors.",
            "",
            "Publishing rule:",
            "- quizDraft is an authoring array, not the final learner quiz.",
            "- Include code_input authoring items inside quizDraft whenever Required exercise counts include code_input.",
            "- code_input authoring items are published as project practice automatically.",
            "- single_choice, multi_choice, drag_reorder, and fill_blank_choice are published as quiz practice.",
            // DRAG_REORDER_EXACT_TOKEN_RULES
            "- drag_reorder contract: correctOrder must be a full permutation of tokens.",
            "- Copy every correctOrder entry exactly from tokens; strings must match character-for-character.",
            "- correctOrder must have the same length as tokens, with no omissions, additions, or duplicates.",
            "- Never use answer letters (a, b, c, d), numeric positions, indexes, or invented ids unless those exact strings are present in tokens.",
            "- Example: tokens [\"FROM clause\", \"JOIN operation\", \"ON condition\"] requires those exact text values in correctOrder, not [\"a\", \"b\", \"c\"].",
            // DRAG_REORDER_RETRY_REPAIR
            "- If validation mentions drag_reorder, correctOrder, or tokens, rebuild the item by copying and reordering the exact token strings.",
            "- On retry, verify correctOrder.length === tokens.length and each token occurs exactly once.",
            // DRAG_REORDER_FINAL_GATE
            "- Before returning JSON, verify every drag_reorder correctOrder is an exact full permutation of tokens.",
            "- You may include projectDraft, but projectDraft alone does not create code_input exercises; the compiler creates project cards from quizDraft code_input items.",
            "",
            ...profileAuthoringRules,
            ...(structuredLessonIntent ? ["", structuredLessonIntent] : []),
            "",
            renderAuthoringPolicy(args.seed),
            "",
            exercisePolicyRules,
            "",
            "If projectDraft is present:",
            '- it must contain "title" and "stepIds"',
            "- every stepId must refer to an existing quizDraft item id",
            "",
            "Final self-check before returning JSON:",
            "- Every exercise kind matches the number of correct answers it needs.",
            "- Every multi_choice includes ALL correct options, not only one.",
            "- Every fill_blank_choice has exactly one blank and exactly one correctValue.",
            "- Every code_input follows the profile-specific runtime and recipe rules.",
            "",
            renderFinalExerciseCountChecklist(args.seed),
            "",
            renderWorkspacePolicy(args.seed),
        ].join("\n"),
        user: JSON.stringify(
            {
                locale: args.locale,
                seed: args.seed,
                shape: args.shape,
            },
            null,
            2,
        ),
    };
}
