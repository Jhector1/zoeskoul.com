import HeaderSlick from "@/components/HeaderSlick";
import FooterSlick from "@/components/layout/FooterSlick";
import React from "react";

export default async function PlatformLayout({
  children,
//   params,
}: Readonly<{
  children: React.ReactNode;
//   params: Promise<{ locale: string }>;
}>) {
  return (
    // <html>
      <div >
        <HeaderSlick brand={process.env.APP_NAME} badge="MVP" />
        {children}
          <FooterSlick />
      </div>
    // </html>
  );
}
