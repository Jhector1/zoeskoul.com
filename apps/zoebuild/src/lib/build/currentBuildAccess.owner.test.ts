import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

function read(relative: string) {
  return readFileSync(
    fileURLToPath(
      new URL(relative, import.meta.url),
    ),
    "utf8",
  );
}

describe("ZoeBuild shared Web session owner", () => {
  it("resolves Web app-session before Build authorization", () => {
    const source =
      read("./currentBuildAccess.ts");

    expect(source).toContain(
      "createAuthClient",
    );

    expect(source).toContain(
      "apiOrigin: websiteOrigin",
    );

    expect(source).toContain(
      "client.fetchSession()",
    );

    expect(source).toContain(
      "session.user.id",
    );

    expect(source).toContain(
      "loadBuildAccessSnapshot(",
    );

    expect(source).not.toContain(
      "getCurrentUserAccess",
    );

    expect(source).not.toContain(
      "next-auth",
    );
  });
});
