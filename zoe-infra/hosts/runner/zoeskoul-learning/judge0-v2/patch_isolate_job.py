#!/usr/bin/env python3
"""Guarded, reproducible change to the exact source shipped in the pinned base."""
from pathlib import Path
import re

path = Path('/api/app/jobs/isolate_job.rb')
source = path.read_text()
old = r'^([ \t]*)@box_id = submission\.id%2147483647[ \t]*$'
new = ('\\1@box_id = @reserved_box_id\n'
       '    raise "Missing valid Isolate box lease" unless @box_id.is_a?(Integer) && (0..999).cover?(@box_id)')
updated, hits = re.subn(old, new, source, flags=re.MULTILINE)
if hits != 1 or 'IsolateJob.prepend(ZoeIsolateBoxLease::JobPatch)' in source:
    raise SystemExit(f'STOP: unrecognized Judge0 source; box assignment matches={hits}')
updated += ('\nrequire_relative "zoe_isolate_box_lease"\n'
            'IsolateJob.prepend(ZoeIsolateBoxLease::JobPatch)\n')
path.write_text(updated)
print('ISOLATE_BOX_LEASE_PATCH_PASS')
