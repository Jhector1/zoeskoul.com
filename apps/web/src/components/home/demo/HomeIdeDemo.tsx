"use client";

import {
  CheckCircle2,
  FileCode2,
  FileText,
  Folder,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type DemoPhase =
  | "typing"
  | "cursor"
  | "running"
  | "output"
  | "success"
  | "tutor"
  | "reset";

const CODE_TOKENS = [
  { text: "name", className: "text-sky-700 dark:text-sky-300" },
  { text: " = ", className: "text-neutral-500 dark:text-white/45" },
  { text: '"Maya"', className: "text-amber-700 dark:text-amber-300" },
  { text: "\n", className: "" },
  { text: "print", className: "text-violet-700 dark:text-violet-300" },
  { text: "(", className: "text-neutral-600 dark:text-white/55" },
  { text: "f", className: "text-violet-700 dark:text-violet-300" },
  { text: '"Hello, ', className: "text-amber-700 dark:text-amber-300" },
  { text: "{", className: "text-amber-700 dark:text-amber-300" },
  { text: "name", className: "text-sky-700 dark:text-sky-300" },
  { text: "}", className: "text-amber-700 dark:text-amber-300" },
  { text: '!"', className: "text-amber-700 dark:text-amber-300" },
  { text: ")", className: "text-neutral-600 dark:text-white/55" },
] as const;

const DEMO_CODE = CODE_TOKENS.map(
  (token) => token.text,
).join("");

const NEXT_PHASE: Record<
  Exclude<DemoPhase, "typing">,
  {
    next: DemoPhase;
    delay: number;
  }
> = {
  cursor: {
    next: "running",
    delay: 760,
  },
  running: {
    next: "output",
    delay: 620,
  },
  output: {
    next: "success",
    delay: 680,
  },
  success: {
    next: "tutor",
    delay: 820,
  },
  tutor: {
    next: "reset",
    delay: 2350,
  },
  reset: {
    next: "typing",
    delay: 500,
  },
};

type HomeIdeDemoProps = {
  kicker: string;
  title: string;
  description: string;
  tutorHint: string;
};

function useDemoActivity(
  rootRef: RefObject<HTMLElement | null>,
) {
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] =
    useState(true);
  const [reduceMotion, setReduceMotion] =
    useState(false);

  useEffect(() => {
    const node = rootRef.current;
    const media = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const syncReducedMotion = () => {
      setReduceMotion(media.matches);
    };

    const syncVisibility = () => {
      setDocumentVisible(
        document.visibilityState === "visible",
      );
    };

    syncReducedMotion();
    syncVisibility();

    let observer: IntersectionObserver | null = null;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
    } else if (node) {
      observer = new IntersectionObserver(
        ([entry]) => {
          setInView(Boolean(entry?.isIntersecting));
        },
        {
          rootMargin: "120px 0px 120px 0px",
          threshold: 0.18,
        },
      );

      observer.observe(node);
    }

    document.addEventListener(
      "visibilitychange",
      syncVisibility,
    );

    if (media.addEventListener) {
      media.addEventListener(
        "change",
        syncReducedMotion,
      );
    } else {
      media.addListener(syncReducedMotion);
    }

    return () => {
      observer?.disconnect();

      document.removeEventListener(
        "visibilitychange",
        syncVisibility,
      );

      if (media.removeEventListener) {
        media.removeEventListener(
          "change",
          syncReducedMotion,
        );
      } else {
        media.removeListener(syncReducedMotion);
      }
    };
  }, [rootRef]);

  return {
    active:
      inView &&
      documentVisible &&
      !reduceMotion,
    reduceMotion,
  };
}

function HighlightedCode({
  visibleLength,
}: {
  visibleLength: number;
}) {
  let remaining = visibleLength;

  return (
    <>
      {CODE_TOKENS.map((token, index) => {
        if (remaining <= 0) {
          return null;
        }

        const visible = token.text.slice(
          0,
          remaining,
        );

        remaining -= visible.length;

        return (
          <span
            key={`${token.text}-${index}`}
            className={token.className}
          >
            {visible}
          </span>
        );
      })}
    </>
  );
}

function ExplorerRail() {
  return (
    <aside
      aria-hidden
      className="hidden min-h-0 border-r border-neutral-200 bg-neutral-50/70 dark:border-white/10 dark:bg-black/20 sm:flex sm:flex-col"
    >
      <div className="flex h-10 items-center border-b border-neutral-200 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:border-white/10 dark:text-white/60">
        Explorer
      </div>

      <div className="space-y-1 p-2 text-[11px]">
        <div className="flex min-h-8 items-center gap-1.5 rounded-md px-2 font-semibold text-neutral-700 dark:text-white/70">
          <span className="text-neutral-400">▾</span>
          <Folder className="size-3.5" />
          <span className="truncate">
            python-basics
          </span>
        </div>

        <div className="flex min-h-8 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 pl-6 text-neutral-900 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)] dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-white/90">
          <FileCode2 className="size-3.5 text-emerald-600 dark:text-emerald-300" />
          <span className="truncate">
            main.py
          </span>
        </div>

        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 pl-6 text-neutral-600 dark:text-white/55">
          <FileText className="size-3.5" />
          <span className="truncate">
            README.md
          </span>
        </div>
      </div>
    </aside>
  );
}

