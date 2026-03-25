"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { PANEL } from "@/components/billing/styles";
import { BillingSkel as Skel } from "./BillingSkel";

export default function InfoRowSkeleton() {
    return (
        <div className={cn(PANEL, "p-4")}>
            <Skel className="h-4 w-36" />
            <Skel className="mt-2 h-3.5 w-[92%] opacity-80" />
            <Skel className="mt-2 h-3.5 w-[70%] opacity-70" />
        </div>
    );
}