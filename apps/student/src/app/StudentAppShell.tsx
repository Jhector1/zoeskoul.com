import {
  normalizeStudentPathname,
  isNextOwnedPath,
} from "../compat/app-route-ownership";

import type {
  AppSessionResponse,
} from "@zoeskoul/auth-client";
import {
  useEffect,
  useState,
} from "react";

import StudentHeaderSlick from "@student/components/chrome/StudentHeaderSlick";
import { ExactMyLearningView } from "../exact-old-ui/ExactMyLearningView";
import { ExactCatalogsView } from "../exact-old-ui/ExactCatalogsView";
import { ExactCatalogDetailView } from "../exact-old-ui/ExactCatalogDetailView";
import { ExactAchievementsView } from "../exact-old-ui/ExactAchievementsView";
import { ExactLeaderboardView } from "../exact-old-ui/ExactLeaderboardView";
import { ExactProgressView } from "../exact-old-ui/ExactProgressView";
import { ExactCertificateView } from "../exact-old-ui/ExactCertificateView";
import { ExactSubjectAssignmentsView } from "../exact-old-ui/ExactSubjectAssignmentsView";
import { ExactTutoringSessionView } from "../exact-old-ui/ExactTutoringSessionView";
import { ExactSubjectModulesView } from "../exact-old-ui/ExactSubjectModulesView";
import { ExactModuleIntroView } from "../exact-old-ui/ExactModuleIntroView";
import { ExactReviewModuleView } from "../exact-old-ui/ExactReviewModuleView";
import {
  ExactDailyPracticeView,
  ExactModulePracticeView,
} from "../exact-old-ui/ExactPracticeViews";
import {
  resolveStudentShellLocation,
} from "./studentRoutes";

import {
  shouldRenderGlobalStudentHeader,
} from "./studentLayout";

import {
  StudentNotFoundView,
} from "./StudentNotFoundView";
import {
  resolveLegacyStudentAccess,
} from "./studentSessionCompatibility";

export function StudentAppShell(props: {
  apiOrigin: string;
  websiteOrigin: string;
  session: AppSessionResponse;
}) {
  const [pathname, setPathname] = useState(
    () =>
      normalizeStudentPathname(
        window.location.pathname,
      ),
  );

  useEffect(() => {
    const update = () => {
      const nextPathname =
        normalizeStudentPathname(
          window.location.pathname,
        );

      if (
        nextPathname !==
        window.location.pathname
      ) {
        window.history.replaceState(
          {},
          "",
          nextPathname,
        );
      }

      setPathname(nextPathname);
    };

    window.addEventListener("popstate", update);
    window.addEventListener(
      "zoeskoul:vite-navigation",
      update,
    );

    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(
        "zoeskoul:vite-navigation",
        update,
      );
    };
  }, []);


  useEffect(() => {
    const normalized =
      normalizeStudentPathname(
        window.location.pathname,
      );

    if (
      normalized !==
      window.location.pathname
    ) {
      window.history.replaceState(
        {},
        "",
        normalized,
      );
      setPathname(normalized);
    }
  }, []);

  const location =
    resolveStudentShellLocation(pathname);
  const legacyAccess =
    resolveLegacyStudentAccess(
      props.session.authenticated
        ? props.session.roles
        : [],
    );

  useEffect(() => {
    if (
      location.kind !== "website" ||
      !isNextOwnedPath(pathname)
    ) {
      return;
    }

    const target = new URL(
      location.path +
        window.location.search +
        window.location.hash,
      props.websiteOrigin,
    );

    window.location.replace(
      target.toString(),
    );
  }, [
    location,
    props.websiteOrigin,
  ]);

  if (location.kind === "website") {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
        <main className="ui-container py-8">
          <section className="ui-page-surface p-6">
            <div className="ui-section-kicker">
              ZoeSkoul
            </div>
            <h1 className="mt-1 ui-title-md">
              Opening the website
            </h1>
          </section>
        </main>
      </div>
    );
  }

  if (location.kind === "tutoring-session") {
    return (
      <ExactTutoringSessionView
        websiteOrigin={props.websiteOrigin}
        locale={location.locale}
        sessionId={location.sessionId}
        subjectSlug={location.subjectSlug}
        moduleSlug={location.moduleSlug}
      />
    );
  }

  if (location.kind === "lesson") {
    return (
      <ExactReviewModuleView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        subjectSlug={location.subjectSlug}
        moduleSlug={location.moduleSlug}
      />
    );
  }

  const content =
    location.kind === "not-found" ? (
      <StudentNotFoundView
        locale={location.locale}
        path={location.path}
      />
    ) : location.kind === "daily-practice" ? (
      <ExactDailyPracticeView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    ) : location.kind === "module-practice" ? (
      <ExactModulePracticeView
        subjectSlug={
          location.subjectSlug
        }
        moduleSlug={
          location.moduleSlug
        }
      />
    ) : location.kind === "catalogs" ? (
      <ExactCatalogsView
        apiOrigin={props.apiOrigin}
      />
    ) : location.kind === "catalog-detail" ? (
      <ExactCatalogDetailView
        apiOrigin={props.apiOrigin}
        websiteOrigin={props.websiteOrigin}
        locale={location.locale}
        authenticated={props.session.authenticated}
        catalogSlug={location.catalogSlug}
      />
    ) : location.kind === "achievements" ? (
      <ExactAchievementsView />
    ) : location.kind === "leaderboard" ? (
      <ExactLeaderboardView />
    ) : location.kind === "progress" ? (
      <ExactProgressView />
    ) : location.kind === "certificate" ? (
      <ExactCertificateView />
    ) : location.kind === "subject-assignments" ? (
      <ExactSubjectAssignmentsView />
    ) : location.kind === "assignments" ? (
      <ExactMyLearningView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        mode="assignments"
      />
    ) : location.kind === "tutoring" ? (
      <ExactMyLearningView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        mode="tutoring"
      />
    ) : location.kind === "course" ? (
      <ExactSubjectModulesView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        subjectSlug={location.subjectSlug}
        canUnlockAll={
          legacyAccess.canUnlockAll
        }
      />
    ) : location.kind === "module" ? (
      <ExactModuleIntroView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
        subjectSlug={location.subjectSlug}
        moduleSlug={location.moduleSlug}
      />
    ) : (
      <ExactMyLearningView
        apiOrigin={props.apiOrigin}
        locale={location.locale}
      />
    );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
      {shouldRenderGlobalStudentHeader(
        location,
      ) ? (
        <StudentHeaderSlick
          brand="ZoeSkoul"
          websiteOrigin={
            props.websiteOrigin
          }
        />
      ) : null}
      {content}
    </div>
  );
}
