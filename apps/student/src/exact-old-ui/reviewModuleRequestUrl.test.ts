import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildReviewModuleRequestUrl,
} from "./reviewModuleRequestUrl";

describe("ReviewModule bootstrap API routing", () => {
  it("keeps localhost requests on the Student Vite /api proxy", () => {
    expect(
      buildReviewModuleRequestUrl({
        apiOrigin:
          "http://localhost:3000",
        browserUrl:
          "http://localhost:3002/en/subjects/sql-v2/modules/sql-v2-1/learn",
        locale: "en",
        subjectSlug: "sql-v2",
        moduleSlug: "sql-v2-1",
      }),
    ).toBe(
      "/api/student-ui/review-modules/sql-v2/sql-v2-1?locale=en",
    );
  });

  it("rewrites production Student requests to the Web API origin", () => {
    expect(
      buildReviewModuleRequestUrl({
        apiOrigin:
          "https://zoeskoul.com",
        browserUrl:
          "https://student.zoeskoul.com/en/subjects/sql-v2/modules/sql-v2-1/learn",
        locale: "en",
        subjectSlug: "sql-v2",
        moduleSlug: "sql-v2-1",
      }),
    ).toBe(
      "https://zoeskoul.com/api/student-ui/review-modules/sql-v2/sql-v2-1?locale=en",
    );
  });

  it("encodes route segments and locale query safely", () => {
    expect(
      buildReviewModuleRequestUrl({
        apiOrigin:
          "http://localhost:3000",
        browserUrl:
          "http://localhost:3002/en/subjects",
        locale: "fr",
        subjectSlug: "sql v2",
        moduleSlug: "module/one",
      }),
    ).toBe(
      "/api/student-ui/review-modules/sql%20v2/module%2Fone?locale=fr",
    );
  });
});
