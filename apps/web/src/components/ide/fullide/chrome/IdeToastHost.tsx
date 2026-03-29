"use client";

import { cn } from "../../utils";
import { ToastState } from "@/components/ide/types";

export default function IdeToastHost({ toast }: { toast: ToastState }) {
    if (!toast) return null;

    return (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-4">
            <div
                className={cn(
                    "rounded-md border px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur",
                    toast.kind === "error"
                        ? "border-red-500/20 bg-red-600 text-white"
                        : "border-emerald-500/20 bg-emerald-600 text-white",
                )}
            >
                {toast.text}
            </div>
        </div>
    );
}