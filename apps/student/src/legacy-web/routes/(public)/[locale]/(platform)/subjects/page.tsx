import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SubjectPicker from "@/features/practice/ui/subject-picker/SubjectPicker";
import { getEnrolledVisibleSubjectCardsForActor } from "@/lib/subjects/server/catalogVisibility";
import { ROUTES } from "@/utils";
import AssignedCourseCard from "@/components/learningAssignments/AssignedCourseCard";
import TutoringSessionCard from "@/components/tutoring/TutoringSessionCard";
import {
  loadAssignedLearningForUser,
  loadTutoringLearningForUser,
} from "@/lib/learning/myLearningData";

export const dynamic = "force-dynamic";

export default async function MyLearningPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}${ROUTES.myLearning}`)}`,
    );
  }

  const [cards, assignments, tutoringSessions] = await Promise.all([
    getEnrolledVisibleSubjectCardsForActor(),
    loadAssignedLearningForUser({ userId, locale }),
    loadTutoringLearningForUser({ userId, locale }),
  ]);

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
        { label: `${assignments.length} assigned`, href: "#assigned", tone: "info" },
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
            <span className="ui-pill-neutral ml-2">{cards.length}</span>
          </a>
          <a href="#assigned" className="ui-btn-secondary">
            Assigned
            <span className="ui-pill-neutral ml-2">{assignments.length}</span>
          </a>
          <a href="#tutoring" className="ui-btn-secondary">
            Tutoring
            <span className="ui-pill-neutral ml-2">{tutoringSessions.length}</span>
          </a>
        </nav>
      }
      afterSubjects={
        <>
          <section id="assigned" className="scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="ui-section-kicker">Shared with you</div>
                <h2 className="mt-1 ui-title-md">Assigned courses</h2>
                <p className="mt-1 ui-meta">
                  Private courses shared by an instructor or learning group.
                </p>
              </div>
            </div>
            {assignments.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {assignments.map((assignment) => (
                  <AssignedCourseCard key={assignment.id} assignment={assignment} />
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
              <div className="ui-section-kicker">Learn with a tutor</div>
              <h2 className="mt-1 ui-title-md">Tutoring sessions</h2>
              <p className="mt-1 ui-meta">
                Join active sessions and reopen lessons, boards, and explanations shared by your tutor.
              </p>
            </div>
            {tutoringSessions.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {tutoringSessions.map((tutoringSession) => (
                  <TutoringSessionCard
                    key={tutoringSession.id}
                    session={tutoringSession}
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
