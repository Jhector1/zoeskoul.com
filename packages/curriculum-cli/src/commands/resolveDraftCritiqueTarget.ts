import path from "node:path";
import { resolveAuthoringCompileTarget } from "@zoeskoul/curriculum-compiler";

function parseAuthoringCourseBlueprintPath(filePath: string) {
    const parts = path.normalize(filePath).split(path.sep);
    const subjectsIndex = parts.lastIndexOf("subjects");
    const coursesIndex = parts.lastIndexOf("courses");

    if (
        subjectsIndex < 0 ||
        coursesIndex < 0 ||
        parts[coursesIndex + 2] !== "course.blueprint.json"
    ) {
        return null;
    }

    return {
        subjectSlug: parts[subjectsIndex + 1],
        courseSlug: parts[coursesIndex + 1],
    };
}

export async function resolveDraftCritiqueTarget(blueprintPath: string) {
    const authoringPath = parseAuthoringCourseBlueprintPath(blueprintPath);

    if (!authoringPath) {
        return {
            draftSubjectSlug: undefined,
        };
    }

    const target = await resolveAuthoringCompileTarget({
        subjectSlug: authoringPath.subjectSlug,
        courseSlug: authoringPath.courseSlug,
        options: {
            draftOnly: true,
        },
    });

    return {
        draftSubjectSlug: target.liveSubjectSlug,
    };
}
