import { describe, expect, it } from "vitest";

import { workspaceToServiceDefaults } from "./workspaceToServiceDefaults.js";

describe("workspaceToServiceDefaults", () => {
    it("maps capabilities without choosing a learner presentation", () => {
        const serviceDefaults = workspaceToServiceDefaults({
            policy: {
                workspace: {
                    capabilities: {
                        filesystem: { enabled: true },
                        multiFileProjects: { enabled: true },
                        terminal: { enabled: true },
                    },
                },
            } as any,
        });

        expect(serviceDefaults).toEqual({
            runnerBackend: "pty",
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        });
        expect(serviceDefaults?.layoutMode).toBeUndefined();
    });
});
