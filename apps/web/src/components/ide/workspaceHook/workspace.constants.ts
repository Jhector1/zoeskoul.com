import type { WorkspaceLanguage } from "@/lib/practice/types";
import type { IdeWorkspaceAccess } from "./workspace.types";

export const ALL_LANGUAGES: WorkspaceLanguage[] = [
  "python",
  "java",
  "javascript",
  "bash",
  "web",
  "c",
  "cpp",
  "sql",
];

export const SAVE_DEBOUNCE_MS = 300;

export const SPLIT_PX = 8;
export const MIN_LEFT_PX = 240;
export const MIN_RIGHT_PX = 520;

export const DEFAULT_ACCESS: IdeWorkspaceAccess = {
  hasUser: true,
  canUseMultiFile: true,
  canSaveCloud: false,
  canCreateProjects: false,
};
