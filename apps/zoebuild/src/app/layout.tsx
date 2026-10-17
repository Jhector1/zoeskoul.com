import type {
  Metadata,
} from "next";
import type {
  ReactNode,
} from "react";
import {
  cookies,
} from "next/headers";

import {
  APP_PREFERENCES_COOKIE_NAME,
  DEFAULT_APP_PREFERENCES,
  parsePreferencesCookieValue,
} from "@zoeskoul/preferences";

import {
  ZoeBuildHeader,
} from "@/components/chrome/ZoeBuildHeader";
import {
  ZoeBuildAuthenticatedPreviewShell,
} from "@/components/builder/ZoeBuildAuthenticatedPreviewShell";
import {
  resolveZoeBuildOrigins,
} from "@/lib/appOrigins";

import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ZoeBuild",
    template: "%s | ZoeBuild",
  },
  description:
    "Build websites and web applications with Zoé.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieStore =
    await cookies();

  const initialPreferences =
    parsePreferencesCookieValue(
      cookieStore.get(
        APP_PREFERENCES_COOKIE_NAME,
      )?.value,
    ) ?? {
      ...DEFAULT_APP_PREFERENCES,
    };

  const {
    websiteOrigin,
    zoebuildOrigin,
  } = resolveZoeBuildOrigins();

  return (
    <html
      lang={initialPreferences.locale}
      suppressHydrationWarning
    >
      <body>
        <Providers
          apiOrigin={websiteOrigin}
          initialPreferences={
            initialPreferences
          }
        >
          <ZoeBuildHeader
            websiteOrigin={websiteOrigin}
            zoebuildOrigin={zoebuildOrigin}
          />
          <ZoeBuildAuthenticatedPreviewShell
            apiOrigin={websiteOrigin}
          >
            {children}
          </ZoeBuildAuthenticatedPreviewShell>
        </Providers>
      </body>
    </html>
  );
}
