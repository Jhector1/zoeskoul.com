// src/app/api/certificates/subject/pdf/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

import { hasReviewModule } from "@/lib/subjects/registry";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import {CERT_REQUIRE_ASSIGNMENT} from "@/lib/certificates/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const APP_NAME = process.env.APP_NAME;
function jsonErr(message: string, status = 400, detail?: any, setGuestId?: string) {
    const res = NextResponse.json({ message, detail }, { status });
    return attachGuestCookie(res, setGuestId);
}

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getOrigin(req: Request) {
    try {
        return new URL(req.url).origin;
    } catch {
        return "";
    }
}

async function loadPublicAsset(req: Request, relPath: string): Promise<Buffer> {
    const clean = relPath.startsWith("/") ? relPath.slice(1) : relPath;
    const diskPath = path.join(process.cwd(), "public", clean);

    // 1) filesystem first (best for server-side PDF)
    if (fs.existsSync(diskPath)) {
        return await fs.promises.readFile(diskPath);
    }

    // 2) fallback: fetch from site origin
    const origin = getOrigin(req);
    if (!origin) throw new Error(`Asset not found and no origin: ${relPath}`);

    const url = `${origin}/${clean}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch asset ${relPath} from ${url} (${r.status})`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
}

async function getCourseStatus(opts: { actorKey: string; subjectSlug: string; locale: string }) {
    const { actorKey, subjectSlug, locale } = opts;

    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true, title: true },
    });
    if (!subject) return { ok: false as const, status: 404, message: "Unknown subjectSlug." };

    // ✅ include module DB id
    const dbModules = await prisma.practiceModule.findMany({
        where: { subjectId: subject.id },
        orderBy: { order: "asc" },
        select: { id: true, slug: true, title: true, order: true },
    });

    const reviewModules = dbModules.filter((m) => hasReviewModule(subjectSlug, m.slug));
    if (!reviewModules.length) {
        return { ok: false as const, status: 404, message: "No review modules for this subject." };
    }

    // ✅ ReviewProgress.moduleId is the module DB id
    const progressRows = await prisma.reviewProgress.findMany({
        where: {
            actorKey,
            subjectSlug,
            locale,
            moduleId: { in: reviewModules.map((m) => m.id) },
        },
        select: { moduleId: true, state: true, updatedAt: true },
    });

    const progressByModuleId = new Map(progressRows.map((r) => [r.moduleId, r as any]));

    // ✅ decide whether assignment is required for certificate
    const requireAssignment = CERT_REQUIRE_ASSIGNMENT;
    const modules = await Promise.all(
        reviewModules.map(async (m) => {
            const row = progressByModuleId.get(m.id);
            const state = (row?.state ?? null) as any;

            const moduleCompleted = Boolean(state?.moduleCompleted);
            const assignmentSessionId = state?.assignmentSessionId ? String(state.assignmentSessionId) : null;

            let assignmentCompleted = false;
            if (assignmentSessionId) {
                const sess = await prisma.practiceSession.findUnique({
                    where: { id: assignmentSessionId },
                    select: { status: true, completedAt: true },
                });
                assignmentCompleted = sess?.status === "completed";
            }

            return {
                // Keep slug for display/meta (nice for humans)
                moduleId: m.slug,

                // ✅ add db id for correctness/debugging
                moduleDbId: m.id,

                title: m.title,
                order: m.order,
                moduleCompleted,
                assignmentSessionId,
                assignmentCompleted,
                completedAt: state?.moduleCompletedAt ?? null,
            };
        }),
    );

    const eligible = modules.every((x) => x.moduleCompleted && (!requireAssignment || x.assignmentCompleted));

    const completedAt =
        modules
            .map((m) => m.completedAt)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] ??
        progressRows.map((r) => r.updatedAt.toISOString()).sort().slice(-1)[0] ??
        null;

    return { ok: true as const, subject, requireAssignment, modules, eligible, completedAt };
}
// Fit text into a box by reducing font size until it fits height (and wraps within width)
function fitTextBox(
    doc: PDFKit.PDFDocument,
    text: string,
    opts: {
        font: string;
        maxSize: number;
        minSize: number;
        width: number;
        maxHeight: number;
        lineGap?: number;
    },
) {
    const { font, maxSize, minSize, width, maxHeight, lineGap = 0 } = opts;

    for (let size = maxSize; size >= minSize; size -= 1) {
        doc.font(font).fontSize(size);
        const h = doc.heightOfString(text, { width, align: "center", lineGap });
        if (h <= maxHeight) return size;
    }
    return minSize;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const locale = (searchParams.get("locale") ?? "en").trim();

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const setGuestId = ensured.setGuestId;
    const actorKey = actorKeyOf(actor);

    if (!subjectSlug) return jsonErr("Missing subjectSlug.", 400, null, setGuestId);

    const status = await getCourseStatus({ actorKey, subjectSlug, locale });
    if (!status.ok) return jsonErr(status.message, status.status, { subjectSlug }, setGuestId);

    if (!status.eligible) {
        return jsonErr(
            "Not eligible for certificate.",
            403,
            { requireAssignment: status.requireAssignment, modules: status.modules },
            setGuestId,
        );
    }

    // Name on certificate
    let displayName = "Learner";
    if (actor.userId) {
        const u = await prisma.user.findUnique({
            where: { id: actor.userId },
            select: { name: true, email: true },
        });
        displayName = (u?.name || u?.email || "Learner").trim();
    } else {
        displayName = "Guest Learner";
    }

    // Upsert certificate row (issued once)
    const completedAtDate = status.completedAt ? new Date(status.completedAt) : null;

    const meta = {
        courseTitle: status.subject.title,
        requireAssignment: status.requireAssignment,
        modules: status.modules.map((m) => ({
            moduleId: m.moduleId,
            title: m.title,
            moduleCompleted: m.moduleCompleted,
            assignmentCompleted: m.assignmentCompleted,
        })),
    };

    const cert = await prisma.courseCertificate.upsert({
        where: {
            actorKey_subjectSlug_locale: {
                actorKey,
                subjectSlug: status.subject.slug,
                locale,
            },
        },
        create: {
            actorKey,
            subjectSlug: status.subject.slug,
            locale,
            completedAt: completedAtDate,
            meta,
        },
        update: {
            completedAt: completedAtDate ?? undefined,
            meta,
        },
        select: { id: true, issuedAt: true, completedAt: true },
    });

    try {
        // Fonts
        const interRegular = await loadPublicAsset(req, "/fonts/inter/Inter_18pt-Regular.ttf");
        const interBold = await loadPublicAsset(req, "/fonts/inter/Inter_18pt-Bold.ttf");

// ✅ New fonts
        const playfairBold = await loadPublicAsset(req, "/fonts/playfair/PlayfairDisplay-Bold.ttf");
        const greatVibes = await loadPublicAsset(req, "/fonts/greatvibes/GreatVibes-Regular.ttf");

// PDF
        const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 36 });

        const chunks: Buffer[] = [];
        doc.on("data", (c) => chunks.push(c));
        const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

        doc.registerFont("Inter", interRegular);
        doc.registerFont("Inter-Bold", interBold);
        doc.registerFont("Playfair-Bold", playfairBold);
        doc.registerFont("GreatVibes", greatVibes);

        const W = doc.page.width;
        const H = doc.page.height;

