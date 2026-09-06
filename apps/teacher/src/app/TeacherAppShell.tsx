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
  TeacherHeader,
  type TeacherHeaderSection,
} from "./TeacherHeader";
import {
  resolveTeacherLocation,
} from "./teacherRoutes";

function headerSection(
  kind:
    ReturnType<
      typeof resolveTeacherLocation
    >["kind"],
): TeacherHeaderSection {
  if (
    kind === "classes" ||
    kind === "class-new" ||
    kind === "class-detail"
  ) {
    return "classes";
  }

  if (
    kind === "assignments" ||
    kind === "assignment-new" ||
    kind === "assignment-detail"
  ) {
    return "assignments";
  }

  if (kind === "reports") {
    return "reports";
  }

  if (kind === "school") {
    return "school";
  }

  return "tutoring";
}

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

  let content;

  if (location.kind === "classes") {
    content = (
      <TeacherClassesPage
        apiOrigin={props.apiOrigin}
        websiteOrigin={
          props.websiteOrigin
        }
        locale={location.locale}
      />
    );
  } else if (
    location.kind === "class-new"
  ) {
    content = (
      <TeacherClassEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        classId={null}
      />
    );
  } else if (
    location.kind ===
    "class-detail"
  ) {
    content = (
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
  } else if (
    location.kind === "school"
  ) {
    content = (
      <TeacherSchoolPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (
    location.kind === "reports"
  ) {
    content = (
      <TeacherReportsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (
    location.kind ===
    "assignments"
  ) {
    content = (
      <TeacherAssignmentsPage
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );
  } else if (
    location.kind ===
    "assignment-new"
  ) {
    content = (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={null}
      />
    );
  } else if (
    location.kind ===
    "assignment-detail"
  ) {
    content = (
      <TeacherAssignmentEditor
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        assignmentId={
          location.assignmentId
        }
      />
    );
  } else {
    content = (
      <TeacherTutoringDashboard
        apiOrigin={props.apiOrigin}
        websiteOrigin={
          props.websiteOrigin
        }
        locale={location.locale}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
      <TeacherHeader
        locale={location.locale}
        websiteOrigin={
          props.websiteOrigin
        }
        activeSection={headerSection(
          location.kind,
        )}
      />
      {content}
    </div>
  );
}
