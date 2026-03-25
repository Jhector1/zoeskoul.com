"use client";

import React from "react";
import { BillingSkel as Skel } from "./BillingSkel";

export default function BillingHeaderSkeleton() {
    return (
        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <Skel className="h-3.5 w-20" />
                    <Skel className="mt-2 h-6 w-44 max-w-[80%]" />
                    <Skel className="mt-2 h-4 w-[92%] max-w-[26rem] opacity-80" />

                    <div className="mt-3 flex flex-wrap gap-2">
                        <Skel className="h-6 w-28 rounded-full" />
                        <Skel className="h-6 w-24 rounded-full" />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Skel className="h-10 w-32 rounded-2xl" />
                    <Skel className="h-10 w-24 rounded-2xl" />
                </div>
            </div>
        </div>
    );
}