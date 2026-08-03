export function QuizBlockSkeleton() {
    return (
        <div className="mt-3 grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl border border-neutral-200/60 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <div className="ui-skel h-4 w-56" />
                            <div className="ui-skel h-3 w-80 opacity-80" />
                        </div>
                        <div className="ui-skel h-8 w-20 rounded-xl" />
                    </div>
                    <div className="ui-skel mt-4 h-28 w-full rounded-xl" />
                    <div className="mt-3 flex gap-2">
                        <div className="ui-skel h-9 w-24 rounded-xl" />
                        <div className="ui-skel h-9 w-28 rounded-xl" />
                    </div>
                </div>
            ))}
        </div>
    );
}