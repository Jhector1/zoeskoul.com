#!/usr/bin/env python3
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
from typing import Any, Iterable, Optional

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

from chatgpt_auth import (
    AuthError,
    auth_status,
    choose_model,
    ensure_access_token,
    list_models,
    load_profile,
    login,
    logout,
    refresh,
)

VERSION = "2.3.1"
PATCH_BEGIN = "PATCH_BEGIN"
PATCH_END = "PATCH_END"
NO_SAFE_PATCH = "NO_SAFE_PATCH"
EVIDENCE_BEGIN = "EVIDENCE_REQUEST_BEGIN"
EVIDENCE_END = "EVIDENCE_REQUEST_END"

FORBIDDEN_ADDED = [
    re.compile(r"\b(?:it|test|describe)\.skip\s*\("),
    re.compile(r"\b(?:it|test|describe)\.only\s*\("),
    re.compile(r"\btest\.todo\s*\("),
    re.compile(r"@ts-ignore|@ts-nocheck"),
    re.compile(r"eslint-disable"),
    re.compile(r"--passWithNoTests"),
    re.compile(r"\bgit\s+(?:push|commit|reset|checkout|clean)\b"),
    re.compile(r"\brm\s+-rf\b|\bsudo\b"),
    re.compile(r"expect\s*\(\s*true\s*\)\s*\."),
]

PATH_RE = re.compile(
    r"(?P<path>(?:(?:apps|packages|tools|scripts|config|configs)/"
    r"|src/|\.\./\.\./packages/)"
    r"[A-Za-z0-9_@./+\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|py|sh|yaml|yml|md))"
    r"(?::(?P<line>\d+))?"
)
DIFF_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")


@dataclasses.dataclass
class Gate:
    name: str
    command: str
    timeout_seconds: int
    repairable: bool = True


@dataclasses.dataclass
class Result:
    command: str
    returncode: int
    stdout: str
    stderr: str
    elapsed: float
    timed_out: bool = False

    @property
    def combined(self) -> str:
        return "\n".join(x for x in (self.stdout, self.stderr) if x)


class AgentError(RuntimeError):
    pass


