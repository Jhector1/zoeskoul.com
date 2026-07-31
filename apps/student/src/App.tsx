import "@zoeskoul/lesson-renderer/styles.css";
import "@zoeskoul/lesson-shell/styles.css";
import "@zoeskoul/editor-surface/styles.css";
import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";

import { StudentAccessGate } from "./app/StudentAccessGate";
import { StudentAppShell } from "./app/StudentAppShell";
import { StudentThemeProvider } from "./platform/StudentThemeProvider";
import { LegacyProviders } from "./compat/LegacyProviders";
import { LegacyApiBridge } from "./compat/LegacyApiBridge";
import "./shell.css";

import "./legacy-web/styles/globals.css";
export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    getLocalAppOrigin("website");

  return (
    <StudentThemeProvider>
      <StudentAccessGate
        apiOrigin={apiOrigin}
        websiteOrigin={websiteOrigin}
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
  );
}
