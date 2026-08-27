import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const proxy = fs.readFileSync(
  fileURLToPath(
    new URL("../../proxy.ts", import.meta.url),
  ),
  "utf8",
);

describe("Web canonical preference locale bootstrap", () => {
  it("uses the shared precedence resolver and never localizes API paths", () => {
    expect(proxy).toContain(
      'from "@zoeskoul/preferences"',
    );
    expect(proxy).toContain("parseAcceptLanguage(");
    expect(proxy).toContain("resolveInitialAppLocale({");
    expect(proxy).toContain('req.headers.get("accept-language")');
    expect(proxy).toContain('req.headers.get("x-vercel-ip-country")');
    expect(proxy).toContain('req.headers.get("cf-ipcountry")');
    expect(proxy).toContain('pathname !== "/api"');
    expect(proxy).toContain('!pathname.startsWith("/api/")');
  });

  it("keeps the saved locale authoritative on a conflicting localized URL", () => {
    expect(proxy).toContain(
      "routeLocale !== savedLocale",
    );
    expect(proxy).toContain("localePathname(");
    expect(proxy).toContain("savedLocale");
  });
});
