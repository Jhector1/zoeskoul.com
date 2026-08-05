import "@zoeskoul/lesson-renderer/styles.css";
import "@zoeskoul/lesson-shell/styles.css";
import "@zoeskoul/editor-surface/styles.css";
import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";
import {
  AppPreferencesProvider,
} from "@zoeskoul/preferences/react";
import {
  useEffect,
  useState,
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
      </StudentThemeProvider>
    </AppPreferencesProvider>
  );
}
