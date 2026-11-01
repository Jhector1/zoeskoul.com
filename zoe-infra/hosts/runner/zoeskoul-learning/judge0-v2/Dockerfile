# Dev compatibility base (review and replace before production).
# Identical digest must be used for API and worker.
FROM mrkushalsm/judge0@sha256:d60605ad448453ac3754629bc7121d379cf691e0c091aabbc03ff2886b2626b2

COPY zoe_isolate_box_lease.rb /api/app/jobs/zoe_isolate_box_lease.rb
COPY patch_isolate_job.py /tmp/patch_isolate_job.py
RUN python3 /tmp/patch_isolate_job.py \
    && ruby -c /api/app/jobs/isolate_job.rb \
    && ruby -c /api/app/jobs/zoe_isolate_box_lease.rb \
    && rm -f /tmp/patch_isolate_job.py
