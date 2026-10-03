import type { ReactNode } from "react";
import PublicSiteShell from "@/components/marketing/PublicSiteShell";

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
