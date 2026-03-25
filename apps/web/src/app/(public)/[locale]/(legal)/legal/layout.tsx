import type { ReactNode } from "react";
import React from "react";
import HeaderSlick from "@/components/HeaderSlick";
import FooterSlick from "@/components/layout/FooterSlick";

export default function LegalLayout({ children }: { children: ReactNode }) {
    return (
        <>
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
            <HeaderSlick
                isBillingStatus={false}
                brand={process.env.NEXT_PUBLIC_APP_NAME}
                badge="MVP"
                // isUser={true}
                // isNav={false}
            />
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                {children}
            </div>

        </div>
            <FooterSlick />
            </>
    );
}