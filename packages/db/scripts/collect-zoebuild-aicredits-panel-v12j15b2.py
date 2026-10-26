#!/usr/bin/env python3
"""Read-only collector for the CURRENT divergent credit balance UI. No .env/secrets."""
import sys,hashlib,zipfile
from pathlib import Path
REL='apps/zoebuild/src/app/[locale]/billing/AiCreditsPanel.tsx'
def run():
    if len(sys.argv)!=3:raise SystemExit('usage: collect-zoebuild-aicredits-panel-v12j15b2.py ABS_REPO ABS_OUTPUT_ZIP')
    repo=Path(sys.argv[1]).expanduser().resolve();out=Path(sys.argv[2]).expanduser().resolve()
    if not (repo/'apps/zoebuild').is_dir():raise SystemExit('REPO_INVALID')
    src=repo/REL
    if not src.is_file() or src.is_symlink():raise SystemExit('PANEL_MISSING_OR_SYMLINK')
    if out.exists():raise SystemExit('OUTPUT_EXISTS_REFUSE_OVERWRITE')
    data=src.read_bytes()
    if len(data)>150000:raise SystemExit('PANEL_TOO_LARGE')
    out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(REL,data)
        archive.writestr('SOURCE.txt',f'path={REL}\nsha256={hashlib.sha256(data).hexdigest()}\n')
    print(f'V12J15B2_PANEL_SOURCE_PASS bytes={len(data)} sha256={hashlib.sha256(data).hexdigest()}')
    print('READ_ONLY=YES ENV=NO DB=NO STRIPE=NO GIT=NO CHANGES=NO')
    print('REVIEW_BEFORE_UPLOAD=YES')
if __name__=='__main__':run()
