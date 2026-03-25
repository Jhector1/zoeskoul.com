"use client";

import { cn } from "../../utils";
import {ToastState} from "@/components/ide/types";
// import type { ToastState } from "../fullide/types";

export default function IdeToastHost({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
      <div
        className={cn(
          "rounded-full px-4 py-2 text-xs font-black shadow-lg backdrop-blur",
          toast.kind === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white",
        )}
      >
        {toast.text}
      </div>
    </div>
  );
}
