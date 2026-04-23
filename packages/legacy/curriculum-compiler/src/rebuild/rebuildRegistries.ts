import { execSync } from "node:child_process";

export function rebuildRegistries(subjectSlug?: string) {
    execSync("pnpm i18n:generate", { stdio: "inherit" });
    execSync("pnpm gen:subject-manifests", { stdio: "inherit" });
    execSync(
        subjectSlug
            ? `pnpm gen:topic-manifests --subject ${subjectSlug}`
            : "pnpm gen:topic-manifests",
        { stdio: "inherit" },
    );
}