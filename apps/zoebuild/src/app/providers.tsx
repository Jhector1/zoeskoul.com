"use client";

import type {
  ReactNode,
} from "react";

import type {
  AppPreferences,
} from "@zoeskoul/preferences";
import {
  AppPreferencesProvider,
} from "@zoeskoul/preferences/react";
import {
  AppThemeProvider,
} from "@zoeskoul/platform-ui";

import {
  ZoeBuildLearnerWorkspaceRuntimeProvider,
} from "@/components/learner-workspace/ZoeBuildLearnerWorkspaceRuntime";

export default function Providers(props: {
  children: ReactNode;
  apiOrigin: string;
  authApiOrigin: string;
  initialPreferences: AppPreferences;
}) {
  return (
    <AppPreferencesProvider
      apiOrigin={props.apiOrigin}
      initialPreferences={
        props.initialPreferences
      }
    >
      <AppThemeProvider>
        <ZoeBuildLearnerWorkspaceRuntimeProvider
          apiOrigin={props.authApiOrigin}
        >
          {props.children}
        </ZoeBuildLearnerWorkspaceRuntimeProvider>
      </AppThemeProvider>
    </AppPreferencesProvider>
  );
}
