"use client";

import React from "react";
import { cn } from "@/lib/cn";

type CertificatePreviewCardProps = {
    eligible: boolean;
    previewName: string;
    subjectTitle: string;
    completionDateStr: string;
    issuedDateStr: string;
    certificateId?: string | null;
    appName?: string;
};

export default function CertificatePreviewCard({
                                                   eligible,
                                                   previewName,
                                                   subjectTitle,
                                                   completionDateStr,
                                                   issuedDateStr,
                                                   certificateId,
                                                   appName = process.env.NEXT_PUBLIC_APP_NAME ?? "ZoeSkoul",
                                               }: CertificatePreviewCardProps) {
    return (
        <div className="mx-auto w-full max-w-[820px]">
            <div
                className={cn(
                    "relative overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
                    !eligible && "opacity-75",
                )}
            >
                {!eligible ? (
                    <div className="absolute inset-0 z-20 grid place-items-center bg-white/60 dark:bg-black/40 backdrop-blur-[1px]">
                        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-extrabold text-neutral-900 shadow-sm dark:border-white/10 dark:bg-neutral-900 dark:text-white/90 sm:px-4 sm:text-sm">
                            Finish the checklist to unlock
                        </div>
                    </div>
                ) : null}

                <div className="relative mx-auto aspect-[11/8.5] w-full p-3 sm:p-4 md:p-5">
                    {/* subtle engraved background */}
                    <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
                        <div className="absolute -left-20 top-8 h-[140%] w-[140%] rotate-[-8deg]">
                            <div className="h-full w-full bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_16px,rgba(148,163,184,0.5)_17px,transparent_18px)]" />
                        </div>
                    </div>

                    {/* watermark */}
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <div
                            className="rotate-[-12deg] text-[clamp(2rem,7vw,4.75rem)] font-black tracking-[0.18em] text-neutral-900/5 dark:text-white/5"
                            style={{ fontFamily: "var(--font-playfair)" }}
                        >
                            {String(appName).toUpperCase()}
                        </div>
                    </div>

                    {/* frame */}
                    <div className="absolute inset-2 rounded-[16px] border-[2px] border-[#C9A227] sm:inset-3 sm:border-[3px] sm:rounded-[18px]" />
                    <div className="absolute inset-[11px] rounded-[12px] border border-neutral-200/80 dark:border-white/10 sm:inset-[18px] sm:rounded-[14px]" />

                    {/* ornaments */}
                    {[
                        "left-[10px] top-[10px]",
                        "right-[10px] top-[10px]",
                        "left-[10px] bottom-[10px]",
                        "right-[10px] bottom-[10px]",
                    ].map((pos) => (
                        <div
                            key={pos}
                            className={cn(
                                "absolute h-2.5 w-2.5 border border-[#B88B1D] sm:h-3 sm:w-3",
                                pos,
                            )}
                        />
                    ))}

                    <div className="relative flex h-full flex-col items-center justify-center px-2 text-center sm:px-5 md:px-8">
                        <div className="text-[8px] font-extrabold tracking-[0.18em] text-slate-600 dark:text-white/60 sm:text-[10px] md:text-[11px] md:tracking-[0.22em]">
                            {String(appName).toUpperCase()}
                        </div>

                        <div className="mt-1 line-clamp-1 text-[9px] text-slate-500 dark:text-white/50 sm:text-[11px]">
                            {subjectTitle}
                        </div>

                        <div
                            className="mt-3 text-[clamp(1.55rem,5.5vw,3.25rem)] leading-none text-slate-950 dark:text-white"
                            style={{ fontFamily: "var(--font-playfair)" }}
                        >
                            CERTIFICATE
                        </div>

                        <div
                            className="mt-0.5 text-[clamp(0.8rem,2.7vw,1.25rem)] text-slate-950/90 dark:text-white/90"
                            style={{ fontFamily: "var(--font-playfair)" }}
                        >
                            OF COMPLETION
                        </div>

                        <div className="mt-3 h-[2px] w-20 bg-[#C9A227] sm:w-28 md:w-36" />

                        <div className="mt-4 text-[10px] text-slate-700 dark:text-white/70 sm:text-xs md:text-sm">
                            This certificate is proudly presented to
                        </div>

                        <div
                            className="mt-2 line-clamp-1 text-[clamp(1.45rem,6vw,3.5rem)] leading-none text-slate-950 dark:text-white"
                            style={{ fontFamily: "var(--font-script)" }}
                        >
                            {previewName}
                        </div>

                        <div className="mt-2.5 w-[74%] border-t border-dashed border-[#C9A227]" />

                        <div className="mt-3 text-[10px] text-slate-700 dark:text-white/70 sm:text-xs md:text-sm">
                            for the successful completion of
                        </div>

                        <div className="mt-1.5 line-clamp-2 text-[clamp(0.95rem,3vw,1.45rem)] font-extrabold text-slate-950 dark:text-white">
                            {subjectTitle}
                        </div>

                        <div className="mt-auto grid w-full grid-cols-3 items-end gap-2 pt-4 sm:gap-3 sm:pt-5 md:pt-6">
                            <div className="text-left">
                                <div className="mb-1.5 h-px bg-neutral-300 dark:bg-white/10 sm:mb-2" />
                                <div className="text-[8px] text-slate-500 dark:text-white/50 sm:text-[10px] md:text-xs">
                                    Date awarded
                                </div>
                                <div className="text-[9px] font-bold text-slate-900 dark:text-white sm:text-[11px] md:text-sm">
                                    {completionDateStr}
                                </div>
                            </div>

                            <div className="flex justify-center">
                                <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#C9A227] bg-[#fff8e1] dark:bg-white/5 sm:h-12 sm:w-12 md:h-16 md:w-16">
                                    <div className="text-[7px] font-black text-[#B88B1D] sm:text-[8px] md:text-[10px]">
                                        VERIFIED
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="mb-1.5 h-px bg-neutral-300 dark:bg-white/10 sm:mb-2" />
                                <div className="text-[8px] text-slate-500 dark:text-white/50 sm:text-[10px] md:text-xs">
                                    Name / Position
                                </div>
                                <div className="text-[9px] font-bold text-slate-900 dark:text-white sm:text-[11px] md:text-sm">
                                    Program Director
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 flex w-full flex-col gap-1 text-[8px] text-slate-500 dark:text-white/50 sm:mt-3 sm:flex-row sm:items-center sm:justify-between sm:text-[10px] md:text-[11px]">
                            <span>Issued: {issuedDateStr}</span>
                            <span className="truncate sm:max-w-[48%]">
                                {certificateId ? `Certificate ID: ${certificateId}` : ""}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}