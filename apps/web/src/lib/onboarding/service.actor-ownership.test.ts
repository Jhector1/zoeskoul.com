import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

describe("onboarding save actor ownership", () => {
    it("requires an authenticated user for all new onboarding saves", () => {
        expect(source).toContain("function requireAuthenticatedActor(actor: Actor)");
        expect(source).toContain('throw new Error("Onboarding requires an authenticated user.")');
        expect(source).toContain("return { userId: actor.userId, guestId: null } satisfies Actor;");
        expect(source).toContain("const saveActor = requireAuthenticatedActor(actor);");
    });

    it("keeps guest claiming as rollout compatibility only", () => {
        const upsert = source.slice(
            source.indexOf("export async function upsertOnboardingProfile("),
            source.indexOf("export async function claimGuestOnboardingForUser("),
        );

        expect(upsert).toContain("userId: saveActor.userId");
        expect(upsert).toContain("guestId: null");
        expect(upsert).not.toContain("guestId: actor.guestId");
        expect(source).toContain("Compatibility bridge for onboarding answers collected before the");
        expect(source).toContain("export async function claimGuestOnboardingForUser(");
    });
});
