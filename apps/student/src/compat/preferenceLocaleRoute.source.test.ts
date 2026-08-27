import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = fs.readFileSync(
  fileURLToPath(
    new URL("../App.tsx", import.meta.url),
  ),
  "utf8",
);

describe("Student canonical preference locale route convergence", () => {
  it("binds the route locale to the canonical AppPreferences value", () => {
    expect(app).toContain("useAppPreferences");
    expect(app).toContain("StudentLocalePreferenceBoundary");
    expect(app).toContain("useLocationSnapshot");
    expect(app).toContain("currentLocale()");
    expect(app).toContain(
      "routeLocale === preferences.locale",
    );
    expect(app).toContain("navigate(");
    expect(app).toContain("replace: true");
    expect(app).toContain("locale: preferences.locale");
    expect(app).toContain("scroll: false");
  });

  it("keeps theme ownership outside the locale convergence boundary", () => {
    const theme =
      app.indexOf("<StudentThemeProvider>");
    const locale =
      app.indexOf("<StudentLocalePreferenceBoundary>");
    const access =
      app.indexOf("<StudentAccessGate");

    expect(theme).toBeGreaterThan(-1);
    expect(locale).toBeGreaterThan(theme);
    expect(access).toBeGreaterThan(locale);
  });
});
