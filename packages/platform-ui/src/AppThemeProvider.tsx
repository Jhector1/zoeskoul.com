"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { useAppPreferences } from "@zoeskoul/preferences/react";

export function AppThemeProvider(props: {
  children: ReactNode;
}) {
  const { preferences } = useAppPreferences();
  const theme = preferences.theme === "dark" ? "dark" : "light";

  return (
    <ThemeProvider
      attribute="class"
      value={{ dark: "dark", light: "light" }}
      defaultTheme={theme}
      forcedTheme={theme}
      enableSystem={false}
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey="zoeskoul-theme"
    >
      {props.children}
    </ThemeProvider>
  );
}
