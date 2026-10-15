"use client";

import type { ReactNode } from "react";
import type { AppPreferences } from "@zoeskoul/preferences";
import { AppPreferencesProvider } from "@zoeskoul/preferences/react";
import { AppThemeProvider } from "@zoeskoul/platform-ui";
import { SessionProvider } from "next-auth/react";

export default function Providers(props: {
  children: ReactNode;
  apiOrigin: string;
  initialPreferences: AppPreferences;
}) {
  return (
    <SessionProvider>
      <AppPreferencesProvider
        apiOrigin={props.apiOrigin}
        initialPreferences={props.initialPreferences}
      >
        <AppThemeProvider>
          {props.children}
        </AppThemeProvider>
      </AppPreferencesProvider>
    </SessionProvider>
  );
}
