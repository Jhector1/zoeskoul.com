"use client";

import {
  getLearnerWorkspaceEnv,
  getLearnerWorkspaceStaticConfig,
  setLearnerWorkspaceStaticConfig,
  type LearnerWorkspaceStaticConfig,
} from "./staticConfig";

export {
  getLearnerWorkspaceEnv,
  getLearnerWorkspaceStaticConfig,
  setLearnerWorkspaceStaticConfig,
  type LearnerWorkspaceStaticConfig,
};

import React, {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

export type LearnerWorkspaceTranslate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

export type LearnerWorkspaceRuntime = {
  useTranslations: (namespace: string) => LearnerWorkspaceTranslate;
  useAuthenticatedUserId: () => string | null;
  useRouter: () => any;
  Link: ComponentType<any>;
  SettingsMenu: ComponentType<any>;
};

const RuntimeContext = createContext<LearnerWorkspaceRuntime | null>(null);

export function LearnerWorkspaceRuntimeProvider(props: {
  runtime: LearnerWorkspaceRuntime;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={props.runtime}>
      {props.children}
    </RuntimeContext.Provider>
  );
}

export function useLearnerWorkspaceRuntime(): LearnerWorkspaceRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error(
      "LearnerWorkspaceRuntimeProvider is required around learner-workspace UI.",
    );
  }
  return runtime;
}

export function useLearnerWorkspaceTranslations(
  namespace: string,
): LearnerWorkspaceTranslate {
  const runtime = useLearnerWorkspaceRuntime();
  return runtime.useTranslations(namespace);
}

export function useFullIDEAuthenticatedUserId(): string | null {
  const runtime = useLearnerWorkspaceRuntime();
  return runtime.useAuthenticatedUserId();
}

export function useFullIDERouter(): any {
  const runtime = useLearnerWorkspaceRuntime();
  return runtime.useRouter();
}

export function useFullIDETranslations(namespace: string) {
  return useLearnerWorkspaceTranslations(namespace);
}

export function FullIDELink(props: any) {
  const runtime = useLearnerWorkspaceRuntime();
  const Link = runtime.Link;
  return <Link {...props} />;
}

export function FullIDESettingsMenu(props: any) {
  const runtime = useLearnerWorkspaceRuntime();
  const SettingsMenu = runtime.SettingsMenu;
  return <SettingsMenu {...props} />;
}
