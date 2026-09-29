import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
    return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("manual course draft identity", () => {
    it("keeps manual source lookup and compile-time policy on the authoring blueprint", () => {
        const source = read(
            "packages/curriculum-compiler/src/manual/compileManualTopic.ts",
        );

        expect(source).toContain("blueprint: args.blueprint");
        expect(source).toContain(
            "outputSubjectSlug: args.outputSubjectSlug",
        );
        expect(source).not.toContain("const compileBlueprint");
    });

    it("uses outputSubjectSlug as emitted identity without replacing authoring policy", () => {
        const source = read(
            "packages/curriculum-compiler/src/compile/compileTopic.ts",
        );

        expect(source).toContain("outputSubjectSlug?: string");
        expect(source).toContain(
            "args.outputSubjectSlug ?? args.blueprint.subjectSlug",
        );
        expect(source).toContain("const emissionBlueprint");
        expect(source).toContain("subjectSlug: outputSubjectSlug");

        expect(source).toContain(
            "const resolved = await resolvePlan({\n        blueprint: args.blueprint,",
        );
        expect(source).toContain(
            "const sourceLocale = args.blueprint.sourceLocale",
        );
        expect(source).toContain(
            "const extraLocales = (args.blueprint.targetLocales ?? []).filter(",
        );
        expect(source).toContain(
            "const shape = getSubjectShape(args.blueprint.profileId)",
        );
        expect(source).toContain(
            "const profileServices = getProfileServices(args.blueprint.profileId)",
        );

        expect(source).toContain(
            "const subjectManifest = buildSubjectManifestFromPlan({\n        blueprint: emissionBlueprint,",
        );
        expect(source).toContain(
            "const sourceSubjectMessages = buildSubjectMessagesFromPlan({\n        blueprint: emissionBlueprint,",
        );
        expect(source).toContain(
            "const seed = buildTopicSeedFromPlanNode({\n        blueprint: emissionBlueprint,",
        );
    });

    it("resolves the canonical draft subject in CLI without replacing the authoring blueprint", () => {
        const source = read(
            "packages/curriculum-cli/src/commands/compile-manual-topic.ts",
        );

        expect(source).toContain("options: { draftOnly: true }");
        expect(source).toContain(
            "outputSubjectSlug: target.blueprint.subjectSlug",
        );
        expect(source).not.toContain(
            "outputBlueprint: target.blueprint",
        );
    });
});
