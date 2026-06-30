"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import {CERT_DISCLAIMER, ISSUER_NAME, ISSUER_TITLE} from "@/lib/certificates/policy";

type CertificatePreviewCardProps = {
    eligible: boolean;
    previewName: string;
    subjectTitle: string;
    completionDateStr: string;
    issuedDateStr: string;
    certificateId?: string | null;
    appName?: string;
};

const GOLD = "#C9A227";
const GOLD_DARK = "#B88B1D";
const INK = "#0B1220";
const SUB = "#334155";
const MUTED = "#64748B";
const LINE = "#D8DEE9";
const WAVE = "#CBD5E1";
const PAPER = "#FFFFFF";
const SEAL_FILL = "#FFF8E1";


export default function CertificatePreviewCard({
                                                   eligible,
                                                   previewName,
                                                   subjectTitle,
                                                   completionDateStr,
                                                   issuedDateStr,
                                                   certificateId,
                                                   appName = process.env.NEXT_PUBLIC_APP_NAME ?? "ZoeSkoul",
                                               }: CertificatePreviewCardProps) {
    const t = useTranslations("certificatePreview");
    const app = String(appName).toUpperCase();
    const certificateIdLabel = certificateId ? t("certificateId", { id: certificateId }) : "";

    return (
        <div className="mx-auto w-full max-w-[820px]">
            <div
                className={cn(
                    "relative overflow-hidden rounded-2xl border shadow-sm",
                    !eligible && "opacity-80",
                )}
                style={{
                    backgroundColor: PAPER,
                    borderColor: LINE,
                    boxShadow: "0 10px 30px rgba(11,18,32,0.08)",
                }}
            >
                {!eligible ? (
                    <div className="absolute inset-0 z-30 grid place-items-center bg-white/55 backdrop-blur-[1px]">
                        <div
                            className="rounded-xl border px-4 py-2 text-sm font-extrabold"
                            style={{
                                borderColor: LINE,
                                backgroundColor: "#fff",
                                color: INK,
                                boxShadow: "0 6px 20px rgba(11,18,32,0.08)",
                            }}
                        >
                            {t("lockedOverlay")}
                        </div>
                    </div>
                ) : null}

                <div className="relative mx-auto aspect-[11/8.5] w-full">
                    {/* background waves */}
                    <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div
                                key={i}
                                className="absolute left-[3.5%] right-[3.5%] h-px rounded-full"
                                style={{
                                    top: `${11 + i * 6.1}%`,
                                    background: `linear-gradient(90deg, transparent 0%, ${WAVE} 12%, ${WAVE} 88%, transparent 100%)`,
                                    transform: `skewY(${i % 2 === 0 ? "-3deg" : "3deg"})`,
                                }}
                            />
                        ))}
                    </div>

                    {/* watermark */}
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div
                            className="rotate-[-12deg] text-[clamp(3rem,8vw,5.5rem)] leading-none tracking-[0.14em]"
                            style={{
                                fontFamily: "var(--font-playfair)",
                                color: "rgba(11,18,32,0.06)",
                                fontWeight: 700,
                            }}
                        >
                            {app}
                        </div>
                    </div>

                    {/* frame */}
                    <div
                        className="absolute inset-[18px] rounded-[16px] border-[3px]"
                        style={{ borderColor: GOLD }}
                    />
                    <div
                        className="absolute inset-[34px] rounded-[14px] border"
                        style={{ borderColor: LINE }}
                    />

                    {/* corner ornaments */}
                    {[
                        "left-[22px] top-[22px]",
                        "right-[22px] top-[22px]",
                        "left-[22px] bottom-[22px]",
                        "right-[22px] bottom-[22px]",
                    ].map((pos) => (
                        <div
                            key={pos}
                            className={cn("absolute h-3 w-3 border", pos)}
                            style={{ borderColor: GOLD_DARK }}
                        />
                    ))}

                    {/* header */}
                    <div
                        className="absolute left-1/2 top-[8.7%] w-[72%] -translate-x-1/2 text-center"
                        style={{ color: SUB }}
                    >
                        <div
                            className="text-[11px] font-extrabold tracking-[0.22em]"
                            style={{ color: SUB }}
                        >
                            {app}
                        </div>
                        <div className="mt-1 text-[12px]" style={{ color: MUTED }}>
                            {subjectTitle}
                        </div>
                    </div>

                    {/* title */}
                    <div className="absolute left-1/2 top-[19%] w-[76%] -translate-x-1/2 text-center">
                        <div
                            className="text-[clamp(2.6rem,5.2vw,3.45rem)] leading-none"
                            style={{
                                fontFamily: "var(--font-playfair)",
                                color: INK,
                                fontWeight: 700,
                            }}
                        >
                            {t("title")}
                        </div>
                        <div
                            className="mt-2 text-[clamp(1.05rem,2vw,1.4rem)] leading-none"
                            style={{
                                fontFamily: "var(--font-playfair)",
                                color: INK,
                                fontWeight: 700,
                            }}
                        >
                            {t("subtitle")}
                        </div>
                    </div>

                    {/* gold separator */}
                    <div
                        className="absolute left-1/2 top-[34.2%] h-[2px] -translate-x-1/2"
                        style={{
                            width: "24%",
                            backgroundColor: GOLD,
                        }}
                    />

                    {/* presented to */}
                    <div
                        className="absolute left-1/2 top-[38.6%] w-[76%] -translate-x-1/2 text-center text-[13px]"
                        style={{ color: SUB }}
                    >
                        {t("presentedTo")}
                    </div>

                    {/* student name */}
                    <div
                        className="absolute left-1/2 top-[43.2%] w-[76%] -translate-x-1/2 text-center leading-none"
                        style={{
                            fontFamily: "var(--font-script)",
                            color: INK,
                            fontSize: "clamp(2rem,5.6vw,3.5rem)",
                        }}
                    >
                        {previewName}
                    </div>

                    {/* dashed line under name */}
                    <div
                        className="absolute left-1/2 top-[56.2%] -translate-x-1/2 border-t"
                        style={{
                            width: "50%",
                            borderColor: GOLD,
                            borderTopStyle: "dashed",
                        }}
                    />

                    {/* completion text */}
                    <div
                        className="absolute left-1/2 top-[59.3%] w-[76%] -translate-x-1/2 text-center text-[13px]"
                        style={{ color: SUB }}
                    >
                        {t("completionOf")}
                    </div>

                    {/* course title */}
                    <div
                        className="absolute left-1/2 top-[63.2%] w-[76%] -translate-x-1/2 text-center text-[clamp(1rem,2.2vw,1.6rem)] font-extrabold"
                        style={{ color: INK }}
                    >
                        {subjectTitle}
                    </div>

                    {/* bottom left */}
                    <div className="absolute left-[13.2%] top-[76.2%] w-[24.4%]">
                        <div
                            className="mb-2 text-left text-[11px] font-bold"
                            style={{ color: INK }}
                        >
                            {completionDateStr}
                        </div>
                        <div
                            className="h-px w-full"
                            style={{ backgroundColor: LINE }}
                        />
                        <div
                            className="mt-2 text-left text-[10px]"
                            style={{ color: MUTED }}
                        >
                            {t("dateAwarded")}
                        </div>
                    </div>

                    {/* bottom right */}
                    <div className="absolute right-[13.2%] top-[76.2%] w-[24.4%] text-right">

                        <div
                            className="text-[11px] font-bold"
                            style={{ color: INK }}
                        >
                            {ISSUER_NAME}
                        </div>
                        <div
                            className="mt-2 h-px w-full"
                            style={{ backgroundColor: LINE }}
                        />
                        <div
                            className="mt-1 text-[10px] whitespace-nowrap"
                            style={{ color: MUTED }}
                        >
                            {ISSUER_TITLE}
                        </div>

                    </div>

                    {/* seal */}
                    <div className="absolute left-1/2 top-[74.8%] -translate-x-1/2">
                        <div
                            className="grid h-[76px] w-[76px] place-items-center rounded-full border-2"
                            style={{
                                borderColor: GOLD,
                                backgroundColor: SEAL_FILL,
                            }}
                        >
                            <div className="text-center leading-tight">
                                <div
                                    className="text-[9px] font-extrabold"
                                    style={{ color: GOLD_DARK }}
                                >
                                    {t("issuedBadge")}
                                </div>
                                <div
                                    className="mt-1 text-[7px]"
                                    style={{ color: MUTED }}
                                >
                                    {app}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* footer divider below seal */}
                    <div
                        className="absolute left-[8.8%] right-[8.8%] top-[89.2%] h-px"
                        style={{ backgroundColor: LINE }}
                    />

                    {/* disclaimer */}
                    <div
                        className="absolute left-1/2 top-[90.6%] w-[73%] -translate-x-1/2 text-center text-[7.5px] leading-[1.3]"
                        style={{ color: MUTED }}
                    >
                        {CERT_DISCLAIMER}
                    </div>

                    {/* footer meta */}
                    <div
                        className="absolute bottom-[5.4%] left-[6.6%] text-[9px]"
                        style={{ color: MUTED }}
                    >
                        {t("issuedOn", { date: issuedDateStr })}
                    </div>

                    <div
                        className="absolute bottom-[5.4%] right-[6.6%] max-w-[42%] truncate text-right text-[9px]"
                        style={{ color: MUTED }}
                        title={certificateIdLabel || undefined}
                    >
                        {certificateIdLabel}
                    </div>
                </div>
            </div>
        </div>
    );
}
