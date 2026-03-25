export function cx(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}