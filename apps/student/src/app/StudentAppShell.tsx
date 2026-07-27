import type { AppSessionResponse } from "@zoeskoul/auth-client";
import {
  useEffect,
  useState,
} from "react";

import {
  navigateStudentApp,
  resolveStudentRoute,
  studentRoutes,
} from "./studentRoutes";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

function routeContent(routeId: string) {
  if (routeId === "assignments") {
    return {
      eyebrow: "Assignments",
      title: "Your assigned learning",
      body:
        "Course assignments, invitation status, due dates, and progress will move into this application next.",
      action:
        "Assignment migration is the next data-backed screen after My Learning.",
    };
  }

  if (routeId === "tutoring") {
    return {
      eyebrow: "Tutoring",
      title: "Your tutoring sessions",
      body:
        "Upcoming sessions, invitations, and saved tutoring workspaces will be available here.",
      action:
        "Live workspace migration remains separate from the initial course reader.",
    };
  }

  return {
    eyebrow: "My Learning",
    title: "Welcome back to your learning space",
    body:
      "This becomes the home for enrolled courses, teacher-assigned courses, recent progress, and recommended next steps.",
    action:
      "The next implementation will connect this shell to the existing My Learning API boundary.",
  };
}

export function StudentAppShell(props: {
  session: AuthenticatedSession;
}) {
  const [pathname, setPathname] = useState(
    () => window.location.pathname,
  );

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/learning");
      setPathname("/learning");
    }
  }, []);

  const route = resolveStudentRoute(pathname);
  const content = routeContent(route.id);
  const displayName =
    props.session.user.name ??
    props.session.user.email ??
    "Learner";

  return (
    <div className="student-layout">
      <aside className="student-sidebar">
        <a
          className="student-brand"
          href="/learning"
          onClick={(event) => navigateStudentApp(event, "/learning")}
        >
          <span className="student-brand-mark">Z</span>
          <span>
            <strong>ZoeSkoul</strong>
            <small>Student</small>
          </span>
        </a>

        <nav className="student-navigation" aria-label="Student navigation">
          {studentRoutes.map((item) => {
            const active = item.id === route.id;

            return (
              <a
                key={item.id}
                className={active ? "is-active" : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => navigateStudentApp(event, item.href)}
              >
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </a>
            );
          })}
        </nav>

        <div className="student-account-card">
          {props.session.user.image ? (
            <img
              src={props.session.user.image}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="student-account-avatar" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}

          <span>
            <strong>{displayName}</strong>
            <small>
              {props.session.user.roles.join(", ") || "student"}
            </small>
          </span>
        </div>
      </aside>

      <main className="student-main">
        <header className="student-topbar">
          <div>
            <p>{content.eyebrow}</p>
            <h1>{content.title}</h1>
          </div>

          <span className="student-session-pill">
            Database access verified
          </span>
        </header>

        <section className="student-welcome-panel">
          <div>
            <p className="student-panel-eyebrow">
              Student application migration
            </p>
            <h2>{content.title}</h2>
            <p>{content.body}</p>
          </div>

          <div className="student-next-card">
            <span>Next boundary</span>
            <strong>{content.action}</strong>
          </div>
        </section>

        <section className="student-grid" aria-label="Student overview">
          <article>
            <span>Courses in progress</span>
            <strong>—</strong>
            <p>Connected data arrives with the My Learning endpoint.</p>
          </article>

          <article>
            <span>Open assignments</span>
            <strong>—</strong>
            <p>Assigned-course access continues to bypass billing.</p>
          </article>

          <article>
            <span>Upcoming tutoring</span>
            <strong>—</strong>
            <p>Session invitations and schedules will be loaded here.</p>
          </article>
        </section>
      </main>
    </div>
  );
}
