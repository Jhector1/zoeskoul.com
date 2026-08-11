import { describe, expect, it } from "vitest";

import { normalizeDraftQaOptionalMessageRefs } from "./practiceQaPure";

describe("Draft QA optional message references", () => {
  const base =
    "@:topics.python--python-data-functions--draft." +
    "python-5-lists-tuples-and-dictionaries.list-methods-and-mutation." +
    "quiz.try-list-methods-and-mutation-sketch1";

  it("omits missing expectedExample.meta while preserving the expected example", () => {
    expect(
      normalizeDraftQaOptionalMessageRefs({
        kind: "code_input",
        title: "Add an attendee",
        prompt: "Add the attendee with append().",
        expectedExample: {
          kind: "terminal",
          meta: `${base}.expectedExampleMeta`,
          stdin: "Zoe\n",
          stdout: "['Ava', 'Noah', 'Zoe']\n",
        },
      }),
    ).toEqual({
      kind: "code_input",
      title: "Add an attendee",
      prompt: "Add the attendee with append().",
      expectedExample: {
        kind: "terminal",
        stdin: "Zoe\n",
        stdout: "['Ava', 'Noah', 'Zoe']\n",
      },
    });
  });

  it("keeps resolved expectedExample.meta text", () => {
    expect(
      normalizeDraftQaOptionalMessageRefs({
        expectedExample: {
          kind: "terminal",
          meta: "Expected output",
          stdin: "Zoe\n",
          stdout: "['Ava', 'Noah', 'Zoe']\n",
        },
      }),
    ).toEqual({
      expectedExample: {
        kind: "terminal",
        meta: "Expected output",
        stdin: "Zoe\n",
        stdout: "['Ava', 'Noah', 'Zoe']\n",
      },
    });
  });

  it("does not treat unrelated nested meta references as optional", () => {
    expect(
      normalizeDraftQaOptionalMessageRefs({
        grading: {
          meta: `${base}.expectedExampleMeta`,
        },
      }),
    ).toEqual({
      grading: {
        meta: `${base}.expectedExampleMeta`,
      },
    });
  });

  it("omits missing optional hint/help references without weakening required fields", () => {
    expect(
      normalizeDraftQaOptionalMessageRefs({
        title: "Resolved title",
        prompt: `${base}.prompt`,
        hint: `${base}.hint`,
        help: {
          concept: `${base}.help.concept`,
          hint_1: "A real resolved hint",
          hint_2: `${base}.help.hint_2`,
        },
      }),
    ).toEqual({
      title: "Resolved title",
      // Required unresolved references must remain so the existing strict guard
      // still rejects them instead of hiding a real Draft QA problem.
      prompt: `${base}.prompt`,
      help: {
        hint_1: "A real resolved hint",
      },
    });
  });

  it("does not remove ordinary authored strings that resemble no message path", () => {
    const value = {
      hint: "Use append() to mutate the existing list.",
      expectedExampleMeta: "Accepted | Example",
    };

    expect(normalizeDraftQaOptionalMessageRefs(value)).toEqual(value);
  });
});
