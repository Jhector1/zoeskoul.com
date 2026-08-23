import type { AppSessionResponse } from "@zoeskoul/auth-client";
import { useEffect, useState } from "react";

import type { AdminAppAccess } from "@/app/AdminAccessGate";
import { AdminLink } from "@/app/navigation";
import { resolveAdminRoute } from "@/app/adminRoutes";
import { CurriculumDraftsPage } from "@/features/curriculum/CurriculumDraftsPage";
import { AdminDashboard } from "@/features/dashboard/AdminDashboard";
import { LearnerDetail } from "@/features/learners/LearnerDetail";
import { BillingPromotionManager } from "@/features/promotions/BillingPromotionManager";
import { PublicChallengesPage } from "@/features/public-challenges/PublicChallengesPage";
import { QuestionAnalytics } from "@/features/questions/QuestionAnalytics";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

const navItems = [
  { href: "/", label: "Overview", route: "overview" },
  { href: "/questions", label: "Questions", route: "questions" },
  { href: "/curriculum", label: "Curriculum", route: "curriculum" },
  { href: "/public-challenges", label: "Public Challenges", route: "public-challenges" },
  { href: "/promotions", label: "Promotions", route: "promotions" },
] as const;

export function AdminShell(props: {
  apiOrigin: string;
  websiteOrigin: string;
  session: AuthenticatedSession;
  access: AdminAppAccess;
}) {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const onPopState = () => {
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const route = resolveAdminRoute(location.pathname);
  const visibleNavItems =
    props.access.isAdmin
      ? navItems
      : navItems.filter(
          (item) => item.route === "public-challenges",
        );
  const activeRoute =
    route.kind === "learner" ? "overview" : route.kind;

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">Z</div>
            <div>
              <strong>ZoeSkoul</strong>
              <span>Admin</span>
            </div>
          </div>

          <nav className="admin-nav" aria-label="Admin navigation">
            {visibleNavItems.map((item) => (
              <AdminLink
                key={item.href}
                href={item.href}
                className={
                  activeRoute === item.route
                    ? "admin-nav-link is-active"
                    : "admin-nav-link"
                }
              >
                <span className="nav-dot" aria-hidden="true" />
                {item.label}
              </AdminLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {(props.session.user.name ??
                props.session.user.email ??
                "A")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <span className="admin-user-copy">
              <strong>
                {props.session.user.name ?? "Administrator"}
              </strong>
              <span>
                {props.session.user.email ?? props.session.user.id}
              </span>
            </span>
          </div>
          <a
            className="sidebar-external-link"
            href={props.websiteOrigin}
          >
            Open ZoeSkoul
          </a>
        </div>
      </aside>

      <div className="admin-mobile-nav">
        {visibleNavItems.map((item) => (
          <AdminLink
            key={item.href}
            href={item.href}
            className={
              activeRoute === item.route
                ? "mobile-nav-link is-active"
                : "mobile-nav-link"
            }
          >
            {item.label}
          </AdminLink>
        ))}
      </div>

      <main className="admin-main">
        {route.kind === "overview" ? (
          <AdminDashboard
            apiOrigin={props.apiOrigin}
            search={location.search}
          />
        ) : null}

        {route.kind === "questions" ? (
          <QuestionAnalytics
            apiOrigin={props.apiOrigin}
            search={location.search}
          />
        ) : null}

        {route.kind === "curriculum" ? (
          <CurriculumDraftsPage />
        ) : null}

        {route.kind === "public-challenges" ? (
          <PublicChallengesPage
            apiOrigin={props.apiOrigin}
          />
        ) : null}

        {route.kind === "promotions" ? (
          <BillingPromotionManager
            apiOrigin={props.apiOrigin}
          />
        ) : null}

        {route.kind === "learner" ? (
          <LearnerDetail
            apiOrigin={props.apiOrigin}
            actorKey={route.actorKey}
            search={location.search}
          />
        ) : null}

        {route.kind === "not-found" ? (
          <section className="page-state">
            <p className="eyebrow">Not found</p>
            <h1>This Admin page does not exist</h1>
            <AdminLink className="button button-primary" href="/">
              Return to overview
            </AdminLink>
          </section>
        ) : null}
      </main>
    </div>
  );
}
