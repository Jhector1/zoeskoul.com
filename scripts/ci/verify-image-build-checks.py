#!/usr/bin/env python3
"""Fail-closed, image-specific GitHub Actions verification for GHCR promotion.

Checks the published workflow's *completed job steps* for an exact full commit
SHA on main. Overall workflow failure is deliberately not sufficient to reject
a successful Runner job if Web failed independently.
"""
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

WORKFLOW = "build-images.yml"
JOB_NAMES = {"web": "Build web image", "runner": "Build runner image", "runtime": "Build runtime image"}
REQUIRED_STEPS = ("Build and publish immutable image", "Record published candidate digest")
MAX_PAGES = 10  # API filter limits this search to 1,000 workflow runs per SHA.


class GateError(Exception):
    pass


def require_environment():
    sha = os.getenv("TARGET_COMMIT", "")
    component = os.getenv("TARGET_COMPONENT", "")
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GH_API_TOKEN", "")
    base_url = os.getenv("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise GateError("TARGET_COMMIT must be the full lowercase commit SHA")
    if component not in (*JOB_NAMES, "all"):
        raise GateError("invalid TARGET_COMPONENT")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise GateError("invalid GITHUB_REPOSITORY")
    if not token:
        raise GateError("GH_API_TOKEN is required; Actions: read permission must be granted")
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")
    ):
        raise GateError("GitHub API must be HTTPS (except loopback in tests)")
    if not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise GateError("invalid GITHUB_API_URL")
    return sha, component, repo, token, base_url


def request_json(base_url, token, endpoint, params):
    url = base_url + endpoint + ("?" + urlencode(params) if params else "")
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "zoeskoul-ci-promotion-gate",
    })
    try:
        with urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise GateError(f"GitHub API returned status {response.status}")
            data = json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        # Do not print response bodies or credentials (may contain sensitive data).
        if isinstance(exc, HTTPError):
            raise GateError(f"GitHub Actions API HTTP {exc.code}: failed closed") from None
        raise GateError(f"GitHub Actions API unavailable or invalid JSON ({type(exc).__name__}): failed closed") from None
    if not isinstance(data, dict):
        raise GateError("GitHub Actions API response is not an object")
    return data


def collect_pages(base_url, token, endpoint, key, params):
    items = []
    for page in range(1, MAX_PAGES + 1):
        data = request_json(base_url, token, endpoint, {**params, "per_page": 100, "page": page})
        rows = data.get(key)
        if not isinstance(rows, list):
            raise GateError(f"GitHub Actions response missing {key}")
        items.extend(rows)
        if len(rows) < 100:
            return items
    raise GateError("GitHub API search exceeded 1000 results: failed closed")


def candidate_run(run, sha):
    if not isinstance(run, dict):
        return False
    return (run.get("head_sha") == sha and run.get("head_branch") == "main"
            and run.get("event") in ("push", "workflow_dispatch")
            and run.get("status") == "completed"
            and isinstance(run.get("id"), int) and run["id"] > 0
            and run.get("path", "").split("@")[0] == f".github/workflows/{WORKFLOW}")


def successful_job(job, name):
    if not isinstance(job, dict):
        return False
    if job.get("name") != name or job.get("status") != "completed" or job.get("conclusion") != "success":
        return False
    steps = job.get("steps", [])
    if not isinstance(steps, list):
        return False
    for needed in REQUIRED_STEPS:
        matches = [step for step in steps if isinstance(step, dict) and step.get("name") == needed]
        if len(matches) != 1 or matches[0].get("status") != "completed" or matches[0].get("conclusion") != "success":
            return False
    return True


def verify():
    sha, component, repo, token, base_url = require_environment()
    repo_path = "/repos/" + "/".join(quote(x, safe="") for x in repo.split("/"))
    runs = collect_pages(base_url, token,
                         f"{repo_path}/actions/workflows/{WORKFLOW}/runs",
                         "workflow_runs", {"head_sha": sha, "branch": "main"})
    candidates = [run for run in runs if candidate_run(run, sha)]
    selected = list(JOB_NAMES) if component == "all" else [component]
    pending = set(selected)
    evidence = {}
    for run in candidates:
        jobs = collect_pages(base_url, token, f"{repo_path}/actions/runs/{run['id']}/jobs",
                             "jobs", {"filter": "latest"})
        for image in list(pending):
            if any(successful_job(job, JOB_NAMES[image]) for job in jobs):
                evidence[image] = (run["id"], run.get("html_url", ""))
                pending.remove(image)
        if not pending:
            break
    if pending:
        raise GateError("no completed, successful image build+digest check for commit "
                        + sha + ": " + ", ".join(sorted(pending)))
    for image in selected:
        run_id, url = evidence[image]
        print(f"CI_CHECK_PASS {image} {sha} run={run_id} {url}")
        summary = os.getenv("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as out:
                out.write(f"- CI check: `{image}` at `{sha}` — run `{run_id}` (build + digest steps passed)\n")
    print(f"CI_PROMOTION_GATE_PASS {len(selected)} image(s)")


if __name__ == "__main__":
    try:
        verify()
    except (GateError, OSError) as exc:
        print(f"CI_PROMOTION_GATE_BLOCKED: {exc}", file=sys.stderr)
        sys.exit(2)
