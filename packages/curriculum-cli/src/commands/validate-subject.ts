import { validateSubjectAuthoring } from "@zoeskoul/curriculum-compiler";

export async function runValidateSubject(subjectSlug: string) {
    const issues = await validateSubjectAuthoring(subjectSlug);

    if (issues.length) {
        throw new Error(`Subject authoring validation failed:\n- ${issues.join("\n- ")}`);
    }

    console.log(`✔ Subject authoring is valid for ${subjectSlug}`);
}
