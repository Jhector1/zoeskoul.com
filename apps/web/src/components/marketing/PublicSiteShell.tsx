import type { ReactNode } from "react";
import HeaderSlick from "@/components/HeaderSlick";
import FooterSlick from "@/components/layout/FooterSlick";

export default function PublicSiteShell({
  children,
  badge = "",
}: {
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="min-h-dvh">
      <HeaderSlick isBillingStatus={false} badge={badge} />
      {children}
      <FooterSlick />
    </div>
  );
}
