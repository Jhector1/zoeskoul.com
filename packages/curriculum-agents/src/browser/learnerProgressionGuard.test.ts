import {
  describe,
  expect,
  it,
} from "vitest";

import {
  shouldRejectGenericModulesProgressionClick,
} from "./learnerProgressionGuard.js";

describe("Student Agent learner progression guard", () => {
  it("rejects the header Modules shortcut inside a learner flow", () => {
    expect(
      shouldRejectGenericModulesProgressionClick({
        currentUrl:
          "http://localhost:3002/en/subjects/sql-v2/modules/sql-v2-4/learn/topic/quiz/q1",
        text: "Modules",
      }),
    ).toBe(true);
  });

  it("allows Modules on the modules listing", () => {
    expect(
      shouldRejectGenericModulesProgressionClick({
        currentUrl:
          "http://localhost:3002/en/subjects/sql-v2/modules",
        text: "Modules",
      }),
    ).toBe(false);
  });

  it("does not reject the real Next module control", () => {
    expect(
      shouldRejectGenericModulesProgressionClick({
        currentUrl:
          "http://localhost:3002/en/subjects/sql-v2/modules/sql-v2-4/learn/topic/project/p3",
        text: "Next module",
      }),
    ).toBe(false);
  });

  it("can identify Modules through aria-label", () => {
    expect(
      shouldRejectGenericModulesProgressionClick({
        currentUrl:
          "http://localhost:3002/en/subjects/sql-v2/modules/sql-v2-4/learn",
        text: "",
        ariaLabel: "Modules",
      }),
    ).toBe(true);
  });
});
