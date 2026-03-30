import React from "react";
import { cn } from "@/lib/cn";

export function BillingCard({
                                children,
                                className,
                            }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-page-surface overflow-hidden", className)}>{children}</div>;
}

export function BillingPanel({
                                 children,
                                 className,
                             }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-surface-soft", className)}>{children}</div>;
}

export function BillingSoftPanel({
                                     children,
                                     className,
                                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-surface-muted", className)}>{children}</div>;
}

export function BillingSectionHeader({
                                         children,
                                         className,
                                     }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("border-b border-neutral-200/70 p-5 dark:border-white/10", className)}>
            {children}
        </div>
    );
}