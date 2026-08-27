import { describe, expect, it, vi } from "vitest";

import {
  APP_FONT_SIZE_OPTIONS,
  DEFAULT_APP_PREFERENCES,
  PreferencesClientError,
  createPreferencesClient,
  inferAppLocale,
  isAppTheme,
  languageTagToAppLocale,
  normalizeAppPreferences,
  normalizeFontSizePx,
  normalizeLocale,
  parseAcceptLanguage,
  parseAppPreferencesPatch,
  parsePreferencesCookieValue,
  preferencesEqual,
  readBrowserPreferenceSnapshot,
  resolveConcreteTheme,
  resolveInitialAppLocale,
  serializePreferencesCookieValue,
  writeLegacyPreferences,
} from "./index";

const saved = {
  authenticated: true,
  source: "database",
  preferences: {
    locale: "fr",
    theme: "dark",
    fontSizePx: 20,
    soundEnabled: false,
  },
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("preference contracts", () => {
  it("normalizes defaults and supported values", () => {
    expect(normalizeAppPreferences(null)).toEqual(DEFAULT_APP_PREFERENCES);
    expect(["light", "dark", "system"].every(isAppTheme)).toBe(true);
    expect(isAppTheme("sepia")).toBe(false);
    expect(normalizeLocale(" FR ")).toBe("fr");
    expect(normalizeLocale("unknown")).toBe("en");
    expect(normalizeLocale("es")).toBe("en");
    expect(APP_FONT_SIZE_OPTIONS.map((value) => normalizeFontSizePx(value))).toEqual(
      APP_FONT_SIZE_OPTIONS,
    );
    expect(normalizeFontSizePx(15)).toBe(16);
    expect(normalizeFontSizePx(21)).toBe(24);
  });

  it("infers a supported first locale from browser language before country", () => {
    expect(languageTagToAppLocale("fr-CA")).toBe("fr");
    expect(languageTagToAppLocale("ht_HT")).toBe("ht");
    expect(languageTagToAppLocale("es-MX")).toBeNull();

    expect(inferAppLocale({
      languages: ["fr-CA", "en-US"],
      country: "HT",
    })).toBe("fr");

    expect(inferAppLocale({
      languages: ["es-MX"],
      country: "HT",
    })).toBe("ht");

    expect(inferAppLocale({
      languages: ["es-MX"],
      country: "US",
    })).toBe("en");
  });

  it("lets a saved locale win over every automatic first-visit signal", () => {
    expect(resolveInitialAppLocale({
      savedLocale: "ht",
      languages: ["fr-CA", "en-US"],
      country: "FR",
    })).toBe("ht");

    expect(resolveInitialAppLocale({
      savedLocale: "unsupported",
      languages: ["fr-CA", "en-US"],
      country: "HT",
    })).toBe("fr");
  });

  it("honors Accept-Language quality and freezes system theme to a concrete value", () => {
    expect(parseAcceptLanguage("en;q=0.5, fr-CA;q=0.9, ht;q=0.7"))
      .toEqual(["fr-CA", "ht", "en"]);
    expect(resolveConcreteTheme("system", true)).toBe("dark");
    expect(resolveConcreteTheme("system", false)).toBe("light");
    expect(resolveConcreteTheme("dark", false)).toBe("dark");
  });

  it("strictly rejects invalid and unknown patch fields", () => {
    expect(parseAppPreferencesPatch({ theme: "sepia" }).success).toBe(false);
    expect(parseAppPreferencesPatch({ soundEnabled: "yes" }).success).toBe(false);
    expect(parseAppPreferencesPatch({ userId: "spoof", theme: "dark" }))
      .toMatchObject({ success: false });
    expect(parseAppPreferencesPatch({ fontSizePx: 18 }).success).toBe(false);
    expect(parseAppPreferencesPatch({ theme: "dark" }))
      .toEqual({ success: true, data: { theme: "dark" } });
  });

  it("round-trips a stable versioned cookie and rejects invalid versions", () => {
    const serialized = serializePreferencesCookieValue(saved.preferences);
    expect(serialized).toBe("v1.fr.d.20.0");
    expect(parsePreferencesCookieValue(serialized)).toEqual(saved.preferences);
    expect(parsePreferencesCookieValue("v2.fr.d.20.0")).toBeNull();
    expect(parsePreferencesCookieValue("v1.fr.d.18.0")).toBeNull();
  });

  it("prefers a valid shared cookie over stale local storage", () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "zoeskoul-theme" ? "light" : null),
    };
    expect(readBrowserPreferenceSnapshot({
      cookie: `other=x; zoeskoul.preferences=${serializePreferencesCookieValue(saved.preferences)}`,
      storage,
    })).toEqual(saved.preferences);
  });

  it("preserves local sound volume while writing enabled state", () => {
    const values = new Map<string, string>([
      ["learnoir.sfx", JSON.stringify({ enabled: true, volume: 0.35 })],
    ]);
    writeLegacyPreferences({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }, saved.preferences);
    expect(JSON.parse(values.get("learnoir.sfx") ?? "")).toEqual({
      enabled: false,
      volume: 0.35,
    });
    expect(preferencesEqual(saved.preferences, { ...saved.preferences })).toBe(true);
  });
});

describe("preferences browser client", () => {
  it("uses credentials include and supports GET and PATCH", async () => {
    const fetchImpl = vi.fn(async () => json(saved));
    const client = createPreferencesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    });

    await expect(client.get()).resolves.toEqual(saved);
    await expect(client.patch({ theme: "dark" })).resolves.toEqual(saved);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      new URL("/api/app-preferences", "https://zoeskoul.com"),
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.any(URL),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({ theme: "dark" }),
      }),
    );
  });

  it.each([401, 403, 500])("classifies HTTP %s without redirecting", async (status) => {
    const replace = vi.fn();
    Object.defineProperty(globalThis, "window", {
      value: { location: { replace } },
      configurable: true,
    });
    await expect(createPreferencesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl: async () => json({ error: "Failed" }, status),
    }).get()).rejects.toMatchObject({
      name: "PreferencesClientError",
      kind: "http",
      status,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("distinguishes network, invalid JSON, and invalid DTO failures", async () => {
    await expect(createPreferencesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl: async () => { throw new Error("offline"); },
    }).get()).rejects.toMatchObject({ kind: "network" });

    await expect(createPreferencesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl: async () => new Response("{bad"),
    }).get()).rejects.toMatchObject({ kind: "invalid_json" });

    await expect(createPreferencesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl: async () => json({ preferences: {} }),
    }).get()).rejects.toMatchObject({ kind: "invalid_payload" });
  });

  it("exports a stable typed client error", () => {
    expect(new PreferencesClientError({
      message: "offline",
      kind: "network",
    })).toMatchObject({ name: "PreferencesClientError", kind: "network" });
  });
});
