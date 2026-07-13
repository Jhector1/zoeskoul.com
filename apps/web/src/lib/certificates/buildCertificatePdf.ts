import {
    CERTIFICATE_COLORS,
    CERTIFICATE_DESIGN_HEIGHT,
    CERTIFICATE_DESIGN_WIDTH,
    CERTIFICATE_LAYOUT,
    CERTIFICATE_TYPE,
} from "@/lib/certificates/design";
import { CERT_DISCLAIMER, ISSUER_NAME, ISSUER_TITLE } from "@/lib/certificates/policy";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CERTIFICATE_FONT_DIRS = [
    path.join(process.cwd(), "src/lib/certificates/fonts"),
    path.join(process.cwd(), "apps/web/src/lib/certificates/fonts"),
] as const;

function readCertificateFont(filename: string) {
    for (const directory of CERTIFICATE_FONT_DIRS) {
        const fontPath = path.join(directory, filename);
        if (existsSync(fontPath)) return readFileSync(fontPath);
    }

    throw new Error(
        `Missing certificate font asset: ${filename}. Run the certificate font setup script before building.`,
    );
}

const INTER_REGULAR_FONT = readCertificateFont("inter-400.woff");
const INTER_BOLD_FONT = readCertificateFont("inter-700.woff");
const INTER_EXTRABOLD_FONT = readCertificateFont("inter-800.woff");
const PLAYFAIR_BOLD_FONT = readCertificateFont("playfair-700.woff");
const GREAT_VIBES_FONT = readCertificateFont("great-vibes-400.woff");

export type CertificatePdfCopy = {
    title: string;
    subtitle: string;
    presentedTo: string;
    completionOf: string;
    dateAwarded: string;
    issuedBadge: string;
    issuedOn: string;
    certificateIdLabel: string;
};

export type BuildCertificatePdfArgs = {
    learnerName: string;
    subjectTitle: string;
    completionDateStr: string;
    appName: string;
    copy: CertificatePdfCopy;
};

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

