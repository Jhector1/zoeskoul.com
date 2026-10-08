type LanguageExperienceDemoProps = {
    kicker: string;
    title: string;
    description: string;
    conversationLabel: string;
    listenLabel: string;
    learnerLabel: string;
    prompt: string;
    response: string;
    feedback: string;
    vocabularyLabel: string;
    firstTerm: string;
    firstMeaning: string;
    secondTerm: string;
    secondMeaning: string;
};

const WAVE_HEIGHTS = [14, 24, 34, 22, 40, 28, 18];

function SpeakerIcon() {
    return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
            <path
                d="M16 9.2a4 4 0 0 1 0 5.6M18.5 6.8a7.5 7.5 0 0 1 0 10.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MicIcon() {
    return (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <rect
                x="9"
                y="3"
                width="6"
                height="11"
                rx="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9.5 21h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default function LanguageExperienceDemo({
    kicker,
    title,
    description,
    conversationLabel,
    listenLabel,
    learnerLabel,
    prompt,
    response,
    feedback,
    vocabularyLabel,
    firstTerm,
    firstMeaning,
    secondTerm,
    secondMeaning,
}: LanguageExperienceDemoProps) {
    return (
        <section
            data-testid="home-language-demo"
            className="ui-page-surface overflow-hidden p-4 sm:p-5 lg:p-6"
        >
            <div className="grid items-center gap-7 lg:grid-cols-[minmax(220px,0.68fr)_minmax(0,1.32fr)] lg:gap-8">
                <div className="min-w-0">
                    <div className="ui-kicker">{kicker}</div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[rgb(var(--ui-text)/0.96)] sm:text-3xl">
                        {title}
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.84)] sm:text-[15px]">
                        {description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                        <span className="ui-chip">
                            <SpeakerIcon />
                            <span>{listenLabel}</span>
                        </span>
                        <span className="ui-chip">
                            <MicIcon />
                            <span>{learnerLabel}</span>
                        </span>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.62)] p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--ui-border)/0.72)] pb-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.72)]">
                            {conversationLabel}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--ui-accent)/0.92)]">
                            <span className="size-1.5 rounded-full bg-[rgb(var(--ui-accent))] motion-safe:animate-pulse" />
                            {listenLabel}
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="max-w-[88%] rounded-xl rounded-bl-sm border border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-surface)/0.9)] p-3 shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold text-[rgb(var(--ui-text-muted)/0.72)]">
                                <span className="flex size-6 items-center justify-center rounded-full bg-[rgb(var(--ui-accent)/0.1)] text-[rgb(var(--ui-accent))]">
                                    <SpeakerIcon />
                                </span>
                                {listenLabel}
                            </div>
                            <p className="mt-2 text-base font-semibold tracking-[-0.01em] text-[rgb(var(--ui-text)/0.96)]">
                                {prompt}
                            </p>

                            <div className="mt-3 flex h-10 items-center gap-1" aria-hidden="true">
                                {WAVE_HEIGHTS.map((height, index) => (
                                    <span
                                        key={`${height}-${index}`}
                                        className="w-1.5 rounded-full bg-[rgb(var(--ui-accent)/0.7)] motion-safe:animate-pulse motion-reduce:animate-none"
                                        style={{
                                            height,
                                            animationDelay: `${index * 90}ms`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="ml-auto max-w-[88%] rounded-xl rounded-br-sm border border-[rgb(var(--ui-accent)/0.2)] bg-[rgb(var(--ui-accent)/0.07)] p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-[rgb(var(--ui-text-muted)/0.72)]">
                                <span className="flex size-6 items-center justify-center rounded-full bg-[rgb(var(--ui-accent)/0.12)] text-[rgb(var(--ui-accent))] motion-safe:animate-pulse motion-reduce:animate-none">
                                    <MicIcon />
                                </span>
                                {learnerLabel}
                            </div>
                            <p className="mt-2 text-base font-semibold tracking-[-0.01em] text-[rgb(var(--ui-text)/0.96)]">
                                {response}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.72)] p-2.5">
                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                ✓
                            </span>
                            <span className="text-sm font-medium text-[rgb(var(--ui-text)/0.9)]">
                                {feedback}
                            </span>
                        </div>

                        <div className="rounded-lg border border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.72)] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--ui-text-muted)/0.68)]">
                                {vocabularyLabel}
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md bg-[rgb(var(--ui-surface-2)/0.72)] px-3 py-2">
                                    <div className="text-sm font-semibold text-[rgb(var(--ui-text)/0.94)]">
                                        {firstTerm}
                                    </div>
                                    <div className="mt-0.5 text-xs text-[rgb(var(--ui-text-muted)/0.76)]">
                                        {firstMeaning}
                                    </div>
                                </div>
                                <div className="rounded-md bg-[rgb(var(--ui-surface-2)/0.72)] px-3 py-2">
                                    <div className="text-sm font-semibold text-[rgb(var(--ui-text)/0.94)]">
                                        {secondTerm}
                                    </div>
                                    <div className="mt-0.5 text-xs text-[rgb(var(--ui-text-muted)/0.76)]">
                                        {secondMeaning}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
