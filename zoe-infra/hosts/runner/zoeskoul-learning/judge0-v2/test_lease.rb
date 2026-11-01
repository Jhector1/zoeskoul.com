# Run without Docker/Postgres: fake PG connections implement the advisory-lock API.
require 'set'
require 'minitest/autorun'
$LOADED_FEATURES << 'pg.rb'
module PG
  @slots = Set.new
  class << self
    attr_accessor :slots
    def connect(**_kwargs)
      Connection.new
    end
  end
  class Connection
    def initialize
      @owned = Set.new
      @closed = false
    end
    def exec_params(_sql, args)
      raise 'connection closed' if @closed
      slot = args.fetch(1)
      if PG.slots.include?(slot)
        [{'acquired' => 'f'}]
      else
        PG.slots.add(slot)
        @owned.add(slot)
        [{'acquired' => 't'}]
      end
    end
    def finished?
      @closed
    end
    def close
      @owned.each { |slot| PG.slots.delete(slot) }
      @closed = true
    end
  end
end
ENV.update('POSTGRES_HOST'=>'localhost','POSTGRES_DB'=>'test','POSTGRES_USER'=>'test','POSTGRES_PASSWORD'=>'test')
require_relative 'zoe_isolate_box_lease'

class BoxLeaseTests < Minitest::Test
  def setup
    PG.slots.clear
  end
  def test_concurrent_jobs_cannot_reuse_an_active_slot
    a = ZoeIsolateBoxLease::Lease.acquire
    b = ZoeIsolateBoxLease::Lease.acquire
    refute_equal a.box_id, b.box_id
    assert a.box_id.between?(0,999)
    assert b.box_id.between?(0,999)
  ensure
    a&.release
    b&.release
  end
  def test_slot_is_released_on_close
    a = ZoeIsolateBoxLease::Lease.acquire
    assert_equal 1, PG.slots.size
    a.release
    assert_empty PG.slots
  end
  def test_full_pool_raises_without_leaking_connection
    (0...1000).each { |id| PG.slots.add(id) }
    assert_raises(ZoeIsolateBoxLease::SlotsExhausted) { ZoeIsolateBoxLease::Lease.acquire }
  end
  def test_job_patch_closes_lease_even_if_execution_raises
    impl = Class.new do
      def perform(_id)
        raise 'failure'
      end
    end
    impl.prepend(ZoeIsolateBoxLease::JobPatch)
    assert_raises(RuntimeError) { impl.new.perform(12345) }
    assert_empty PG.slots
  end
end
