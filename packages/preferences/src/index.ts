export const APP_THEMES = ["light", "dark", "system"] as const;
export const APP_LOCALES = ["en", "fr", "ht"] as const;
export const APP_FONT_SIZE_OPTIONS = [14, 16, 20, 24] as const;

export const APP_PREFERENCES_COOKIE_NAME = "zoeskoul.preferences";
export const APP_PREFERENCES_COOKIE_VERSION = 1;
export const APP_PREFERENCES_EVENT = "zoeskoul:preferences-update";

export const LEGACY_PREFERENCE_KEYS = {
  locale: "learnoir:locale",
  theme: "zoeskoul-theme",
  fontSizePx: "APP_FONT_SIZE_PX",
  sound: "learnoir.sfx",
} as const;

export type AppTheme = (typeof APP_THEMES)[number];
export type AppLocale = (typeof APP_LOCALES)[number];
export type AppFontSizePx = (typeof APP_FONT_SIZE_OPTIONS)[number];

export type AppPreferences = {
  locale: AppLocale;
  theme: AppTheme;
  fontSizePx: AppFontSizePx;
  soundEnabled: boolean;
};

export type AppPreferencesPatch = Partial<AppPreferences>;

export type AppPreferencesResponse = {
  authenticated: boolean;
  preferences: AppPreferences;
  source: "database" | "cookie" | "default";
};

export const DEFAULT_APP_PREFERENCES: Readonly<AppPreferences> = {
  locale: "en",
  theme: "system",
  fontSizePx: 16,
  soundEnabled: true,
};

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" &&
    APP_THEMES.includes(value as AppTheme);
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" &&
    APP_LOCALES.includes(value as AppLocale);
}

export function isAppFontSizePx(value: unknown): value is AppFontSizePx {
  return typeof value === "number" &&
    APP_FONT_SIZE_OPTIONS.includes(value as AppFontSizePx);
}

export function normalizeLocale(
  value: unknown,
  fallback: AppLocale = DEFAULT_APP_PREFERENCES.locale,
): AppLocale {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return isAppLocale(normalized) ? normalized : fallback;
}

export function normalizeTheme(
  value: unknown,
  fallback: AppTheme = DEFAULT_APP_PREFERENCES.theme,
): AppTheme {
  return isAppTheme(value) ? value : fallback;
}

export function normalizeFontSizePx(
  value: unknown,
  fallback: AppFontSizePx = DEFAULT_APP_PREFERENCES.fontSizePx,
): AppFontSizePx {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value <= 14) return 14;
  if (value <= 16) return 16;
  if (value <= 20) return 20;
  return 24;
}

export function normalizeAppPreferences(
  value: unknown,
  fallback: AppPreferences = { ...DEFAULT_APP_PREFERENCES },
): AppPreferences {
  const candidate =
    typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};

  return {
    locale: normalizeLocale(candidate.locale, fallback.locale),
    theme: normalizeTheme(candidate.theme, fallback.theme),
    fontSizePx: normalizeFontSizePx(
      candidate.fontSizePx,
      fallback.fontSizePx,
    ),
    soundEnabled:
      typeof candidate.soundEnabled === "boolean"
        ? candidate.soundEnabled
        : fallback.soundEnabled,
  };
}

export function isAppPreferences(value: unknown): value is AppPreferences {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 4 &&
    Object.keys(candidate).every((key) =>
      ["locale", "theme", "fontSizePx", "soundEnabled"].includes(key)) &&
    isAppLocale(candidate.locale) &&
    isAppTheme(candidate.theme) &&
    isAppFontSizePx(candidate.fontSizePx) &&
    typeof candidate.soundEnabled === "boolean"
  );
}

