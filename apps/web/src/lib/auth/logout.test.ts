import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildKeycloakEndSessionUrl,
  buildWebLogoutUrl,
  readKeycloakIdToken,
  resolveLogoutProvider,
  resolveLogoutRedirect,
} from "./logout";

describe("resolveLogoutRedirect", () => {
  const baseUrl =
    "http://localhost:3000";

  it("accepts a locale-aware Web destination", () => {
    expect(
      resolveLogoutRedirect({
        rawRedirect:
          "http://localhost:3000/fr?loggedOut=1#top",
        baseUrl,
        locale: "fr",
        includeLocalApps: true,
      }),
    ).toBe(
      "http://localhost:3000/fr?loggedOut=1#top",
    );
  });

  it("keeps trusted app callbacks on Web to avoid a sign-in loop", () => {
    expect(
      resolveLogoutRedirect({
        rawRedirect:
          "http://localhost:3002/en/subjects",
        baseUrl,
        locale: "fr",
        includeLocalApps: true,
      }),
    ).toBe("http://localhost:3000/fr");
  });

  it.each([
    "https://evil.example",
    "https://zoeskoul.com.evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "http://user:secret@localhost:3000/en",
    "not a URL",
    "/api/auth/logout",
    "/fr/authenticate",
  ])(
    "rejects unsafe or looping destination %s",
    (rawRedirect) => {
      expect(
        resolveLogoutRedirect({
          rawRedirect,
          baseUrl,
          locale: "fr",
          includeLocalApps: true,
        }),
      ).toBe("http://localhost:3000/fr");
    },
  );
});

describe("logout provider metadata", () => {
  it.each([
    [{ provider: "google" }, "google"],
    [{ provider: "keycloak" }, "keycloak"],
    [{ provider: "other" }, "unknown"],
    [{}, "unknown"],
    [null, "signed-out"],
    [undefined, "signed-out"],
  ] as const)(
    "resolves %j as %s",
    (token, expected) => {
      expect(
        resolveLogoutProvider(token),
      ).toBe(expected);
    },
  );

  it("reads a Keycloak ID token only for Keycloak", () => {
    expect(
      readKeycloakIdToken({
        provider: "keycloak",
        kc_id_token: "server-token",
      }),
    ).toBe("server-token");
    expect(
      readKeycloakIdToken({
        provider: "google",
        kc_id_token: "must-not-leak",
      }),
    ).toBeNull();
    expect(
      readKeycloakIdToken({
        provider: "keycloak",
      }),
    ).toBeNull();
  });
});

describe("buildKeycloakEndSessionUrl", () => {
  it("builds the provider request with server-held metadata", () => {
    const logoutUrl = new URL(
      buildKeycloakEndSessionUrl({
        issuer:
          "https://accounts.example/realms/zoeskoul/",
        clientId: "zoeskoul-web",
        postLogoutRedirect:
          "https://zoeskoul.com/fr",
        idToken: "server-token",
      })!,
    );

    expect(logoutUrl.pathname).toBe(
      "/realms/zoeskoul/protocol/openid-connect/logout",
    );
    expect(
      logoutUrl.searchParams.get("client_id"),
    ).toBe("zoeskoul-web");
    expect(
      logoutUrl.searchParams.get(
        "post_logout_redirect_uri",
      ),
    ).toBe("https://zoeskoul.com/fr");
    expect(
      logoutUrl.searchParams.get(
        "id_token_hint",
      ),
    ).toBe("server-token");
  });

  it("allows Keycloak logout without an ID token", () => {
    const logoutUrl = new URL(
      buildKeycloakEndSessionUrl({
        issuer:
          "https://accounts.example/realms/zoeskoul",
        clientId: "zoeskoul-web",
        postLogoutRedirect:
          "https://zoeskoul.com/en",
        idToken: null,
      })!,
    );

    expect(
      logoutUrl.searchParams.has(
        "id_token_hint",
      ),
    ).toBe(false);
  });

  it.each([
    [undefined, "zoeskoul-web"],
    ["not a URL", "zoeskoul-web"],
    ["javascript:alert(1)", "zoeskoul-web"],
    ["https://user:secret@accounts.example", "zoeskoul-web"],
    ["https://accounts.example", undefined],
  ])(
    "skips provider logout for invalid metadata",
    (issuer, clientId) => {
      expect(
        buildKeycloakEndSessionUrl({
          issuer,
          clientId,
          postLogoutRedirect:
            "https://zoeskoul.com/en",
          idToken: "server-token",
        }),
      ).toBeNull();
    },
  );
});

describe("buildWebLogoutUrl", () => {
  it("uses the generic Web endpoint", () => {
    expect(
      buildWebLogoutUrl({
        websiteOrigin:
          "https://zoeskoul.com",
        locale: "ht",
      }),
    ).toBe(
      "https://zoeskoul.com/api/auth/logout?postLogoutRedirect=https%3A%2F%2Fzoeskoul.com%2Fht&locale=ht",
    );
  });

  it("carries an internal invitation destination for server validation", () => {
    const logoutUrl = new URL(
      buildWebLogoutUrl({
        websiteOrigin:
          "https://zoeskoul.com",
        locale: "fr",
        postLogoutRedirect:
          "/fr/invitations/course/invite-1",
      }),
    );

    expect(
      logoutUrl.searchParams.get(
        "postLogoutRedirect",
      ),
    ).toBe(
      "https://zoeskoul.com/fr/invitations/course/invite-1",
    );
  });
});
