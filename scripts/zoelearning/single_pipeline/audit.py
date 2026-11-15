#!/usr/bin/env python3
"""Read-only, fail-closed ZoeLearning student grading topology regression audit.

Static checks are intentionally narrow: finding an unexpected site requires review,
not automatic deletion. This cannot establish deployed/runtime route behavior.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

CANONICAL = 'apps/web/src/lib/practice/api/validate/handler.ts'
REPO = 'apps/web/src/lib/practice/api/validate/repositories/attempt.repo.ts'
DRAFT = 'apps/web/src/app/api/admin/curriculum-drafts/practice/validate/route.ts'
ADMIN_QA = 'apps/web/src/app/api/admin/curriculum-drafts/admin-lab/verify/route.ts'
PRACTICE_ROUTE = 'apps/web/src/app/api/practice/validate/route.ts'
STUDENT_ROUTE = 'apps/web/src/app/api/student/runtime/practice/validate/route.ts'
REVIEW = 'apps/web/src/app/api/review/progress/route.ts'
ADAPTER = 'apps/web/src/lib/practice/api/validate/grade/verifyAdminLabFilesystem.ts'
RUNNER = 'apps/runner/src/services/execution/adminFilesystemEvidence.ts'
RUNNER_ROUTE = 'apps/runner/src/routes/sessions.admin.verifyFilesystem.ts'
DEV_ALIAS = 'apps/web/src/app/api/dev/curriculum-drafts/practice/validate/route.ts'
GRADE_EXPORT = 'apps/web/src/lib/practice/api/validate/services/grading.service.ts'

ALLOWED = {
    'attempt_persistence_calls': {CANONICAL: 1, REPO: 1},
    'grading_calls': {CANONICAL: 1, DRAFT: 1},
    'filesystem_adapter_calls': {CANONICAL: 1},
    'runner_filesystem_posts': {ADAPTER: 1, ADMIN_QA: 1},
    'practice_attempt_mutations': {REPO: 1},
}

# A syntax-aware parser would be stronger; we skip test and fixture sources and
# tolerate declaration lines. All unexpected sites are reported for review.
PATTERNS = {
    'attempt_persistence_calls': re.compile(r'\bpersistValidatedAttempt\s*\('),
    'grading_calls': re.compile(r'\bgradeInstance\s*\('),
    'filesystem_adapter_calls': re.compile(r'\badminVerifier\s*\('),
    'runner_filesystem_posts': re.compile(r"runnerPost\s*(?:<[^>]*>)?\s*\(\s*['\"]/sessions/admin/verify-filesystem['\"]", re.S),
    'practice_attempt_mutations': re.compile(r'\.\s*practiceAttempt\s*\.\s*(?:create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\('),
}

REQUIRED = {
    CANONICAL: ('function handlePracticeValidate(', 'persistValidatedAttempt(prisma,', 'gradeInstance({', 'verifyAdminLabFilesystemForPractice', 'if (graded.infrastructureFailure)', 'awardValidateGamification({'),
    REPO: ('function persistValidatedAttempt(', 'pg_advisory_xact_lock', 'tx.practiceAttempt.create({', 'function persistAttemptAndFinalize(', 'await persistValidatedAttempt(prisma,'),
    DRAFT: ('runAdminCurriculumDraftRoute(', 'isCurriculumDraftEditorEnabled()', 'buildDraftQaInstance(', 'await gradeInstance({', 'draftQa: true', 'attempts: null', 'gamification: null'),
    ADMIN_QA: ('runAdminCurriculumDraftRoute(', 'loadDraftAdminQaExpected(', 'checkDraftAdminQaRequest(', 'runnerPost<', 'attempts: null', 'gamification: null'),
    PRACTICE_ROUTE: ('handlePracticeValidate(',),
    STUDENT_ROUTE: ('handlePracticeValidate(',),
    ADAPTER: ('function verifyAdminLabFilesystemForPractice(', 'authorizeStudentAdminLab(', 'requireRunnerActorKey()', 'actorKeyOf(args.actor) !== actorKey', 'createRunnerUnavailableGradeResult('),
    REVIEW: ('prisma.reviewProgress.create(', 'prisma.reviewProgress.updateMany(', 'prisma.reviewProgress.deleteMany('),
    RUNNER: ('getActiveSessionsForActor(', 'matching.length !== 1', 'verifyAdminWorkspaceVolume(', 'verifyLearnerContainer(', 'inspectWithSidecar(', 'assertAdminLabSwitch('),
    RUNNER_ROUTE: ('getRequiredActorKey(', 'verifyAdminFilesystem('),
    DEV_ALIAS: ('export { POST, OPTIONS } from "@/app/api/admin/curriculum-drafts/practice/validate/route"',),
    GRADE_EXPORT: ('export {gradeInstance} from "@/lib/practice/api/validate/grade"',),
}

FORBIDDEN_QA = ('persistValidatedAttempt(', 'persistAttemptAndFinalize(', 'handlePracticeValidate(',
                'practiceAttempt.create(', 'practiceAttempt.update(', 'practiceSession.update(',
                'awardValidateGamification(', 'awardReviewProgressGamification(')


def is_real_source(path: Path) -> bool:
    name = path.name
    if path.suffix.lower() not in ('.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'):
        return False
    if name.endswith(('.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.d.ts', '.test.js', '.spec.js')):
        return False
    if '__tests__' in path.parts or '__fixtures__' in path.parts or 'fixtures' in path.parts:
        return False
    return True


def occurrences(root: Path) -> tuple[dict, int]:
    sites = {category: [] for category in PATTERNS}
    num_files = 0
    for folder in ('apps/web/src', 'apps/runner/src', 'packages'):
        directory = root / folder
        if not directory.is_dir():
            continue
        for path in directory.rglob('*'):
            if not path.is_file() or not is_real_source(path) or any(p in path.parts for p in ('node_modules', '.next', 'dist', 'build')):
                continue
            num_files += 1
            src = path.read_text(encoding='utf-8', errors='replace')
            rel = path.relative_to(root).as_posix()
            for category, pattern in PATTERNS.items():
                for match in pattern.finditer(src):
                    if category != 'runner_filesystem_posts':
                        line_start = src.rfind('\n', 0, match.start()) + 1
                        line_prefix = src[line_start:match.start()]
                        if re.search(r'\b(?:function|declare\s+function)\s*$', line_prefix):
                            continue
                        # Common comment line should not create a false call site.
                        if line_prefix.lstrip().startswith(('//', '*')):
                            continue
                    sites[category].append({'file': rel, 'line': src.count('\n', 0, match.start()) + 1})
    return sites, num_files


def run(root: Path) -> dict:
    errors: list[str] = []
    checks: list[str] = []
    for relative, markers in REQUIRED.items():
        path = root / relative
        if not path.is_file():
            errors.append(f'MISSING_REQUIRED_FILE: {relative}')
            continue
        contents = path.read_text(encoding='utf-8')
        for marker in markers:
            if marker not in contents:
                errors.append(f'MISSING_REQUIRED_INVARIANT: {relative}: {marker}')
        checks.append(relative)

    for qa in (DRAFT, ADMIN_QA):
        p = root / qa
        if p.is_file():
            src = p.read_text(encoding='utf-8')
            for marker in FORBIDDEN_QA:
                if marker in src:
                    errors.append(f'DRAFT_QA_STUDENT_PERSISTENCE_OR_GRADE_AWARD: {qa}: {marker}')

    rp = root / REVIEW
    if rp.is_file():
        src = rp.read_text(encoding='utf-8')
        if any(x in src for x in ('practiceAttempt.create(', 'practiceAttempt.update(', 'practiceSession.update(')):
            errors.append('REVIEW_PROGRESS_WRITES_PRACTICE_SCORE')

    sites, num_files = occurrences(root)
    for category, expected in ALLOWED.items():
        found: dict[str, int] = {}
        for site in sites[category]:
            found[site['file']] = found.get(site['file'], 0) + 1
        if found != expected:
            errors.append(f'UNEXPECTED_{category.upper()}: expected {expected}, observed {found}')

    git_head = ''
    if (root / '.git').exists():
        try:
            git_head = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True, timeout=4).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            git_head = 'unavailable'

    return {
        'audit': 'stage4b9bf3b-single-student-grading-pipeline-v2',
        'result': 'PASS' if not errors else 'FAIL',
        'git_head': git_head,
        'source_files_scanned': num_files,
        'classified_sites': sites,
        'checked_files': checks,
        'findings': errors,
        'classification': {
            'attempt_repo_wrapper': 'Delegates to persistValidatedAttempt; no second transaction implementation',
            'draft_practice_validation': 'Calls same gradeInstance; no student attempts, scores, or gamification writes',
            'draft_admin_filesystem_qa': 'Uses trusted Runner evidence with no student attempt writes',
            'review_progress': 'Writes reviewProgress, a separate review-state model, not practiceAttempt',
            'student_routes': 'Both route through handlePracticeValidate',
            'runner': 'Requires exactly one active actor/topic session and verifies its bound volume',
        },
        'scope_limitation': 'Static source call-site and invariant audit only. Dynamic invocation, raw SQL, newly named APIs, deployed route behavior, end-to-end side effects, and course policy approvals still require separate checks.',
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=None)
    args = parser.parse_args()
    if not args.repo.is_dir():
        parser.error('--repo must refer to an existing repository directory')
    outcome = run(args.repo.resolve())
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(outcome, indent=2, sort_keys=True) + '\n')
        print('REPORT=' + str(args.output))
    print('SOURCE_FILES_SCANNED=' + str(outcome['source_files_scanned']))
    for category, values in outcome['classified_sites'].items():
        print(f'{category}=' + ', '.join(f"{x['file']}:{x['line']}" for x in values))
    for error in outcome['findings']:
        print('REVIEW_REQUIRED=' + error)
    print('STAGE4B9BF3B_SINGLE_PIPELINE_STATIC_' + outcome['result'])
    return 0 if outcome['result'] == 'PASS' else 1

if __name__ == '__main__':
    raise SystemExit(main())
