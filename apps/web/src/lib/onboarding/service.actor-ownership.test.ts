import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

describe("onboarding save actor ownership", () => {
    it("claims an existing guest profile before authenticated saves", () => {
        expect(source).toContain(
            "const saveActor = await prepareOnboardingSaveActor(actor);",
        );
        expect(source).toContain("if (actor.guestId)");
        expect(source).toContain("await claimGuestOnboardingForUser({");
        expect(source).toContain("guestId: actor.guestId");
        expect(source).toContain("userId: actor.userId");
    });

    it("never persists a guest id on an authenticated onboarding profile", () => {
        expect(source).toContain(
            "return { userId: actor.userId, guestId: null };",
        );

        const upsert = source.slice(
            source.indexOf("export async function upsertOnboardingProfile("),
            source.indexOf("export async function claimGuestOnboardingForUser("),
        );

        expect(upsert).toContain("const where = actorWhere(saveActor);");
        expect(upsert).toContain("userId: saveActor.userId");
        expect(upsert).toContain("guestId: saveActor.guestId");
        expect(upsert).not.toContain("guestId: actor.guestId");
    });
});