function EditorChrome({
  phase,
  visibleLength,
  active,
}: {
  phase: DemoPhase;
  visibleLength: number;
  active: boolean;
}) {
  const running = phase === "running";
  const cursorPhase = phase === "cursor";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="flex h-10 items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-2 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="flex min-w-0 items-center gap-1">
          <div className="flex max-w-[180px] items-center gap-1 rounded-md border border-neutral-300 bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/90">
            <FileCode2 className="size-3 text-emerald-600 dark:text-emerald-300" />
            <span className="truncate">
              main.py
            </span>
            <span className="text-neutral-400 dark:text-white/35">
              ×
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-neutral-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/45 sm:inline-flex">
            Python
          </span>

          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={[
              "relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 text-[11px] font-semibold transition-[transform,background-color,border-color,box-shadow] duration-200",
              running
                ? "scale-[0.97] border-emerald-400 bg-emerald-500 text-white shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                : "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100",
            ].join(" ")}
          >
            <Play
              className="size-3 fill-current"
              aria-hidden
            />
            {running ? "Running" : "Run"}

            {running ? (
              <span
                aria-hidden
                className="absolute inset-0 animate-pulse bg-white/10"
              />
            ) : null}
          </button>
        </div>
      </div>

      <div className="relative min-h-[190px] flex-1 overflow-hidden bg-white dark:bg-[#0b0d10]">
        <div
          aria-hidden
          className={[
            "pointer-events-none absolute right-[70px] top-[15px] z-20 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
            cursorPhase
              ? "translate-x-0 translate-y-0 scale-100 opacity-100"
              : running
                ? "translate-x-0 translate-y-0 scale-90 opacity-0 duration-200"
                : "-translate-x-[110px] translate-y-[76px] scale-95 opacity-0 sm:-translate-x-[185px]",
          ].join(" ")}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 drop-shadow-md"
          >
            <path
              d="M5 3.5 18.5 13l-6.2 1.3 3.4 5.4-2.6 1.5-3.3-5.4L5 20V3.5Z"
              fill="rgb(var(--ui-text) / 0.92)"
              stroke="rgb(var(--ui-bg) / 0.9)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="grid h-full grid-cols-[34px_minmax(0,1fr)] font-mono text-[12px] leading-6 sm:grid-cols-[42px_minmax(0,1fr)] sm:text-[13px]">
          <div className="select-none border-r border-neutral-100 bg-neutral-50/60 px-2 pt-4 text-right text-neutral-400 dark:border-white/[0.04] dark:bg-white/[0.015] dark:text-white/25">
            <div>1</div>
            <div>2</div>
          </div>

          <pre className="m-0 overflow-hidden whitespace-pre-wrap break-words px-4 pt-4 text-neutral-800 dark:text-white/82">
            <HighlightedCode
              visibleLength={visibleLength}
            />
            {phase === "typing" && active ? (
              <span
                aria-hidden
                className="ml-[1px] inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-emerald-500 dark:bg-emerald-300"
              />
            ) : null}
          </pre>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-emerald-500/[0.035] to-transparent opacity-70"
        />
      </div>
    </div>
  );
}

function TerminalDock({
  phase,
}: {
  phase: DemoPhase;
}) {
  const running = phase === "running";
  const outputVisible = [
    "output",
    "success",
    "tutor",
    "reset",
  ].includes(phase);
  const successVisible = [
    "success",
    "tutor",
    "reset",
  ].includes(phase);

  return (
    <div
      className={[
        "border-t border-neutral-200 bg-neutral-50/70 transition-[background-color,box-shadow] duration-300 dark:border-white/10 dark:bg-black/25",
        running
          ? "shadow-[inset_0_2px_0_rgba(245,158,11,0.08)]"
          : successVisible
            ? "shadow-[inset_0_2px_0_rgba(16,185,129,0.08)]"
            : "",
      ].join(" ")}
    >
      <div className="flex h-9 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[10px] font-extrabold text-neutral-600 dark:text-white/60 sm:text-[11px]">
          <Terminal className="size-3.5" />
          Terminal
        </div>

        <div className="flex items-center gap-2 text-[10px] font-semibold text-neutral-500 dark:text-white/45">
          <span
            className={[
              "size-1.5 rounded-full transition-colors duration-300",
              running
                ? "animate-pulse bg-amber-400"
                : successVisible
                  ? "bg-emerald-400"
                  : "bg-neutral-300 dark:bg-white/20",
            ].join(" ")}
          />
          {running
            ? "Running"
            : successVisible
              ? "Complete"
              : "Ready"}
        </div>
      </div>

      <div className="min-h-[118px] border-t border-neutral-200 px-4 py-3 font-mono text-[11px] leading-5 dark:border-white/[0.07] sm:text-[12px]">
        <div
          className={[
            "transition-[opacity,transform] duration-400 ease-out",
            outputVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          ].join(" ")}
        >
          <div className="text-neutral-500 dark:text-white/40">
            $ python main.py
          </div>
          <div className="mt-1 text-neutral-800 dark:text-white/85">
            Hello, Maya!
          </div>
        </div>

        <div
          className={[
            "mt-3 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition-[opacity,transform] duration-400 ease-out sm:text-[11px]",
            successVisible
              ? "translate-y-0 border-emerald-500/20 bg-emerald-500/10 text-emerald-800 opacity-100 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
              : "translate-y-2 border-transparent opacity-0",
          ].join(" ")}
        >
          <CheckCircle2 className="size-3.5" />
          All tests passed
        </div>
      </div>
    </div>
  );
}

