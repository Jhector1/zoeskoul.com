import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    new URL("./HomePageAvatarOnboardingClient.tsx", import.meta.url),
    "utf8",
);

describe("home onboarding theme ownership", () => {
    it("persists theme through the canonical app-preferences setter", () => {
        expect(source).toContain(
            'import { useAppPreferences } from "@zoeskoul/preferences/react";',
        );
        expect(source).toContain(
            "const { updatePreferences } = useAppPreferences();",
        );
        expect(source).toContain("updatePreferences({ theme })");
        expect(source).not.toContain(
            "const { setTheme, resolvedTheme } = useTheme();",
        );
        expect(source).not.toContain("setTheme(theme)");
    });
});
