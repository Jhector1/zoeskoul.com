#!/usr/bin/env python3
"""Read-only: collect the browser edit/intent callers needed for V12J.16C.
Does not read hidden/env files, credentials, DB, or invoke a toolchain.
"""
from pathlib import Path
import hashlib, json, sys, zipfile

PATTERNS = (b"assistant/edit", b"assistant/intent", b"X-ZoeBuild-Ai-Operation-Id",
            b"ZOE_AI_OPERATION_HEADER", b"pendingFileEdit")
EXT = {".tsx", ".ts"}

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: collector.py REPO OUTPUT.zip")
    repo = Path(sys.argv[1]).resolve(strict=True)
    dest = Path(sys.argv[2]).resolve()
    if dest.exists():
        raise SystemExit("REFUSED_OUTPUT_EXISTS")
    base = repo / "apps/zoebuild/src"
    if not base.is_dir():
        raise SystemExit("REFUSED_NOT_ZOEBUILD_REPO")
    matches=[]
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix not in EXT or path.is_symlink():
            continue
        if any(part in {"node_modules", ".next", "__generated__"} for part in path.parts):
            continue
        relative=path.relative_to(repo).as_posix()
        # Do not collect broad server-owned source here; already included in V12J.16A.
        if "/api/" in relative or "/lib/build/" in relative or "/lib/auth/" in relative:
            continue
        if path.stat().st_size>90_000:
            continue
        content=path.read_bytes()
        if any(pattern in content for pattern in PATTERNS):
            matches.append((relative,content))
    matches.sort()
    if len(matches)>30:
        raise SystemExit("REFUSED_TOO_MANY_UI_FILES")
    dest.parent.mkdir(parents=True,exist_ok=True)
    manifest={"readOnly":True,"files":[{"path":p,"sha256":hashlib.sha256(b).hexdigest()} for p,b in matches]}
    with zipfile.ZipFile(dest,"x",compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json",json.dumps(manifest,indent=2))
        for p,b in matches:
            z.writestr("source/"+p,b)
    print(f"V12J16B_EDIT_UI_SOURCE_PASS files={len(matches)} bytes={sum(len(b) for _,b in matches)}")
    print("READ_ONLY=YES ENV=NO DB=NO PROVIDER=NO STRIPE=NO GIT=NO")
    print("REVIEW_BEFORE_UPLOAD=YES")

if __name__ == "__main__":
    main()
