#!/usr/bin/env ruby
# Apply only the expected source change to the pinned Judge0 base image.
# This patch runs with USER root in the Docker build; the image runs as judge0.
module ZoeJudge0SourcePatch
  OLD_ASSIGNMENT = /^([ \t]*)@box_id = submission\.id%2147483647[ \t]*$/
  INSTALLED_MARKER = 'IsolateJob.prepend(ZoeIsolateBoxLease::JobPatch)'

  def self.transform(source)
    raise 'STOP: Judge0 box lease already installed' if source.include?(INSTALLED_MARKER)
    matches = source.scan(OLD_ASSIGNMENT).length
    raise "STOP: unexpected Judge0 box ID expression, matches=#{matches}" unless matches == 1

    updated = source.sub(OLD_ASSIGNMENT) do
      indent = Regexp.last_match(1)
      "#{indent}@box_id = @reserved_box_id\n" \
        "#{indent}raise \"Missing valid Isolate box lease\" unless @box_id.is_a?(Integer) && (0..999).cover?(@box_id)"
    end
    updated << "\nrequire_relative \"zoe_isolate_box_lease\"\n"
    updated << "IsolateJob.prepend(ZoeIsolateBoxLease::JobPatch)\n"
    updated
  end
end

if __FILE__ == $PROGRAM_NAME
  path = ENV.fetch('ISOLATE_JOB_PATH', '/api/app/jobs/isolate_job.rb')
  source = File.binread(path)
  updated = ZoeJudge0SourcePatch.transform(source)
  File.binwrite(path, updated)
  puts 'ISOLATE_BOX_LEASE_PATCH_PASS'
end
