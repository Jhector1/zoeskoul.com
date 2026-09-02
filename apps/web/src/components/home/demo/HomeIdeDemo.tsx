"use client";

import {
  CheckCircle2,
  Database,
  FileCode2,
  FileText,
  Folder,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

type DemoSceneId =
  | "python"
  | "sql"
  | "terminal";

type DemoPhase =
  | "typing"
  | "cursor"
  | "running"
  | "output"
  | "success"
  | "tutor"
  | "transition";

type CodeToken = {
  text: string;
  className: string;
};

type DemoScene = {
  id: DemoSceneId;
  label: string;
  fileName: string;
  languageLabel: string;
  codeTokens?: readonly CodeToken[];
  terminalInput?: string;
  tutorHint: string;
};

const PYTHON_TOKENS = [
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
] as const satisfies readonly CodeToken[];

const SQL_TOKENS = [
  { text: "SELECT", className: "text-violet-700 dark:text-violet-300" },
  { text: " name, score\n", className: "text-neutral-800 dark:text-white/82" },
  { text: "FROM", className: "text-violet-700 dark:text-violet-300" },
  { text: " students\n", className: "text-neutral-800 dark:text-white/82" },
  { text: "ORDER BY", className: "text-violet-700 dark:text-violet-300" },
  { text: " score ", className: "text-neutral-800 dark:text-white/82" },
  { text: "DESC", className: "text-violet-700 dark:text-violet-300" },
  { text: ";", className: "text-neutral-600 dark:text-white/55" },
] as const satisfies readonly CodeToken[];

const TERMINAL_COMMAND = "ls -la";

const SCENES = [
  {
    id: "python",
    label: "Python",
    fileName: "main.py",
    languageLabel: "Python",
    codeTokens: PYTHON_TOKENS,
    tutorHint: "Nice — your f-string is correct.",
  },
  {
    id: "sql",
    label: "SQL",
    fileName: "query.sql",
    languageLabel: "SQL",
    codeTokens: SQL_TOKENS,
    tutorHint: "Great — ORDER BY puts the highest scores first.",
  },
  {
    id: "terminal",
    label: "Terminal",
    fileName: "Terminal",
    languageLabel: "Shell",
    terminalInput: TERMINAL_COMMAND,
    tutorHint: "Good — -la shows hidden files and detailed permissions.",
  },
] as const satisfies readonly DemoScene[];

const SCENE_DURATION = {
  cursor: 720,
  running: 620,
  output: 680,
  success: 820,
  tutor: 2200,
  transition: 430,
} as const;

const MANUAL_HOLD_MS = 10000;

type HomeIdeDemoProps = {
  kicker: string;
  title: string;
  description: string;
};

function useDemoActivity(
  rootRef: RefObject<HTMLElement | null>,
) {
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncReducedMotion = () => {
      setReduceMotion(media.matches);
    };

    const syncVisibility = () => {
      setDocumentVisible(document.visibilityState === "visible");
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

    document.addEventListener("visibilitychange", syncVisibility);

    if (media.addEventListener) {
      media.addEventListener("change", syncReducedMotion);
    } else {
      media.addListener(syncReducedMotion);
    }

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);

      if (media.removeEventListener) {
        media.removeEventListener("change", syncReducedMotion);
      } else {
        media.removeListener(syncReducedMotion);
      }
    };
  }, [rootRef]);

  return {
    active: inView && documentVisible && !reduceMotion,
    reduceMotion,
  };
}

function sceneText(scene: DemoScene) {
  if (scene.id === "terminal") {
    return scene.terminalInput ?? "";
  }

  return scene.codeTokens?.map((token) => token.text).join("") ?? "";
}

function HighlightedCode({
  tokens,
  visibleLength,
}: {
  tokens: readonly CodeToken[];
  visibleLength: number;
}) {
  let remaining = visibleLength;

  return (
    <>
      {tokens.map((token, index) => {
        if (remaining <= 0) {
          return null;
        }

        const visible = token.text.slice(0, remaining);
        remaining -= visible.length;

        return (
          <span
            key={`${index}-${token.text}`}
            className={token.className}
          >
            {visible}
          </span>
        );
      })}
    </>
  );
}

