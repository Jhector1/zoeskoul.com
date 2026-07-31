import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  AppPreferencesProvider,
} from "@zoeskoul/preferences/react";
import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The application root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppPreferencesProvider
      apiOrigin={
        import.meta.env.VITE_API_ORIGIN ??
        getLocalAppOrigin("website")
      }
    >
      <App />
    </AppPreferencesProvider>
  </StrictMode>,
);