// Palette (closer to your sample)
        const ink = "#0B1220";
        const sub = "#334155";
        const muted = "#64748B";
        const gold = "#C9A227";
        const gold2 = "#B88B1D";
        const line = "#D8DEE9";
        const wave = "#CBD5E1";

// Helpers
        const boxX = 78;
        const boxW = W - 156;

        function center(text: string, y: number, font: string, size: number, color: string, opts?: any) {
            doc.fillColor(color).font(font).fontSize(size);
            doc.text(text, boxX, y, { width: boxW, align: "center", ...opts });
        }

        function drawCorner(doc: PDFKit.PDFDocument, x: number, y: number, s: number) {
            // small square + inner diamond mark
            doc.save();
            doc.strokeColor(gold2).lineWidth(1);
            doc.rect(x, y, s, s).stroke();
            doc.moveTo(x + s * 0.2, y + s * 0.5).lineTo(x + s * 0.5, y + s * 0.2).stroke();
            doc.moveTo(x + s * 0.5, y + s * 0.2).lineTo(x + s * 0.8, y + s * 0.5).stroke();
            doc.moveTo(x + s * 0.8, y + s * 0.5).lineTo(x + s * 0.5, y + s * 0.8).stroke();
            doc.moveTo(x + s * 0.5, y + s * 0.8).lineTo(x + s * 0.2, y + s * 0.5).stroke();
            doc.restore();
        }

        function drawWaves(doc: PDFKit.PDFDocument) {
            // subtle background curves (vector; no image)
            doc.save();
            doc.opacity(0.18);
            doc.strokeColor(wave).lineWidth(1);

            const left = 30;
            const right = W - 30;

            for (let i = 0; i < 12; i++) {
                const y = 70 + i * 34;
                doc.moveTo(left, y);
                doc.bezierCurveTo(
                    W * 0.30,
                    y - 40,
                    W * 0.70,
                    y + 40,
                    right,
                    y,
                );
                doc.stroke();
            }

            doc.opacity(1);
            doc.restore();
        }

        function drawFrame(doc: PDFKit.PDFDocument) {
            doc.save();

            // Outer gold frame
            doc.lineWidth(3).strokeColor(gold).roundedRect(18, 18, W - 36, H - 36, 16).stroke();

            // Inner thin frame
            doc.lineWidth(1).strokeColor(line).roundedRect(34, 34, W - 68, H - 68, 14).stroke();

            // Corner ornaments
            const s = 12;
            drawCorner(doc, 22, 22, s);
            drawCorner(doc, W - 22 - s, 22, s);
            drawCorner(doc, 22, H - 22 - s, s);
            drawCorner(doc, W - 22 - s, H - 22 - s, s);

            doc.restore();
        }

        function fitTextBox(
            doc: PDFKit.PDFDocument,
            text: string,
            opts: { font: string; maxSize: number; minSize: number; width: number; maxHeight: number; lineGap?: number },
        ) {
            const { font, maxSize, minSize, width, maxHeight, lineGap = 0 } = opts;
            for (let size = maxSize; size >= minSize; size -= 1) {
                doc.font(font).fontSize(size);
                const h = doc.heightOfString(text, { width, align: "center", lineGap });
                if (h <= maxHeight) return size;
            }
            return minSize;
        }

