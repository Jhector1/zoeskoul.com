import {
  currentLocale,
  useLocationSnapshot,
} from "../compat/navigation-runtime";
import {
  TeacherAssignmentEditor,
} from "../features/assignments/TeacherAssignmentEditor";
import {
  TeacherAssignmentsPage,
} from "../features/assignments/TeacherAssignmentsPage";
import {
  TeacherClassCreateWizard,
} from "../features/classes/TeacherClassCreateWizard";
import {
  TeacherClassWorkspace,
} from "../features/classes/TeacherClassWorkspace";
import {
  TeacherClassesPage,
} from "../features/classes/TeacherClassesPage";
import {
  TeacherHomePage,
} from "../features/home/TeacherHomePage";
import {
  TeacherReportsPage,
} from "../features/reports/TeacherReportsPage";
import {
  TeacherSchoolPage,
} from "../features/school/TeacherSchoolPage";
import TeacherTutoringDashboard from "../features/tutoring/TeacherTutoringDashboard";
import {
  TeacherHeader,
  type TeacherHeaderSection,
} from "./TeacherHeader";
import {
  resolveTeacherLocation,
} from "./teacherRoutes";

function headerSection(
  kind: ReturnType<typeof resolveTeacherLocation>["kind"],
): TeacherHeaderSection {
  if (
    kind === "classes" ||
    kind === "class-new" ||
    kind === "class-detail" ||
    kind === "assignments" ||
    kind === "assignment-new" ||
    kind === "assignment-detail"
  ) {
    return "classes";
  }

  if (
    kind === "school" ||
    kind === "reports"
  ) {
    return "institution";
  }

  if (kind === "tutoring") {
    return "tutoring";
  }

  return "home";
}

export function TeacherAppShell(props: {
  apiOrigin: string;
  websiteOrigin: string;
}) {
  useLocationSnapshot();

  const location = resolveTeacherLocation(
    window.location.pathname,
    currentLocale(),
  );

  const assignmentSearch =
    location.kind === "assignment-new"
      ? new URLSearchParams(window.location.search)
      : null;
  const assignmentPrefillSubjectId =
    assignmentSearch?.get("subjectId") ?? null;
  const assignmentPrefillClassId =
    assignmentSearch?.get("classId") ?? null;

  let content;

  if (location.kind === "home") {
    content = (
      <TeacherHomePage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "classes") {
    content = (
      <TeacherClassesPage
        apiOrigin={props.apiOrigin}
        websiteOrigin={props.websiteOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "class-new") {
    content = (
      <TeacherClassCreateWizard
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "class-detail") {
    content = (
      <TeacherClassWorkspace
        apiOrigin={props.apiOrigin}
        websiteOrigin={props.websiteOrigin}
        locale={location.locale}
        classId={location.classId}
      />
    );
  } else if (location.kind === "school") {
    content = (
      <TeacherSchoolPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "reports") {
    content = (
      <TeacherReportsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "assignments") {
    content = (
      <TeacherAssignmentsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (location.kind === "assignment-new") {
    content = (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={null}
        initialSubjectId={assignmentPrefillSubjectId}
        initialClassId={assignmentPrefillClassId}
      />
    );
  } else if (location.kind === "assignment-detail") {
    content = (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={location.assignmentId}
      />
    );
  } else {
    content = (
      <TeacherTutoringDashboard
        apiOrigin={props.apiOrigin}
        websiteOrigin={props.websiteOrigin}
        locale={location.locale}
      />
    );
  }

  return (
    <div className="min-h-screen ui-bg text-[rgb(var(--ui-text)/1)]">
      <TeacherHeader
        locale={location.locale}
        websiteOrigin={props.websiteOrigin}
        activeSection={headerSection(location.kind)}
      />
      {content}
    </div>
  );
}
