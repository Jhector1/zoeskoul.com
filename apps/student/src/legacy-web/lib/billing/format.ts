export function fmtShortDate(iso: string | null, intlLocale?: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    return new Intl.DateTimeFormat(intlLocale || undefined, {
        month: "short",
        day: "numeric",
    }).format(d);
}