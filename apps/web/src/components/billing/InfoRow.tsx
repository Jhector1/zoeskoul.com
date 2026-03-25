"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { PANEL } from "./styles";

export default function InfoRow({ title, desc }: { title: string; desc: string }) {
    return (
        <div className={cn(PANEL, "p-4")}>
            <div className="text-sm font-black text-neutral-900 dark:text-white/85">{title}</div>
            <div className="mt-1 text-xs text-neutral-600 dark:text-white/65">{desc}</div>
        </div>
    );
}