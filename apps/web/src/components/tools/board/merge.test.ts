import { describe, expect, it } from "vitest";

import { canonicalizeBoardBody, mergeBoardBodies } from "./merge";

const text = (id: string, value: string) => ({
  id,
  type: "text" as const,
  color: "#111827",
  strokeWidth: 2,
  x: 10,
  y: 20,
  text: value,
  fontSize: 24,
});

function body(elements: ReturnType<typeof text>[]) {
  return JSON.stringify({ version: 1, elements });
}

describe("mergeBoardBodies", () => {
  it("rejects malformed board payloads before storage", () => {
    expect(canonicalizeBoardBody("not-json")).toBeNull();
    expect(canonicalizeBoardBody(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it("preserves unrelated concurrent edits", () => {
    const merged = JSON.parse(
      mergeBoardBodies({
        baseBody: body([text("a", "A")]),
        incomingBody: body([text("a", "A"), text("local", "L")]),
        currentBody: body([text("a", "A"), text("remote", "R")]),
      }),
    );

    expect(merged.elements.map((element: { id: string }) => element.id)).toEqual([
      "a",
      "remote",
      "local",
    ]);
  });
});