// Background + Frame
        drawWaves(doc);
        drawFrame(doc);

// Optional watermark (very subtle)
        doc.save();
        doc.opacity(0.06);
        doc.fillColor("#0B1220");
        doc.font("Playfair-Bold").fontSize(90);
        doc.rotate(-12, { origin: [W * 0.25, H * 0.55] });
        doc.text(String(APP_NAME).toUpperCase(), W * 0.06, H * 0.45, { width: W * 0.88, align: "center" });
        doc.rotate(12, { origin: [W * 0.25, H * 0.55] });
        doc.opacity(1);
        doc.restore();

// Content
        const courseTitle = status.subject.title;
        const completionDateStr = fmtDate(status.completedAt);
        const issuedDateStr = cert.issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// Top small line
        center(String(APP_NAME).toUpperCase(), 62, "Inter-Bold", 12, sub, { characterSpacing: 1 });
        center(courseTitle, 82, "Inter", 12, muted);

// Big certificate title (serif)
        center("CERTIFICATE", 120, "Playfair-Bold", 54, ink);
        center("OF COMPLETION", 176, "Playfair-Bold", 22, ink);

// Gold separator
        doc.save();
        doc.strokeColor(gold).lineWidth(2);
        doc.moveTo(boxX + boxW * 0.38, 210).lineTo(boxX + boxW * 0.62, 210).stroke();
        doc.restore();

        center("This certificate is proudly presented to", 240, "Inter", 13, sub);

