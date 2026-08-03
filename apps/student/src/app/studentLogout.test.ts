import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStudentLogoutUrl,
} from "./studentLogout";

describe("Student logout navigation", () => {
  it("points Sign out at the centralized Web endpoint", () => {
    const logoutUrl = new URL(
      buildStudentLogoutUrl({
        websiteOrigin:
          "http://localhost:3000",
        locale: "en",
      }),
    );

    expect(logoutUrl.toString()).toBe(
      "http://localhost:3000/api/auth/logout?postLogoutRedirect=http%3A%2F%2Flocalhost%3A3000%2Fen&locale=en",
    );
    expect(logoutUrl.searchParams.has(
      "provider",
    )).toBe(false);
  });
});
