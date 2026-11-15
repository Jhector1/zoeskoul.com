#!/usr/bin/env python3
"""Synthetic regression tests against provided, exact Stage 4B9BF3B source snapshot."""
import argparse
import shutil
import tempfile
from pathlib import Path
from audit import run, CANONICAL, DRAFT, RUNNER, REQUIRED

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, required=True)
args = parser.parse_args()
SOURCE = args.repo.resolve()
if not SOURCE.is_dir():
    raise SystemExit('MISSING_REPO: provide your source checkout with --repo')


def copy():
    d = tempfile.TemporaryDirectory()
    root = Path(d.name)
    for relative in REQUIRED:
        source_file = SOURCE / relative
        if not source_file.is_file():
            raise AssertionError(f'Missing baseline file: {relative}')
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, target)
    return d, root


def check(name, change, expected):
    d, root = copy()
    try:
        if change is not None:
            change(root)
        out = run(root)
        if out['result'] != expected:
            raise AssertionError((name, expected, out['findings']))
        print('PASS', name)
    finally:
        d.cleanup()


def inject_rogue_writer(root):
    f = root / 'apps/web/src/lib/practice/rogueStudentGrader.ts'
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text('export async function rogue() { return await persistValidatedAttempt(null as any, {} as any); }\n')


def inject_rogue_grader(root):
    f = root / 'apps/web/src/lib/practice/rogueStudentGrader.ts'
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text('export async function rogue() { return await gradeInstance({} as any); }\n')


def insert_draft_writer(root):
    f = root / DRAFT
    f.write_text(f.read_text() + '\nvoid prisma.practiceAttempt.create({});\n')


def remove_single_match(root):
    f = root / RUNNER
    f.write_text(f.read_text().replace('matching.length !== 1', 'matching.length < 1'))


def duplicate_handler_attempt(root):
    f = root / CANONICAL
    f.write_text(f.read_text() + '\nvoid persistValidatedAttempt(null as any, {} as any);\n')

check('known canonical and QA topology passes', None, 'PASS')
check('unapproved attempt writer fails', inject_rogue_writer, 'FAIL')
check('unapproved grader fails', inject_rogue_grader, 'FAIL')
check('draft QA attempt write fails', insert_draft_writer, 'FAIL')
check('ambiguous session acceptance fails', remove_single_match, 'FAIL')
check('duplicate handler persistence fails', duplicate_handler_attempt, 'FAIL')
print('STAGE4B9BF3B_V2_SYNTHETIC_TESTS_PASS')
