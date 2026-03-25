// src/i18n/stripLocale.ts
import { routing } from "@/i18n/routing";

export function stripLocale(pathname: string) {
  let parts = pathname.split("/").filter(Boolean);

  // remove ALL leading locale segments (handles /ht/fr/assignments)
  while (parts.length && routing.locales.includes(parts[0] as any)) {
    parts = parts.slice(1);
  }

  const rest = "/" + parts.join("/");
  return rest === "/" ? "/" : rest;
}
