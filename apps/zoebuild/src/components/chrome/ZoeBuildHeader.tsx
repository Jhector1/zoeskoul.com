"use client";

import Link from "next/link";
import {
  usePathname,
} from "next/navigation";
import {
  buildAuthenticateUrl,
  buildLogoutUrl,
} from "@zoeskoul/auth-client";
import {
  useAppSession,
} from "@zoeskoul/auth-client/react";

import {
  HeaderChrome,
  ThemeToggle,
  UserMenuChrome,
  ZoeSkoulLogoMark,
} from "@zoeskoul/platform-ui";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";

import {
  ZoeBuildLocaleSwitcher,
} from "./ZoeBuildLocaleSwitcher";

const COPY = {
  en: {
    projects: "Projects",
    signIn: "Sign in",
    profile: "Profile",
    logout: "Sign out",
    account: "Open account menu",
  },
  fr: {
    projects: "Projets",
    signIn: "Se connecter",
    profile: "Profil",
    logout: "Se déconnecter",
    account: "Ouvrir le menu du compte",
  },
  ht: {
    projects: "Pwojè",
    signIn: "Konekte",
    profile: "Pwofil",
    logout: "Dekonekte",
    account: "Louvri meni kont lan",
  },
} as const;

export function ZoeBuildHeader(props: {
  websiteOrigin: string;
  zoebuildOrigin: string;
}) {
  const pathname = usePathname() || "/";
  const { preferences } =
    useAppPreferences();
  const sessionState =
    useAppSession({
      apiOrigin: props.websiteOrigin,
    });

  const locale =
    preferences.locale === "fr" ||
    preferences.locale === "ht"
      ? preferences.locale
      : "en";
  const t = COPY[locale];

  const projectsHref =
    `/${locale}/projects`;
  const user =
    sessionState.status === "authenticated"
      ? sessionState.session.user
      : null;

  const callbackUrl =
    new URL(
      pathname,
      props.zoebuildOrigin,
    ).toString();

  const signInHref =
    buildAuthenticateUrl({
      websiteOrigin: props.websiteOrigin,
      callbackUrl,
      locale,
    });

  const profileHref =
    new URL(
      `/${locale}/profile`,
      props.websiteOrigin,
    ).toString();

  const logoutHref =
    buildLogoutUrl({
      websiteOrigin: props.websiteOrigin,
      locale,
    });

  const brandGroup = (
    <Link
      href="/"
      className="group flex min-w-0 items-center gap-2.5"
      aria-label="ZoeBuild"
    >
      <ZoeSkoulLogoMark />
      <span className="hidden text-sm font-semibold tracking-tight sm:inline">
        ZoeBuild
      </span>
    </Link>
  );

  const account =
    sessionState.status === "loading"
      ? null
      : user
        ? (
          <UserMenuChrome
            name={user.name ?? "User"}
            email={user.email}
            avatar={
              user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="h-6 w-6 object-cover"
                />
              ) : undefined
            }
            ariaLabel={t.account}
            profileLabel={t.profile}
            progressLabel={t.projects}
            logoutLabel={t.logout}
            profileHref={profileHref}
            progressHref={projectsHref}
            onSignOut={() => {
              window.location.assign(
                logoutHref,
              );
            }}
            renderLink={({
              href,
              onClick,
              className,
              children,
            }) => (
              <Link
                href={href}
                onClick={onClick}
                className={className}
              >
                {children}
              </Link>
            )}
          />
        )
        : (
          <Link
            className="ui-btn-secondary h-8"
            href={signInHref}
          >
            {t.signIn}
          </Link>
        );

  const topRowActions = (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <Link
        href={projectsHref}
        className="ui-btn-ide-ghost h-8"
      >
        {t.projects}
      </Link>

      <ZoeBuildLocaleSwitcher compact />

      <ThemeToggle compact />

      {account}
    </div>
  );


  const isProjectEditor =
    /^\/(?:en|fr|ht)\/projects\/[^/]+\/?$/.test(
      pathname,
    );

  if (isProjectEditor) {
    return null;
  }

return (
    <HeaderChrome
      brandGroup={brandGroup}
      topRowActions={topRowActions}
    />
  );
}
