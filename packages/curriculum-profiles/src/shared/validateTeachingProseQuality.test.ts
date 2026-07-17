import { describe, expect, it } from "vitest";
import { validateTeachingProseQuality } from "./validateTeachingProseQuality.js";

const booklikeBody = `A **qualified column** is a column written with its table name, so the reference identifies both the value and its source. This matters after a join because two tables may each contain an id column, and a bare id no longer tells the reader which record is intended.

\`\`\`sql
SELECT enrollments.id, students.name
FROM enrollments
INNER JOIN students
  ON enrollments.student_id = students.id;
\`\`\`

First, the SELECT list names an enrollment id and a student name. Next, the join follows the documented relationship from the foreign key to the student primary key. One result row represents one enrollment paired with its student. The table name before each dot keeps that meaning visible when the query grows. That precision also keeps later filters, aliases, and reports readable without changing the relationship itself.`;

describe("validateTeachingProseQuality", () => {
    it("accepts a defined, book-like teaching sketch with complementary titles", () => {
        const issues = validateTeachingProseQuality({
            profileId: "sql",
            projectLike: false,
            draft: {
                sketchBlocks: [
                    {
                        id: "qualified-columns",
                        cardTitle: "Give Every Column an Address",
                        title: "A qualified column names its table and column",
                        bodyMarkdown: booklikeBody,
                    },
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues).toEqual([]);
    });

    it("rejects missing/repeated titles, thin prose, and a robotic opening", () => {
        const issues = validateTeachingProseQuality({
            profileId: "sql",
            projectLike: false,
            draft: {
                sketchBlocks: [
                    {
                        id: "thin",
                        title: "Understanding LEFT JOIN",
                        bodyMarkdown:
                            "In SQL, the LEFT JOIN operation is used to combine rows. This query will show the result.",
                    },
                    {
                        id: "repeat",
                        cardTitle: "Using Table Aliases",
                        title: "Using Table Aliases",
                        bodyMarkdown:
                            "Let's look at aliases. For example, consider a query. This query will be shorter.",
                    },
                ],
                quizDraft: [],
            } as any,
        });
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("PROGRAMMING_CARD_TITLE_MISSING");
        expect(codes).toContain("PROGRAMMING_CARD_TITLE_REPEATS_HEADING");
        expect(codes).toContain("PROGRAMMING_SKETCH_TITLE_GENERIC");
        expect(codes).toContain("PROGRAMMING_TEACHING_PROSE_TOO_THIN");
        expect(codes).toContain("PROGRAMMING_CONCEPT_DEFINITION_MISSING");
        expect(codes).toContain("PROGRAMMING_ROBOTIC_PROSE_DETECTED");
    });

    it("rejects repeated navigation or inner titles across lesson cards", () => {
        const issues = validateTeachingProseQuality({
            profileId: "sql",
            projectLike: false,
            draft: {
                sketchBlocks: [
                    {
                        id: "first",
                        cardTitle: "Apply the Filter",
                        title: "A WHERE clause narrows the reviewed row set",
                        bodyMarkdown: booklikeBody,
                    },
                    {
                        id: "second",
                        cardTitle: "Apply the Filter",
                        title: "The same reviewed scope belongs in the mutation",
                        bodyMarkdown: booklikeBody,
                    },
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "PROGRAMMING_SKETCH_TITLE_REPEATED_ACROSS_CARDS",
        );
    });

    it("allows a concise project brief while still rejecting a generic project heading", () => {
        const issues = validateTeachingProseQuality({
            profileId: "sql",
            projectLike: true,
            draft: {
                sketchBlocks: [
                    {
                        id: "brief",
                        cardTitle: "A Roster That Can Be Trusted",
                        title: "Project brief: enrollment activity roster",
                        bodyMarkdown:
                            "The registrar needs one row per enrollment, with readable identifiers and a stable order. The report must connect students to enrollment records through the documented key pair, preserve the enrollment grain as columns are added, and make every source column easy to trace. Build the query cumulatively so each step retains the prior working report while adding one requirement. The finished roster should be clear enough for another analyst to verify confidently without guessing which id belongs to which table.",
                    },
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues).toEqual([]);
    });
});
