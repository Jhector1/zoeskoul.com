# Box-ID ownership for Judge0 Isolate 2.2.x (valid IDs: 0..999).
# PostgreSQL session advisory locks make leases exclusive across all workers.
# The database session is held throughout the entire job and closes even on error.
require 'pg'
require 'securerandom'

module ZoeIsolateBoxLease
  # Dedicated namespace so these locks never collide with other applications.
  LOCK_NAMESPACE = 0x5A4F4501
  SLOT_COUNT = 1_000

  class SlotsExhausted < RuntimeError; end

  class Lease
    attr_reader :box_id

    def self.acquire
      connection = PG.connect(
        host: ENV.fetch('POSTGRES_HOST'),
        port: Integer(ENV.fetch('POSTGRES_PORT', '5432')),
        dbname: ENV.fetch('POSTGRES_DB'),
        user: ENV.fetch('POSTGRES_USER'),
        password: ENV.fetch('POSTGRES_PASSWORD'),
        connect_timeout: 5
      )

      begin
        start = SecureRandom.random_number(SLOT_COUNT)
        SLOT_COUNT.times do |offset|
          id = (start + offset) % SLOT_COUNT
          acquired = connection.exec_params(
            'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
            [LOCK_NAMESPACE, id]
          ).first.fetch('acquired')
          return new(connection, id) if acquired == 't' || acquired == true
        end
        raise SlotsExhausted, 'All Isolate sandbox slots are occupied'
      rescue Exception
        connection.close unless connection.finished?
        raise
      end
    end

    def initialize(connection, box_id)
      @connection = connection
      @box_id = box_id
    end

    def release
      # Closing the dedicated PG session atomically drops its advisory lock.
      # Unlike a Redis TTL, a long-running job cannot lose its lease to expiry.
      @connection.close unless @connection.finished?
    end
  end

  module JobPatch
    def perform(submission_id)
      lease = Lease.acquire
      @reserved_box_id = lease.box_id
      super
    ensure
      # The original IsolateJob's ensure/cleanup executes inside `super` first.
      begin
        lease.release if lease
      rescue StandardError => error
        warn "Judge0 box lease close failed: #{error.class}"
      end
    end
  end
end
