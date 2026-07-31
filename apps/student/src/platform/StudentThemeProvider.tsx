import {
  ThemeProvider,
  useTheme,
} from "next-themes";
import type {
  ReactNode,
} from "react";
import {
  useEffect,
} from "react";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";

function ThemePreferenceSync() {
  const { preferences } = useAppPreferences();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (theme !== preferences.theme) {
      setTheme(preferences.theme);
    }
  }, [preferences.theme, setTheme, theme]);

  return null;
}

export function StudentThemeProvider(props: {
  children: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="zoeskoul-theme"
    >
      <ThemePreferenceSync />
      {props.children}
    </ThemeProvider>
  );
}
