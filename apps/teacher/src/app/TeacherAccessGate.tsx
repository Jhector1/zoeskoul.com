import {
  buildAuthenticateUrl,
  buildOnboardingUrl,
  type AppCapability,
  type AppSessionResponse,
} from "@zoeskoul/auth-client";
import {
  useAppSession,
} from "@zoeskoul/auth-client/react";
import {
  useEffect,
  type ReactNode,
} from "react";

import {
  useTranslations,
} from "../compat/next-intl";

const TEACHER_ACCESS_CAPABILITY: AppCapability =
  "teacher:access";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

export function TeacherAccessGate(props: {
  apiOrigin: string;
  websiteOrigin: string;
  children: (
    session: AuthenticatedSession,
  ) => ReactNode;
}) {
  const t =
    useTranslations("Teacher.shell");
  const state =
    useAppSession({
      apiOrigin: props.apiOrigin,
    });

  useEffect(() => {
    if (
      state.status !== "unauthenticated"
    ) {
      return;
    }

    const signInUrl =
      buildAuthenticateUrl({
        websiteOrigin:
          props.websiteOrigin,
        callbackUrl:
          window.location.href,
      });

    window.location.replace(
      signInUrl,
    );
  }, [
    props.websiteOrigin,
    state,
  ]);

  useEffect(() => {
    if (
      state.status !== "authenticated" ||
      !state.session.capabilities.includes(TEACHER_ACCESS_CAPABILITY) ||
      state.session.onboarding.status === "completed"
    ) {
      return;
    }

    window.location.replace(
      buildOnboardingUrl({
        websiteOrigin: props.websiteOrigin,
        callbackUrl: window.location.href,
      }),
    );
  }, [props.websiteOrigin, state]);

  if (state.status === "loading") {
    return (
      <main
        className="app-shell"
        aria-busy="true"
      >
        <section className="foundation-card">
          <div className="eyebrow">
            {t("brand")}
          </div>
          <h1>{t("loadingTitle")}</h1>
          <p>{t("loadingBody")}</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">
            {t("errorEyebrow")}
          </div>
          <h1>{t("errorTitle")}</h1>
          <p>{t("errorBody")}</p>
          <button
            type="button"
            className="button primary"
            onClick={() =>
              window.location.reload()
            }
          >
            {t("retry")}
          </button>
        </section>
      </main>
    );
  }

  if (
    state.status === "unauthenticated"
  ) {
    return (
      <main
        className="app-shell"
        aria-busy="true"
      >
        <section className="foundation-card">
          <div className="eyebrow">
            {t("signInEyebrow")}
          </div>
          <h1>{t("signInTitle")}</h1>
          <p>{t("signInBody")}</p>
        </section>
      </main>
    );
  }

  const session = state.session;

  if (
    !session.capabilities.includes(
      TEACHER_ACCESS_CAPABILITY,
    )
  ) {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">
            {t("accessEyebrow")}
          </div>
          <h1>{t("accessTitle")}</h1>
          <p>{t("accessBody")}</p>
          <a
            className="button primary"
            href={props.websiteOrigin}
          >
            {t("return")}
          </a>
        </section>
      </main>
    );
  }

  if (session.onboarding.status !== "completed") {
    return (
      <main className="app-shell" aria-busy="true">
        <section className="foundation-card">
          <div className="eyebrow">{t("brand")}</div>
          <h1>Opening ZoeSkoul onboarding</h1>
          <p>Your role, institution context, and departments are set up once for your account.</p>
        </section>
      </main>
    );
  }

  return props.children(session);
}
