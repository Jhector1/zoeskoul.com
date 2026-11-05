#!/usr/bin/env python3
"""Fail-closed ZoeBuild image-release resolver and two-key pin updater.

Uses only Python's standard library. Does not persist an API token or print
.env contents. All release inputs are tied to the exact GitHub main commit.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = "Jhector1/zoeskoul.com"
WORKFLOW = "build-images.yml"
SHA = re.compile(r"^[a-f0-9]{40}$")
DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$")


def fail(message: str) -> None:
    raise SystemExit("ERROR: " + message)


def request_json(endpoint: str) -> dict:
    base = "https://api.github.com"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "zoebuild-immutable-release-resolver",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(base + endpoint, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        fail("GitHub API unavailable (" + type(exc).__name__ + "). Set GH_TOKEN if the repository is private. No deployment performed.")


def resolve_main(get_json=request_json) -> str:
    repo = "/repos/" + REPOSITORY
    branch = get_json(repo + "/branches/main")
    head = branch.get("commit", {}).get("sha", "")
    if not SHA.fullmatch(head):
        fail("invalid latest main commit SHA")
    query = urllib.parse.urlencode({"branch": "main", "event": "push", "per_page": 100})
    runs = get_json(repo + "/actions/workflows/" + WORKFLOW + "/runs?" + query)
    matches = [
        run for run in runs.get("workflow_runs", [])
        if run.get("head_sha") == head
        and run.get("event") == "push"
        and run.get("head_branch") == "main"
    ]
    if not matches:
        fail("no main-push production image workflow found for latest commit " + head[:12])
    # GitHub includes reruns with the same run id; use the most recent attempt.
    newest = max(matches, key=lambda run: (int(run.get("run_number") or 0), int(run.get("run_attempt") or 0)))
    if newest.get("status") != "completed" or newest.get("conclusion") != "success":
        fail("latest main image workflow is not successful (status="
             + str(newest.get("status")) + ", conclusion="
             + str(newest.get("conclusion")) + "); refusing stale image fallback")
    return head


def ref_from_digests(repository: str, raw: str) -> str:
    if not re.fullmatch(r"ghcr\.io/[a-z0-9_-]+/zoeskoul-(runner|runtime)", repository):
        fail("invalid GHCR repository")
    try:
        values = json.loads(raw)
    except ValueError:
        fail("Docker returned invalid RepoDigests JSON")
    if not isinstance(values, list):
        fail("Docker RepoDigests is not an array")
    refs = [value for value in values
            if isinstance(value, str) and value.startswith(repository + "@")
            and DIGEST.fullmatch(value[len(repository) + 1:])]
    if len(set(refs)) != 1:
        fail("no unique validated digest for " + repository)
    return refs[0]


def write_pins(env_file: Path, runner: str, runtime: str, owner: str) -> None:
    if not re.fullmatch(r"[a-z0-9_-]+", owner):
        fail("invalid GHCR owner")
    for value, name in ((runner, "runner"), (runtime, "runtime")):
        expected = f"ghcr.io/{owner}/zoeskoul-{name}@"
        if not value.startswith(expected) or not DIGEST.fullmatch(value[len(expected):]):
            fail(f"invalid immutable {name} image reference")
    if env_file.is_symlink() or not env_file.is_file():
        fail("refusing missing or symlinked pool .env")
    old_stat = env_file.stat()
    lines = env_file.read_text(encoding="utf-8").splitlines(keepends=True)
    replacements = {"RUNNER_SERVICE_IMAGE_REF": runner, "RUNNER_IMAGE_REF": runtime}
    counts = {key: 0 for key in replacements}
    result = []
    for line in lines:
        match = re.match(r"^(RUNNER_SERVICE_IMAGE_REF|RUNNER_IMAGE_REF)=", line)
        if match:
            key = match.group(1)
            counts[key] += 1
            result.append(f"{key}={replacements[key]}\n")
        else:
            result.append(line)
    if counts != {key: 1 for key in replacements}:
        fail("pin variables must each appear exactly once in ZoeBuild .env")
    fd, temp_name = tempfile.mkstemp(prefix=".zoebuild-image-pins-", dir=str(env_file.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.writelines(result)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(temp_name, stat.S_IMODE(old_stat.st_mode))
        if (old_stat.st_uid, old_stat.st_gid) != (os.geteuid(), os.getegid()):
            os.chown(temp_name, old_stat.st_uid, old_stat.st_gid)
        os.replace(temp_name, env_file)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    args = sys.argv[1:]
    if args == ["resolve-main"]:
        print(resolve_main())
    elif len(args) == 3 and args[0] == "ref-from-digests":
        print(ref_from_digests(args[1], args[2]))
    elif len(args) == 5 and args[0] == "write-pins":
        write_pins(Path(args[1]), args[2], args[3], args[4])
    else:
        fail("usage: resolve-main | ref-from-digests REPO JSON | write-pins ENV RUNNER_REF RUNTIME_REF OWNER")

if __name__ == "__main__":
    main()
