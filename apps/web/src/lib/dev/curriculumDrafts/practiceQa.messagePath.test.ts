import { describe, expect, it } from "vitest";

import { readDraftMessagePath } from "./practiceQaPure";

describe("Draft QA message path lookup", () => {
  const messages = {
    topics: {
      "python--python-data-functions--draft": {
        "python-5-lists-tuples-and-dictionaries": {
          "creating-and-indexing-lists": {
            quiz: {
              "fb-second-item": {
                choices: ["0", "1", "2", "3"],
              },
              "sc-whole-list": {
                options: {
                  a: "numbers = [3, 5, 7]",
                  b: "numbers = (3, 5, 7)",
                },
              },
            },
          },
        },
      },
    },
  };

  it("resolves the exact fill-blank choices.0 path used by Draft QA", () => {
    expect(
      readDraftMessagePath(
        messages,
        "topics.python--python-data-functions--draft.python-5-lists-tuples-and-dictionaries.creating-and-indexing-lists.quiz.fb-second-item.choices.0",
      ),
    ).toBe("0");
  });

  it("resolves every numeric fill-blank choice", () => {
    const base =
      "topics.python--python-data-functions--draft.python-5-lists-tuples-and-dictionaries.creating-and-indexing-lists.quiz.fb-second-item.choices";

    expect(readDraftMessagePath(messages, `${base}.0`)).toBe("0");
    expect(readDraftMessagePath(messages, `${base}.1`)).toBe("1");
    expect(readDraftMessagePath(messages, `${base}.2`)).toBe("2");
    expect(readDraftMessagePath(messages, `${base}.3`)).toBe("3");
  });

  it("still resolves ordinary object-key paths", () => {
    expect(
      readDraftMessagePath(
        messages,
        "topics.python--python-data-functions--draft.python-5-lists-tuples-and-dictionaries.creating-and-indexing-lists.quiz.sc-whole-list.options.b",
      ),
    ).toBe("numbers = (3, 5, 7)");
  });

  it("rejects invalid array traversal", () => {
    const base =
      "topics.python--python-data-functions--draft.python-5-lists-tuples-and-dictionaries.creating-and-indexing-lists.quiz.fb-second-item.choices";

    expect(readDraftMessagePath(messages, `${base}.nope`)).toBeUndefined();
    expect(readDraftMessagePath(messages, `${base}.-1`)).toBeUndefined();
    expect(readDraftMessagePath(messages, `${base}.01`)).toBeUndefined();
    expect(readDraftMessagePath(messages, `${base}.9`)).toBeUndefined();
  });
});
