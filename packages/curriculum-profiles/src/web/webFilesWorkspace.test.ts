import { describe, expect, it } from "vitest";

import { WORKSPACE_PROFILES } from "../workspaceProfiles.js";

describe("browser-web-files-runner", () => {
  it("uses the shared FullIDE file workspace without a terminal", () => {
    const profile = WORKSPACE_PROFILES["browser-web-files-runner"];

    expect(profile).toBeTruthy();
    expect(profile.capabilities.multiFileProjects.enabled).toBe(true);
    expect(profile.capabilities.filesystem.enabled).toBe(true);
    expect(profile.capabilities.createFiles?.enabled).toBe(true);
    expect(profile.capabilities.createFolders?.enabled).toBe(true);
    expect(profile.capabilities.terminal.enabled).toBe(false);
    expect(profile.capabilities.packageInstall.enabled).toBe(false);
    expect(profile.capabilities.uploads.enabled).toBe(false);
  });
});