function SceneSelector({
  activeScene,
  onSelect,
}: {
  activeScene: DemoSceneId;
  onSelect: (scene: DemoSceneId) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[rgb(var(--ui-border)/0.92)] bg-[rgb(var(--ui-surface-2)/0.72)] p-1"
      aria-label="Demo scene"
    >
      {SCENES.map((scene) => {
        const active = activeScene === scene.id;

        return (
          <button
            key={scene.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(scene.id)}
            className={[
              "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-200",
              active
                ? "bg-[rgb(var(--ui-surface)/1)] text-[rgb(var(--ui-text)/0.96)] shadow-sm"
                : "text-[rgb(var(--ui-text-muted)/0.76)] hover:text-[rgb(var(--ui-text)/0.88)]",
            ].join(" ")}
          >
            {scene.label}
          </button>
        );
      })}
    </div>
  );
}

function ExplorerRail({
  scene,
}: {
  scene: DemoScene;
}) {
  const folder =
    scene.id === "sql"
      ? "student-data"
      : scene.id === "terminal"
        ? "linux-basics"
        : "python-basics";

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
          <span className="truncate">{folder}</span>
        </div>

        {scene.id !== "terminal" ? (
          <div className="flex min-h-8 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 pl-6 text-neutral-900 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)] dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-white/90">
            {scene.id === "sql" ? (
              <Database className="size-3.5 text-emerald-600 dark:text-emerald-300" />
            ) : (
              <FileCode2 className="size-3.5 text-emerald-600 dark:text-emerald-300" />
            )}
            <span className="truncate">{scene.fileName}</span>
          </div>
        ) : (
          <div className="flex min-h-8 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 pl-6 text-neutral-900 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-white/90">
            <Terminal className="size-3.5 text-emerald-600 dark:text-emerald-300" />
            <span>Terminal</span>
          </div>
        )}

        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 pl-6 text-neutral-600 dark:text-white/55">
          <FileText className="size-3.5" />
          <span className="truncate">README.md</span>
        </div>
      </div>
    </aside>
  );
}

function Cursor({
  visible,
  leaving,
}: {
  visible: boolean;
  leaving: boolean;
}) {
  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute right-[67px] top-[14px] z-30 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible
          ? "translate-x-0 translate-y-0 scale-100 opacity-100"
          : leaving
            ? "translate-x-0 translate-y-0 scale-90 opacity-0 duration-200"
            : "-translate-x-[110px] translate-y-[76px] scale-95 opacity-0 sm:-translate-x-[185px]",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" className="size-5 drop-shadow-md">
        <path
          d="M5 3.5 18.5 13l-6.2 1.3 3.4 5.4-2.6 1.5-3.3-5.4L5 20V3.5Z"
          fill="rgb(var(--ui-text) / 0.92)"
          stroke="rgb(var(--ui-bg) / 0.9)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function EditorToolbar({
  scene,
  phase,
}: {
  scene: DemoScene;
  phase: DemoPhase;
}) {
  const running = phase === "running";

  return (
    <div className="flex h-10 items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-2 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex max-w-[180px] items-center gap-1 rounded-md border border-neutral-300 bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/90">
          {scene.id === "sql" ? (
            <Database className="size-3 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <FileCode2 className="size-3 text-emerald-600 dark:text-emerald-300" />
          )}
          <span className="truncate">{scene.fileName}</span>
          <span className="text-neutral-400 dark:text-white/35">×</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden rounded-full border border-neutral-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/45 sm:inline-flex">
          {scene.languageLabel}
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
          <Play className="size-3 fill-current" aria-hidden />
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
  );
}

