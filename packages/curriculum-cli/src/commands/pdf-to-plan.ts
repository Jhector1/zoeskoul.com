import fs from "node:fs/promises";
import path from "node:path";
import { pdfToCoursePlan } from "@zoeskoul/curriculum-compiler";

function getArg(flag: string, argv: string[]): string | undefined {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
}

export async function runPdfToPlan(argv: string[]): Promise<void> {
    const filePath = argv[0];
    if (!filePath) {
        throw new Error(
            "Usage: pdf-to-plan <pdfPath> --subject <subjectSlug> [--out <outputPath>]",
        );
    }

    const subjectSlug = getArg("--subject", argv);
    if (!subjectSlug) {
        throw new Error("Missing required --subject <subjectSlug>");
    }

    const outputPath =
        getArg("--out", argv) ??
        path.join("authoring", subjectSlug, "course.plan.json");

    const plan = await pdfToCoursePlan({
        filePath,
        subjectSlug,
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");

    process.stdout.write(
        `Wrote normalized course plan to ${outputPath}\n`,
    );
}