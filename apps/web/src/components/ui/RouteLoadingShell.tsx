import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type RouteLoadingShellProps = {
    label?: string;
    className?: string;
    minHeightClassName?: string;
};

export default function RouteLoadingShell({
                                              label = "Loading...",
                                              className,
                                              minHeightClassName = "min-h-[50vh]",
                                          }: RouteLoadingShellProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-center",
                minHeightClassName,
                className,
            )}
        >
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.98)] px-4 py-2 text-sm text-[rgb(var(--ui-text-muted)/0.95)] shadow-sm backdrop-blur">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{label}</span>
            </div>
        </div>
    );
}