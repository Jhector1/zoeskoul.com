import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";
import type {
  I18nMessages,
} from "@zoeskoul/i18n-core";

import {
  IntlBridgeProvider,
} from "../compat/next-intl";
import {
  currentLocale,
  navigate,
  useLocationSnapshot,
} from "../compat/navigation-runtime";
import {
  loadTeacherLocaleMessages,
} from "./messages";

export function TeacherIntlProvider(props: {
  children: ReactNode;
}) {
  const { preferences } =
    useAppPreferences();
  const location =
    useLocationSnapshot();
  const routeLocale =
    currentLocale();
  const routeMatchesPreference =
    routeLocale === preferences.locale;

  const [state, setState] = useState<{
    locale: string;
    messages: I18nMessages;
  } | null>(null);

  useEffect(() => {
    if (routeMatchesPreference) {
      return;
    }

    navigate(location, {
      replace: true,
      locale: preferences.locale,
      scroll: false,
    });
  }, [
    location,
    preferences.locale,
    routeMatchesPreference,
  ]);

  useEffect(() => {
    if (!routeMatchesPreference) {
      return;
    }

    let cancelled = false;

    void loadTeacherLocaleMessages(
      routeLocale,
    )
      .then((messages) => {
        if (!cancelled) {
          setState({
            locale: routeLocale,
            messages,
          });
        }
      })
      .catch((error) => {
        console.error(
          "[teacher i18n] locale messages",
          error,
        );

        if (!cancelled) {
          setState({
            locale: routeLocale,
            messages: {},
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    routeLocale,
    routeMatchesPreference,
  ]);

  if (
    !routeMatchesPreference ||
    !state ||
    state.locale !== routeLocale
  ) {
    return (
      <main
        className="min-h-screen"
        aria-busy="true"
      />
    );
  }

  return (
    <IntlBridgeProvider
      locale={routeLocale}
      messages={state.messages}
    >
      {props.children}
    </IntlBridgeProvider>
  );
}
