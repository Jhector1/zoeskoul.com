"use client";

import React, { useEffect, useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 900);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // ignore (clipboard permissions)
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={[
        "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-extrabold hover:bg-white/15",
        className,
      ].join(" ")}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
