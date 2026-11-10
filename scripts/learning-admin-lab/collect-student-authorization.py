#!/usr/bin/env python3
"""Read-only current-code exporter for Course 2 entitlement and assessment integration.

Exports source text only: no .env, keys, node_modules, Git history, or file contents
outside selected source roots. Review the ZIP before uploading.
"""
import argparse
import json
import re
import zipfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--repo',required=True)
p.add_argument('--output',required=True)
a=p.parse_args()
repo=Path(a.repo).resolve(strict=True)
if not (repo/'apps/web/package.json').is_file() or not (repo/'apps/runner/package.json').is_file():
    p.error('Expected Zoéskoul monorepo root')
out=Path(a.output).expanduser().resolve()
if out.is_relative_to(repo): p.error('Output must be outside repository')
roots=('apps/web/src/app/api/learning','apps/web/src/lib/learning',
       'apps/web/src/lib/server','apps/web/src/app/api/run/pty',
       'apps/web/src/components/code','apps/student/src',
       'packages/learning-contracts/src','packages/curriculum-compiler/src')
explicit=('apps/web/src/lib/practice/actor.ts',
          'apps/web/src/lib/server/runnerActorKey.ts',
          'apps/web/src/lib/server/runnerClient.ts',
          'apps/web/src/app/api/run/pty/sessions/start/route.ts',
          'apps/web/src/app/api/run/pty/sessions/ensure/route.ts')
pattern=re.compile(r'courseAccess|course.*entitle|enroll|published.*topic|code_input|tryIt|runnerPost|ptySession|lesson.*access|grade|assessment',re.I)
items={}
for rel in explicit:
  file=repo/rel
  if file.is_file() and not file.is_symlink() and file.stat().st_size<300000:
    items[rel]=file
for root in roots:
  d=repo/root
  if not d.is_dir() or d.is_symlink():continue
  for file in d.rglob('*'):
    if len(items)>=85:break
    if not file.is_file() or file.is_symlink() or file.suffix not in ('.ts','.tsx') or file.stat().st_size>200000: continue
    rel=file.relative_to(repo).as_posix()
    if '/node_modules/' in '/'+rel or '.env' in file.name or '.secret' in file.name:continue
    try: data=file.read_text()
    except UnicodeError:continue
    if pattern.search(data):items[rel]=file
  if len(items)>=85:break
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for rel,file in sorted(items.items()):z.write(file,rel)
  z.writestr('_manifest.json',json.dumps({'source_count':len(items),'note':'Review source for secrets before sharing'},indent=2))
print('EXPORTED_STUDENT_SOURCE_FILES='+str(len(items)))
print('OUTPUT='+str(out))
print('READ_ONLY_REVIEW_BEFORE_SHARING')
