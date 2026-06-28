import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModuleNavBar from "./ReviewModuleNavBar";

vi.mock("next-intl", () => ({
    useTranslations: () => {
        const t = ((key: string) => {
            const copy: Record<string, string> = {
                "buttons.prevModule": "Prev module",
                "buttons.nextModule": "Next module",
            };
            return copy[key] ?? key;
        }) as ((key: string) => string) & {
            rich: (key: string, values: Record<string, (chunks: React.ReactNode) => React.ReactNode>) => React.ReactNode;
        };

        t.rich = (key: string, values: Record<string, (chunks: React.ReactNode) => React.ReactNode>) => {
            if (key === "hints.unlockNext") {
                return (
                    <>
                        Complete this module to unlock {values.next?.("Next") ?? "Next"}.
                    </>
                );
            }

            return key;
        };

        return t;
    },
}));

vi.mock("@/components/ui/NavButton", () => ({
    default: ({
        children,
        href = "",
        disabled = false,
        className = "",
    }: any) => (
        <a
            href={href}
            data-disabled={disabled ? "true" : "false"}
            className={className}
        >
            {children}
        </a>
    ),
}));

function renderNav(overrides: Partial<React.ComponentProps<typeof ReviewModuleNavBar>> = {}) {
    return renderToStaticMarkup(
        <ReviewModuleNavBar
            locale="en"
            subjectSlug="linux-terminal-fundamentals"
            prevModuleId="module-1"
            nextModuleId="module-3"
            nextLocked={false}
            nextBillingHref={null}
            canGoNext={true}
            canGetCertificate={false}
            {...overrides}
        />,
    );
}

describe("ReviewModuleNavBar", () => {
    it("keeps unlock-next clickable when the next module is billing-locked", () => {
        const html = renderNav({
            nextLocked: true,
            nextBillingHref: "/en/billing?subject=linux-terminal-fundamentals&module=module-3",
            canGoNext: true,
        });

        expect(html).toContain("Unlock next");
        expect(html).toContain('href="/en/billing?subject=linux-terminal-fundamentals&amp;module=module-3"');
        expect(html).toContain('data-disabled="false"');
    });

    it("still shows the unlock hint while the locked CTA remains clickable", () => {
        const html = renderNav({
            nextLocked: true,
            nextBillingHref: "/en/billing",
            canGoNext: true,
        });

        expect(html).toContain("Complete this module to unlock");
        expect(html).toContain("Next");
    });

    it("disables the next CTA only when there is no reachable next destination", () => {
        const html = renderNav({
            nextModuleId: null,
            canGoNext: false,
        });

        expect(html).not.toContain("Unlock next");
        expect(html).not.toContain("Next module");
    });
});
