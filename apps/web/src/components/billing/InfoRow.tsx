"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { PANEL } from "./styles";

import type { ReactNode } from "react";

export default function InfoRow({
                                    title,
                                    desc,
                                    icon,
                                }: {
    title: string;
    desc: string;
    icon?: ReactNode;
}) {
    return (
        <div className={cn(PANEL, "ui-surface p-4")}>
            <div className="flex items-start gap-3">
                {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}

                <div className="min-w-0">
                    <div className="ui-title-sm">{title}</div>
                    <div className="mt-1 ui-meta">{desc}</div>
                </div>
            </div>
        </div>
    );
}