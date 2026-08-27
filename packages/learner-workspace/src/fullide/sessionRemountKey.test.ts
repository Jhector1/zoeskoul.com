import { describe, expect, it } from "vitest";

import { buildFullIdeSessionRemountKey } from "./sessionRemountKey";

describe("buildFullIdeSessionRemountKey", () => {
    const base = {
        actorKey: "user:1",
        runtimeLanguage: "python",
        initialProjectId: "local",
        scopeKey: "review-tool:exercise-a",
        exerciseStateKey: "exercise-a:reset:0",
        controlledWorkspace: true,
    };

    it("keeps controlled Review FullIDE mounted across exercise and reset identity changes", () => {
        const current = buildFullIdeSessionRemountKey(base);
        const next = buildFullIdeSessionRemountKey({
            ...base,
            scopeKey: "review-tool:exercise-b",
            exerciseStateKey: "exercise-b:reset:3",
        });

        expect(next).toBe(current);
    });

    it("still remounts controlled workspaces for genuine actor, language, or project boundaries", () => {
        const current = buildFullIdeSessionRemountKey(base);

        expect(
            buildFullIdeSessionRemountKey({ ...base, actorKey: "user:2" }),
        ).not.toBe(current);
        expect(
            buildFullIdeSessionRemountKey({
                ...base,
                runtimeLanguage: "javascript",
            }),
        ).not.toBe(current);
        expect(
            buildFullIdeSessionRemountKey({
                ...base,
                initialProjectId: "project:2",
            }),
        ).not.toBe(current);
    });

    it("preserves scope and exercise boundaries for uncontrolled sandbox/project workspaces", () => {
        const uncontrolled = {
            ...base,
            controlledWorkspace: false,
        };
        const current = buildFullIdeSessionRemountKey(uncontrolled);

        expect(
            buildFullIdeSessionRemountKey({
                ...uncontrolled,
                scopeKey: "scope:2",
            }),
        ).not.toBe(current);
        expect(
            buildFullIdeSessionRemountKey({
                ...uncontrolled,
                exerciseStateKey: "exercise:2",
            }),
        ).not.toBe(current);
    });
});
