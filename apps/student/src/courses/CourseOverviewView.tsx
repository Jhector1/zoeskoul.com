import { useCourseOverview } from "@zoeskoul/learning-client/react";

import {
  modulePath,
  navigateStudentApp,
} from "../app/studentRoutes";

function accessLabel(reason: string): string {
  if (reason === "requires_payment") {
    return "Payment required";
  }

  if (reason === "requires_assignment") {
    return "Assignment required";
  }

  if (reason === "requires_login") {
    return "Sign in required";
  }

  return "Available";
}

export function CourseOverviewView(props: {
  apiOrigin: string;
  websiteOrigin: string;
  subjectSlug: string;
}) {
  const state = useCourseOverview({
    apiOrigin: props.apiOrigin,
    subjectSlug: props.subjectSlug,
    locale: "en",
  });

  if (state.status === "loading") {
    return (
      <section className="course-reader-state" aria-busy="true">
        <div className="student-state-spinner" aria-hidden="true" />
        <strong>Loading course</strong>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="course-reader-state">
        <strong>Course could not be loaded</strong>
        <p>{state.error}</p>
        <a
          className="course-reader-link"
          href="/learning"
          onClick={(event) =>
            navigateStudentApp(event, "/learning")
          }
        >
          Back to My Learning
        </a>
      </section>
    );
  }

  const { subject, modules } = state.data;

  return (
    <div className="course-reader-page">
      <nav className="course-reader-breadcrumbs" aria-label="Breadcrumb">
        <a
          href="/learning"
          onClick={(event) =>
            navigateStudentApp(event, "/learning")
          }
        >
          My Learning
        </a>
        <span>/</span>
        <span>{subject.title}</span>
      </nav>

      <section className="course-reader-hero">
        <div className="course-reader-mark" aria-hidden="true">
          {subject.title.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <span className="course-reader-kicker">Course</span>
          <h2>{subject.title}</h2>
          {subject.description ? (
            <p>{subject.description}</p>
          ) : null}
        </div>
      </section>

      <section className="course-reader-section">
        <div className="course-reader-section-heading">
          <div>
            <span>Course outline</span>
            <h3>Modules</h3>
          </div>
          <strong>{modules.length}</strong>
        </div>

        {modules.length ? (
          <div className="course-module-list">
            {modules.map((module, index) => {
              const localHref = modulePath(
                subject.slug,
                module.slug,
              );
              const fallbackHref = new URL(
                `/en/subjects/${encodeURIComponent(subject.slug)}/modules/${encodeURIComponent(module.slug)}`,
                props.websiteOrigin,
              ).toString();

              return (
                <article
                  key={module.id}
                  className="course-module-card"
                >
                  <div className="course-module-index">
                    {index + 1}
                  </div>
                  <div className="course-module-copy">
                    <div className="course-module-title-row">
                      <h4>{module.title}</h4>
                      <span
                        className={
                          module.access.ok
                            ? "course-access-pill is-open"
                            : "course-access-pill"
                        }
                      >
                        {module.access.ok
                          ? "Available"
                          : accessLabel(module.access.reason)}
                      </span>
                    </div>
                    {module.description ? (
                      <p>{module.description}</p>
                    ) : null}
                    <div className="course-module-meta">
                      <span>
                        {module.sectionsCount} section
                        {module.sectionsCount === 1 ? "" : "s"}
                      </span>
                      <span>
                        {module.topicsCount} topic
                        {module.topicsCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {module.access.ok ? (
                      <a
                        className="course-reader-link"
                        href={localHref}
                        onClick={(event) =>
                          navigateStudentApp(event, localHref)
                        }
                      >
                        View module
                      </a>
                    ) : (
                      <a
                        className="course-reader-link"
                        href={fallbackHref}
                      >
                        View access options
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="learning-empty">
            <strong>No modules are available</strong>
            <p>This course does not currently have a published module.</p>
          </div>
        )}
      </section>
    </div>
  );
}