function CodeEditor({
  scene,
  phase,
  visibleLength,
  active,
}: {
  scene: DemoScene;
  phase: DemoPhase;
  visibleLength: number;
  active: boolean;
}) {
  const lineCount = scene.id === "sql" ? 3 : 2;

  return (
    <div className="relative min-h-[190px] flex-1 overflow-hidden bg-white dark:bg-[#0b0d10]">
      <Cursor
        visible={phase === "cursor"}
        leaving={phase === "running"}
      />

      <div className="grid h-full grid-cols-[34px_minmax(0,1fr)] font-mono text-[12px] leading-6 sm:grid-cols-[42px_minmax(0,1fr)] sm:text-[13px]">
        <div className="select-none border-r border-neutral-100 bg-neutral-50/60 px-2 pt-4 text-right text-neutral-400 dark:border-white/[0.04] dark:bg-white/[0.015] dark:text-white/25">
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>

        <pre className="m-0 overflow-hidden whitespace-pre-wrap break-words px-4 pt-4 text-neutral-800 dark:text-white/82">
          <HighlightedCode
            tokens={scene.codeTokens ?? []}
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
  );
}

function StatusLabel({
  running,
  success,
}: {
  running: boolean;
  success: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-semibold text-neutral-500 dark:text-white/45">
      <span
        className={[
          "size-1.5 rounded-full transition-colors duration-300",
          running
            ? "animate-pulse bg-amber-400"
            : success
              ? "bg-emerald-400"
              : "bg-neutral-300 dark:bg-white/20",
        ].join(" ")}
      />
      {running ? "Running" : success ? "Complete" : "Ready"}
    </div>
  );
}

function SuccessChip({
  visible,
  label,
}: {
  visible: boolean;
  label: string;
}) {
  return (
    <div
      className={[
        "mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-[opacity,transform] duration-400 ease-out sm:text-[11px]",
        visible
          ? "translate-y-0 border-emerald-500/20 bg-emerald-500/10 text-emerald-800 opacity-100 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
          : "translate-y-2 border-transparent opacity-0",
      ].join(" ")}
    >
      <CheckCircle2 className="size-3.5" />
      {label}
    </div>
  );
}

function PythonOutput({
  phase,
}: {
  phase: DemoPhase;
}) {
  const running = phase === "running";
  const outputVisible = ["output", "success", "tutor"].includes(phase);
  const successVisible = ["success", "tutor"].includes(phase);

  return (
    <div className="border-t border-neutral-200 bg-neutral-50/70 dark:border-white/10 dark:bg-black/25">
      <div className="flex h-9 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[10px] font-extrabold text-neutral-600 dark:text-white/60 sm:text-[11px]">
          <Terminal className="size-3.5" />
          Terminal
        </div>

        <StatusLabel running={running} success={successVisible} />
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

        <SuccessChip visible={successVisible} label="All tests passed" />
      </div>
    </div>
  );
}

function SqlResults({
  phase,
}: {
  phase: DemoPhase;
}) {
  const running = phase === "running";
  const outputVisible = ["output", "success", "tutor"].includes(phase);
  const successVisible = ["success", "tutor"].includes(phase);

  const rows = [
    ["Maya", "98"],
    ["Luis", "94"],
    ["Nina", "91"],
  ];

  return (
    <div className="border-t border-neutral-200 bg-neutral-50/70 dark:border-white/10 dark:bg-black/25">
      <div className="flex h-9 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[10px] font-extrabold text-neutral-600 dark:text-white/60 sm:text-[11px]">
          <Database className="size-3.5" />
          Results
        </div>

        <StatusLabel running={running} success={successVisible} />
      </div>

      <div className="min-h-[118px] border-t border-neutral-200 p-3 dark:border-white/[0.07]">
        <div
          className={[
            "overflow-hidden rounded-md border border-neutral-200 bg-white transition-[opacity,transform] duration-400 ease-out dark:border-white/10 dark:bg-white/[0.025]",
            outputVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          ].join(" ")}
        >
          <div className="grid grid-cols-2 border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45">
            <div className="px-3 py-1.5">name</div>
            <div className="border-l border-neutral-200 px-3 py-1.5 dark:border-white/10">
              score
            </div>
          </div>

          {rows.map(([name, score]) => (
            <div
              key={name}
              className="grid grid-cols-2 border-b border-neutral-100 text-[11px] text-neutral-700 last:border-b-0 dark:border-white/[0.06] dark:text-white/72"
            >
              <div className="px-3 py-1.5">{name}</div>
              <div className="border-l border-neutral-100 px-3 py-1.5 font-mono dark:border-white/[0.06]">
                {score}
              </div>
            </div>
          ))}
        </div>

        <SuccessChip
          visible={successVisible}
          label="Query returned 3 rows"
        />
      </div>
    </div>
  );
}

