import Link from "next/link";
import SandboxBoardClient from "./SandboxBoardClient";

export const metadata = {
  title: "Whiteboard | ZoeSkoul Sandbox",
  description: "Draw, sketch, and organize ideas on a personal ZoeSkoul whiteboard.",
  robots: { index: false, follow: false },
};

export default async function SandboxBoardPage({params}: {params:Promise<{locale:string}>}) {
  const {locale} = await params;
  return (
    <main
      data-sandbox-board-immersive
      className="flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[var(--app-bg)] text-neutral-900 dark:text-white"
      style={{ height: "100dvh" }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--ui-border)/0.7)] bg-[rgb(var(--ui-surface))] px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight sm:text-lg">Whiteboard</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Your personal visual workspace</p>
        </div>
        <Link className="ui-btn-secondary shrink-0" href={`/${locale}/sandbox`}>Back to sandboxes</Link>
      </header>
      <section aria-label="Whiteboard drawing workspace" className="min-h-0 flex-1 overflow-hidden">
        <SandboxBoardClient locale={locale}/>
      </section>
    </main>
  );
}
