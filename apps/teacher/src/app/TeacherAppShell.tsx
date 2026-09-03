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
  TeacherClassEditor,
} from "../features/classes/TeacherClassEditor";
import {
  TeacherClassDashboard,
} from "../features/classes/TeacherClassDashboard";
import {
  TeacherClassesPage,
} from "../features/classes/TeacherClassesPage";
import {
  TeacherReportsPage,
} from "../features/reports/TeacherReportsPage";
import {
  TeacherSchoolPage,
} from "../features/school/TeacherSchoolPage";
import TeacherTutoringDashboard from "../features/tutoring/TeacherTutoringDashboard";
import {
  resolveTeacherLocation,
} from "./teacherRoutes";

export function TeacherAppShell(props: {
  apiOrigin: string;
  websiteOrigin: string;
}) {
  useLocationSnapshot();

  const location =
    resolveTeacherLocation(
      window.location.pathname,
      currentLocale(),
    );

  if (location.kind === "classes") {
    return (
      <TeacherClassesPage
        apiOrigin={props.apiOrigin}
        websiteOrigin={
          props.websiteOrigin
        }
        locale={location.locale}
      />
    );
  }

  if (location.kind === "class-new") {
    return (
      <TeacherClassEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        classId={null}
      />
    );
  }

  if (
    location.kind ===
    "class-detail"
  ) {
    return (
      <>
        <TeacherClassDashboard
          apiOrigin={props.apiOrigin}
          locale={location.locale}
          classId={location.classId}
        />
        <TeacherClassEditor
          apiOrigin={props.apiOrigin}
          locale={location.locale}
          classId={
            location.classId
          }
        />
      </>
    );
  }

  if (location.kind === "school") {
    return <TeacherSchoolPage apiOrigin={props.apiOrigin} locale={location.locale} />;
  }

  if (
    location.kind ===
    "reports"
  ) {
    return (
      <TeacherReportsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  }

  if (
    location.kind ===
    "assignments"
  ) {
    return (
      <TeacherAssignmentsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  }

  if (
    location.kind ===
    "assignment-new"
  ) {
    return (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={null}
      />
    );
  }

  if (
    location.kind ===
    "assignment-detail"
  ) {
    return (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={
          location.assignmentId
        }
      />
    );
  }

  return (
    <TeacherTutoringDashboard
      apiOrigin={props.apiOrigin}
      websiteOrigin={
        props.websiteOrigin
      }
      locale={location.locale}
    />
  );
}
