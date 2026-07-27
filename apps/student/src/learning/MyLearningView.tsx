import type {
  LearningAssignmentSummary,
  LearningCourseSummary,
  LearningTutoringSummary,
} from "@zoeskoul/learning-client";
import { useMyLearning } from "@zoeskoul/learning-client/react";

import type { StudentRouteId } from "../app/studentRoutes";

function websiteHref(
  websiteOrigin: string,
  path: string,
): string {
  return new URL(path, websiteOrigin).toString();
}

function formatDate(value: string | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function CourseCard(props: {
  course: LearningCourseSummary;
  websiteOrigin: string;
}) {
  const href = websiteHref(
    props.websiteOrigin,
    `/en/subjects/${encodeURIComponent(props.course.slug)}/modules`,
  );

  return (
    <article className="learning-card">
      <div className="learning-card-icon" aria-hidden="true">
        {props.course.title.slice(0, 1).toUpperCase()}
      </div>
      <div className="learning-card-copy">
        <span className="learning-card-kicker">
          Course
        </span>
        <h3>{props.course.title}</h3>
        <p>{props.course.description}</p>
        <a href={href} className="learning-card-action">
          Continue course
        </a>
      </div>
    </article>
  );
}

function AssignmentCard(props: {
  assignment: LearningAssignmentSummary;
  websiteOrigin: string;
}) {
  const due = formatDate(props.assignment.dueAt);
  const href = websiteHref(
    props.websiteOrigin,
    "/en/assignments",
  );

  return (
    <article className="learning-card">
      <div className="learning-card-copy">
        <div className="learning-card-row">
          <span className="learning-card-kicker">
            Assigned course
          </span>
          <span className="learning-status">
            {props.assignment.availability.replace("_", " ")}
          </span>
        </div>
        <h3>{props.assignment.title}</h3>
        <p>
          {props.assignment.description ??
            props.assignment.subject.description ??
            props.assignment.subject.title}
        </p>
        <div className="learning-card-meta">
          <span>{props.assignment.subject.title}</span>
          {due ? <span>Due {due}</span> : null}
        </div>
        <a href={href} className="learning-card-action">
          Open assignment
        </a>
      </div>
    </article>
  );
}

function TutoringCard(props: {
  session: LearningTutoringSummary;
  websiteOrigin: string;
}) {
  const firstModule = props.session.moduleKeys[0];
  const path = firstModule
    ? `/en/tutoring-sessions/${encodeURIComponent(props.session.id)}/subjects/${encodeURIComponent(props.session.sourceSubjectSlug)}/modules/${encodeURIComponent(firstModule)}/learn`
    : `/en/tutoring-sessions/${encodeURIComponent(props.session.id)}`;

  const invitation = props.session.invitation;
  const href = websiteHref(props.websiteOrigin, path);

  return (
    <article className="learning-card">
      <div className="learning-card-copy">
        <div className="learning-card-row">
          <span className="learning-card-kicker">
            Tutoring
          </span>
          <span className="learning-status">
            {invitation
              ? `Invitation ${invitation.state}`
              : props.session.status}
          </span>
        </div>
        <h3>{props.session.title}</h3>
        <p>
          {props.session.description ??
            props.session.subject.description ??
            props.session.subject.title}
        </p>
        <div className="learning-card-meta">
          <span>{props.session.subject.title}</span>
          <span>
            {props.session.owner.name ??
              props.session.owner.email ??
              "ZoeSkoul tutor"}
          </span>
        </div>
        <a href={href} className="learning-card-action">
          {invitation
            ? "Review invitation"
            : "Open tutoring session"}
        </a>
      </div>
    </article>
  );
}

function EmptySection(props: {
  title: string;
  body: string;
}) {
  return (
    <div className="learning-empty">
      <strong>{props.title}</strong>
      <p>{props.body}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="learning-loading" aria-busy="true">
      <div className="student-state-spinner" aria-hidden="true" />
      <strong>Loading My Learning</strong>
      <p>Finding your courses, assignments, and tutoring sessions.</p>
    </section>
  );
}

export function MyLearningView(props: {
  apiOrigin: string;
  websiteOrigin: string;
  routeId: StudentRouteId;
}) {
  const state = useMyLearning({
    apiOrigin: props.apiOrigin,
    locale: "en",
  });

  if (state.status === "loading") {
    return <LoadingState />;
  }

  if (state.status === "error") {
    return (
      <section className="learning-error">
        <strong>My Learning could not be loaded</strong>
        <p>{state.error}</p>
        <button
          type="button"
          className="student-primary-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </section>
    );
  }

  const { courses, assignments, tutoringSessions } = state.data;

  if (props.routeId === "assignments") {
    return (
      <section className="learning-section">
        <div className="learning-section-heading">
          <div>
            <span>Assignments</span>
            <h2>Your assigned courses</h2>
          </div>
          <strong>{assignments.length}</strong>
        </div>
        {assignments.length ? (
          <div className="learning-card-grid">
            {assignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                websiteOrigin={props.websiteOrigin}
              />
            ))}
          </div>
        ) : (
          <EmptySection
            title="No assigned courses"
            body="Courses shared by a teacher or learning group will appear here."
          />
        )}
      </section>
    );
  }

  if (props.routeId === "tutoring") {
    return (
      <section className="learning-section">
        <div className="learning-section-heading">
          <div>
            <span>Tutoring</span>
            <h2>Your tutoring sessions</h2>
          </div>
          <strong>{tutoringSessions.length}</strong>
        </div>
        {tutoringSessions.length ? (
          <div className="learning-card-grid">
            {tutoringSessions.map((session) => (
              <TutoringCard
                key={session.id}
                session={session}
                websiteOrigin={props.websiteOrigin}
              />
            ))}
          </div>
        ) : (
          <EmptySection
            title="No tutoring sessions"
            body="Invitations and sessions shared by your tutor will appear here."
          />
        )}
      </section>
    );
  }

  return (
    <div className="learning-dashboard">
      <section className="learning-summary">
        <div>
          <span className="learning-summary-kicker">
            Welcome back
          </span>
          <h2>Pick up where you left off</h2>
          <p>
            Courses you enrolled in, assigned learning, and tutoring
            sessions are now loaded from your ZoeSkoul account.
          </p>
        </div>
        <div className="learning-summary-counts">
          <div>
            <strong>{courses.length}</strong>
            <span>Courses</span>
          </div>
          <div>
            <strong>{assignments.length}</strong>
            <span>Assigned</span>
          </div>
          <div>
            <strong>{tutoringSessions.length}</strong>
            <span>Tutoring</span>
          </div>
        </div>
      </section>

      <section className="learning-section">
        <div className="learning-section-heading">
          <div>
            <span>Courses</span>
            <h2>Continue learning</h2>
          </div>
          <strong>{courses.length}</strong>
        </div>
        {courses.length ? (
          <div className="learning-card-grid">
            {courses.map((course) => (
              <CourseCard
                key={course.subjectId}
                course={course}
                websiteOrigin={props.websiteOrigin}
              />
            ))}
          </div>
        ) : (
          <EmptySection
            title="No enrolled courses yet"
            body="Browse the ZoeSkoul catalogs to choose your first course."
          />
        )}
      </section>

      {assignments.length ? (
        <section className="learning-section">
          <div className="learning-section-heading">
            <div>
              <span>Assigned</span>
              <h2>Shared with you</h2>
            </div>
            <strong>{assignments.length}</strong>
          </div>
          <div className="learning-card-grid">
            {assignments.slice(0, 4).map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                websiteOrigin={props.websiteOrigin}
              />
            ))}
          </div>
        </section>
      ) : null}

      {tutoringSessions.length ? (
        <section className="learning-section">
          <div className="learning-section-heading">
            <div>
              <span>Tutoring</span>
              <h2>Learn with a tutor</h2>
            </div>
            <strong>{tutoringSessions.length}</strong>
          </div>
          <div className="learning-card-grid">
            {tutoringSessions.slice(0, 4).map((session) => (
              <TutoringCard
                key={session.id}
                session={session}
                websiteOrigin={props.websiteOrigin}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
