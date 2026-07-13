import { describe, expect, it } from "vitest";
import { buildCertificatePdf } from "@/lib/certificates/buildCertificatePdf";

describe("buildCertificatePdf", () => {
    it("renders the certificate in landscape with the same embedded fonts as the UI preview", async () => {
        const pdf = await buildCertificatePdf({
            learnerName: "Student Learnoir",
            subjectTitle: "Linux Terminal Fundamentals",
            completionDateStr: "July 6, 2026",
            appName: "ZoeSkoul",
            copy: {
                title: "CERTIFICATE",
                subtitle: "OF COMPLETION",
                presentedTo: "This certificate is proudly presented to",
                completionOf: "for the successful completion of",
                dateAwarded: "Date awarded",
                issuedBadge: "ISSUED",
                issuedOn: "Issued: July 6, 2026",
                certificateIdLabel:
                    "Certificate ID: linux-terminal-fundamentals-en",
            },
        });

        const source = pdf.toString("latin1");

        expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
        expect(source).toContain("/MediaBox [0 0 792 612]");
        expect(source).not.toContain("/MediaBox [0 0 612 792]");
        expect(source).toContain("PlayfairDisplay-Bold");
        expect(source).toContain("GreatVibes-Regular");
        expect(source).toContain("Inter-Regular");
        expect(source).toContain("Inter-Bold");
        expect(source).toContain("Inter-ExtraBold");
    });
});
