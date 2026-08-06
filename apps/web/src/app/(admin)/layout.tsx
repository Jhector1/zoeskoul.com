import type { ReactNode } from "react";

import "../globals.css";

type AdminRootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function AdminRootLayout({
  children,
}: AdminRootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
