import type { AppSessionResponse } from "@zoeskoul/auth-client";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  loadLocaleMessages,
} from "../legacy-web/i18n/messages.generated";
import {
  IntlBridgeProvider,
} from "./next-intl";
import {
  SessionProvider,
} from "./next-auth-react";
import { SfxProvider } from "../legacy-web/lib/sfx/SfxProvider";
import {
  currentLocale,
  useLocationSnapshot,
} from "./navigation-runtime";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

type Messages = Record<string, unknown>;

export function LegacyProviders(props: {
  session: AuthenticatedSession;
  children: ReactNode;
}) {
  useLocationSnapshot();
  const locale = currentLocale();
  const [state, setState] = useState<{
    locale: string;
    messages: Messages;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadLocaleMessages(locale)
      .then((messages) => {
        if (!cancelled) {
          setState({ locale, messages });
        }
      })
      .catch((error) => {
        console.error(
          "[student exact old UI] locale messages",
          error,
        );

        if (!cancelled) {
          setState({ locale, messages: {} });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!state || state.locale !== locale) {
    return (
      <main
        className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white"
        aria-busy="true"
      >
        <div className="ui-container py-12">
          <div className="ui-page-surface p-6">
            Loading ZoeSkoul…
          </div>
        </div>
      </main>
    );
  }

  const session = {
    user: {
      ...props.session.user,
      id: props.session.user.id,
      roles: props.session.roles,
    },
  };

  return (
    <SessionProvider session={session}>
      <IntlBridgeProvider
        locale={locale}
        messages={state.messages}
      >
        <SfxProvider>
          {props.children}
        </SfxProvider>
      </IntlBridgeProvider>
    </SessionProvider>
  );
}