def run_shell(repo: Path, command: str, timeout: int) -> Result:
    started = time.monotonic()
    try:
        p = subprocess.run(
            ["/bin/bash", "-lc", command],
            cwd=repo,
            text=True,
            capture_output=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        return Result(command, p.returncode, p.stdout, p.stderr, time.monotonic() - started)
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout or ""
        err = exc.stderr or ""
        if isinstance(out, bytes):
            out = out.decode(errors="replace")
        if isinstance(err, bytes):
            err = err.decode(errors="replace")
        return Result(
            command,
            124,
            out,
            err + f"\nTIMEOUT after {timeout}s",
            time.monotonic() - started,
            True,
        )


def run_argv(repo: Path, argv: list[str], timeout: int = 120) -> Result:
    started = time.monotonic()
    try:
        p = subprocess.run(
            argv,
            cwd=repo,
            text=True,
            capture_output=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        return Result(
            " ".join(shlex.quote(x) for x in argv),
            p.returncode,
            p.stdout,
            p.stderr,
            time.monotonic() - started,
        )
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout or ""
        err = exc.stderr or ""
        if isinstance(out, bytes):
            out = out.decode(errors="replace")
        if isinstance(err, bytes):
            err = err.decode(errors="replace")
        return Result(
            " ".join(shlex.quote(x) for x in argv),
            124,
            out,
            err + f"\nTIMEOUT after {timeout}s",
            time.monotonic() - started,
            True,
        )


def git(repo: Path, args: Iterable[str], timeout: int = 120) -> Result:
    return run_argv(repo, ["git", *list(args)], timeout)


def must_git(repo: Path, args: Iterable[str]) -> str:
    r = git(repo, args)
    if r.returncode:
        raise AgentError(r.combined)
    return r.stdout


def clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    n = max(1, limit // 2)
    return text[:n] + f"\n\n... [CLIPPED {len(text) - limit} chars] ...\n\n" + text[-n:]


def normalize(path: str) -> str:
    path = path.strip()
    while path.startswith("./"):
        path = path[2:]
    if path.startswith("../../packages/"):
        path = path[len("../../"):]
    if path.startswith("src/"):
        path = "apps/web/" + path
    return Path(path).as_posix()


def load_config(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise AgentError("Agent config must be a JSON object.")
    return value


def parse_gates(cfg: dict[str, Any]) -> list[Gate]:
    gates = [
        Gate(
            str(x["name"]),
            str(x["command"]),
            int(x.get("timeout_seconds", 900)),
            bool(x.get("repairable", True)),
        )
        for x in cfg.get("gates", [])
    ]
    if not gates:
        raise AgentError("No gates configured.")
    return gates


def repo_root(candidate: Path) -> Path:
    r = run_argv(candidate, ["git", "rev-parse", "--show-toplevel"], 30)
    if r.returncode:
        raise AgentError("Not inside a git repository.")
    return Path(r.stdout.strip()).resolve()


def protected_path(rel: str) -> bool:
    rel = normalize(rel)
    p = Path(rel)
    name = p.name.lower()
    parts = {x.lower() for x in p.parts}

    if ".git" in parts or "node_modules" in parts:
        return True
    if any(x in parts for x in {".next", "dist", "coverage", ".turbo"}):
        return True
    if name.startswith(".env"):
        return True
    if any(word in name for word in ("secret", "credential", "private-key", "private_key")):
        return True
    if p.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
        return True
    return False


def safety_controller_path(rel: str) -> bool:
    rel = normalize(rel)
    return rel in {
        "tools/zoeskoul-agent/zoeskoul_closure_agent.py",
        "tools/zoeskoul-agent/chatgpt_auth.py",
        "tools/zoeskoul-agent/run.sh",
    }


def readable_repo_path(repo: Path, rel: str) -> bool:
    rel = normalize(rel)
    if protected_path(rel):
        return False
    full = (repo / rel).resolve()
    try:
        full.relative_to(repo.resolve())
    except ValueError:
        return False
    return full.is_file()


def writable_repo_path(repo: Path, rel: str) -> bool:
    rel = normalize(rel)
    if protected_path(rel) or safety_controller_path(rel):
        return False
    full = (repo / rel).resolve()
    try:
        full.relative_to(repo.resolve())
    except ValueError:
        return False
    return True


def read_repo_file(repo: Path, rel: str, limit: int = 20000) -> str:
    rel = normalize(rel)
    if not readable_repo_path(repo, rel):
        return f"===== {rel} =====\n[unavailable or protected]\n"
    try:
        raw = (repo / rel).read_text(errors="replace")
    except Exception as exc:
        return f"===== {rel} =====\n[unreadable: {exc}]\n"
    return f"===== {rel} =====\n{clip(raw, limit)}\n"


def list_repo_files(repo: Path, limit_chars: int = 50000) -> str:
    r = run_argv(repo, ["git", "ls-files", "--cached", "--others", "--exclude-standard"], 120)
    if r.returncode:
        return "[git ls-files failed]\n" + clip(r.combined, 4000)
    files = [line for line in r.stdout.splitlines() if line and not protected_path(line)]
    return clip("\n".join(files), limit_chars)


def grep_repo(repo: Path, term: str, limit_chars: int = 22000) -> str:
    if not term or len(term) > 160 or "\n" in term or "\r" in term:
        return f"===== SEARCH {term!r} =====\n[rejected]\n"
    r = run_argv(repo, ["git", "grep", "-n", "-I", "-F", "-e", term, "--"], 120)
    if r.returncode not in (0, 1):
        return f"===== SEARCH {term!r} =====\n[git grep failed]\n{clip(r.combined, 4000)}"
    safe_lines = []
    for line in r.stdout.splitlines():
        rel = line.split(":", 1)[0]
        if not protected_path(rel):
            safe_lines.append(line)
    return f"===== SEARCH {term!r} =====\n{clip(chr(10).join(safe_lines), limit_chars)}\n"


def glob_repo(repo: Path, pattern: str, max_files: int = 20, per_file_chars: int = 12000) -> str:
    if (
        not pattern
        or len(pattern) > 180
        or "\n" in pattern
        or pattern.startswith("/")
        or ".." in Path(pattern).parts
    ):
        return f"===== GLOB {pattern!r} =====\n[rejected]\n"

    listing = list_repo_files(repo, 250000).splitlines()
    matches = [
        rel for rel in listing
        if fnmatch.fnmatch(rel, pattern) and readable_repo_path(repo, rel)
    ][:max_files]

    chunks = [f"===== GLOB {pattern!r} matches={len(matches)} ====="]
    for rel in matches:
        chunks.append(read_repo_file(repo, rel, per_file_chars))
    return "\n".join(chunks)


def failure_source_context(repo: Path, output: str, limit: int) -> tuple[str, list[str]]:
    found: dict[str, list[int]] = {}
    for m in PATH_RE.finditer(output):
        rel = normalize(m.group("path"))
        if not readable_repo_path(repo, rel):
            continue
        found.setdefault(rel, [])
        if m.group("line"):
            line = int(m.group("line"))
            if line not in found[rel]:
                found[rel].append(line)
        if len(found) >= 20:
            break

    chunks: list[str] = []
    paths: list[str] = []
    for rel, lines in found.items():
        paths.append(rel)
        content = (repo / rel).read_text(errors="replace").splitlines()
        if not lines:
            lines = [1]
        for line in lines[:4]:
            start = max(1, line - 70)
            end = min(len(content), line + 90 if line > 1 else min(240, len(content)))
            body = "\n".join(f"{i:5d} | {content[i-1]}" for i in range(start, end + 1))
            chunks.append(f"\n===== {rel} [{start}-{end}] =====\n{body}")
        if sum(map(len, chunks)) >= limit:
            break
    return clip("\n".join(chunks), limit), paths


def baseline_repo_evidence(
    repo: Path,
    cfg_path: Path,
    gate: Gate,
    result: Result,
    limit: int,
) -> str:
    chunks = [
        read_repo_file(repo, "package.json", 20000),
        read_repo_file(repo, "apps/web/package.json", 20000),
        read_repo_file(repo, "pnpm-workspace.yaml", 10000),
        read_repo_file(repo, "turbo.json", 14000),
        read_repo_file(repo, "vitest.config.ts", 16000),
        read_repo_file(repo, "vitest.config.mts", 16000),
        read_repo_file(repo, "apps/web/vitest.config.ts", 20000),
        read_repo_file(repo, "apps/web/vitest.config.mts", 20000),
        read_repo_file(repo, "apps/web/next.config.ts", 14000),
    ]

    try:
        chunks.append(
            "===== tools/zoeskoul-agent/zoeskoul-agent.json =====\n"
            + clip(cfg_path.read_text(errors="replace"), 22000)
        )
    except Exception as exc:
        chunks.append(f"===== agent config =====\n[unreadable: {exc}]")

    for label, command in (
        ("ROOT PNPM SCRIPTS", "pnpm -s run"),
        ("WEB PNPM SCRIPTS", "cd apps/web && pnpm -s run"),
    ):
        inv = run_shell(repo, command, 60)
        chunks.append(
            f"===== {label} =====\nexit={inv.returncode}\n{clip(inv.combined, 20000)}"
        )

    for term in (
        "process.cwd()",
        "process.cwd",
        "cwd",
        "monorepo",
        "repo view",
        "vitest",
        "test:unit",
        "test:web",
        "test:web:unit",
    ):
        chunks.append(grep_repo(repo, term, 12000))

    chunks.append("===== REPOSITORY FILE INDEX =====\n" + list_repo_files(repo, 50000))
    chunks.append(
        "===== CURRENT GATE =====\n"
        f"name={gate.name}\ncommand={gate.command}\nexit={result.returncode}\n"
    )
    return clip("\n\n".join(chunks), limit)


def parse_evidence_request(text: str) -> Optional[dict[str, Any]]:
    a = text.find(EVIDENCE_BEGIN)
    b = text.find(EVIDENCE_END)
    if a < 0 or b <= a:
        return None
    raw = text[a + len(EVIDENCE_BEGIN):b].strip()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AgentError(f"Invalid evidence request JSON: {exc}") from exc
    if not isinstance(req, dict):
        raise AgentError("Evidence request must be a JSON object.")
    return req


def fulfill_evidence_request(repo: Path, request: dict[str, Any], total_limit: int) -> str:
    chunks: list[str] = []

    searches = request.get("search", [])
    if isinstance(searches, list):
        for term in searches[:14]:
            if isinstance(term, str):
                chunks.append(grep_repo(repo, term, 24000))

    files = request.get("files", [])
    if isinstance(files, list):
        for rel in files[:24]:
            if isinstance(rel, str):
                chunks.append(read_repo_file(repo, rel, 28000))

    globs = request.get("globs", [])
    if isinstance(globs, list):
        for pattern in globs[:12]:
            if isinstance(pattern, str):
                chunks.append(glob_repo(repo, pattern, max_files=24, per_file_chars=14000))

    if request.get("repo_file_index") is True:
        chunks.append("===== REPOSITORY FILE INDEX =====\n" + list_repo_files(repo, 80000))

    if request.get("git_diff") is True:
        chunks.append("===== CURRENT GIT DIFF =====\n" + clip(must_git(repo, ["diff", "--binary"]), 90000))

    if request.get("git_status") is True:
        chunks.append("===== CURRENT GIT STATUS =====\n" + must_git(repo, ["status", "--short"]))

    return clip("\n\n".join(chunks), total_limit)


def patch_paths(patch: str) -> list[str]:
    paths: list[str] = []
    for line in patch.splitlines():
        m = DIFF_RE.match(line)
        if not m:
            continue
        for raw in (m.group(1), m.group(2)):
            if raw == "/dev/null":
                continue
            rel = normalize(raw)
            if rel not in paths:
                paths.append(rel)
    if not paths:
        raise AgentError("Patch has no diff --git headers.")
    return paths


def validate_patch(repo: Path, patch: str, cfg: dict[str, Any]) -> list[str]:
    if len(patch) > int(cfg.get("max_patch_chars", 350000)):
        raise AgentError("Patch exceeds configured size limit.")
    if "GIT binary patch" in patch or "Binary files " in patch:
        raise AgentError("Binary patches are forbidden.")

    paths = patch_paths(patch)
    if len(paths) > int(cfg.get("max_files_per_patch", 30)):
        raise AgentError("Patch touches too many files.")

    denied = [rel for rel in paths if not writable_repo_path(repo, rel)]
    if denied:
        raise AgentError("Protected/non-writable repo path(s): " + ", ".join(denied))

    additions = [
        line[1:]
        for line in patch.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    ]
    if len(additions) > int(cfg.get("max_added_lines_per_patch", 3000)):
        raise AgentError("Patch adds too many lines.")

    for line in additions:
        for rx in FORBIDDEN_ADDED:
            if rx.search(line):
                raise AgentError(f"Forbidden added-line pattern {rx.pattern!r}: {line!r}")

    return paths


def base_instructions(cfg: dict[str, Any]) -> str:
    rules = "\n".join(f"- {x}" for x in cfg.get("architecture_rules", []))
    return f"""You are the autonomous repair planner for the ZoeSkoul monorepo.

AUTHORITY:
- You may inspect the entire repository through evidence requests.
- You may patch any non-secret repository file, including root configs,
  package scripts, Vitest/Next/Turbo config, applications, packages, tests,
  tooling, and tools/zoeskoul-agent/zoeskoul-agent.json.
- You may NOT patch the agent Python/auth/bootstrap safety controller.
- You have NO shell tool and cannot choose shell commands.
- You cannot commit, push, reset, checkout, clean, or mutate .git.

QUALITY:
- Fix root causes, not symptoms.
- Prefer established repo wrappers/contracts over bypassing them.
- Do not regress production to satisfy stale tests.
- Never weaken/skip/delete tests merely to turn a gate green.
- Do not add suppressions, fake assertions, broad error swallowing, or sleeps.
- Search for existing canonical implementations before creating new ones.
- A gate command/configuration can itself be wrong. If evidence proves that,
  patch tools/zoeskoul-agent/zoeskoul-agent.json to use the repository's
  established command/wrapper instead of changing production code.

ZoeSkoul architecture:
{rules}

Return exactly ONE of:

{PATCH_BEGIN}
diff --git a/path b/path
...
{PATCH_END}

OR request more repository evidence:

{EVIDENCE_BEGIN}
{{"search":["literal symbol"],"files":["path"],"globs":["pattern"],"repo_file_index":false,"git_diff":true,"git_status":true}}
{EVIDENCE_END}

OR, only after investigation proves no safe solution exists:

{NO_SAFE_PATCH}
REASON: concise evidence-based reason

No Markdown fences. No prose outside those forms."""


def failure_prompt(
    gate: Gate,
    result: Result,
    status: str,
    src: str,
    diff: str,
    iteration: int,
) -> str:
    return f"""ITERATION: {iteration}
FAILING GATE: {gate.name}
CURRENT FIXED GATE COMMAND:
{gate.command}

EXIT={result.returncode}
TIMED_OUT={result.timed_out}
ELAPSED={result.elapsed:.2f}s

GIT STATUS:
{status}

FAILURE OUTPUT:
{clip(result.combined, 90000)}

DIRECTLY REFERENCED SOURCE CONTEXT:
{src or "[none extracted]"}

CURRENT DIFF FOR REFERENCED PATHS:
{diff or "[none]"}

Investigate before guessing. If more repo evidence is needed, request it.
Return the smallest correct patch once the root cause is proven."""


def parse_model_output(text: str) -> tuple[str, Optional[str], Optional[dict[str, Any]]]:
    req = parse_evidence_request(text)
    if req is not None:
        return "evidence", None, req

    if NO_SAFE_PATCH in text and PATCH_BEGIN not in text:
        return "no_patch", text.strip(), None

    a = text.find(PATCH_BEGIN)
    b = text.find(PATCH_END)
    if a < 0 or b <= a:
        raise AgentError("Model output must be PATCH, EVIDENCE_REQUEST, or NO_SAFE_PATCH.")

    patch = text[a + len(PATCH_BEGIN):b].strip()
    if patch.startswith("```"):
        patch = re.sub(r"^```(?:diff|patch)?\s*", "", patch)
        patch = re.sub(r"\s*```$", "", patch)
    if not patch.endswith("\n"):
        patch += "\n"
    return "patch", patch, None


def call_chatgpt(access_token: str, model: str, inst: str, prompt: str) -> str:
    if OpenAI is None:
        raise AgentError("OpenAI Python SDK unavailable.")

    client = OpenAI(
        api_key=access_token,
        base_url="https://api.openai.com/v1",
        max_retries=0,
    )

    pieces: list[str] = []
    completed = False
    failure: Optional[str] = None

    with client.responses.create(
        model=model,
        instructions=inst,
        input=[{"role": "user", "content": prompt}],
        store=False,
        stream=True,
    ) as stream:
        for event in stream:
            t = getattr(event, "type", "")
            if t == "response.output_text.delta":
                pieces.append(str(getattr(event, "delta", "")))
            elif t == "response.completed":
                completed = True
            elif t == "response.failed":
                resp = getattr(event, "response", None)
                error = getattr(resp, "error", None) if resp else None
                failure = getattr(error, "code", None) or "unknown_error"
            elif t == "response.incomplete":
                failure = "response_incomplete"

    if failure:
        raise AgentError(f"ChatGPT plan inference failed: {failure}")
    if not completed:
        raise AgentError("Stream ended without response.completed.")
    return "".join(pieces)


def ask(cfg: dict[str, Any], inst: str, prompt: str) -> tuple[str, str]:
    token = ensure_access_token()
    model = choose_model(token, [str(x) for x in cfg.get("preferred_models", [])])

    try:
        return call_chatgpt(token, model, inst, prompt), model
    except Exception as exc:
        code = getattr(exc, "status_code", None)
        text = str(exc)
        if code == 401 or "401" in text or "invalid_token" in text.lower():
            profile = load_profile()
            if profile:
                token = str(refresh(profile)["access_token"])
                model = choose_model(token, [str(x) for x in cfg.get("preferred_models", [])])
                return call_chatgpt(token, model, inst, prompt), model
        raise


def investigate_until_patch(
    repo: Path,
    cfg_path: Path,
    cfg: dict[str, Any],
    gate: Gate,
    result: Result,
    initial_prompt: str,
    inst: str,
    idir: Path,
) -> tuple[Optional[str], Optional[str]]:
    prompt = initial_prompt
    max_rounds = int(cfg.get("max_evidence_rounds_per_failure", 6))
    baseline_used = False

    for round_no in range(1, max_rounds + 1):
        text, model = ask(cfg, inst, prompt)
        (idir / f"round-{round_no:02d}-model.txt").write_text(model + "\n")
        (idir / f"round-{round_no:02d}-response.txt").write_text(text)

        kind, payload, request = parse_model_output(text)

        if kind == "patch":
            return payload, model

        if kind == "evidence":
            evidence = fulfill_evidence_request(
                repo,
                request or {},
                int(cfg.get("max_requested_evidence_chars", 160000)),
            )
            (idir / f"round-{round_no:02d}-evidence.txt").write_text(evidence)
            prompt = (
                initial_prompt
                + "\n\n=== REQUESTED REPOSITORY EVIDENCE ===\n"
                + evidence
                + "\n\nContinue investigating. Request more evidence if necessary; otherwise patch."
            )
            print(f"evidence_round={round_no}/{max_rounds} requested_by_model=YES")
            continue

        if not baseline_used:
            baseline_used = True
            evidence = baseline_repo_evidence(
                repo,
                cfg_path,
                gate,
                result,
                int(cfg.get("max_baseline_evidence_chars", 200000)),
            )
            (idir / f"round-{round_no:02d}-baseline-evidence.txt").write_text(evidence)
            prompt = (
                initial_prompt
                + "\n\n=== AUTOMATIC WHOLE-REPO EVIDENCE PASS ===\n"
                + evidence
                + "\n\nYour previous answer was NO_SAFE_PATCH. Re-evaluate with this broader evidence. "
                  "You may request specific additional evidence."
            )
            print("NO_SAFE_PATCH -> whole_repo_evidence_pass=YES")
            continue

        return None, payload or text

    return None, "Evidence-round limit exhausted without a safe patch."


def try_apply_patch(repo: Path, patch_file: Path) -> tuple[bool, str]:
    # Recount hunk lengths because LLM-authored diffs can contain correct
    # context with stale @@ line counts. This does not relax context matching.
    check = git(repo, ["apply", "--check", "--recount", str(patch_file)])
    if check.returncode:
        return False, "git apply --check --recount failed:\n" + check.combined

    applied = git(
        repo,
        ["apply", "--recount", "--whitespace=error-all", str(patch_file)],
    )
    if applied.returncode:
        return False, "git apply --recount failed:\n" + applied.combined

    diff_check = git(repo, ["diff", "--check"])
    if diff_check.returncode:
        git(repo, ["apply", "-R", "--recount", str(patch_file)])
        return (
            False,
            "git diff --check failed; candidate patch reversed:\n"
            + diff_check.combined,
        )

    return True, ""


def patch_repair_context(repo: Path, paths: list[str], limit: int = 120000) -> str:
    chunks: list[str] = []
    for rel in paths[:20]:
        chunks.append(read_repo_file(repo, rel, 30000))
    return clip("\n\n".join(chunks), limit)


def repair_rejected_patch(
    repo: Path,
    cfg: dict[str, Any],
    inst: str,
    idir: Path,
    rejected_patch: str,
    apply_error: str,
    paths: list[str],
) -> tuple[Optional[str], Optional[list[str]], Optional[str]]:
    max_rounds = int(cfg.get("max_patch_repair_rounds", 3))
    current_patch = rejected_patch
    current_error = apply_error

    for repair_round in range(1, max_rounds + 1):
        target_context = patch_repair_context(repo, paths)
        repair_prompt = f"""PATCH FORMAT/APPLICABILITY REPAIR ROUND: {repair_round}/{max_rounds}

The proposed patch was rejected locally. Preserve the intended fix unless the
apply error proves the patch targeted stale content.

GIT APPLY ERROR:
{clip(current_error, 16000)}

REJECTED PATCH:
{clip(current_patch, 70000)}

EXACT CURRENT TARGET FILE CONTENT:
{target_context}

Return a syntactically valid unified git diff against the exact current files.
Hunk headers and context must match. Do not use Markdown fences. You may request
additional repository evidence if genuinely necessary."""

        (idir / f"patch-repair-{repair_round:02d}-prompt.txt").write_text(
            repair_prompt
        )
        response, model = ask(cfg, inst, repair_prompt)
        (idir / f"patch-repair-{repair_round:02d}-model.txt").write_text(
            model + "\n"
        )
        (idir / f"patch-repair-{repair_round:02d}-response.txt").write_text(
            response
        )

        kind, payload, request = parse_model_output(response)

        if kind == "evidence":
            evidence = fulfill_evidence_request(
                repo,
                request or {},
                int(cfg.get("max_requested_evidence_chars", 160000)),
            )
            (idir / f"patch-repair-{repair_round:02d}-evidence.txt").write_text(
                evidence
            )
            current_error = (
                current_error
                + "\n\nADDITIONAL REQUESTED EVIDENCE:\n"
                + evidence
            )
            continue

        if kind == "no_patch":
            current_error = payload or response
            continue

        assert payload is not None
        candidate = payload

        try:
            candidate_paths = validate_patch(repo, candidate, cfg)
        except Exception as exc:
            current_patch = candidate
            current_error = f"local patch safety validation rejected it: {exc}"
            continue

        candidate_file = idir / f"candidate-repaired-{repair_round:02d}.patch"
        candidate_file.write_text(candidate)
        ok, error = try_apply_patch(repo, candidate_file)
        if ok:
            print(
                f"patch_self_repair=PASS "
                f"round={repair_round}/{max_rounds}"
            )
            return candidate, candidate_paths, None

        current_patch = candidate
        current_error = error
        print(
            f"patch_self_repair=RETRY "
            f"round={repair_round}/{max_rounds}"
        )

    return None, None, current_error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--config")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--from-gate")
    parser.add_argument("--max-iterations", type=int)
    parser.add_argument("--login", action="store_true")
    parser.add_argument("--logout", action="store_true")
    parser.add_argument("--auth-status", action="store_true")
    parser.add_argument("--models", action="store_true")
    args = parser.parse_args()

    if args.login:
        login()
        return 0
    if args.logout:
        logout()
        return 0
    if args.auth_status:
        return auth_status()
    if args.models:
        token = ensure_access_token()
        for m in list_models(token):
            print(f"{m['slug']}\t{m['display_name']}")
        return 0

    here = Path(__file__).resolve().parent
    cfg_path = Path(args.config).resolve() if args.config else here / "zoeskoul-agent.json"
    cfg = load_config(cfg_path)
    repo = repo_root(Path(args.repo).resolve())

    for marker in cfg.get("required_repo_markers", []):
        if not (repo / str(marker)).exists():
            raise AgentError(f"Repo identity check failed: missing {marker}")

    gates = parse_gates(cfg)
    gate_index = 0
    if args.from_gate:
        names = [g.name for g in gates]
        if args.from_gate not in names:
            raise AgentError(f"Unknown gate {args.from_gate!r}")
        gate_index = names.index(args.from_gate)

    max_iterations = int(
        args.max_iterations if args.max_iterations is not None else cfg.get("max_iterations", 15)
    )

    log_root = Path(
        str(cfg.get("log_directory", "~/.zoeskoul-agent/zoeskoul-web-infra/runs"))
    ).expanduser()
    session = log_root / dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    session.mkdir(parents=True, exist_ok=False)

    branch = must_git(repo, ["branch", "--show-current"]).strip()
    head = must_git(repo, ["rev-parse", "HEAD"]).strip()
    status0 = must_git(repo, ["status", "--short"])

    (session / "status-before.txt").write_text(status0)
    (session / "diff-before.patch").write_text(must_git(repo, ["diff", "--binary"]))
    (session / "staged-before.patch").write_text(must_git(repo, ["diff", "--cached", "--binary"]))

    token = ensure_access_token()
    selected_model = choose_model(token, [str(x) for x in cfg.get("preferred_models", [])])

    (session / "session.json").write_text(
        json.dumps(
            {
                "version": VERSION,
                "auth": "ChatGPT plan",
                "model": selected_model,
                "repo": str(repo),
                "branch": branch,
                "head": head,
                "dirty_before": bool(status0.strip()),
                "whole_repo_read": True,
                "whole_repo_patch": True,
                "model_chosen_shell": False,
                "commit_push": False,
            },
            indent=2,
        ) + "\n"
    )

    print("=== ZOESKOUL CLOSURE AGENT V2.3 ===")
    print("mode=WHOLE_REPO_ENGINEER")
    print("auth=CHATGPT_PLAN")
    print(f"model={selected_model}")
    print(f"repo={repo}")
    print(f"preexisting_dirty={'YES' if status0.strip() else 'NO'}")
    print("whole_repo_read=YES")
    print("whole_repo_patch=YES")
    print("model_chosen_shell=NO")
    print("commit_or_push=DISABLED_BY_DESIGN")

    iteration = 0
    seen: dict[str, int] = {}
    final_cycle = 0

    while True:
        cfg = load_config(cfg_path)
        gates = parse_gates(cfg)

        if gate_index >= len(gates):
            final_cycle += 1
            print(f"\n=== FINAL VERIFICATION {final_cycle} ===")
            first_fail: Optional[int] = None

            for i, gate in enumerate(gates):
                r = run_shell(repo, gate.command, gate.timeout_seconds)
                (session / f"final-{final_cycle:02d}-{i+1:02d}-{gate.name}.log").write_text(r.combined)

                if r.returncode:
                    print(f"[FINAL] FAIL {gate.name}")
                    first_fail = i
                    break

                print(f"[FINAL] PASS {gate.name} ({r.elapsed:.1f}s)")

            if first_fail is None:
                dc = git(repo, ["diff", "--check"])
                if dc.returncode:
                    raise AgentError(dc.combined)

                (session / "status-after.txt").write_text(must_git(repo, ["status", "--short"]))
                (session / "diff-after.patch").write_text(must_git(repo, ["diff", "--binary"]))

                print("\n=== CLOSURE COMPLETE ===")
                print("ALL_GATES=PASS")
                print("FINAL_RERUN=PASS")
                print("git_diff_check=PASS")
                print("commit_or_push=NO")
                print(f"logs={session}")
                return 0

            if final_cycle >= int(cfg.get("max_final_verification_cycles", 3)):
                print("FINAL_VERIFICATION_LIMIT_REACHED=YES")
                return 3

            gate_index = first_fail
            continue

        gate = gates[gate_index]
        print(f"\n=== GATE {gate_index+1}/{len(gates)} {gate.name} ===")
        print(f"$ {gate.command}")

        r = run_shell(repo, gate.command, gate.timeout_seconds)
        (session / f"gate-{gate_index+1:02d}-{gate.name}-{iteration+1:02d}.log").write_text(r.combined)

        if r.returncode == 0:
            print(f"PASS {gate.name} ({r.elapsed:.1f}s)")
            gate_index += 1
            continue

        print(f"FAIL {gate.name} exit={r.returncode}")

        if not gate.repairable:
            print("gate_repairable=NO")
            return 4
        if iteration >= max_iterations:
            print(f"MAX_REPAIR_ITERATIONS_REACHED={max_iterations}")
            return 5

        failure_key = hashlib.sha256(
            (gate.name + "\n" + gate.command + "\n" + clip(r.combined, 80000)).encode()
        ).hexdigest()
        seen[failure_key] = seen.get(failure_key, 0) + 1

        if seen[failure_key] > int(cfg.get("stagnation_limit", 4)):
            print("STAGNATION_DETECTED=YES")
            return 6

        iteration += 1
        idir = session / f"iteration-{iteration:02d}-{gate.name}"
        idir.mkdir()

        status = must_git(repo, ["status", "--short"])
        src, paths = failure_source_context(
            repo,
            r.combined,
            int(cfg.get("max_direct_source_context_chars", 70000)),
        )

        relevant_diff = must_git(repo, ["diff", "--", *paths]) if paths else ""
        relevant_diff = clip(relevant_diff, int(cfg.get("max_relevant_diff_chars", 60000)))

        inst = base_instructions(cfg)
        prm = failure_prompt(gate, r, status, src, relevant_diff, iteration)

        (idir / "initial-prompt.txt").write_text(prm)
        (idir / "direct-source-context.txt").write_text(src)
        (idir / "relevant-diff.patch").write_text(relevant_diff)

        print(f"repair_iteration={iteration}/{max_iterations}")

        patch, stop_reason = investigate_until_patch(
            repo,
            cfg_path,
            cfg,
            gate,
            r,
            prm,
            inst,
            idir,
        )

        if patch is None:
            print("INVESTIGATION_EXHAUSTED")
            print(stop_reason or "No safe patch.")
            return 7

        patch_file = idir / "candidate.patch"
        patch_file.write_text(patch)

        try:
            touched = validate_patch(repo, patch, cfg)
        except Exception as exc:
            (idir / "rejected.txt").write_text(str(exc))
            print(f"PATCH_REJECTED: {exc}")
            continue

        (idir / "touched-paths.txt").write_text("\n".join(touched) + "\n")
        print("patch_paths=" + ",".join(touched))

        if args.dry_run:
            check = git(
                repo,
                ["apply", "--check", "--recount", str(patch_file)],
            )
            if check.returncode:
                print("DRY_RUN_PATCH_CHECK=FAIL")
                print(check.combined)
                return 8

            print("DRY_RUN_PATCH_CHECK=PASS")
            print("repo_modified=NO")
            print(f"candidate={patch_file}")
            return 0

        ok, apply_error = try_apply_patch(repo, patch_file)

        if not ok:
            (idir / "apply-rejected.txt").write_text(apply_error)
            print("PATCH_APPLY_REJECTED -> automatic_patch_self_repair=YES")
            repaired_patch, repaired_paths, repair_error = repair_rejected_patch(
                repo,
                cfg,
                inst,
                idir,
                patch,
                apply_error,
                touched,
            )

            if repaired_patch is None or repaired_paths is None:
                print("PATCH_SELF_REPAIR_EXHAUSTED")
                print(repair_error or apply_error)
                continue

            patch = repaired_patch
            touched = repaired_paths
            patch_file = idir / "candidate-repaired-final.patch"
            patch_file.write_text(patch)
            print("patch_apply=PASS_AFTER_SELF_REPAIR")

        (idir / "diff-after-apply.patch").write_text(
            must_git(repo, ["diff", "--binary"])
        )

        if "tools/zoeskoul-agent/zoeskoul-agent.json" in touched:
            print("agent_gate_config_changed=YES")
            cfg = load_config(cfg_path)
            gates = parse_gates(cfg)
            names = [g.name for g in gates]
            if gate.name not in names:
                raise AgentError(f"Current gate {gate.name!r} disappeared after config patch.")
            gate_index = names.index(gate.name)

        print("patch_apply=PASS")
        print("git_diff_check=PASS")
        print("rerun_same_gate=YES")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nINTERRUPTED")
        print("commit_or_push=NO")
        raise SystemExit(130)
    except (AgentError, AuthError) as exc:
        print(f"\nAGENT_ERROR: {exc}", file=sys.stderr)
        print("commit_or_push=NO", file=sys.stderr)
        raise SystemExit(2)
