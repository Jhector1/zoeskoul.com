"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { PANEL } from "./styles";

export default function InfoRow({ title, desc }: { title: string; desc: string }) {
    return (
        <div className={cn(PANEL, "p-4")}>
            <div className="ui-title-sm">{title}</div>
            <div className="mt-1 ui-meta">{desc}</div>
        </div>
    );
}