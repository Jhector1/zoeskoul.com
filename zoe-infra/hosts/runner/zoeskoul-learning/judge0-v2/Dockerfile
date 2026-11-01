# Development compatibility base; review and replace before production.
# Same pinned image must be used by the Judge0 API and worker.
FROM mrkushalsm/judge0@sha256:d60605ad448453ac3754629bc7121d379cf691e0c091aabbc03ff2886b2626b2

# The upstream base runs as USER judge0. The copied application source is
# root-owned; perform this guarded source patch as root during image build.
USER root
COPY zoe_isolate_box_lease.rb /api/app/jobs/zoe_isolate_box_lease.rb
COPY patch_isolate_job.rb /tmp/patch_isolate_job.rb
RUN ruby /tmp/patch_isolate_job.rb \
    && ruby -c /api/app/jobs/isolate_job.rb \
    && ruby -c /api/app/jobs/zoe_isolate_box_lease.rb \
    && rm -f /tmp/patch_isolate_job.rb

# Preserve the upstream unprivileged application runtime identity.
USER judge0
