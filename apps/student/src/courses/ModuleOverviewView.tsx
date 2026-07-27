import { useModuleOverview } from "@zoeskoul/learning-client/react";

import {
  coursePath,
  navigateStudentApp,
} from "../app/studentRoutes";

function websiteHref(
  origin: string,
  path: string,
): string {
  return new URL(path, origin).toString();
}

export function ModuleOverviewView(props: {
  apiOrigin: string;
  websiteOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const state = useModuleOverview({
    apiOrigin: props.apiOrigin,
    subjectSlug: props.subjectSlug,
    moduleSlug: props.moduleSlug,
    locale: "en",
  });

  if (state.status === "loading") {
    return (
      <section className="course-reader-state" aria-busy="true">
        <div className="student-state-spinner" aria-hidden="true" />
        <strong>Loading module outline</strong>
      </section>
    );
  }

  if (state.status === "error") {
    const backHref = coursePath(props.subjectSlug);

    return (
      <section className="course-reader-state">
        <strong>Module could not be loaded</strong>
        <p>{state.error}</p>
        <a
          className="course-reader-link"
          href={backHref}
          onClick={(event) =>
            navigateStudentApp(event, backHref)
          }
        >
          Back to course
        </a>
      </section>
    );
  }

  const {
    subject,
    module,
    access,
    sections,
    stats,
  } = state.data;

  const courseHref = coursePath(subject.slug);
  const learnHref = websiteHref(
    props.websiteOrigin,
    `/en/subjects/${encodeURIComponent(subject.slug)}/modules/${encodeURIComponent(module.slug)}/learn`,
  );
  const accessHref = websiteHref(
    props.websiteOrigin,
    `/en/subjects/${encodeURIComponent(subject.slug)}/modules/${encodeURIComponent(module.slug)}`,
  );

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
        <a
          href={courseHref}
          onClick={(event) =>
            navigateStudentApp(event, courseHref)
          }
        >
          {subject.title}
        </a>
        <span>/</span>
        <span>{module.title}</span>
      </nav>

      <section className="course-reader-hero">
        <div className="course-reader-mark" aria-hidden="true">
          {module.order + 1}
        </div>
        <div className="course-reader-hero-copy">
          <span className="course-reader-kicker">Module</span>
          <h2>{module.title}</h2>
          {module.description ? (
            <p>{module.description}</p>
          ) : null}
          <div className="course-reader-hero-meta">
            <span>
              {stats.sectionsCount} section
              {stats.sectionsCount === 1 ? "" : "s"}
            </span>
            <span>
              {stats.topicsCount} topic
              {stats.topicsCount === 1 ? "" : "s"}
            </span>
            {module.meta.estimatedMinutes ? (
              <span>
                About {module.meta.estimatedMinutes} minutes
              </span>
            ) : null}
          </div>
          <a
            className="student-primary-button"
            href={access.ok ? learnHref : accessHref}
          >
            {access.ok
              ? "Start learning"
              : "View access options"}
          </a>
        </div>
      </section>

      {module.meta.outcomes.length ? (
        <section className="course-reader-section">
          <div className="course-reader-section-heading">
            <div>
              <span>Outcomes</span>
              <h3>What you will learn</h3>
            </div>
          </div>
          <ul className="course-outcome-list">
            {module.meta.outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="course-reader-section">
        <div className="course-reader-section-heading">
          <div>
            <span>Module outline</span>
            <h3>Sections and topics</h3>
          </div>
          <strong>{stats.topicsCount}</strong>
        </div>

        <div className="course-section-list">
          {sections.map((section, sectionIndex) => (
            <article
              key={section.slug}
              className="course-section-card"
            >
              <div className="course-section-heading">
                <span>{sectionIndex + 1}</span>
                <div>
                  <h4>{section.title}</h4>
                  {section.description ? (
                    <p>{section.description}</p>
                  ) : null}
                </div>
              </div>

              <ol className="course-topic-list">
                {section.topics.map((topic, topicIndex) => (
                  <li key={topic.slug}>
                    <span>
                      {sectionIndex + 1}.{topicIndex + 1}
                    </span>
                    <strong>{topic.title}</strong>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <div className="course-reader-handoff">
        <div>
          <strong>Interactive lesson runtime</strong>
          <p>
            Lesson cards, progress, validation, editor, terminal, board,
            and AI tutor still open in the existing ZoeSkoul reader while
            the workspace engine is extracted as one subsystem.
          </p>
        </div>
        <a
          className="student-primary-button"
          href={access.ok ? learnHref : accessHref}
        >
          {access.ok
            ? "Open interactive lesson"
            : "View access options"}
        </a>
      </div>
    </div>
  );
}
