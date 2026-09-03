import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AppPreferencesProvider,
} from "@zoeskoul/preferences/react";

import { App } from "./App";
import {
  resolveTeacherAppOrigins,
} from "./appOrigins";
import "./styles.css";

const rootElement =
  document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "The application root element was not found.",
  );
}

const { apiOrigin } =
  resolveTeacherAppOrigins();

createRoot(rootElement).render(
  <StrictMode>
    <AppPreferencesProvider
      apiOrigin={apiOrigin}
    >
      <App />
    </AppPreferencesProvider>
  </StrictMode>,
);
