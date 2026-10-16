"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  type ReactNode,
} from "react";

import {
  useAppSession,
} from "@zoeskoul/auth-client/react";
import {
  LearnerWorkspaceRuntimeProvider,
  setLearnerWorkspaceStaticConfig,
  type LearnerWorkspaceRuntime,
  type LearnerWorkspaceTranslate,
} from "@zoeskoul/learner-workspace/runtime/appRuntime";

setLearnerWorkspaceStaticConfig({
  appName: "zoebuild",
  nodeEnv:
    process.env.NODE_ENV ??
    "development",
  env: {
    NEXT_PUBLIC_TERMINAL_MODE:
      process.env.NEXT_PUBLIC_TERMINAL_MODE,
    NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI:
      process.env.NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI,
    NEXT_PUBLIC_ZOE_DEBUG_LEARNING_UI:
      process.env.NEXT_PUBLIC_ZOE_DEBUG_LEARNING_UI,
  },
});

const ENGLISH_MESSAGES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "ide.fullIde.status": {
    conflict: "Conflict",
    saving: "Saving…",
    unsaved: "Unsaved",
    saved: "Saved",
    notSaved: "Not saved",
    unsavedTitle: "Unsaved changes",
    savedAt: "Saved {time}",
    notSavedYet: "Not saved yet",
  },
  "ide.fullIde.header": {
    sqlDialect: "SQL dialect",
    goBack: "Go back",
    back: "Back",
    files: "Files",
    saveCopy: "Save Copy",
    saveAs: "Save As",
    resolve: "Resolve",
    saving: "Saving…",
    save: "Save",
    upgrade: "Upgrade",
    logIn: "Log in",
  },
  "ide.fullIde.deleteModal": {
    title: "Delete",
    description: "Delete {name}?",
    fallbackItem: "this item",
    cancel: "Cancel",
    confirm: "Delete",
  },
  "ide.explorer.layout": {
    openFileExplorer: "Open file explorer",
    resizeExplorer: "Resize explorer",
    resizeExplorerHelp:
      "Drag or use arrow keys to resize explorer",
    files: "Files",
    close: "Close",
    closeFilesPanel: "Close files panel",
  },
  "ide.explorer.menu": {
    openNodeActions: "Open node actions",
    actionsTitle: "Actions",
  },
  "ide.explorer.tabs": {
    openFiles: "Open files",
    closeFile: "Close {name}",
  },
  "ide.explorer.tree": {
    save: "Save",
    cancel: "Cancel",
  },
  "ide.codeRunner": {
    defaultTitle: "Try it",
    outputTab: "Output",
    resultsTab: "Results",
    stdinPlaceholder:
      "Type stdin here. Each new line becomes one input line.",
    previewTab: "Preview",
    terminalTab: "Terminal",
  },
};

function humanizeTranslationKey(key: string): string {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();

  if (!normalized) {
    return key;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function interpolate(
  message: string,
  values?: Record<string, unknown>,
): string {
  let output = message;

  for (const [key, value] of Object.entries(values ?? {})) {
    output = output
      .split(`{${key}}`)
      .join(String(value));
  }

  return output;
}

function useZoeBuildLearnerWorkspaceTranslations(
  namespace: string,
): LearnerWorkspaceTranslate {
  return (
    key: string,
    values?: Record<string, unknown>,
  ) => {
    const message =
      ENGLISH_MESSAGES[namespace]?.[key] ??
      humanizeTranslationKey(key);

    return interpolate(message, values);
  };
}

/**
 * ZoeBuild owns project-level settings/resources outside FullIDE.
 * The shared learner settings control therefore has no product-level
 * surface inside ZoeBuild's canonical IDE.
 */
function ZoeBuildLearnerWorkspaceSettingsMenu() {
  return null;
}

function createZoeBuildLearnerWorkspaceRuntime(
  apiOrigin: string,
): LearnerWorkspaceRuntime {
  return {
    useTranslations:
      useZoeBuildLearnerWorkspaceTranslations,

    useAuthenticatedUserId() {
      const state = useAppSession({
        apiOrigin,
      });

      return state.status === "authenticated"
        ? state.session.user.id
        : null;
    },

    useRouter,
    Link,
    SettingsMenu:
      ZoeBuildLearnerWorkspaceSettingsMenu,
  };
}

export function ZoeBuildLearnerWorkspaceRuntimeProvider(
  props: {
    apiOrigin: string;
    children: ReactNode;
  },
) {
  const runtime = useMemo(
    () =>
      createZoeBuildLearnerWorkspaceRuntime(
        props.apiOrigin,
      ),
    [props.apiOrigin],
  );

  return (
    <LearnerWorkspaceRuntimeProvider
      runtime={runtime}
    >
      {props.children}
    </LearnerWorkspaceRuntimeProvider>
  );
}
