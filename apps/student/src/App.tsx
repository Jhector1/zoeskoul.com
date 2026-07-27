import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";

import { StudentAccessGate } from "./app/StudentAccessGate";
import { StudentAppShell } from "./app/StudentAppShell";
import "./shell.css";
import "./learning/learning.css";
import "./learning/shell-overrides.css";
import "./courses/course-reader.css";

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    getLocalAppOrigin("website");

  return (
    <StudentAccessGate
      apiOrigin={apiOrigin}
      websiteOrigin={websiteOrigin}
    >
      {(session) => (
        <StudentAppShell
          apiOrigin={apiOrigin}
          websiteOrigin={websiteOrigin}
          session={session}
        />
      )}
    </StudentAccessGate>
  );
}
