#!/usr/bin/env python3
"""PUB3A2: bounded multi-project development operator; no HTTP or public routing.

One process handles exactly one allowlisted project. Reuse the existing pilot
controller and sandbox, but never switch its module-global ROOT in a server.
The legacy pilot keeps its current pointer, storage and gateway unchanged.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import stat
import sys

import control
import pilot

ALLOWLIST = control.TOOLS / "hosted-projects.json"
MAX_PROJECTS = 2


def private_directory(path):
    """Create/check a directory below an already trusted operator directory."""
    path.mkdir(mode=0o700, exist_ok=True)
    st = path.lstat()
    pilot.require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid()
                  and stat.S_IMODE(st.st_mode) == 0o700,
                  "Unsafe hosted project directory")
    return path


def select_project(project, legacy_cfg, allowlist, legacy_root):
    pilot.require(isinstance(project, str) and pilot.ID.fullmatch(project),
                  "Invalid project identity")
    pilot.require(isinstance(allowlist, dict) and set(allowlist) == {"projectIds"},
                  "Hosted allowlist shape")
    ids = allowlist["projectIds"]
    pilot.require(isinstance(ids, list) and 0 < len(ids) <= MAX_PROJECTS
                  and all(isinstance(x, str) and pilot.ID.fullmatch(x) for x in ids),
                  "Hosted allowlist identity")
    pilot.require(len(set(ids)) == len(ids) and legacy_cfg["projectId"] not in ids,
                  "Legacy project or duplicate in hosted allowlist")
    pilot.require(project in ids, "Project not allowlisted")
    # A removed project must be explicitly reviewed/retired before capacity is
    # reused. Never silently abandon retained containers or active pointers.
    parent = private_directory(legacy_root.parent / "hosted-publish-dev")
    root_lock = parent / "projects.lock"
    fd = os.open(root_lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        st = os.fstat(fd)
        pilot.require(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid()
                      and stat.S_IMODE(st.st_mode) == 0o600, "Unsafe hosted allocation lock")
        fcntl.flock(fd, fcntl.LOCK_EX)
        for child in parent.iterdir():
            if child.name == "projects.lock":
                continue
            pilot.require(child.name in ids, "Existing hosted project requires operator review")
            st = child.lstat()
            pilot.require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid()
                          and stat.S_IMODE(st.st_mode) == 0o700, "Unsafe hosted project directory")
        root = private_directory(parent / project)
    finally:
        os.close(fd)
    return {**legacy_cfg, "projectId": project}, root


def dispatch(cfg, operation, raw=b""):
    # Only call after binding ROOT in a fresh, single-project CLI process.
    if operation in ("fenced-init", "fenced-ack", "fenced-apply"):
        import hosted_fenced_provider as fenced
        if operation == "fenced-init": return fenced.initialize(cfg)
        if operation == "fenced-ack": return fenced.status(cfg)
        return fenced.apply(cfg, raw)
    if operation == "activate":
        return control.activate(cfg, raw)
    if operation == "manage":
        pilot.require(0 < len(raw) <= 4096, "Management input limit")
        return control.manage(cfg, pilot.unique_json(raw))
    if operation == "history":
        with control.activation_lock():
            return control.history(cfg)
    if operation == "status":
        return control.status(cfg)
    raise ValueError("Unsupported hosted operation")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project")
    parser.add_argument("operation", choices=("activate", "status", "history", "manage", "fenced-init", "fenced-ack", "fenced-apply"))
    args = parser.parse_args()
    # Existing dev-host guard, exact pinned image and operator config validation.
    legacy = control.configuration()
    cfg, root = select_project(args.project, legacy, control.read_private(ALLOWLIST), pilot.ROOT)
    pilot.ROOT = root
    limit = pilot.MAX_OBJECT + 1 if args.operation == "activate" else 4097 if args.operation == "manage" else 0
    if args.operation == "fenced-apply": limit = pilot.MAX_OBJECT + 16386
    raw = sys.stdin.buffer.read(limit) if limit else b""
    print(json.dumps(dispatch(cfg, args.operation, raw), separators=(",", ":")), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as exc:
        print("HOSTED_CONTROL_FAILED=" + type(exc).__name__, file=sys.stderr, flush=True)
        raise SystemExit(1)
