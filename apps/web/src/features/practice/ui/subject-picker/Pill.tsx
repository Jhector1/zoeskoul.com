"use client";

import React from "react";
import { cn } from "@/lib/cn";

export default function Pill({
                               children,
                               tone = "neutral",
                             }: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "info" | "danger";
}) {
  return (
      <span
          className={cn(
              "ui-pill",
              tone === "good"
                  ? "ui-pill--good"
                  : tone === "warn"
                      ? "ui-pill--warn"
                      : tone === "info"
                          ? "ui-pill--info"
                          : tone === "danger"
                              ? "ui-pill--danger"
                              : "ui-pill--neutral",
          )}
      >
      {children}
    </span>
  );
}