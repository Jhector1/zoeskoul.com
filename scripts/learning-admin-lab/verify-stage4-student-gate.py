#!/usr/bin/env python3
"""Read-only Stage 4A invariants; not a substitute for live authorization tests."""
from __future__ import annotations
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
paths = {
  'route': 'apps/web/src/app/api/run/pty/sessions/admin/start/route.ts',
  'policy': 'apps/web/src/lib/learning/server/learningAdminStudentPolicy.ts',
  'authorizer': 'apps/web/src/lib/learning/server/authorizeStudentAdminLab.ts',
  'grant': 'apps/web/src/lib/server/learningAdminGrantPayload.ts',
  'mint': 'apps/web/src/lib/server/mintStudentAdminLabGrant.ts',
  'runner': 'apps/runner/src/services/execution/learningAdminGrant.ts',
}
sources = {k: (root/p).read_text() for k,p in paths.items()}
expected = {
  'route': ['ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED', 'requireRunnerActorKey', 'authorizeStudentAdminLab(', 'mintStudentAdminLabGrant(', '"/sessions/admin/start"', 'createAttachToken', 'request.headers.get("origin")'],
  'authorizer': ['"server-only"', 'subjectEnrollment.findFirst', 'practiceModule.findFirst', 'resolveTopicBundleManifest', 'matchesPublishedAdminTopic', 'resolvePracticeAccess', 'actor.userId'],
  'policy': ['linux-files-permissions-users', 'sudo-root-concepts', 'ownership-administration-concepts', 'final-capstone-secure-project'],
  'grant': ['createHmac', 'actorKey:', 'courseSlug:', 'topicSlug:', 'iat:', 'exp:', 'nonce:'],
  'mint': ['"server-only"', 'randomBytes(16)', 'ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET'],
  'runner': ['verifyAdminGrant', 'assertAdminLabSwitch', 'isEligibleAdminLabLesson'],
}
for k, tokens in expected.items():
    missing = [t for t in tokens if t not in sources[k]]
    if missing:
        raise SystemExit(f'STAGE4_SOURCE_GUARD_FAIL {k}: {missing}')
# No browser handoff or client module has access to the signing key/grant.
route = sources['route']
if 'grant,' in route and 'sessionId' not in route:
    raise SystemExit('Missing session response')
response_fields = route.split('return NextResponse.json<LabResponse>({')[-1].split('});', 1)[0]
if 'grant' in response_fields:
    raise SystemExit('Signed grant leaked to browser response')
print('ZOELEARNING_STAGE4_STUDENT_AUTH_SOURCE_GUARD_PASS')
print('STUDENT_ADMIN_DISABLED_BY_DEFAULT; NO_CURRICULUM_PUBLICATION; NO_GRADER_CHANGE')
