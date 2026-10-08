import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRootUrl = new URL("../../../../", import.meta.url);

function read(relativePath: string) {
    return fs.readFileSync(
        new URL(relativePath, webRootUrl),
        "utf8",
    );
}

describe("department home experience ownership", () => {
    it("keeps the existing IDE demo canonical for Computer Science", () => {
        const home = read(
            "src/components/home/onboarding/HomePageAvatarOnboardingClient.tsx",
        );
        const section = read(
            "src/components/home/demo/DepartmentExperienceSection.tsx",
        );

        expect(home).toContain(
            'import HomeIdeDemo from "@/components/home/demo/HomeIdeDemo"',
        );
        expect(home).toContain("<HomeIdeDemo");
        expect(section).not.toContain("HomeIdeDemo");
    });

    it("owns a separate language animation without runner or network dependencies", () => {
        const demo = read(
            "src/components/home/demo/LanguageExperienceDemo.tsx",
        );

        expect(demo).toContain('data-testid="home-language-demo"');
        expect(demo).toContain("motion-safe:animate-pulse");
        expect(demo).toContain("motion-reduce:animate-none");
        expect(demo).not.toContain("fetch(");
        expect(demo).not.toContain("Monaco");
        expect(demo).not.toContain("Judge0");
    });

    it("keeps full department demos full-width when multiple are selected", () => {
        const section = read(
            "src/components/home/demo/DepartmentExperienceSection.tsx",
        );

        expect(section).toContain('className="grid gap-4"');
        expect(section).not.toContain("2xl:grid-cols-2");
    });

    it("composes all selected supported department experiences", () => {
        const home = read(
            "src/components/home/onboarding/HomePageAvatarOnboardingClient.tsx",
        );
        const policy = read("src/lib/home/departmentHome.ts");

        expect(home).toContain("<DepartmentExperienceSection");
        expect(home).toContain("<LanguageExperienceDemo");
        expect(policy).toContain("resolveDepartmentHomeExperiences");
        expect(policy).toContain('"computer-science"');
        expect(policy).toContain('"languages"');
    });
});
