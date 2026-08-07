import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readBrowserPreferenceSnapshot,
  serializePreferencesCookieValue,
} from "@zoeskoul/preferences";

describe("Student shared preference compatibility", () => {
  it("accepts a Web cookie snapshot without changing its values", () => {
    const preferences = {
      locale: "ht",
      theme: "dark",
      fontSizePx: 24,
      soundEnabled: false,
    } as const;
    const snapshot = readBrowserPreferenceSnapshot({
      cookie:
        `zoeskoul.preferences=${serializePreferencesCookieValue(preferences)}`,
      storage: null,
    });
    expect(snapshot).toEqual(preferences);
  });

  it("routes existing controls through shared persistence adapters", () => {
    const files = [
      "../App.tsx",
      "../components/chrome/StudentHeaderSlick.tsx",
      "../legacy-web/components/LocaleSwitcher.tsx",
      "../legacy-web/components/ThemeToggle.tsx",
      "../legacy-web/lib/sfx/SfxProvider.tsx",
    ];
    const source = files.map((file) =>
      readFileSync(new URL(file, import.meta.url), "utf8"),
    ).join("\n");

    expect(source).toContain("AppPreferencesProvider");
    expect(source).toContain("updatePreferences");
    expect(source).toContain("persistLocale");
    expect(source).toContain("useOptionalAppPreferences");
    expect(source).toContain("grid w-full grid-cols-4");
    expect(source).toContain("ui-btn-ide-border");
  });
});
