import { describe, expect, it } from "vitest";

import {
  resolvePracticeDisplayTitle,
  toTaggedPracticeTitleKey,
} from "./displayTitle";

const messages: Record<string, string> = {
  "@:topics.linux.whatTerminal.title": "What the Terminal Is",
};

const resolve = (
  value?: string | null,
  _values?: Record<string, string | number | Date>,
  fallback?: string,
) => (value ? messages[value] ?? fallback ?? value : fallback ?? "");

describe("practice display titles", () => {
  it("normalizes authored title keys", () => {
    expect(toTaggedPracticeTitleKey("topics.linux.whatTerminal.title")).toBe(
      "@:topics.linux.whatTerminal.title",
    );
    expect(toTaggedPracticeTitleKey("@:topics.linux.whatTerminal.title")).toBe(
      "@:topics.linux.whatTerminal.title",
    );
  });

  it("resolves a tagged title stored directly on an exercise", () => {
    expect(
      resolvePracticeDisplayTitle({
        title: "@:topics.linux.whatTerminal.title",
        resolve,
        fallback: "Exercise 1",
      }),
    ).toBe("What the Terminal Is");
  });

  it("prefers the authored title key while keeping a readable fallback", () => {
    expect(
      resolvePracticeDisplayTitle({
        title: "what-the-terminal-is",
        titleKey: "topics.linux.whatTerminal.title",
        resolve,
      }),
    ).toBe("What the Terminal Is");
  });

  it("never renders an unresolved tagged key", () => {
    expect(
      resolvePracticeDisplayTitle({
        title: "@:topics.missing.title",
        resolve,
        fallback: "Exercise 2",
      }),
    ).toBe("Exercise 2");
  });
});
