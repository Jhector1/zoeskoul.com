import { loadBlueprint, compileSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runCompileSubject(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    const out = await compileSubject({ blueprint, provider: openAiProvider });
    console.log(`Compiled draft for subject ${out.subjectManifest.subject.slug}`);
}