function TerminalWorkspace({
  phase,
  visibleLength,
  active,
}: {
  phase: DemoPhase;
  visibleLength: number;
  active: boolean;
}) {
  const outputVisible = ["output", "success", "tutor"].includes(phase);
  const successVisible = ["success", "tutor"].includes(phase);
  const command = TERMINAL_COMMAND.slice(0, visibleLength);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#0b0d10]">
      <div className="flex h-10 items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-3 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-neutral-700 dark:text-white/70">
          <Terminal className="size-3.5 text-emerald-600 dark:text-emerald-300" />
          Terminal
        </div>

        <span className="rounded-full border border-neutral-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/45">
          Shell
        </span>
      </div>

      <div className="min-h-[308px] flex-1 px-4 py-4 font-mono text-[11px] leading-6 sm:text-[12px]">
        <div className="text-neutral-500 dark:text-white/40">
          learner@zoeskoul:~/workspace$
          <span className="ml-2 text-neutral-800 dark:text-white/85">
            {command}
          </span>

          {phase === "typing" && active ? (
            <span
              aria-hidden
              className="ml-1 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-emerald-500 dark:bg-emerald-300"
            />
          ) : null}
        </div>

        <div
          className={[
            "mt-3 transition-[opacity,transform] duration-400 ease-out",
            outputVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          ].join(" ")}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-3 text-neutral-700 dark:text-white/72">
            <span>drwxr-xr-x</span>
            <span>projects</span>
            <span>-rw-r--r--</span>
            <span>README.md</span>
            <span>-rw-r--r--</span>
            <span>notes.txt</span>
          </div>

          <SuccessChip
            visible={successVisible}
            label="Command completed"
          />
        </div>
      </div>
    </div>
  );
}

