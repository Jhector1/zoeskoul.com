import {
  ThemeProvider,
} from "next-themes";
import type {
  ReactNode,
} from "react";

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
      {props.children}
    </ThemeProvider>
  );
}
