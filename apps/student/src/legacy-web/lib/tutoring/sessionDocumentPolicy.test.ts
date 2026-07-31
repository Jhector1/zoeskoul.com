import { describe, expect, it } from "vitest";

import {
  isValidBoardCardKey,
  participantOwnerKey,
  validateBoardDocumentInput,
} from "./sessionDocumentPolicy";

const moduleKey = "module-1";
const cardKey = "card:topic:general";

describe("tutoring session document policy", () => {
  it("scopes participant documents by user", () => {
    expect(participantOwnerKey("student-1")).toBe("user:student-1");
  });

  it("accepts only authored board scopes", () => {
    expect(isValidBoardCardKey("card:topic-1:exercise-2")).toBe(true);
    expect(isValidBoardCardKey("../../arbitrary")).toBe(false);

    expect(
      validateBoardDocumentInput({
        moduleKeys: [moduleKey],
        scopeAllowed: false,
        moduleKey,
        cardKey: "card:topic:invented",
        toolId: "board",
        body: "{}",
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects unknown modules and oversized board bodies", () => {
    expect(
      validateBoardDocumentInput({
        moduleKeys: [moduleKey],
        scopeAllowed: true,
        moduleKey: "module-2",
        cardKey,
        toolId: "board",
        body: "{}",
      }),
    ).toMatchObject({ ok: false, status: 404 });

    expect(
      validateBoardDocumentInput({
        moduleKeys: [moduleKey],
        scopeAllowed: true,
        moduleKey,
        cardKey,
        toolId: "board",
        body: "x".repeat(512 * 1024 + 1),
      }),
    ).toMatchObject({ ok: false, status: 413 });
  });
});
