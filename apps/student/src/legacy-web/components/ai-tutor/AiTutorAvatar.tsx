"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

type AvatarSize = "xxs" | "xs" | "sm" | "md" | "lg";
type AvatarTone = "accent" | "info";

const sizeClass: Record<
  AvatarSize,
  {
    shell: string;
    body: string;
    eye: string;
    gap: string;
    label: string;
    spark: string;
    mouth: number;
  }
> = {
  xxs: {
    shell: "h-9 w-9",
    body: "h-8 w-8 rounded-lg p-0.5",
    eye: "h-1.5 w-1.5",
    gap: "gap-1",
    label: "px-1 py-px text-[5px]",
    spark: "size-0.5",
    mouth: 6,
  },
  xs: {
    shell: "h-11 w-11",
    body: "h-9 w-9 rounded-xl p-0.5",
    eye: "h-2 w-2",
    gap: "gap-1.5",
    label: "px-1 py-px text-[6px]",
    spark: "size-0.5",
    mouth: 7,
  },
  sm: {
    shell: "h-[52px] w-[52px]",
    body: "h-[44px] w-[44px] rounded-xl p-1",
    eye: "h-2.5 w-2.5",
    gap: "gap-2",
    label: "px-1 py-0.5 text-[7px]",
    spark: "size-0.5",
    mouth: 9,
  },
  md: {
    shell: "h-[66px] w-[66px]",
    body: "h-[54px] w-[54px] rounded-2xl p-1.5",
    eye: "h-3 w-3",
    gap: "gap-2.5",
    label: "px-1.5 py-0.5 text-[8px]",
    spark: "size-1",
    mouth: 14,
  },
  lg: {
    shell: "h-[78px] w-[78px] sm:h-[86px] sm:w-[86px]",
    body: "h-[64px] w-[64px] rounded-2xl p-1.5 sm:h-[70px] sm:w-[70px]",
    eye: "h-3.5 w-3.5 sm:h-4 sm:w-4",
    gap: "gap-2.5",
    label: "px-1.5 py-0.5 text-[8px]",
    spark: "size-1",
    mouth: 14,
  },
};

const toneClass: Record<
  AvatarTone,
  { spark: string; glow: string; label: string }
> = {
  accent: {
    spark: "bg-[rgb(var(--ui-accent)/0.35)] dark:bg-[rgb(var(--ui-accent)/0.2)]",
    glow: "bg-[rgb(var(--ui-accent)/0.15)] dark:bg-[rgb(var(--ui-accent)/0.08)]",
    label:
      "border-[rgb(var(--ui-accent)/0.18)] bg-[rgb(var(--ui-accent)/0.1)] text-[rgb(var(--ui-accent)/1)]",
  },
  info: {
    spark: "bg-[rgb(var(--ui-info)/0.35)] dark:bg-[rgb(var(--ui-info)/0.22)]",
    glow: "bg-[rgb(var(--ui-info)/0.16)] dark:bg-[rgb(var(--ui-info)/0.1)]",
    label:
      "border-[rgb(var(--ui-info)/0.2)] bg-[rgb(var(--ui-info)/0.11)] text-[rgb(var(--ui-info)/1)]",
  },
};

function SparkDot({
  className,
  dotClass,
  tone,
}: {
  className?: string;
  dotClass: string;
  tone: AvatarTone;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "absolute rounded-full",
        toneClass[tone].spark,
        dotClass,
        className,
      )}
      animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function AiTutorAvatar({
  speaking = false,
  size = "md",
  tone = "accent",
  label = "Guide",
  className,
}: {
  speaking?: boolean;
  size?: AvatarSize;
  tone?: AvatarTone;
  label?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const sizes = sizeClass[size];
  const colors = toneClass[tone];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        sizes.shell,
        className,
      )}
    >
      <motion.div
        aria-hidden="true"
        className={cn("absolute inset-2 rounded-full blur-xl", colors.glow)}
        animate={
          reduceMotion
            ? undefined
            : { scale: [1, 1.05, 1], opacity: [0.35, 0.6, 0.35] }
        }
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <SparkDot className="left-1.5 top-2" dotClass={sizes.spark} tone={tone} />
      <SparkDot className="right-2 top-1.5" dotClass={sizes.spark} tone={tone} />
      <SparkDot className="bottom-2 right-1.5" dotClass={sizes.spark} tone={tone} />

      <motion.div
        className={cn(
          "ui-page-surface relative flex items-center justify-center",
          sizes.body,
        )}
        animate={
          reduceMotion ? undefined : { y: [0, -2, 0], rotate: [0, -1, 1, 0] }
        }
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="ui-surface-muted flex h-full w-full flex-col items-center justify-center rounded-[inherit] border p-1">
          <div className={cn("flex items-center", sizes.gap)}>
            {[0, 1].map((eye) => (
              <motion.div
                key={eye}
                aria-hidden="true"
                className={cn(
                  "rounded-full bg-[rgb(var(--ui-text)/0.92)]",
                  sizes.eye,
                )}
                animate={reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  times: [0, 0.42, 0.46, 0.5, 1],
                }}
                style={{ transformOrigin: "center center" }}
              />
            ))}
          </div>

          <motion.div
            aria-hidden="true"
            className="mt-1 rounded-full bg-[rgb(var(--ui-text)/0.88)]"
            animate={
              reduceMotion
                ? undefined
                : speaking
                  ? {
                      width: [sizes.mouth, sizes.mouth + 4, sizes.mouth - 2, sizes.mouth + 2, sizes.mouth],
                      borderRadius: [999, 8, 999, 8, 999],
                    }
                  : { width: sizes.mouth }
            }
            style={{ height: size === "xxs" || size === "xs" ? 4 : 6 }}
            transition={{
              duration: 1.05,
              repeat: speaking ? Infinity : 0,
              ease: "easeInOut",
            }}
          />

          <div
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full border font-medium",
              colors.label,
              sizes.label,
            )}
          >
            <Sparkles className={size === "xxs" || size === "xs" ? "size-1" : size === "sm" ? "size-1.5" : "size-2"} />
            {label}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function useAiTutorTypewriter(
  text: string,
  speed = 15,
  shouldAnimate = true,
) {
  const [displayed, setDisplayed] = useState(shouldAnimate ? "" : text);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayed(text);
      return;
    }

    setDisplayed("");
    let index = 0;

    const timer = window.setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, speed);

    return () => window.clearInterval(timer);
  }, [text, speed, shouldAnimate]);

  return displayed;
}

export function AiTutorSpeechBubble({
  text,
  animate = true,
  side = "right",
  className,
}: {
  text: string;
  animate?: boolean;
  side?: "left" | "right";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const rendered = useAiTutorTypewriter(text, 15, animate && !reduceMotion);

  return (
    <div className={cn("relative w-[min(220px,62vw)] sm:w-[250px]", className)}>
      <div className="ui-page-surface relative rounded-2xl px-3 py-2.5">
        <div
          aria-hidden="true"
          className={cn(
            "absolute top-[18px] h-2.5 w-2.5 rotate-45 border",
            side === "right"
              ? "-right-[5px] border-r border-t border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/0.96)]"
              : "-left-[5px] border-b border-l border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/0.96)]",
          )}
        />
        <p className="text-[12px] leading-5 text-[rgb(var(--ui-text-muted)/0.9)] sm:text-[13px]">
          {rendered}
          {rendered.length < text.length ? (
            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[rgb(var(--ui-text)/0.65)] align-middle" />
          ) : null}
        </p>
      </div>
    </div>
  );
}
