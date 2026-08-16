import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyZoeSkoulSurface,
} from "./zoeskoulSurface.js";

describe("classifyZoeSkoulSurface", () => {
  it.each([
    [
      "http://localhost:3000/en/authenticate?callbackUrl=x",
      "authenticate",
    ],
    [
      "http://localhost:3002/en/subjects",
      "my-learning",
    ],
    [
      "http://localhost:3002/en/subjects/sql-v2/modules",
      "course-modules",
    ],
    [
      "http://localhost:3002/en/subjects/sql-v2/modules/module0",
      "module-intro",
    ],
    [
      "http://localhost:3002/en/subjects/sql-v2/modules/module0/learn",
      "review-module",
    ],
    [
      "http://localhost:3002/en/subjects/sql-v2/modules/module0/learn/a/b/exercise/c",
      "review-module",
    ],
    [
      "http://localhost:3002/en/catalog/core/subjects/sql-v2/modules/module0/learn",
      "review-module",
    ],
    [
      "http://localhost:3002/en/subjects/sql-v2/modules/module0/practice",
      "practice",
    ],
  ])("%s", (url, expected) => {
    expect(classifyZoeSkoulSurface(url)).toBe(expected);
  });
});
