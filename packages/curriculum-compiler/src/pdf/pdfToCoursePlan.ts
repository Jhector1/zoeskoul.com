import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type {
    NormalizedCoursePlan,
    NormalizedPlanModule,
    NormalizedPlanSection,
    NormalizedPlanTopic,
} from "@zoeskoul/curriculum-contracts";

const CORE_HEADINGS = [
    "Learning objectives",
    "Section structure",
    "Sections and Topics",
    "Guided Exercises",
    "Quiz Focus",
    "Module Project",
] as const;

const EXTRA_STOP_HEADINGS = [
    "Assessment and Delivery Notes",
    "Suggested beginner rhythm",
    "Recommended Course Deliverables",
    "Module-to-Module Milestones",
    "Sample Pacing Options",
    "Tooling Suggestions",
    "Closing Note",
] as const;

const ALL_BOUNDARY_HEADINGS = [...CORE_HEADINGS, ...EXTRA_STOP_HEADINGS];

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanRawText(rawText: string): string {
    return rawText
        .replace(/\u00A0/g, " ")
        .replace(/\r/g, "")
        .replace(/<PARSED TEXT FOR PAGE:.*?>/gi, "\n")
        .replace(/-\s*\d+\s+of\s+\d+\s*--/gi, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\t/g, " ")
        .replace(/[ ]{2,}/g, " ");
}

function injectBreaks(rawText: string): string {
    let text = cleanRawText(rawText);

    const patterns = [
        String.raw`Module\s+\d+\s*-\s*`,
        String.raw`Purpose:`,
        ...ALL_BOUNDARY_HEADINGS.map(escapeRegex),
        String.raw`Section\s+\d+\.\d+\s*-\s*`,
        String.raw`Topic\s+\d+\.\d+\.\d+\s*-\s*`,
    ];

    for (const pattern of patterns) {
        text = text.replace(new RegExp(`\\s+(?=${pattern})`, "g"), "\n");
    }

    return text;
}