export async function buildCertificatePdf(args: BuildCertificatePdfArgs) {
    const { default: PDFDocument } = await import("pdfkit");
    const { copy } = args;
    const colors = CERTIFICATE_COLORS;
    const layout = CERTIFICATE_LAYOUT;
    const type = CERTIFICATE_TYPE;

    const doc = new PDFDocument({
        size: "LETTER",
        layout: "landscape",
        margin: 0,
        compress: true,
        info: {
            Title: `${args.subjectTitle} Certificate`,
            Author: args.appName,
            Subject: "Course completion certificate",
        },
    });

    doc.registerFont("Inter", INTER_REGULAR_FONT);
    doc.registerFont("Inter-Bold", INTER_BOLD_FONT);
    doc.registerFont("Inter-ExtraBold", INTER_EXTRABOLD_FONT);
    doc.registerFont("Playfair-Bold", PLAYFAIR_BOLD_FONT);
    doc.registerFont("Great-Vibes", GREAT_VIBES_FONT);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    const sx = pageWidth / CERTIFICATE_DESIGN_WIDTH;
    const sy = pageHeight / CERTIFICATE_DESIGN_HEIGHT;
    const px = (value: number) => value * sx;
    const py = (value: number) => value * sy;
    const pctX = (value: number) => CERTIFICATE_DESIGN_WIDTH * (value / 100) * sx;
    const pctY = (value: number) => CERTIFICATE_DESIGN_HEIGHT * (value / 100) * sy;

    doc.rect(0, 0, pageWidth, pageHeight).fill(colors.paper);

    // CSS uses a horizontal gradient plus skewY. Draw short segments so the
    // opacity fades at both ends just like the preview gradient.
    const waveStartX = pctX(layout.waveLeftPct);
    const waveEndX = pageWidth - pctX(layout.waveRightPct);
    const waveWidth = waveEndX - waveStartX;
    const waveDeltaY =
        Math.tan((layout.waveSkewDeg * Math.PI) / 180) * waveWidth;
    const waveSegments = 32;

    doc.save().lineCap("round");
    for (let i = 0; i < layout.waveCount; i += 1) {
        const startY = pctY(layout.waveStartTopPct + i * layout.waveStepPct);
        const endY = startY + (i % 2 === 0 ? -waveDeltaY : waveDeltaY);

        for (let segment = 0; segment < waveSegments; segment += 1) {
            const t0 = segment / waveSegments;
            const t1 = (segment + 1) / waveSegments;
            const midpoint = (t0 + t1) / 2;
            const fade = Math.min(
                clamp01(midpoint / 0.12),
                clamp01((1 - midpoint) / 0.12),
            );

            doc
                .strokeOpacity(layout.waveOpacity * fade)
                .moveTo(waveStartX + waveWidth * t0, startY + (endY - startY) * t0)
                .lineTo(waveStartX + waveWidth * t1, startY + (endY - startY) * t1)
                .lineWidth(py(1))
                .strokeColor(colors.wave)
                .stroke();
        }
    }
    doc.restore();

    const app = args.appName.toUpperCase();
    const watermarkSpacing = px(type.watermarkPx * layout.watermarkTrackingEm);
    doc.save();
    doc
        .fillOpacity(layout.watermarkOpacity)
        .fillColor(colors.ink)
        .font("Playfair-Bold")
        .fontSize(px(type.watermarkPx));
    const watermarkWidth = doc.widthOfString(app, {
        characterSpacing: watermarkSpacing,
    });
    const watermarkHeight = doc.currentLineHeight(true);
    doc.rotate(layout.watermarkRotationDeg, { origin: [centerX, centerY] });
    doc.text(
        app,
        centerX - watermarkWidth / 2,
        centerY - watermarkHeight / 2,
        {
            lineBreak: false,
            characterSpacing: watermarkSpacing,
        },
    );
    doc.restore();

    doc
        .lineWidth(px(layout.outerFrameWidthPx))
        .strokeColor(colors.gold)
        .roundedRect(
            px(layout.outerFrameInsetPx),
            py(layout.outerFrameInsetPx),
            pageWidth - px(layout.outerFrameInsetPx * 2),
            pageHeight - py(layout.outerFrameInsetPx * 2),
            px(layout.outerFrameRadiusPx),
        )
        .stroke();
    doc
        .lineWidth(px(1))
        .strokeColor(colors.line)
        .roundedRect(
            px(layout.innerFrameInsetPx),
            py(layout.innerFrameInsetPx),
            pageWidth - px(layout.innerFrameInsetPx * 2),
            pageHeight - py(layout.innerFrameInsetPx * 2),
            px(layout.innerFrameRadiusPx),
        )
        .stroke();

    const cornerSize = px(layout.cornerSizePx);
    const cornerInsetX = px(layout.cornerInsetPx);
    const cornerInsetY = py(layout.cornerInsetPx);
    const cornerSquares = [
        [cornerInsetX, cornerInsetY],
        [pageWidth - cornerInsetX - cornerSize, cornerInsetY],
        [cornerInsetX, pageHeight - cornerInsetY - cornerSize],
        [pageWidth - cornerInsetX - cornerSize, pageHeight - cornerInsetY - cornerSize],
    ] as const;
    for (const [x, y] of cornerSquares) {
        doc
            .rect(x, y, cornerSize, cornerSize)
            .lineWidth(px(1))
            .strokeColor(colors.goldDark)
            .stroke();
    }

    const headerWidth = pctX(layout.headerWidthPct);
    const headerX = (pageWidth - headerWidth) / 2;
    const headerY = pctY(layout.headerTopPct);
    doc
        .fillColor(colors.sub)
        .font("Inter-ExtraBold")
        .fontSize(px(type.appPx))
        .text(app, headerX, headerY, {
            width: headerWidth,
            align: "center",
            characterSpacing: px(type.appPx * type.appTrackingEm),
            lineBreak: false,
        });
    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.headerSubjectPx))
        .text(args.subjectTitle, headerX, headerY + py(17.2), {
            width: headerWidth,
            align: "center",
            lineBreak: false,
        });

    const titleWidth = pctX(layout.titleWidthPct);
    const titleX = (pageWidth - titleWidth) / 2;
    const titleY = pctY(layout.titleTopPct);
    doc
        .fillColor(colors.ink)
        .font("Playfair-Bold")
        .fontSize(px(type.titlePx))
        .text(copy.title, titleX, titleY, {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });
    doc
        .fillColor(colors.ink)
        .font("Playfair-Bold")
        .fontSize(px(type.subtitlePx))
        .text(copy.subtitle, titleX, titleY + py(type.titlePx + layout.titleSubtitleGapPx), {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });

    doc
        .moveTo(centerX - pctX(layout.separatorWidthPct / 2), pctY(layout.separatorTopPct))
        .lineTo(centerX + pctX(layout.separatorWidthPct / 2), pctY(layout.separatorTopPct))
        .lineWidth(py(layout.separatorHeightPx))
        .strokeColor(colors.gold)
        .stroke();

    doc
        .fillColor(colors.sub)
        .font("Inter")
        .fontSize(px(type.bodyPx))
        .text(copy.presentedTo, titleX, pctY(layout.presentedTopPct), {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });

    doc
        .fillColor(colors.ink)
        .font("Great-Vibes")
        .fontSize(px(type.learnerPx))
        .text(args.learnerName, titleX, pctY(layout.learnerTopPct), {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });

    doc
        .moveTo(centerX - pctX(layout.learnerLineWidthPct / 2), pctY(layout.learnerLineTopPct))
        .lineTo(centerX + pctX(layout.learnerLineWidthPct / 2), pctY(layout.learnerLineTopPct))
        .lineWidth(py(1))
        .dash(px(3), { space: px(2) })
        .strokeColor(colors.gold)
        .stroke()
        .undash();

    doc
        .fillColor(colors.sub)
        .font("Inter")
        .fontSize(px(type.bodyPx))
        .text(copy.completionOf, titleX, pctY(layout.completionTopPct), {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });
    doc
        .fillColor(colors.ink)
        .font("Inter-ExtraBold")
        .fontSize(px(type.subjectPx))
        .text(args.subjectTitle, titleX, pctY(layout.subjectTopPct), {
            width: titleWidth,
            align: "center",
            lineBreak: false,
        });

    const footerY = pctY(layout.footerTopPct);
    const footerColumnWidth = pctX(layout.footerColumnWidthPct);
    const leftColumnX = pctX(layout.footerSidePct);
    const rightColumnX = pageWidth - pctX(layout.footerSidePct) - footerColumnWidth;
    const footerLineY = footerY + py(24.5);

    doc
        .fillColor(colors.ink)
        .font("Inter-Bold")
        .fontSize(px(type.footerValuePx))
        .text(args.completionDateStr, leftColumnX, footerY, {
            width: footerColumnWidth,
            align: "left",
            lineBreak: false,
        });
    doc
        .moveTo(leftColumnX, footerLineY)
        .lineTo(leftColumnX + footerColumnWidth, footerLineY)
        .lineWidth(py(1))
        .strokeColor(colors.line)
        .stroke();
    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.footerLabelPx))
        .text(copy.dateAwarded, leftColumnX, footerY + py(33.5), {
            width: footerColumnWidth,
            align: "left",
            lineBreak: false,
        });

    doc
        .fillColor(colors.ink)
        .font("Inter-Bold")
        .fontSize(px(type.footerValuePx))
        .text(ISSUER_NAME, rightColumnX, footerY, {
            width: footerColumnWidth,
            align: "right",
            lineBreak: false,
        });
    doc
        .moveTo(rightColumnX, footerLineY)
        .lineTo(rightColumnX + footerColumnWidth, footerLineY)
        .lineWidth(py(1))
        .strokeColor(colors.line)
        .stroke();
    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.footerLabelPx))
        .text(ISSUER_TITLE, rightColumnX, footerY + py(29.5), {
            width: footerColumnWidth,
            align: "right",
            lineBreak: false,
        });

    const sealTop = pctY(layout.sealTopPct);
    const sealSize = px(layout.sealSizePx);
    const sealCenterY = sealTop + sealSize / 2;
    doc
        .circle(centerX, sealCenterY, sealSize / 2)
        .lineWidth(px(2))
        .fillAndStroke(colors.sealFill, colors.gold);
    const sealBlockTop = sealCenterY - py(11);
    doc
        .fillColor(colors.goldDark)
        .font("Inter-ExtraBold")
        .fontSize(px(type.sealTitlePx))
        .text(copy.issuedBadge, centerX - px(30), sealBlockTop, {
            width: px(60),
            align: "center",
            lineBreak: false,
        });
    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.sealBrandPx))
        .text(app, centerX - px(30), sealBlockTop + py(15), {
            width: px(60),
            align: "center",
            lineBreak: false,
        });

    doc
        .moveTo(pctX(layout.footerDividerSidePct), pctY(layout.footerDividerTopPct))
        .lineTo(
            pageWidth - pctX(layout.footerDividerSidePct),
            pctY(layout.footerDividerTopPct),
        )
        .lineWidth(py(1))
        .strokeColor(colors.line)
        .stroke();

    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.disclaimerPx))
        .text(
            CERT_DISCLAIMER,
            (pageWidth - pctX(layout.disclaimerWidthPct)) / 2,
            pctY(layout.disclaimerTopPct),
            {
                width: pctX(layout.disclaimerWidthPct),
                align: "center",
                lineGap: py(1),
                lineBreak: false,
            },
        );

    const metaY =
        pageHeight - pctY(layout.metaBottomPct) - py(type.metaPx * 1.5);
    doc
        .fillColor(colors.muted)
        .font("Inter")
        .fontSize(px(type.metaPx))
        .text(copy.issuedOn, pctX(layout.metaSidePct), metaY, {
            width: pctX(layout.metaMaxWidthPct),
            align: "left",
            lineBreak: false,
        });
    doc.text(
        copy.certificateIdLabel,
        pageWidth - pctX(layout.metaSidePct + layout.metaMaxWidthPct),
        metaY,
        {
            width: pctX(layout.metaMaxWidthPct),
            align: "right",
            lineBreak: false,
            ellipsis: true,
        },
    );

    doc.end();
    return done;
}
