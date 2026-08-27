import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  APP_PREFERENCES_EVENT,
  DEFAULT_APP_PREFERENCES,
  LEGACY_PREFERENCE_KEYS,
  PreferencesClientError,
  createPreferencesClient,
  normalizeAppPreferences,
  parseAppPreferencesPatch,
  inferAppLocale,
  resolveConcreteTheme,
  preferencesEqual,
  readBrowserPreferenceSnapshot,
  readLocalPreferences,
  writeLegacyPreferences,
  type AppPreferences,
  type AppPreferencesPatch,
} from "./index";

export type AppPreferencesState = {
  preferences: AppPreferences;
  status: "loading" | "ready" | "error";
  authenticated: boolean | null;
  error: PreferencesClientError | null;
  updatePreferences: (patch: AppPreferencesPatch) => Promise<void>;
  revalidate: () => Promise<void>;
};

const PreferencesContext = createContext<AppPreferencesState | null>(null);

function browserSnapshot(initial?: AppPreferences): AppPreferences {
  if (typeof window === "undefined") {
    return initial ?? { ...DEFAULT_APP_PREFERENCES };
  }

  const inferredFallback = normalizeAppPreferences({
    ...(initial ?? DEFAULT_APP_PREFERENCES),
    locale: initial?.locale ?? inferAppLocale({
      languages: navigator.languages?.length
        ? navigator.languages
        : [navigator.language],
    }),
    theme: resolveConcreteTheme(
      initial?.theme ?? DEFAULT_APP_PREFERENCES.theme,
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
    ),
  });

  const snapshot = readBrowserPreferenceSnapshot({
    cookie: document.cookie,
    storage: window.localStorage,
    fallback: inferredFallback,
  });
  persistCompatibility(snapshot);
  return snapshot;
}

function concreteBrowserTheme(
  current: AppPreferences["theme"],
): Exclude<AppPreferences["theme"], "system"> {
  if (current === "light" || current === "dark") return current;
  return resolveConcreteTheme(
    current,
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
}

function persistCompatibility(preferences: AppPreferences): void {
  if (typeof window === "undefined") return;
  try {
    writeLegacyPreferences(window.localStorage, preferences);
  } catch {
    // Restricted storage must not block appearance updates.
  }

  document.documentElement.style.setProperty(
    "--app-font-size",
    `${preferences.fontSizePx}px`,
  );

  document.cookie =
    `NEXT_LOCALE=${preferences.locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function AppPreferencesProvider(props: {
  apiOrigin: string;
  initialPreferences?: AppPreferences;
  children: ReactNode;
}) {
  const clientRef = useRef(createPreferencesClient({
    apiOrigin: props.apiOrigin,
  }));
  const [preferences, setPreferences] = useState<AppPreferences>(
    () => browserSnapshot(props.initialPreferences),
  );
  const preferencesRef = useRef(preferences);
  const authenticatedRef = useRef<boolean | null>(null);
  const [status, setStatus] = useState<AppPreferencesState["status"]>("loading");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<PreferencesClientError | null>(null);

  useEffect(() => {
    clientRef.current = createPreferencesClient({
      apiOrigin: props.apiOrigin,
    });
  }, [props.apiOrigin]);

  function commit(next: AppPreferences) {
    preferencesRef.current = next;
    setPreferences(next);
    persistCompatibility(next);
  }

  async function revalidate() {
    try {
      let response = await clientRef.current.get();

      if (
        response.authenticated &&
        response.source === "cookie"
      ) {
        response = await clientRef.current.patch(response.preferences);
      } else if (
        !response.authenticated &&
        response.source === "default" &&
        !preferencesEqual(
          preferencesRef.current,
          response.preferences,
        )
      ) {
        response = await clientRef.current.mirrorAnonymous(
          preferencesRef.current,
        );
      }

      if (response.preferences.theme === "system") {
        const theme = concreteBrowserTheme(preferencesRef.current.theme);
        response = response.authenticated
          ? await clientRef.current.patch({ theme })
          : await clientRef.current.mirrorAnonymous({
              ...response.preferences,
              theme,
            });
      }

      authenticatedRef.current = response.authenticated;
      setAuthenticated(response.authenticated);
      commit(response.preferences);
      setError(null);
      setStatus("ready");
    } catch (cause) {
      const nextError =
        cause instanceof PreferencesClientError
          ? cause
          : new PreferencesClientError({
              message: cause instanceof Error ? cause.message : "Preference request failed.",
              kind: "network",
            });
      setError(nextError);
      setStatus("error");
    }
  }

  async function updatePreferences(patch: AppPreferencesPatch) {
    const parsed = parseAppPreferencesPatch(patch);
    if (!parsed.success) {
      const nextError = new PreferencesClientError({
        message: parsed.error,
        kind: "invalid_payload",
        payload: patch,
      });
      setError(nextError);
      setStatus("error");
      throw nextError;
    }

    const optimistic = normalizeAppPreferences({
      ...preferencesRef.current,
      ...parsed.data,
    });
    commit(optimistic);
    setError(null);
    setStatus("ready");

    try {
      const response = authenticatedRef.current === false
        ? await clientRef.current.mirrorAnonymous(optimistic)
        : await clientRef.current.patch(parsed.data);
      authenticatedRef.current = response.authenticated;
      setAuthenticated(response.authenticated);
      commit(response.preferences);
      setStatus("ready");
    } catch (cause) {
      let failure: unknown = cause;
      if (
        cause instanceof PreferencesClientError &&
        cause.status === 401
      ) {
        try {
          const response =
            await clientRef.current.mirrorAnonymous(optimistic);
          authenticatedRef.current = false;
          setAuthenticated(false);
          commit(response.preferences);
          setStatus("ready");
          return;
        } catch (anonymousCause) {
          failure = anonymousCause;
        }
      }

      const nextError =
        failure instanceof PreferencesClientError
          ? failure
          : new PreferencesClientError({
              message:
                failure instanceof Error
                  ? failure.message
                  : "Preference save failed.",
              kind: "network",
            });
      setError(nextError);
      setStatus("error");
      throw nextError;
    }
  }

  useEffect(() => {
    persistCompatibility(preferencesRef.current);
    void revalidate();
  }, [props.apiOrigin]);

  useEffect(() => {
    const handlePreferenceRequest = (event: Event) => {
      const parsed = parseAppPreferencesPatch(
        (event as CustomEvent<unknown>).detail,
      );
      if (parsed.success) {
        void updatePreferences(parsed.data).catch(() => undefined);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key &&
        !Object.values(LEGACY_PREFERENCE_KEYS).includes(
          event.key as (typeof LEGACY_PREFERENCE_KEYS)[keyof typeof LEGACY_PREFERENCE_KEYS],
        )
      ) {
        return;
      }

      try {
        commit(readLocalPreferences(
          window.localStorage,
          preferencesRef.current,
        ));
      } catch {
        // Keep the current in-memory preference in restricted contexts.
      }
    };

    window.addEventListener(APP_PREFERENCES_EVENT, handlePreferenceRequest);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(APP_PREFERENCES_EVENT, handlePreferenceRequest);
      window.removeEventListener("storage", handleStorage);
    };
  });

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        status,
        authenticated,
        error,
        updatePreferences,
        revalidate,
      }}
    >
      {props.children}
    </PreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferencesState {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error(
      "useAppPreferences must be used within AppPreferencesProvider.",
    );
  }
  return value;
}

export function useOptionalAppPreferences(): AppPreferencesState | null {
  return useContext(PreferencesContext);
}
