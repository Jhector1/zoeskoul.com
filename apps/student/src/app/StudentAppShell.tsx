import type { AppSessionResponse } from "@zoeskoul/auth-client";
import {
  useEffect,
  useState,
} from "react";

import { MyLearningView } from "../learning/MyLearningView";
import {
  navigateStudentApp,
  resolveStudentRoute,
  studentRoutes,
} from "./studentRoutes";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

const routeHeadings = {
  learning: {
    eyebrow: "My Learning",
    title: "Your learning",
    description:
      "Continue courses, open assigned learning, and return to tutoring.",
  },
  assignments: {
    eyebrow: "Assignments",
    title: "Assigned learning",
    description:
      "Courses shared by a teacher, tutor, or learning group.",
  },
  tutoring: {
    eyebrow: "Tutoring",
    title: "Tutoring sessions",
    description:
      "Join active sessions and reopen work shared by your tutor.",
  },
} as const;

export function StudentAppShell(props: {
  apiOrigin: string;
  websiteOrigin: string;
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
  const heading = routeHeadings[route.id];
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
        <header className="student-topbar student-real-topbar">
          <div>
            <p>{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <span className="student-page-description">
              {heading.description}
            </span>
          </div>
        </header>

        <MyLearningView
          apiOrigin={props.apiOrigin}
          websiteOrigin={props.websiteOrigin}
          routeId={route.id}
        />
      </main>
    </div>
  );
}
