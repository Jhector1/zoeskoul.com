import type { ReactNode } from "react";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";

/**
 * Route-group boundary: every present and future teaching page is protected in
 * one place. Individual pages may call the cached guard again when they need
 * the resolved teacher/admin record for ownership-scoped queries.
 */
export default async function TeachingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireTeachingPageUser({ locale });
  return children;
}
