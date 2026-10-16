import {
  existsSync,
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

function local(relative: string) {
  return fileURLToPath(
    new URL(relative, import.meta.url),
  );
}

function source(relative: string) {
  return readFileSync(
    local(relative),
    "utf8",
  );
}

describe("ZoeBuild Web-owned authentication boundary", () => {
  it("does not own Auth.js providers or handlers", () => {
    expect(
      existsSync(
        local("./auth.ts"),
      ),
    ).toBe(false);

    expect(
      existsSync(
        local(
          "../app/api/auth/[...nextauth]/route.ts",
        ),
      ),
    ).toBe(false);
  });

  it("uses the canonical shared session client", () => {
    const access =
      source(
        "./build/currentBuildAccess.ts",
      );

    const header =
      source(
        "../components/chrome/ZoeBuildHeader.tsx",
      );

    expect(access).toContain(
      "createAuthClient",
    );

    expect(header).toContain(
      "useAppSession",
    );

    expect(header).toContain(
      "buildAuthenticateUrl",
    );

    expect(header).toContain(
      "buildLogoutUrl",
    );
  });

  it("has no ZoeBuild NextAuth runtime dependency", () => {
    const pkg =
      source("../../package.json");

    const providers =
      source("../app/providers.tsx");

    const header =
      source(
        "../components/chrome/ZoeBuildHeader.tsx",
      );

    expect(pkg).not.toContain(
      '"next-auth"',
    );

    expect(providers).not.toContain(
      "SessionProvider",
    );

    expect(header).not.toContain(
      "next-auth",
    );
  });

  it("keeps /authenticate only as a Web redirect shim", () => {
    const page =
      source(
        "../app/authenticate/page.tsx",
      );

    expect(page).toContain(
      "buildZoeBuildWebAuthenticateUrl",
    );

    expect(page).toContain(
      "redirect(",
    );

    expect(page).not.toContain(
      "/api/auth/signin/",
    );
  });
});
