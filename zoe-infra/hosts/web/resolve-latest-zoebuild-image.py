#!/usr/bin/env python3
"""Resolve a single immutable GHCR image tag from a successful manual workflow.

The build workflow publishes both app and signer images with github.sha only.
No 'latest' or mutable 'prod' tags are used. Never prints credentials.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

SHA = re.compile(r"^[a-f0-9]{40}$")
OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+$")


def read_env(path):
    result = {}
    for number, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"malformed entry at {path.name}:{number}")
        name, value = line.split("=", 1)
        name = name.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name):
            raise ValueError(f"invalid variable name at {path.name}:{number}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[name] = value
    return result


def select_run(payload, repo_name):
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        raise ValueError("GitHub API did not return workflow_runs")
    eligible = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        head_repo = run.get("head_repository") or {}
        if (run.get("conclusion") == "success"
            and run.get("status") == "completed"
            and run.get("event") == "workflow_dispatch"
            and run.get("head_branch") == "main"
            and str(head_repo.get("full_name", "")).lower() == repo_name.lower()
            and SHA.fullmatch(str(run.get("head_sha", "")))):
            eligible.append(run)
    if not eligible:
        raise ValueError("no successful manual main-branch ZoeBuild image workflow found")
    latest = max(eligible, key=lambda r: (r.get("run_number") or 0, r.get("id") or 0))
    return latest["head_sha"]


def resolve(owner, repo, explicit):
    if explicit:
        if not SHA.fullmatch(explicit):
            raise ValueError("explicit image tag must be a lowercase 40-character commit SHA")
        return explicit
    api = (f"https://api.github.com/repos/{repo}/actions/workflows/"
           "build-zoebuild-image.yml/runs?branch=main&status=success&per_page=100")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "zoebuild-web-host-deploy/1",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GH_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(api, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"GitHub workflow API returned HTTP {exc.code}; if private, supply GH_TOKEN with Actions read access") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ValueError("could not reach GitHub workflow API (network unavailable or timed out)") from None
    return select_run(result, repo)


def main(args):
    if len(args) != 2:
        raise ValueError("usage: resolve-latest-zoebuild-image.py path/to/.env.zoebuild [40-char-sha-or-empty]")
    path, explicit = args
    cfg = read_env(Path(path))
    owner = cfg.get("GHCR_OWNER", "")
    if not OWNER.fullmatch(owner):
        raise ValueError("GHCR_OWNER must be a valid GitHub account or organization")
    repo = cfg.get("GITHUB_SOURCE_REPO", f"{owner}/zoeskoul.com")
    parts = repo.split("/")
    if len(parts) != 2 or not OWNER.fullmatch(parts[0]) or not REPOSITORY.fullmatch(parts[1]):
        raise ValueError("GITHUB_SOURCE_REPO must be 'owner/repository'")
    if parts[0].lower() != owner.lower():
        raise ValueError("GITHUB_SOURCE_REPO owner must equal GHCR_OWNER")
    sha = resolve(owner, repo, explicit)
    print(owner.lower() + " " + sha)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"IMAGE_RESOLUTION_FAILED: {error}", file=sys.stderr)
        sys.exit(1)
