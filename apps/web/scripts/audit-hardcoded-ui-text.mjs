#!/usr/bin/env node

/**
 * Lightweight i18n audit for likely hardcoded user-facing UI text.
 *
 * How to fix a finding:
 * 1. Move the text into the nearest feature message JSON.
 * 2. Read it with next-intl (`useTranslations`, `getTranslations`, etc).
 * 3. Re-run:
 *    - pnpm --filter @zoeskoul/web i18n:generate
 *    - pnpm --filter @zoeskoul/web i18n:audit-ui
 *
 * If a string truly must stay hardcoded, add an exact file+string entry to
 * scripts/hardcoded-ui-allowlist.json.
 *
 * This audit is intentionally conservative. It warns on high-confidence UI text
 * patterns rather than trying to catch every possible case.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");

const TARGET_DIRS = [
  "src/components",
  "src/app/(public)",
  "src/features",
];

const EXCLUDED_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  ".d.ts",
];

const EXCLUDED_PATHS = [
  "src/i18n/messages.generated.ts",
  "src/i18n/messages/",
  "src/lib/subjects/",
  "src/lib/practice/generator/",
  "src/lib/code/feedback/",
];

const AUDITABLE_EXTENSIONS = new Set([".ts", ".tsx"]);
const ATTRIBUTE_NAMES = new Set([
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "confirmLabel",
  "cancelLabel",
  "helperText",
  "emptyText",
]);

const LANGUAGE_IDS = new Set([
  "c",
  "cpp",
  "css",
  "html",
  "java",
  "javascript",
  "json",
  "python",
  "sql",
  "typescript",
  "web",
]);

const HIGH_CONFIDENCE_COMPONENT_PROPS = new Set([
  "title",
  "description",
  "confirmLabel",
  "cancelLabel",
  "label",
]);

const SYMBOL_ONLY_RE = /^[\s\-–—•✓✕→←↻↷…/|:;.,()[\]{}+*=!?#@%&]+$/;
const URL_RE = /^(https?:\/\/|mailto:|tel:)/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROUTE_RE = /^\/[A-Za-z0-9\-._~/[\]]*$/;
const STORAGE_KEY_RE = /^[a-z0-9_.:-]+$/;
const IMPORTISH_RE = /^[@a-z0-9_.\-\/()[\]]+$/i;
const TECHNICAL_PREFIX_RE = /^(data-|aria-|--|var\(|rgba?\(|#[0-9a-f]{3,8}$)/i;
const SHELLISH_RE = /^(pwd|ls|cd|mkdir|touch|cat|rm|mv|cp|echo|node|npm|pnpm|python|pip|sql|select\b|insert\b|update\b|delete\b)/i;

function toRepoPath(webRelativePath) {
  return path.posix.join("apps/web", webRelativePath.replaceAll(path.sep, "/"));
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function shouldExclude(relPath) {
  if (EXCLUDED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))) return true;
  return EXCLUDED_PATHS.some((prefix) => relPath === prefix || relPath.startsWith(prefix));
}

async function exists(dirPath) {
  try {
    await fs.access(dirPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(relDir) {
  const absDir = path.join(WEB_ROOT, relDir);
  if (!(await exists(absDir))) return [];

  const out = [];
  const stack = [absDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);
      if (!AUDITABLE_EXTENSIONS.has(ext)) continue;

      const rel = path.relative(WEB_ROOT, abs).replaceAll(path.sep, "/");
      if (shouldExclude(rel)) continue;
      out.push(rel);
    }
  }

  return out.sort();
}

async function loadAllowlist() {
  const allowlistPath = path.join(__dirname, "hardcoded-ui-allowlist.json");
  const raw = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  return new Set(
    entries
      .filter((entry) => entry && typeof entry.file === "string" && typeof entry.string === "string")
      .map((entry) => `${entry.file}::${entry.string}`),
  );
}

function isLikelyUserFacing(text) {
  if (!text) return false;
  if (text.length <= 1) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (SYMBOL_ONLY_RE.test(text)) return false;
  if (URL_RE.test(text) || EMAIL_RE.test(text) || ROUTE_RE.test(text)) return false;
  if (TECHNICAL_PREFIX_RE.test(text)) return false;
  if (LANGUAGE_IDS.has(text.toLowerCase())) return false;
  if (/e2e|testid|data-testid/i.test(text)) return false;
  if (SHELLISH_RE.test(text) && !/[.!?]$/.test(text)) return false;
  if (/kind:\s*["']?[a-z0-9_-]+["']?/i.test(text)) return false;
  if (IMPORTISH_RE.test(text) && !/\s/.test(text) && text.includes("/")) return false;
  if (STORAGE_KEY_RE.test(text) && !/\s/.test(text) && /[._:-]/.test(text)) return false;
  if (/^(console|window|document|process|localStorage|sessionStorage)\b/.test(text)) return false;
  if (/^[A-Z0-9_]+$/.test(text)) return false;
  return true;
}

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getJsxTagName(node) {
  if (!node) return null;
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return null;
}

function hasIgnoredJsxAncestor(node) {
  let current = node.parent;
  while (current) {
    const tag = getJsxTagName(current);
    if (tag === "code" || tag === "pre" || tag === "script" || tag === "style") {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function getCallName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${getCallName(node.expression)}.${node.name.text}`;
  return "";
}

function extractStaticText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isJsxExpression(node) && node.expression) {
    return extractStaticText(node.expression);
  }
  return null;
}

function suggestNamespace(relPath) {
  const p = relPath.replaceAll(path.sep, "/");
  if (p.includes("/code/runner/")) return "ide.codeRunner";
  if (p.includes("/code/projects/")) return "ide.projects";
  if (p.includes("/components/tools/")) return "ide.tools";
  if (p.includes("/components/ide/fullide/panes/IdeExplorerPane") || p.includes("/ExplorerTree") || p.includes("/NodeMenu") || p.includes("/TabsBar") || p.includes("/IdeDesktopLayout") || p.includes("/IdeMobileLayout")) {
    return "ide.explorer";
  }
  if (p.includes("/components/ide/fullide/panes/IdeEditorPane")) return "ide.editor";
  if (p.includes("/components/ide/fullide/")) return "ide.fullIde";
  if (p.includes("/components/review/module/components/ModuleSidebar")) return "review.sidebar";
  if (p.includes("/components/review/module/CardRenderer")) return "review.cardRenderer";
  if (p.includes("/components/review/quiz/") || p.includes("/components/review/QuizBlock")) return "review.quiz";
  if (p.includes("/components/practice/kinds/CodeInput")) return "practice.codeInput";
  if (p.includes("/components/practice/")) return "practice.exerciseRenderer";
  if (p.endsWith("/subjects/[subjectSlug]/modules/SubjectModulesClient.tsx")) return "subjectModulesUi";
  if (p.endsWith("/subjects/[subjectSlug]/modules/[moduleSlug]/ModuleIntroClient.tsx")) return "moduleIntroUi";
  if (p.includes("/certificate/_components/CertificatePreviewCard.tsx")) return "certificatePreview";
  return "TODO.featureNamespace";
}

function createFinding({ sourceFile, relPath, node, text, kind, confidence }) {
  return {
    file: toRepoPath(relPath),
    line: getLine(sourceFile, node),
    text: normalizeText(text),
    kind,
    confidence,
    namespace: suggestNamespace(relPath),
  };
}

function isAllowed(allowlist, file, text) {
  return allowlist.has(`${file}::${text}`);
}

function visitSourceFile(sourceFile, relPath, allowlist) {
  const findings = [];
  const repoPath = toRepoPath(relPath);

  function maybePush(finding) {
    if (!isLikelyUserFacing(finding.text)) return;
    if (isAllowed(allowlist, repoPath, finding.text)) return;
    findings.push(finding);
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = normalizeText(node.getText(sourceFile));
      if (text && !hasIgnoredJsxAncestor(node)) {
        maybePush(
          createFinding({
            sourceFile,
            relPath,
            node,
            text,
            kind: "jsx-text",
            confidence: "high",
          }),
        );
      }
    }

    if (ts.isJsxExpression(node) && node.expression && !hasIgnoredJsxAncestor(node)) {
      if (
        ts.isStringLiteral(node.expression) ||
        ts.isNoSubstitutionTemplateLiteral(node.expression)
      ) {
        const text = normalizeText(node.expression.text);
        if (text) {
          maybePush(
            createFinding({
              sourceFile,
              relPath,
              node: node.expression,
              text,
              kind: "jsx-expression-string",
              confidence: "high",
            }),
          );
        }
      }
    }

    if (ts.isJsxAttribute(node) && ATTRIBUTE_NAMES.has(node.name.text)) {
      const text = extractStaticText(node.initializer);
      if (text) {
        const parentTag =
          ts.isJsxAttributes(node.parent) &&
          (ts.isJsxOpeningElement(node.parent.parent) || ts.isJsxSelfClosingElement(node.parent.parent))
            ? getJsxTagName(node.parent.parent)
            : null;
        const isComponentProp = Boolean(parentTag && /^[A-Z]/.test(parentTag));
        const confidence =
          node.name.text === "aria-label" ||
          node.name.text === "placeholder" ||
          node.name.text === "alt" ||
          (isComponentProp && HIGH_CONFIDENCE_COMPONENT_PROPS.has(node.name.text))
            ? "high"
            : "medium";

        maybePush(
          createFinding({
            sourceFile,
            relPath,
            node,
            text,
            kind: `jsx-attr:${node.name.text}`,
            confidence,
          }),
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const callName = getCallName(node.expression);
      if (/^console(\.|$)/.test(callName)) {
        return ts.forEachChild(node, visit);
      }

      const firstArg = node.arguments[0];
      const text = extractStaticText(firstArg);
      if (text) {
        const isToast =
          /(^toast$|^toast\.|\.toast$|\.toast\.|^sonner\.toast|^enqueueSnackbar$)/.test(callName);
        const isUiMessageCall =
          /(open|show|error|success|warning|info|notify|message)$/.test(callName) &&
          /toast|dialog|modal|alert|snackbar/i.test(callName);

        if (isToast || isUiMessageCall) {
          maybePush(
            createFinding({
              sourceFile,
              relPath,
              node: firstArg,
              text,
              kind: "call-arg",
              confidence: "high",
            }),
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

async function main() {
  const allowlist = await loadAllowlist();
  const relFiles = (await Promise.all(TARGET_DIRS.map(collectFiles))).flat();

  const findings = [];

  for (const relPath of relFiles) {
    const absPath = path.join(WEB_ROOT, relPath);
    const text = await fs.readFile(absPath, "utf8");
    const sourceFile = ts.createSourceFile(
      relPath,
      text,
      ts.ScriptTarget.Latest,
      true,
      relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    findings.push(...visitSourceFile(sourceFile, relPath, allowlist));
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text));

  if (!findings.length) {
    console.log("✅ No likely hardcoded user-facing UI text found.");
    return;
  }

  console.log(`⚠️  Found ${findings.length} likely hardcoded UI string${findings.length === 1 ? "" : "s"}:\n`);

  for (const finding of findings) {
    console.log(
      `${finding.file}:${finding.line}\n` +
        `  [${finding.confidence}] ${finding.kind}\n` +
        `  "${finding.text}"\n` +
        `  suggested namespace: ${finding.namespace}\n`,
    );
  }

  console.log("Audit is warning-only by default.");
  console.log("Use the allowlist for intentional hardcoded UI strings.");
  console.log("Use --strict to make high-confidence findings fail CI.");

  if (process.argv.includes("--strict") && findings.some((f) => f.confidence === "high")) {
    process.exitCode = 1;
  }
}

await main();