export function parseAppPreferencesPatch(
  value: unknown,
):
  | { success: true; data: AppPreferencesPatch }
  | { success: false; error: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return { success: false, error: "Preferences must be an object." };
  }

  const candidate = value as Record<string, unknown>;
  const allowed = new Set([
    "locale",
    "theme",
    "fontSizePx",
    "soundEnabled",
  ]);
  const unknownKey = Object.keys(candidate).find((key) => !allowed.has(key));

  if (unknownKey) {
    return {
      success: false,
      error: `Unknown preference field: ${unknownKey}.`,
    };
  }

  if (Object.keys(candidate).length === 0) {
    return { success: false, error: "At least one preference is required." };
  }

  if ("locale" in candidate && !isAppLocale(candidate.locale)) {
    return { success: false, error: "Invalid locale." };
  }
  if ("theme" in candidate && !isAppTheme(candidate.theme)) {
    return { success: false, error: "Invalid theme." };
  }
  if (
    "fontSizePx" in candidate &&
    !isAppFontSizePx(candidate.fontSizePx)
  ) {
    return { success: false, error: "Invalid font size." };
  }
  if (
    "soundEnabled" in candidate &&
    typeof candidate.soundEnabled !== "boolean"
  ) {
    return { success: false, error: "Invalid sound preference." };
  }

  return {
    success: true,
    data: candidate as AppPreferencesPatch,
  };
}

export function preferencesEqual(
  left: AppPreferences,
  right: AppPreferences,
): boolean {
  return (
    left.locale === right.locale &&
    left.theme === right.theme &&
    left.fontSizePx === right.fontSizePx &&
    left.soundEnabled === right.soundEnabled
  );
}

const THEME_CODES: Record<AppTheme, string> = {
  light: "l",
  dark: "d",
  system: "s",
};

const THEMES_BY_CODE: Record<string, AppTheme | undefined> = {
  l: "light",
  d: "dark",
  s: "system",
};

export function serializePreferencesCookieValue(
  preferences: AppPreferences,
): string {
  return [
    `v${APP_PREFERENCES_COOKIE_VERSION}`,
    preferences.locale,
    THEME_CODES[preferences.theme],
    preferences.fontSizePx,
    preferences.soundEnabled ? "1" : "0",
  ].join(".");
}

export function parsePreferencesCookieValue(
  value: string | null | undefined,
): AppPreferences | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const [version, locale, themeCode, fontSize, sound, ...rest] =
    decoded.split(".");

  if (
    rest.length > 0 ||
    version !== `v${APP_PREFERENCES_COOKIE_VERSION}`
  ) {
    return null;
  }

  const theme = THEMES_BY_CODE[themeCode ?? ""];
  const parsedFontSize = Number(fontSize);
  const parsedSound =
    sound === "1" ? true : sound === "0" ? false : null;

  if (
    !isAppLocale(locale) ||
    !theme ||
    !isAppFontSizePx(parsedFontSize) ||
    parsedSound === null
  ) {
    return null;
  }

  return {
    locale,
    theme,
    fontSizePx: parsedFontSize,
    soundEnabled: parsedSound,
  };
}

export function readPreferencesCookie(
  cookieHeader: string | null | undefined,
): AppPreferences | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== APP_PREFERENCES_COOKIE_NAME) continue;
    return parsePreferencesCookieValue(part.slice(separator + 1).trim());
  }

  return null;
}

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readLocalPreferences(
  storage: Pick<Storage, "getItem">,
  fallback: AppPreferences = { ...DEFAULT_APP_PREFERENCES },
): AppPreferences {
  let soundEnabled: unknown;

  try {
    const rawSound = storage.getItem(LEGACY_PREFERENCE_KEYS.sound);
    if (rawSound) {
      const parsed = JSON.parse(rawSound) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        soundEnabled = (parsed as Record<string, unknown>).enabled;
      }
    }
  } catch {
    soundEnabled = undefined;
  }

  const rawFontSize = storage.getItem(LEGACY_PREFERENCE_KEYS.fontSizePx);

  return normalizeAppPreferences(
    {
      locale: storage.getItem(LEGACY_PREFERENCE_KEYS.locale),
      theme: storage.getItem(LEGACY_PREFERENCE_KEYS.theme),
      fontSizePx: rawFontSize === null ? undefined : Number(rawFontSize),
      soundEnabled,
    },
    fallback,
  );
}

export function readBrowserPreferenceSnapshot(args: {
  cookie?: string | null;
  storage?: Pick<Storage, "getItem"> | null;
  fallback?: AppPreferences;
}): AppPreferences {
  const fallback = args.fallback ?? { ...DEFAULT_APP_PREFERENCES };
  const cookiePreferences = readPreferencesCookie(args.cookie);
  if (cookiePreferences) return cookiePreferences;
  if (!args.storage) return fallback;

  try {
    return readLocalPreferences(args.storage, fallback);
  } catch {
    return fallback;
  }
}