// Name (script)
        const nameSize = fitTextBox(doc, displayName, {
            font: "GreatVibes",
            maxSize: 56,
            minSize: 28,
            width: boxW,
            maxHeight: 90,
            lineGap: -4,
        });
        center(displayName, 268, "GreatVibes", nameSize, ink, { lineGap: -4 });

// Dotted gold line under name
        doc.save();
        doc.strokeColor(gold).dash(2, { space: 4 }).lineWidth(1);
        doc.moveTo(boxX + boxW * 0.18, 352).lineTo(boxX + boxW * 0.82, 352).stroke();
        doc.undash();
        doc.restore();

        center("for the successful completion of", 370, "Inter", 13, sub);

// Course (bold, fits)
        const courseSize = fitTextBox(doc, courseTitle, {
            font: "Inter-Bold",
            maxSize: 26,
            minSize: 16,
            width: boxW,
            maxHeight: 58,
            lineGap: -1,
        });
        center(courseTitle, 395, "Inter-Bold", courseSize, ink, { lineGap: -1 });

// Signature + date lines (more “official”)
        const yLine = H - 130;

        doc.save();
        doc.strokeColor(line).lineWidth(1);

// left
        doc.moveTo(110, yLine).lineTo(310, yLine).stroke();
        doc.fillColor(muted).font("Inter").fontSize(10);
        doc.text("Date awarded", 110, yLine + 8, { width: 200, align: "left" });
        doc.fillColor(ink).font("Inter-Bold").fontSize(11);
        doc.text(completionDateStr, 110, yLine - 18, { width: 200, align: "left" });

// right
        doc.strokeColor(line).lineWidth(1);
        doc.moveTo(W - 310, yLine).lineTo(W - 110, yLine).stroke();
        doc.fillColor(muted).font("Inter").fontSize(10);
        doc.text("Name / Position", W - 310, yLine + 8, { width: 200, align: "right" });
        doc.fillColor(ink).font("Inter-Bold").fontSize(11);
        doc.text("Program Director", W - 310, yLine - 18, { width: 200, align: "right" });

        doc.restore();

// Seal (cleaner)
        doc.save();
        doc.strokeColor(gold).lineWidth(2);
        doc.fillColor("#FFF8E1");
        doc.circle(W / 2, H - 118, 40).fillAndStroke();
        doc.fillColor(gold2).font("Inter-Bold").fontSize(10);
        doc.text("VERIFIED", W / 2 - 45, H - 126, { width: 90, align: "center" });
        doc.fillColor(muted).font("Inter").fontSize(8);
        doc.text(String(APP_NAME).toUpperCase(), W / 2 - 45, H - 112, { width: 90, align: "center" });
        doc.restore();

// Footer meta
        doc.fillColor(muted).font("Inter").fontSize(9);
        doc.text(`Issued: ${issuedDateStr}`, 54, H - 54, { width: W - 108, align: "left" });
        doc.text(`Certificate ID: ${cert.id}`, 54, H - 54, { width: W - 108, align: "right" });

        doc.end();

        // const pdf = await done;
        // const filename = `${status.subject.slug}-certificate.pdf`;

// Buffer -> ArrayBuffer (no extra copy)
        const pdf = await done;
        const filename = `${status.subject.slug}-certificate.pdf`;

// ✅ Make a fresh no pdfUint8Array (backed by ArrayBuffer, not SharedArrayBuffer)
        const bytes = new Uint8Array(pdf.byteLength);
        bytes.set(pdf); // Buffer is a Uint8Array, so this copies cleanly

        const res = new NextResponse(bytes);

        res.headers.set("Content-Type", "application/pdf");
        res.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
        res.headers.set("Cache-Control", "no-store");

        return attachGuestCookie(res, setGuestId);
    } catch (e: any) {
        return jsonErr(
            "Failed to generate certificate PDF.",
            500,
            { error: String(e?.message ?? e) },
            setGuestId,
        );
    }
}