export default function HomeIdeDemo({
  kicker,
  title,
  description,
  tutorHint,
}: HomeIdeDemoProps) {
  const rootRef =
    useRef<HTMLElement | null>(null);

  const {
    active,
    reduceMotion,
  } = useDemoActivity(rootRef);

  const [phase, setPhase] =
    useState<DemoPhase>("typing");
  const [typedLength, setTypedLength] =
    useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setTypedLength(DEMO_CODE.length);
      setPhase("success");
      return;
    }

    if (!active) return;

    if (phase === "typing") {
      setTypedLength(0);

      let index = 0;
      let finishTimer:
        | number
        | undefined;

      const typingTimer =
        window.setInterval(() => {
          index += 1;

          setTypedLength(
            Math.min(
              index,
              DEMO_CODE.length,
            ),
          );

          if (index >= DEMO_CODE.length) {
            window.clearInterval(
              typingTimer,
            );

            finishTimer =
              window.setTimeout(
                () => {
                  setPhase("cursor");
                },
                360,
              );
          }
        }, 30);

      return () => {
        window.clearInterval(
          typingTimer,
        );

        if (finishTimer) {
          window.clearTimeout(
            finishTimer,
          );
        }
      };
    }

    const step = NEXT_PHASE[phase];

    const timer =
      window.setTimeout(() => {
        setPhase(step.next);
      }, step.delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    active,
    phase,
    reduceMotion,
  ]);

  const visibleLength = reduceMotion
    ? DEMO_CODE.length
    : typedLength;

  const tutorVisible =
    phase === "tutor";

  return (
    <section
      ref={rootRef}
      data-testid="home-ide-demo"
      data-phase={phase}
      className="ui-page-surface overflow-hidden p-4 sm:p-5 lg:p-6"
    >
      <div className="grid items-center gap-7 lg:grid-cols-[minmax(220px,0.68fr)_minmax(0,1.32fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="ui-kicker">
            {kicker}
          </div>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.96)] sm:text-3xl">
            {title}
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)] sm:text-[15px] sm:leading-7">
            {description}
          </p>

          <div
            aria-hidden
            className="mt-5 flex flex-wrap gap-2"
          >
            {[
              "Write",
              "Run",
              "Understand",
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border border-[rgb(var(--ui-border)/0.92)] bg-[rgb(var(--ui-surface-2)/0.8)] px-2.5 py-1 text-[11px] font-semibold text-[rgb(var(--ui-text-muted)/0.9)]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative min-w-0">
          <div
            aria-hidden
            className="absolute -inset-5 rounded-[34px] bg-emerald-400/[0.08] blur-3xl dark:bg-emerald-300/[0.06]"
          />

          <div
            role="img"
            aria-label="Animated ZoeSkoul coding workspace demonstration"
            className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.16)] dark:border-white/10 dark:bg-neutral-950 dark:shadow-[0_28px_80px_rgba(0,0,0,0.34)]"
          >
            <div className="grid min-h-[392px] grid-cols-1 sm:grid-cols-[145px_minmax(0,1fr)]">
              <ExplorerRail />

              <div className="flex min-h-0 flex-col">
                <EditorChrome
                  phase={phase}
                  visibleLength={visibleLength}
                  active={active}
                />

                <TerminalDock phase={phase} />
              </div>
            </div>

            <div
              aria-hidden
              className={[
                "pointer-events-none absolute bottom-4 right-4 max-w-[250px] rounded-xl border border-emerald-500/20 bg-white/95 p-3 shadow-xl backdrop-blur-sm transition-[opacity,transform] duration-500 ease-out dark:border-emerald-300/20 dark:bg-neutral-900/95",
                tutorVisible
                  ? "translate-y-0 scale-100 opacity-100"
                  : "translate-y-2 scale-[0.985] opacity-0",
              ].join(" ")}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-200">
                  <Sparkles className="size-3.5" />
                </div>

                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-200">
                    AI Tutor
                  </div>

                  <p className="mt-1 text-[11px] leading-5 text-neutral-700 dark:text-white/72">
                    {tutorHint}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