export function writeLegacyPreferences(
  storage: PreferenceStorage,
  preferences: AppPreferences,
): void {
  storage.setItem(LEGACY_PREFERENCE_KEYS.locale, preferences.locale);
  storage.setItem(LEGACY_PREFERENCE_KEYS.theme, preferences.theme);
  storage.setItem(
    LEGACY_PREFERENCE_KEYS.fontSizePx,
    String(preferences.fontSizePx),
  );

  let volume = 0.7;
  try {
    const current = storage.getItem(LEGACY_PREFERENCE_KEYS.sound);
    const parsed = current ? JSON.parse(current) as unknown : null;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).volume === "number"
    ) {
      volume = Math.max(
        0,
        Math.min(1, (parsed as Record<string, number>).volume),
      );
    }
  } catch {
    volume = 0.7;
  }

  storage.setItem(
    LEGACY_PREFERENCE_KEYS.sound,
    JSON.stringify({ enabled: preferences.soundEnabled, volume }),
  );
}

export function isAppPreferencesResponse(
  value: unknown,
): value is AppPreferencesResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 3 &&
    Object.keys(candidate).every((key) =>
      ["authenticated", "preferences", "source"].includes(key)) &&
    typeof candidate.authenticated === "boolean" &&
    ["database", "cookie", "default"].includes(String(candidate.source)) &&
    isAppPreferences(candidate.preferences)
  );
}

export class PreferencesClientError extends Error {
  readonly kind: "http" | "network" | "invalid_json" | "invalid_payload";
  readonly status?: number;
  readonly payload?: unknown;

  constructor(args: {
    message: string;
    kind: "http" | "network" | "invalid_json" | "invalid_payload";
    status?: number;
    payload?: unknown;
  }) {
    super(args.message);
    this.name = "PreferencesClientError";
    this.kind = args.kind;
    this.status = args.status;
    this.payload = args.payload;
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PreferencesClientError({
      message: "The preferences response was not valid JSON.",
      kind: "invalid_json",
      status: response.status,
      payload: text,
    });
  }
}

export function createPreferencesClient(options: {
  apiOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const origin = new URL(options.apiOrigin).origin;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function request(
    method: "GET" | "PATCH" | "POST",
    preferences?: AppPreferencesPatch | AppPreferences,
    signal?: AbortSignal,
  ): Promise<AppPreferencesResponse> {
    let response: Response;
    try {
      response = await fetchImpl(
        new URL("/api/app-preferences", origin),
        {
          method,
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...(preferences ? { "Content-Type": "application/json" } : {}),
          },
          body: preferences ? JSON.stringify(preferences) : undefined,
          signal,
        },
      );
    } catch (error) {
      throw new PreferencesClientError({
        message: error instanceof Error ? error.message : "Preference request failed.",
        kind: "network",
      });
    }

    let payload: unknown;
    try {
      payload = await readJsonResponse(response);
    } catch (error) {
      if (error instanceof PreferencesClientError && !response.ok) {
        throw new PreferencesClientError({
          message: `API request failed with status ${response.status}.`,
          kind: "http",
          status: response.status,
          payload: error.payload,
        });
      }
      throw error;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as Record<string, unknown>).error === "string"
          ? String((payload as Record<string, unknown>).error)
          : `API request failed with status ${response.status}.`;
      throw new PreferencesClientError({
        message,
        kind: "http",
        status: response.status,
        payload,
      });
    }

    if (!isAppPreferencesResponse(payload)) {
      throw new PreferencesClientError({
        message: "The preferences response was invalid.",
        kind: "invalid_payload",
        payload,
      });
    }

    return payload;
  }

  return {
    get: (signal?: AbortSignal) => request("GET", undefined, signal),
    patch: (patch: AppPreferencesPatch, signal?: AbortSignal) =>
      request("PATCH", patch, signal),
    mirrorAnonymous: (preferences: AppPreferences, signal?: AbortSignal) =>
      request("POST", preferences, signal),
  };
}

export function requestAppPreferencesUpdate(
  patch: AppPreferencesPatch,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(APP_PREFERENCES_EVENT, { detail: patch }),
  );
}
