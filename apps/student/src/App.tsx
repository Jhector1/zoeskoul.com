import "@zoeskoul/lesson-renderer/styles.css";
import "@zoeskoul/lesson-shell/styles.css";
import "@zoeskoul/editor-surface/styles.css";
import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";
import {
  AppPreferencesProvider,
  useAppPreferences,
} from "@zoeskoul/preferences/react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { StudentAccessGate } from "./app/StudentAccessGate";
import { StudentAppShell } from "./app/StudentAppShell";
import {
  isPublicStudentPath,
} from "./app/studentRoutes";
import { StudentThemeProvider } from "./platform/StudentThemeProvider";
import { LegacyProviders } from "./compat/LegacyProviders";
import { LegacyApiBridge } from "./compat/LegacyApiBridge";
import "./shell.css";

import "./legacy-web/styles/globals.css";

import {
  currentLocale,
  navigate,
  useLocationSnapshot,
} from "./compat/navigation-runtime";

function useStudentPathname() {
  const [pathname, setPathname] = useState(
    () => window.location.pathname,
  );

  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", update);
    window.addEventListener(
      "zoeskoul:vite-navigation",
      update,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        update,
      );
      window.removeEventListener(
        "zoeskoul:vite-navigation",
        update,
      );
    };
  }, []);

  return pathname;
}

function StudentLocalePreferenceBoundary(props: {
  children: ReactNode;
}) {
  const { preferences } =
    useAppPreferences();
  const location =
    useLocationSnapshot();
  const routeLocale =
    currentLocale();
  const routeMatchesPreference =
    routeLocale === preferences.locale;

  useEffect(() => {
    if (routeMatchesPreference) {
      return;
    }

    navigate(
      location,
      {
        replace: true,
        locale: preferences.locale,
        scroll: false,
      },
    );
  }, [
    location,
    preferences.locale,
    routeMatchesPreference,
  ]);

  if (!routeMatchesPreference) {
    return (
      <main
        className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white"
        aria-busy="true"
      >
        <div className="ui-container py-12">
          <div className="ui-page-surface p-6">
            Loading ZoeSkoul…
          </div>
        </div>
      </main>
    );
  }

  return props.children;
}

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    getLocalAppOrigin("website");

  const pathname = useStudentPathname();

  return (
    <AppPreferencesProvider apiOrigin={apiOrigin}>
      <StudentThemeProvider>
        <StudentLocalePreferenceBoundary>
          <StudentAccessGate
          apiOrigin={apiOrigin}
          websiteOrigin={websiteOrigin}
          allowUnauthenticated={
            isPublicStudentPath(pathname)
          }
        >
          {(session) => (
            <LegacyProviders session={session}>
              <LegacyApiBridge apiOrigin={apiOrigin}>
                <StudentAppShell
                  apiOrigin={apiOrigin}
                  websiteOrigin={websiteOrigin}
                  session={session}
                />
              </LegacyApiBridge>
            </LegacyProviders>
          )}
          </StudentAccessGate>
        </StudentLocalePreferenceBoundary>
      </StudentThemeProvider>
    </AppPreferencesProvider>
  );
}
