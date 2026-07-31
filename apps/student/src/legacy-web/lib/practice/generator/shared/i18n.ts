import {pickName, safeInt} from "@/lib/practice/generator/engines/python/_shared";



export function tag(key: string) {
    return `@:${key}`;
}

export function getDeep(obj: any, path: string) {
    return String(path)
        .split(".")
        .filter(Boolean)
        .reduce((acc: any, part) => (acc == null ? undefined : acc[part]), obj);
}

export function i18nText(args: any, path: string, fallback: string) {
    const v = getDeep(args?.ctx?.meta?.i18n, path);
    return typeof v === "string" && v.trim() ? v : fallback;
}

export function fillTemplate(template: string, vars: Record<string, string | number>) {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export function pyFStringPrint(template: string) {
    return `print(f${JSON.stringify(template)})\n`;
}

export  function terminalFenceI18n(args: any, stdin: string, stdout: string) {
    const inputLabel = i18nText(args, "common.terminalInputLabel", "input");
    const outputLabel = i18nText(args, "common.terminalOutputLabel", "output");

    return [
        "~~~terminal",
        `$ ${inputLabel}`,
        stdin.trimEnd(),
        "",
        `$ ${outputLabel}`,
        stdout.trimEnd(),
        "~~~",
    ].join("\n");
}