function cleanLine(line: string): string {
    return line
        .replace(/^[•▪◦·*-]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeLines(rawText: string): string[] {
    return injectBreaks(rawText)
        .split(/\n+/)
        .map(cleanLine)
        .filter(Boolean);
}

function findLineIndex(lines: string[], value: string, start = 0): number {
    for (let i = start; i < lines.length; i++) {
        if (lines[i] === value) return i;
    }
    return -1;
}

function isModuleHeader(line: string): boolean {
    return /^Module\s+\d+\s*-\s*.+$/.test(line);
}

function isSectionHeader(line: string): boolean {
    return /^Section\s+\d+\.\d+\s*-\s*.+$/i.test(line);
}

function isTopicHeader(line: string): boolean {
    return /^Topic\s+\d+\.\d+\.\d+\s*-\s*.+$/i.test(line);
}

function isBoundaryHeading(line: string): boolean {
    return ALL_BOUNDARY_HEADINGS.includes(line as (typeof ALL_BOUNDARY_HEADINGS)[number]);
}

function isCoreHeading(line: string): boolean {
    return CORE_HEADINGS.includes(line as (typeof CORE_HEADINGS)[number]);
}

function isStopLine(line: string): boolean {
    return (
        !line ||
        isModuleHeader(line) ||
        isCoreHeading(line) ||
        EXTRA_STOP_HEADINGS.includes(line as (typeof EXTRA_STOP_HEADINGS)[number])
    );
}

function shouldAppendToPrevious(prev: string, next: string): boolean {
    if (!prev) return false;
    if (!next) return false;

    if (!/[.!?:]$/.test(prev)) return true;
    if (/^[a-z(]/.test(next)) return true;

    return false;
}

function parseBulletBlock(lines: string[], start: number, end: number): string[] {
    const items: string[] = [];
    let current = "";

    for (let i = start; i < end; i++) {
        const raw = lines[i];
        if (!raw) continue;
        if (isStopLine(raw)) break;

        const line = cleanLine(raw);
        if (!line) continue;

        if (/^\d+\.\s+/.test(line)) {
            if (current) items.push(current.trim());
            current = line.replace(/^\d+\.\s+/, "").trim();
            continue;
        }

        if (!current) {
            current = line;
            continue;
        }

        if (shouldAppendToPrevious(current, line)) {
            current = `${current} ${line}`.trim();
        } else {
            items.push(current.trim());
            current = line;
        }
    }

    if (current) items.push(current.trim());
    return items.filter(Boolean);
}

function parseNumberedBlock(lines: string[], start: number, end: number): string[] {
    const items: string[] = [];
    let current = "";

    for (let i = start; i < end; i++) {
        const raw = lines[i];
        if (!raw) continue;
        if (isStopLine(raw)) break;

        const line = cleanLine(raw);
        if (!line) continue;

        if (/^\d+\.\s+/.test(line)) {
            if (current) items.push(current.trim());
            current = line.replace(/^\d+\.\s+/, "").trim();
            continue;
        }

        if (current) {
            current = `${current} ${line}`.trim();
        }
    }

    if (current) items.push(current.trim());
    return items.filter(Boolean);
}

function parseSingleParagraph(lines: string[], start: number, end: number): string {
    const out: string[] = [];

    for (let i = start; i < end; i++) {
        const line = lines[i];
        if (!line) continue;
        if (isStopLine(line)) break;
        out.push(line);
    }

    return out.join(" ").replace(/\s+/g, " ").trim();
}

function nextBoundaryIndex(lines: string[], start: number, moduleEnd: number): number {
    for (let i = start; i < moduleEnd; i++) {
        if (isBoundaryHeading(lines[i] ?? "") || isModuleHeader(lines[i] ?? "")) {
            return i;
        }
    }
    return moduleEnd;
}

function parsePurpose(lines: string[], moduleStart: number, moduleEnd: number): string {
    const purposeIndex = lines.findIndex(
        (line, i) => i >= moduleStart && i < moduleEnd && line.startsWith("Purpose:"),
    );
    if (purposeIndex === -1) return "";

    const firstLine = lines[purposeIndex].replace(/^Purpose:\s*/, "").trim();
    const boundary = nextBoundaryIndex(lines, purposeIndex + 1, moduleEnd);
    const rest = parseSingleParagraph(lines, purposeIndex + 1, boundary);

    return [firstLine, rest].filter(Boolean).join(" ").trim();
}

function parseLearningObjectives(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): string[] {
    const start = findLineIndex(lines, "Learning objectives", moduleStart);
    if (start === -1 || start >= moduleEnd) return [];

    const end = nextBoundaryIndex(lines, start + 1, moduleEnd);
    return parseBulletBlock(lines, start + 1, end);
}

function parseGuidedExercises(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): string[] {
    const start = findLineIndex(lines, "Guided Exercises", moduleStart);
    if (start === -1 || start >= moduleEnd) return [];

    const end = nextBoundaryIndex(lines, start + 1, moduleEnd);
    return parseNumberedBlock(lines, start + 1, end);
}

function parseQuizFocus(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): string[] {
    const start = findLineIndex(lines, "Quiz Focus", moduleStart);
    if (start === -1 || start >= moduleEnd) return [];

    const end = nextBoundaryIndex(lines, start + 1, moduleEnd);
    return parseBulletBlock(lines, start + 1, end);
}

function parseModuleProject(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): string {
    const start = findLineIndex(lines, "Module Project", moduleStart);
    if (start === -1 || start >= moduleEnd) return "";

    const end = nextBoundaryIndex(lines, start + 1, moduleEnd);
    return parseSingleParagraph(lines, start + 1, end);
}

function parseSectionsAndTopics(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): NormalizedPlanSection[] {
    const start = findLineIndex(lines, "Sections and Topics", moduleStart);
    if (start === -1 || start >= moduleEnd) return [];

    const end = nextBoundaryIndex(lines, start + 1, moduleEnd);
    const sections: NormalizedPlanSection[] = [];
    let currentSection: NormalizedPlanSection | null = null;

    for (let i = start + 1; i < end; i++) {
        const line = lines[i];
        if (!line) continue;

        const sectionMatch = line.match(/^Section\s+([\d.]+)\s*-\s*(.+)$/i);
        if (sectionMatch) {
            const sectionCode = sectionMatch[1];
            const sectionTitle = sectionMatch[2].trim();

            currentSection = {
                sectionSlug: `section_${sectionCode.replace(/\./g, "_")}`,
                order: sections.length + 1,
                title: sectionTitle,
                sourceSectionCode: sectionCode,
                topics: [],
            };

            sections.push(currentSection);
            continue;
        }

        const topicMatch = line.match(/^Topic\s+([\d.]+)\s*-\s*(.+)$/i);
        if (topicMatch && currentSection) {
            const topicCode = topicMatch[1];
            const topicTitle = topicMatch[2].trim();

            currentSection.topics.push({
                topicId: slugify(topicTitle),
                order: currentSection.topics.length + 1,
                title: topicTitle,
                sourceTopicCode: topicCode,
            });
        }
    }

    return sections;
}

function parseModuleBlock(
    lines: string[],
    moduleStart: number,
    moduleEnd: number,
): NormalizedPlanModule {
    const header = lines[moduleStart];
    const match = header.match(/^Module\s+(\d+)\s*-\s*(.+)$/i);

    if (!match) {
        throw new Error(`Invalid module header: "${header}"`);
    }

    const moduleOrder = Number(match[1]);
    const moduleTitle = match[2].trim();

    return {
        moduleSlug: `module_${moduleOrder}`,
        order: moduleOrder,
        title: moduleTitle,
        purpose: parsePurpose(lines, moduleStart, moduleEnd),
        learningObjectives: parseLearningObjectives(lines, moduleStart, moduleEnd),
        guidedExercises: parseGuidedExercises(lines, moduleStart, moduleEnd),
        quizFocus: parseQuizFocus(lines, moduleStart, moduleEnd),
        moduleProject: parseModuleProject(lines, moduleStart, moduleEnd),
        sections: parseSectionsAndTopics(lines, moduleStart, moduleEnd),
    };
}

export async function extractPdfText(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText();
        return result.text;
    } finally {
        await parser.destroy();
    }
}

export async function pdfToCoursePlan(args: {
    filePath: string;
    subjectSlug: string;
    title?: string;
    description?: string;
}): Promise<NormalizedCoursePlan> {
    const rawText = await extractPdfText(args.filePath);
    const lines = normalizeLines(rawText);

    const moduleStartIndexes = lines
        .map((line, index) => (isModuleHeader(line) ? index : -1))
        .filter((index) => index >= 0);

    if (!moduleStartIndexes.length) {
        throw new Error("No module headers were found in the PDF.");
    }

    const modules: NormalizedPlanModule[] = [];

    for (let i = 0; i < moduleStartIndexes.length; i++) {
        const start = moduleStartIndexes[i]!;
        const end = moduleStartIndexes[i + 1] ?? lines.length;
        modules.push(parseModuleBlock(lines, start, end));
    }

    return {
        subjectSlug: args.subjectSlug,
        title: args.title ?? lines[0] ?? args.subjectSlug,
        description:
            args.description ??
            "Normalized course plan generated from PDF curriculum input.",
        source: {
            kind: "pdf",
            filePath: args.filePath,
            originalTitle: path.basename(args.filePath),
        },
        modules,
    };
}