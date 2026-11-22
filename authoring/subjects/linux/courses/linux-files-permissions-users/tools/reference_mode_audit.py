#!/usr/bin/env python3
"""Read-only local demonstration of exact mode checks; NOT a production Runner grader.

The production grader must run inside an authenticated isolated executor and use
no-follow, handle-relative filesystem access to defend against concurrent symlink
races, along with fixture lease/ownership and executor lifecycle constraints.
"""
from __future__ import annotations
from pathlib import Path
from stat import S_IMODE, S_ISDIR, S_ISREG
import os

TARGETS = {
    '.': ('directory', 0o755),
    'README.md': ('regular_file', 0o644),
    'scripts': ('directory', 0o700),
    'scripts/run.sh': ('regular_file', 0o700),
    'secrets.env': ('regular_file', 0o600),
    'shared': ('directory', 0o770),
}
DIRECTORY_CHILDREN = {
    '.': {'README.md','scripts','secrets.env','shared'},
    'scripts': {'run.sh'},
    'shared': set(),
}

def audit(root: Path, owner_uid: int | None = None) -> list[str]:
    """Inspect a trusted isolated learner fixture; return descriptive errors.

    This function is not race-proof; never deploy it as an untrusted filesystem
    gateway. It does not execute code or modify any entry.
    """
    root = Path(root)
    owner_uid = os.getuid() if owner_uid is None else owner_uid
    failures: list[str] = []
    for rel, (kind, expected) in TARGETS.items():
        path = root if rel == '.' else root / rel
        # Deny symlinks in every relevant component before stat. lstat checks
        # the named node and does not follow the final path component.
        chain = [root]
        if rel != '.':
            parts = Path(rel).parts
            chain += [root.joinpath(*parts[:n]) for n in range(1,len(parts)+1)]
        try:
            for part in chain:
                if part.is_symlink():
                    failures.append(f'{rel}: symlink component is forbidden')
                    raise ValueError('link')
            st = path.lstat()
        except (FileNotFoundError, NotADirectoryError):
            failures.append(f'{rel}: missing entry')
            continue
        except ValueError:
            continue
        if st.st_uid != owner_uid:
            failures.append(f'{rel}: owner mismatch')
        if not (S_ISDIR(st.st_mode) if kind == 'directory' else S_ISREG(st.st_mode)):
            failures.append(f'{rel}: expected {kind}')
            continue
        mode = S_IMODE(st.st_mode)
        if mode != expected:
            failures.append(f'{rel}: mode is {mode:03o}, expected {expected:03o}')
    for rel, expected_names in DIRECTORY_CHILDREN.items():
        dir_path = root if rel == '.' else root / rel
        if dir_path.is_symlink() or not dir_path.is_dir():
            continue
        actual_names = {p.name for p in dir_path.iterdir()}
        extras = actual_names - expected_names
        if extras:
            failures.append(f'{rel}: unexpected entries {sorted(extras)}')
    return failures
