import type {
  LearningAssignmentSummary,
  LearningCourseSummary,
  LearningTutoringSummary,
} from "@zoeskoul/learning-client";
import { useMyLearning } from "@zoeskoul/learning-client/react";

import SubjectPicker from "@student/features/practice/ui/subject-picker/SubjectPicker";
import type { SubjectCard } from "@student/features/practice/ui/subject-picker/subjectCardTypes";
import AssignedCourseCard from "@/components/learningAssignments/AssignedCourseCard";
import TutoringSessionCard from "@/components/tutoring/TutoringSessionCard";
import HumanTutoringHub from "@student/features/tutoring/HumanTutoringHub";
import { ROUTES } from "@zoeskoul/app-config";

function courseCard(
  course: LearningCourseSummary,
): SubjectCard {
  return {
    subjectId: course.subjectId,
    slug: course.slug,
    title: course.title,
    description: course.description,
    defaultModuleSlug: course.defaultModuleSlug,
    imagePublicId: course.imagePublicId,
    imageAlt: course.imageAlt,
    enrolled: true,
    status: course.status,
    availabilityStatus: "seeded",
  };
}

function StateSurface(props: {
  title: string;
  body: string;
  busy?: boolean;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
      <main className="ui-container py-8">
        <section
          className="ui-page-surface p-6"
          aria-busy={props.busy}
        >
          <div className="ui-section-kicker">
            Your learning
          </div>
          <h1 className="mt-1 ui-title-md">
            {props.title}
          </h1>
          <p className="mt-2 ui-meta">
            {props.body}
          </p>
        </section>
      </main>
    </div>
  );
}

export function ExactMyLearningView(props: {
  apiOrigin: string;
  locale: string;
  mode?: "all" | "assignments" | "tutoring";
}) {
  const state = useMyLearning({
    apiOrigin: props.apiOrigin,
    locale: props.locale,
  });

  if (state.status === "loading") {
    return (
      <StateSurface
        title="Loading My Learning"
        body="Finding your courses, assignments, and tutoring sessions."
        busy
      />
    );
  }

  if (state.status === "error") {
    return (
      <StateSurface
        title="My Learning could not be loaded"
        body={state.error}
      />
    );
  }

  const cards = state.data.courses.map(courseCard);
  const assignments =
    state.data.assignments as LearningAssignmentSummary[];
  const tutoringSessions =
    state.data.tutoringSessions as LearningTutoringSummary[];

  if (props.mode === "assignments") {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
        <main className="ui-container py-8">
          <section id="assigned" className="scroll-mt-24">
            <div className="mb-4">
              <div className="ui-section-kicker">Shared with you</div>
              <h1 className="mt-1 ui-title-md">Assigned courses</h1>
              <p className="mt-1 ui-meta">
                Private courses shared by an instructor or learning group.
              </p>
            </div>
            {assignments.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {assignments.map((assignment) => (
                  <AssignedCourseCard
                    key={assignment.id}
                    assignment={assignment}
                  />
                ))}
              </div>
            ) : (
              <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                No courses have been assigned to you yet.
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (props.mode === "tutoring") {
    return (
      <HumanTutoringHub
        apiOrigin={props.apiOrigin}
        locale={props.locale}
        courses={state.data.courses.map((course) => ({
          slug: course.slug,
          title: course.title,
        }))}
        tutoringSessions={tutoringSessions}
      />
    );
  }

  return (
    <SubjectPicker
      initialSubjects={cards}
      pageKicker="Your learning"
      pageTitle="My Learning"
      pageSubtitle="Continue your courses, complete assigned learning, and reopen tutoring sessions from one place."
      emptyTitle="No enrolled courses yet"
      emptySubtitle="Browse the catalogs to find a course. Assigned courses and tutoring sessions will also appear on this page when they are shared with you."
      browseHref={ROUTES.catalogs}
      browseLabel="Browse catalogs"
      allowEnrollment={false}
      subjectSectionId="courses"
      subjectSectionTitle="Courses"
      subjectSectionSubtitle="Courses you enrolled in or can continue independently."
      summaryPills={[
        {
          label: `${assignments.length} assigned`,
          href: "#assigned",
          tone: "info",
        },
        {
          label: `${tutoringSessions.length} tutoring`,
          href: "#tutoring",
          tone: "info",
        },
      ]}
      beforeSubjects={
        <nav
          aria-label="My learning sections"
          className="ui-page-surface flex flex-wrap gap-2 p-3"
        >
          <a href="#courses" className="ui-btn-secondary">
            Courses
            <span className="ui-pill-neutral ml-2">
              {cards.length}
            </span>
          </a>
          <a href="#assigned" className="ui-btn-secondary">
            Assigned
            <span className="ui-pill-neutral ml-2">
              {assignments.length}
            </span>
          </a>
          <a href="#tutoring" className="ui-btn-secondary">
            Tutoring
            <span className="ui-pill-neutral ml-2">
              {tutoringSessions.length}
            </span>
          </a>
        </nav>
      }
      afterSubjects={
        <>
          <section id="assigned" className="scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="ui-section-kicker">
                  Shared with you
                </div>
                <h2 className="mt-1 ui-title-md">
                  Assigned courses
                </h2>
                <p className="mt-1 ui-meta">
                  Private courses shared by an instructor or learning group.
                </p>
              </div>
            </div>

            {assignments.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {assignments.map((assignment) => (
                  <AssignedCourseCard
                    key={assignment.id}
                    assignment={assignment}
                  />
                ))}
              </div>
            ) : (
              <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                No courses have been assigned to you yet.
              </div>
            )}
          </section>

          <section id="tutoring" className="scroll-mt-24">
            <div className="mb-4">
              <div className="ui-section-kicker">
                Learn with a tutor
              </div>
              <h2 className="mt-1 ui-title-md">
                Tutoring sessions
              </h2>
              <p className="mt-1 ui-meta">
                Join active sessions and reopen lessons, boards, and explanations shared by your tutor.
              </p>
            </div>

            {tutoringSessions.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {tutoringSessions.map((session) => (
                  <TutoringSessionCard
                    key={session.id}
                    session={session}
                  />
                ))}
              </div>
            ) : (
              <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                No tutoring sessions have been shared with you yet.
              </div>
            )}
          </section>
        </>
      }
    />
  );
}
