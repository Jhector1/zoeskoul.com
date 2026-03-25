"use client";

import React from "react";
import { cn } from "@/lib/cn";

export const BillingSkel = React.memo(function BillingSkel({
                                                               className,
                                                           }: {
    className?: string;
}) {
    return (
        <div
            aria-hidden
            className={cn(
                "ui-skel rounded-md motion-reduce:animate-none max-w-full",
                className
            )}
        />
    );
});