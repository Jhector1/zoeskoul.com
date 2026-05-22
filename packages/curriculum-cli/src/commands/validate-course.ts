import { validateCourseAuthoring } from "@zoeskoul/curriculum-compiler";

export async function runValidateCourse(subjectSlug: string, courseSlug: string) {
    const issues = await validateCourseAuthoring(subjectSlug, courseSlug);

    if (issues.length) {
        throw new Error(`Course authoring validation failed:\n- ${issues.join("\n- ")}`);
    }

    console.log(`✔ Course authoring is valid for ${subjectSlug}/${courseSlug}`);
}
