import { describe, expect, it } from "vitest";
import {
    buildWorkspaceTerminalStartupInput,
    resolveWorkspaceTerminalStartupCwd,
} from "./useWorkspaceTerminalController";

describe("V6 interactive terminal directory colors", () => {
    it("schedules a hidden startup even for the default workspace root", () => {
        expect(resolveWorkspaceTerminalStartupCwd({cwd: "/workspace"})).toBeNull();
        expect(resolveWorkspaceTerminalStartupCwd({cwd: "/workspace", enableLsColors: true}))
            .toBe("/workspace");
    });
    it("enables GNU ls colors without affecting scripts or non-GNU ls", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace", enableLsColors: true, markerParts: ["one", "two", "three"],
        });
        expect(input).toContain("command ls --color=auto -d / >/dev/null 2>&1");
        expect(input).toContain("alias ls='ls --color=auto'");
        expect(input).not.toContain(".bashrc");
        expect(input).not.toContain("ls --color=always");
        expect(input).toContain("printf '%s%s%s\\n' 'one' 'two' 'three'");
    });
    it("does not change legacy V5 shell startup", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace", markerParts: ["one", "two", "three"],
        });
        expect(input).not.toContain("--color=auto");
    });
    it("preserves workspace setup ordering when color is enabled", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace/demo",
            bootstrap: {setupScriptPath: ".zoeskoul/setup.sh"},
            enableLsColors: true,
            markerParts: ["a", "b", "c"],
        });
        expect(input.indexOf('/bin/bash "$__zoe_setup"'))
            .toBeLessThan(input.indexOf("alias ls='ls --color=auto'"));
    });
});
