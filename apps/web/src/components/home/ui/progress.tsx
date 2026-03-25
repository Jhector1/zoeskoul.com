import * as React from "react";
import {cn} from "@/lib/cn";

export interface ProgressProps
    extends React.HTMLAttributes<HTMLDivElement> {
    value?: number;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value = 0, ...props }, ref) => {
        const safeValue = Math.max(0, Math.min(100, value));

        return (
            <div
                ref={ref}
                className={cn(
                    "relative h-2 w-full overflow-hidden rounded-full bg-muted",
                    className
                )}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={safeValue}
                {...props}
            >
                <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${safeValue}%` }}
                />
            </div>
        );
    }
);

Progress.displayName = "Progress";