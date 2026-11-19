"""Pure planner for trusted protected-egress rotation. No Docker/nft calls.

This is not an authorization decision or an executable renewal endpoint.
The caller must independently verify ownership, active authorization, namespace,
monotonic session deadline and installed firewall structure; serialize renewal
with revocation, quiesce the old gateway, and enforce a bounded apply deadline.
"""
from dataclasses import dataclass
from ipaddress import IPv4Address, IPv4Network

HOSTS = frozenset(('archive.ubuntu.com', 'security.ubuntu.com', 'example.com'))
BLOCKED = tuple(map(IPv4Network, (
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
    '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
    '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3',
)))
# Deliberately conservative: caller must bound execution to less than this
# margin using a monotonic deadline; a planned batch is not reusable later.
APPLY_MARGIN_SECONDS = 10
MIN_TTL_SECONDS = 5
MAX_LEASE_SECONDS = 3600
TABLE = 'inet zoe_learning_egress'


def invalid(reason):
    raise ValueError(reason)


def epoch(value):
    if type(value) is not int or not 0 < value <= 2**53-1:
        invalid('Invalid epoch second')
    return value


def validate_hosts(hosts):
    if type(hosts) is not dict or hosts.keys() != HOSTS:
        invalid('Unexpected destination set')
    result = {}
    for host in sorted(HOSTS):
        entries = hosts[host]
        if type(entries) is not list or not 1 <= len(entries) <= 32:
            invalid('Invalid destination count')
        ips = []
        for entry in entries:
            if type(entry) is not str:
                invalid('Invalid address')
            ip = IPv4Address(entry)
            if str(ip) != entry or not ip.is_global or any(ip in n for n in BLOCKED):
                invalid('Unsafe IPv4 pin')
            ips.append(ip)
        if len(set(ips)) != len(ips):
            invalid('Duplicate IPv4 pin')
        result[host] = tuple(str(ip) for ip in sorted(ips))
    return result


@dataclass(frozen=True)
class RenewalPlan:
    expires_at: int
    kernel_ttl_seconds: int
    batch: str
    http_addresses: tuple
    https_addresses: tuple
    planned_at: int


def plan_renewal(snapshot, *, now, previous_expiry, session_deadline):
    """Build one nft transaction, never run it. All times are trusted inputs.

    The effective expiry is capped by the authorized session deadline. Refuse
    expired prior leases, stale publications and insufficient remaining time.
    The conservative kernel TTL is shorter than the gateway's wall deadline.
    """
    now, previous_expiry, session_deadline = map(epoch, (now, previous_expiry, session_deadline))
    if type(snapshot) is not dict or set(snapshot) != {'hosts', 'expiresAt'}:
        invalid('Invalid policy snapshot')
    expires = epoch(snapshot['expiresAt'])
    if not 0 < previous_expiry - now <= MAX_LEASE_SECONDS:
        invalid('Previous lease expired or inconsistent')
    if previous_expiry > session_deadline:
        invalid('Previous lease exceeds session deadline')
    if not 60 <= expires - now <= MAX_LEASE_SECONDS:
        invalid('Invalid publication lifetime')
    effective = min(expires, session_deadline)
    if effective <= previous_expiry:
        invalid('Non-advancing lease')
    ttl = effective - now - APPLY_MARGIN_SECONDS
    if ttl < MIN_TTL_SECONDS:
        invalid('Insufficient apply window')
    hosts = validate_hosts(snapshot['hosts'])
    http = tuple(sorted(set(hosts['archive.ubuntu.com'] + hosts['security.ubuntu.com']), key=IPv4Address))
    https = hosts['example.com']
    def elements(addresses):
        return ', '.join(f'{ip} timeout {ttl}s' for ip in addresses)
    # All four commands must be submitted in one nft -f transaction, never
    # individual commands. No table/chain/rule creation or deletion.
    batch = (f'flush set {TABLE} approved_http\n'
             f'flush set {TABLE} approved_https\n'
             f'add element {TABLE} approved_http {{ {elements(http)} }}\n'
             f'add element {TABLE} approved_https {{ {elements(https)} }}\n')
    return RenewalPlan(effective, ttl, batch, http, https, now)
