#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const messagesRoot = path.join(projectRoot, "src", "i18n", "messages");
const outputFile = path.join(projectRoot, "src", "i18n", "messages.generated.ts");
const defaultLocale = "en";

async function exists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function getDirectories(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
}

async function walkJsonFiles(dir, baseDir = dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(...(await walkJsonFiles(fullPath, baseDir)));
            continue;
        }

        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".json")) continue;

        const rel = path.relative(baseDir, fullPath).split(path.sep).join("/");
        out.push(rel);
    }

    return out;
}

function makeLoaderBlock(locale, files) {
    if (files.length === 0) {
        return `  ${JSON.stringify(locale)}: [],`;
    }

    const lines = files.map((file) => {
        const importPath = `./messages/${locale}/${file}`;
        return `    () => import(${JSON.stringify(importPath)}).then((m) => (m?.default ?? {}) as AnyObj),`;
    });

    return `  ${JSON.stringify(locale)}: [\n${lines.join("\n")}\n  ],`;
}

async function main() {
    if (!(await exists(messagesRoot))) {
        throw new Error(`Messages directory not found: ${messagesRoot}`);
    }

    const locales = await getDirectories(messagesRoot);

    if (locales.length === 0) {
        throw new Error(`No locale directories found under ${messagesRoot}`);
    }

    if (!locales.includes(defaultLocale)) {
        throw new Error(`Default locale "${defaultLocale}" not found under ${messagesRoot}`);
    }

    const localeToFiles = {};

    for (const locale of locales) {
        const localeDir = path.join(messagesRoot, locale);
        const files = await walkJsonFiles(localeDir);
        localeToFiles[locale] = files.sort((a, b) => a.localeCompare(b));
    }

    const loaderBlocks = locales
        .map((locale) => makeLoaderBlock(locale, localeToFiles[locale]))
        .join("\n\n");

    const fileContents = `/* eslint-disable */
// AUTO-GENERATED FILE.
// Do not edit manually.
// Run: pnpm i18n:generate

type AnyObj = Record<string, any>;

function isObject(v: unknown): v is AnyObj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T extends AnyObj>(base: T, override: AnyObj): T {
  const out: AnyObj = { ...base };

  for (const k of Object.keys(override ?? {})) {
    const bv = out[k];
    const ov = override[k];

    if (isObject(bv) && isObject(ov)) out[k] = deepMerge(bv, ov);
    else out[k] = ov;
  }

  return out as T;
}

const loaders: Record<string, Array<() => Promise<AnyObj>>> = {
${loaderBlocks}
};

export async function loadLocaleMessages(locale: string): Promise<AnyObj> {
  const fns = loaders[locale] ?? [];
  const parts = await Promise.all(fns.map((fn) => fn()));
  return parts.reduce((acc, part) => deepMerge(acc, part), {} as AnyObj);
}

export const AVAILABLE_MESSAGE_LOCALES = ${JSON.stringify(locales)} as const;
`;

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, fileContents, "utf8");

    console.log(
        `Generated src/i18n/messages.generated.ts for locales: ${locales.join(", ")}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});