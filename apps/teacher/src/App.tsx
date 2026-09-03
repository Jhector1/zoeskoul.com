import {
  TeacherAccessGate,
} from "./app/TeacherAccessGate";
import {
  TeacherAppShell,
} from "./app/TeacherAppShell";
import {
  resolveTeacherAppOrigins,
} from "./appOrigins";
import {
  TeacherIntlProvider,
} from "./i18n/TeacherIntlProvider";

export function App() {
  const {
    apiOrigin,
    websiteOrigin,
  } = resolveTeacherAppOrigins();

  return (
    <TeacherIntlProvider>
      <TeacherAccessGate
        apiOrigin={apiOrigin}
        websiteOrigin={
          websiteOrigin
        }
      >
        {() => (
          <TeacherAppShell
            apiOrigin={apiOrigin}
            websiteOrigin={
              websiteOrigin
            }
          />
        )}
      </TeacherAccessGate>
    </TeacherIntlProvider>
  );
}
