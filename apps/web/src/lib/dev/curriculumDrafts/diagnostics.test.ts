import { describe, expect, it } from "vitest";
import { analyzeDraftTopic } from "./diagnostics";

describe("curriculum draft diagnostics", () => {
  it("detects unresolved i18n references and unreachable code-input exercises", () => {
    const result = analyzeDraftTopic({
      messagesJson: { topics: { demo: { title: "Demo" } } },
      bundleJson: {
        cards: [
          {
            id: "quiz",
            kind: "quiz",
            titleKey: "@:topics.demo.missing",
            quiz: { exerciseKeys: ["q1"] },
          },
        ],
        exercises: [
          { id: "q1", kind: "single_choice", purpose: "quiz" },
          {
            id: "hidden-code",
            kind: "code_input",
            purpose: "try_it",
            language: "python",
            starterFiles: [{ path: "main.py", content: "print('x')", language: "python" }],
            solutionFiles: [{ path: "main.py", content: "print('x')", language: "python" }],
          },
        ],
      },
    });

    expect(result.diagnostics.some((item) => item.code === "i18n.unresolved_ref")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "exercise.unreachable" && item.exerciseId === "hidden-code")).toBe(true);
  });

  it("detects quiz cards that reference code-input exercises", () => {
    const result = analyzeDraftTopic({
      messagesJson: {},
      bundleJson: {
        cards: [{ id: "quiz", kind: "quiz", quiz: { exerciseKeys: ["bad-code"] } }],
        exercises: [
          {
            id: "bad-code",
            kind: "code_input",
            purpose: "try_it",
            language: "python",
            starterFiles: [{ path: "main.py", content: "print('start')", language: "python" }],
            solutionFiles: [{ path: "main.py", content: "print('done')", language: "python" }],
            recipe: { semanticChecks: [{ type: "printed_line_count", min: 1 }] },
          },
        ],
      },
    });

    expect(result.diagnostics.some((item) => item.code === "quiz.code_input")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "checks.weak")).toBe(true);
  });

  it("detects project carry-forward mismatches", () => {
    const result = analyzeDraftTopic({
      messagesJson: {},
      bundleJson: {
        cards: [
          {
            id: "project",
            kind: "project",
            project: {
              steps: [
                { id: "one", exerciseKey: "step-one" },
                { id: "two", exerciseKey: "step-two", carryFromPrev: true },
              ],
            },
          },
        ],
        exercises: [
          {
            id: "step-one",
            kind: "code_input",
            language: "python",
            starterFiles: [{ path: "main.py", content: "print('a')", language: "python" }],
            solutionFiles: [{ path: "main.py", content: "print('b')", language: "python" }],
            recipe: { semanticChecks: [{ type: "defines_class", className: "Thing" }] },
          },
          {
            id: "step-two",
            kind: "code_input",
            language: "python",
            starterFiles: [{ path: "main.py", content: "print('c')", language: "python" }],
            solutionFiles: [{ path: "main.py", content: "print('d')", language: "python" }],
            recipe: { semanticChecks: [{ type: "defines_class", className: "Thing" }] },
          },
        ],
      },
    });

    expect(result.diagnostics.some((item) => item.code === "project.carry_mismatch")).toBe(true);
  });
});