function TutorHint({
  visible,
  text,
}: {
  visible: boolean;
  text: string;
}) {
  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute bottom-4 right-4 z-30 max-w-[250px] rounded-xl border border-emerald-500/20 bg-white/95 p-3 shadow-xl backdrop-blur-sm transition-[opacity,transform] duration-500 ease-out dark:border-emerald-300/20 dark:bg-neutral-900/95",
        visible
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
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomeIdeDemo({
  kicker,
  title,
  description,
}: HomeIdeDemoProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const { active, reduceMotion } = useDemoActivity(rootRef);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("typing");
  const [typedLength, setTypedLength] = useState(0);
  const [manualHold, setManualHold] = useState(false);
  const manualTimerRef = useRef<number | null>(null);

  const scene = SCENES[sceneIndex];

  const fullText = useMemo(
    () => sceneText(scene),
    [scene],
  );

  useEffect(() => {
    return () => {
      if (manualTimerRef.current) {
        window.clearTimeout(manualTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setTypedLength(fullText.length);
      setPhase("success");
      return;
    }

    if (!active) return;

    if (phase === "typing") {
      setTypedLength(0);

      let index = 0;
      let finishTimer: number | undefined;

      const typingTimer = window.setInterval(() => {
        index += 1;
        setTypedLength(Math.min(index, fullText.length));

        if (index >= fullText.length) {
          window.clearInterval(typingTimer);

          finishTimer = window.setTimeout(() => {
            setPhase(scene.id === "terminal" ? "running" : "cursor");
          }, 340);
        }
      }, 30);

      return () => {
        window.clearInterval(typingTimer);

        if (finishTimer) {
          window.clearTimeout(finishTimer);
        }
      };
    }

    const delay = SCENE_DURATION[phase];

    const timer = window.setTimeout(() => {
      if (phase === "cursor") {
        setPhase("running");
        return;
      }

      if (phase === "running") {
        setPhase("output");
        return;
      }

      if (phase === "output") {
        setPhase("success");
        return;
      }

      if (phase === "success") {
        setPhase("tutor");
        return;
      }

      if (phase === "tutor") {
        setPhase("transition");
        return;
      }

      if (phase === "transition") {
        setSceneIndex((current) =>
          manualHold
            ? current
            : (current + 1) % SCENES.length,
        );
        setPhase("typing");
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    active,
    fullText.length,
    manualHold,
    phase,
    reduceMotion,
    scene.id,
  ]);

  const selectScene = (id: DemoSceneId) => {
    const nextIndex = SCENES.findIndex((item) => item.id === id);

    if (nextIndex < 0) return;

    if (manualTimerRef.current) {
      window.clearTimeout(manualTimerRef.current);
    }

    setManualHold(true);

    manualTimerRef.current = window.setTimeout(() => {
      setManualHold(false);
    }, MANUAL_HOLD_MS);

    setSceneIndex(nextIndex);
    setTypedLength(0);
    setPhase(reduceMotion ? "success" : "typing");
  };

  const sceneFading = phase === "transition";
  const visibleLength = reduceMotion ? fullText.length : typedLength;
  const tutorVisible = phase === "tutor";

  return (
    <section
      ref={rootRef}
      data-testid="home-ide-demo"
      data-scene={scene.id}
      data-phase={phase}
      className="ui-page-surface overflow-hidden p-4 sm:p-5 lg:p-6"
    >
      <div className="grid items-center gap-7 lg:grid-cols-[minmax(220px,0.68fr)_minmax(0,1.32fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="ui-kicker">{kicker}</div>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.96)] sm:text-3xl">
            {title}
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)] sm:text-[15px] sm:leading-7">
            {description}
          </p>

          <div className="mt-5">
            <SceneSelector
              activeScene={scene.id}
              onSelect={selectScene}
            />
          </div>
        </div>

        <div className="relative min-w-0">
          <div
            aria-hidden
            className="absolute -inset-5 rounded-[34px] bg-emerald-400/[0.08] blur-3xl dark:bg-emerald-300/[0.06]"
          />

          <div
            role="img"
            aria-label={`Animated ZoeSkoul ${scene.label} learning workspace demonstration`}
            className={[
              "relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.16)] transition-[opacity,transform] duration-400 ease-out dark:border-white/10 dark:bg-neutral-950 dark:shadow-[0_28px_80px_rgba(0,0,0,0.34)]",
              sceneFading
                ? "scale-[0.995] opacity-0"
                : "scale-100 opacity-100",
            ].join(" ")}
          >
            <div className="grid min-h-[392px] grid-cols-1 sm:grid-cols-[145px_minmax(0,1fr)]">
              <ExplorerRail scene={scene} />

              {scene.id === "terminal" ? (
                <TerminalWorkspace
                  phase={phase}
                  visibleLength={visibleLength}
                  active={active}
                />
              ) : (
                <div className="flex min-h-0 flex-col">
                  <EditorToolbar scene={scene} phase={phase} />

                  <CodeEditor
                    scene={scene}
                    phase={phase}
                    visibleLength={visibleLength}
                    active={active}
                  />

                  {scene.id === "sql" ? (
                    <SqlResults phase={phase} />
                  ) : (
                    <PythonOutput phase={phase} />
                  )}
                </div>
              )}

              <TutorHint
                visible={tutorVisible}
                text={scene.tutorHint}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
