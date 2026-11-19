#!/usr/bin/env python3
"""Trusted one-shot helper. Not wired to Runner admission or renewal yet.

Runner must stop and verify removal of the old gateway, verify holder ownership,
serialize against cleanup/revocation, and supply a trusted initial structure hash.
An error is NOT evidence of a rollback. Do not start any gateway on failure.
"""
import hashlib
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import time

# Isolated Python ignores the script directory. The image installs root-owned code here.
if __name__ == '__main__':
    sys.path.insert(0, '/usr/local/lib/zoe-firewall')
from firewall_renewal_plan import plan_renewal, validate_hosts

NFT = '/usr/sbin/nft'
TABLE = 'zoe_learning_egress'
SETS = {'approved_http', 'approved_https'}
BUDGET = 7.0  # smaller than planner's 10-second safety margin


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def verify_namespace(inode, cidr, lab):
    require(re.fullmatch(r'[0-9]+', inode) is not None, 'NAMESPACE_ID')
    require(os.readlink('/proc/self/ns/net') == 'net:[' + inode + ']', 'NAMESPACE_MISMATCH')
    require(os.getuid() == 0, 'HELPER_USER')
    with open('/proc/self/status') as f:
        s = dict(line.split(':', 1) for line in f if ':' in line)
    require(all(int(s[k], 16) == 0x1000 for k in ('CapEff','CapPrm','CapBnd')), 'CAPABILITIES')
    require(int(s['CapAmb'],16)==0 and s['NoNewPrivs'].strip()=='1', 'SECURITY_PROFILE')
    with open('/proc/self/uid_map') as f:
        maps = [tuple(map(int,line.split())) for line in f]
    require(bool(maps) and all(not (outside <= 0 < outside+length) for _,outside,length in maps), 'NOT_ROOTLESS')
    n=ipaddress.IPv4Network(cidr,strict=True); a=ipaddress.IPv4Address(lab)
    require(16<=n.prefixlen<=28 and any(n.subnet_of(ipaddress.IPv4Network(x)) for x in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')) and a in n and a not in (n.network_address,n.broadcast_address), 'LAB_ADDRESS')
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as sock:
        sock.bind((lab,0))


def strip_counters(value):
    # Only rule counters are mutable. Preserve their presence and every other expression.
    if isinstance(value,list):
        return [strip_counters(x) for x in value]
    if isinstance(value,dict):
        return {k: ({x:y for x,y in v.items() if x not in ('packets','bytes')} if k=='counter' and isinstance(v,dict) else strip_counters(v)) for k,v in value.items()}
    return value


def inspect_table(report, *, max_remaining=3600, expected_ttl=None):
    """Fingerprint ordered rules, chains, set declarations; separately read live set elements.

    Strict on unknown schema and expired/missing elements. Actual nft JSON format
    and post-transaction stability must be verified on the target rootless VM.
    """
    require(type(report) is dict and set(report)=={'nftables'} and type(report['nftables']) is list, 'NFT_REPORT')
    structures=[]; addresses={}; chains={}; table_count=0; rule_counts={}
    for row in report['nftables']:
        require(type(row) is dict and len(row)==1, 'NFT_OBJECT')
        kind,data=next(iter(row.items()))
        require(type(data) is dict, 'NFT_OBJECT')
        if kind=='metainfo':
            continue
        require(kind in ('table','chain','set','rule'), 'NFT_UNEXPECTED_OBJECT')
        require(data.get('family')=='inet', 'NFT_FAMILY')
        if kind=='table':
            require(data.get('name')==TABLE, 'NFT_TABLE');table_count+=1
        else:
            require(data.get('table')==TABLE, 'NFT_TABLE')
        if kind=='chain':
            name=data.get('name')
            require(name in ('input','output','forward') and name not in chains and data.get('policy')=='drop' and data.get('hook')==name and data.get('type')=='filter' and data.get('prio')==0, 'NFT_CHAIN')
            chains[name]=True
        if kind=='rule':
            name=data.get('chain'); require(name in ('input','output'), 'NFT_RULE_CHAIN')
            require(type(data.get('expr')) is list and bool(data['expr']), 'NFT_RULE_EXPRESSION')
            rule_counts[name]=rule_counts.get(name,0)+1
            data=strip_counters(data)
        if kind=='set':
            name=data.get('name')
            require(name in SETS and name not in addresses and data.get('type')=='ipv4_addr' and data.get('flags')==['timeout'], 'NFT_SET')
            items=data.get('elem',[])
            require(type(items) is list and len(items)<=64, 'NFT_ELEMENTS')
            found=[]
            for item in items:
                require(type(item) is dict and set(item)=={'elem'} and type(item['elem']) is dict, 'NFT_ELEMENT')
                elem=item['elem']; require(set(elem)=={'val','timeout','expires'}, 'NFT_ELEMENT')
                ip=elem['val']; require(type(ip) is str and str(ipaddress.IPv4Address(ip))==ip, 'NFT_ADDRESS')
                ttl=elem['timeout']; remaining=elem['expires']
                require(type(ttl) is int and type(remaining) is int and 0<remaining<=ttl<=3600 and remaining<=max_remaining and (expected_ttl is None or ttl==expected_ttl), 'NFT_ELEMENT_TTL')
                found.append(ip)
            require(len(found)==len(set(found)), 'NFT_DUPLICATE')
            addresses[name]=frozenset(found)
            data={k:v for k,v in data.items() if k!='elem'}
        structures.append({kind:data})
    require(table_count==1 and set(chains)=={'input','output','forward'} and set(addresses)==SETS and rule_counts=={'input':5,'output':6}, 'NFT_STRUCTURE')
    fp=hashlib.sha256(json.dumps(structures,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return fp, addresses


def expected_addresses(hosts):
    pins=validate_hosts(hosts)
    return {'approved_http':frozenset(pins['archive.ubuntu.com']+pins['security.ubuntu.com']), 'approved_https':frozenset(pins['example.com'])}


def checked_table(report, fingerprint, hosts, *, max_remaining, expected_ttl=None):
    actual, addresses=inspect_table(report,max_remaining=max_remaining,expected_ttl=expected_ttl)
    require(actual==fingerprint, 'STRUCTURE_CHANGED')
    require(addresses==expected_addresses(hosts), 'ADDRESS_SET_CHANGED')


def execute(snapshot, previous, session_deadline, fingerprint, *, command, wall=time.time, monotonic=time.monotonic):
    """Only the exact fixed nft commands can execute; command injection is not a runtime option.
    command is injected for unit tests, never supplied by the CLI.
    """
    require(type(previous) is dict and set(previous)=={'hosts','expiresAt'}, 'PREVIOUS_SNAPSHOT')
    require(type(fingerprint) is str and re.fullmatch('[0-9a-f]{64}',fingerprint), 'FINGERPRINT')
    start=monotonic(); started=wall(); now=int(started)
    plan=plan_renewal(snapshot,now=now,previous_expiry=previous['expiresAt'],session_deadline=session_deadline)
    expected_addresses(previous['hosts'])
    def run(args, batch=None):
        elapsed=monotonic()-start
        require(0<=elapsed<BUDGET and abs((wall()-started)-elapsed)<1.0, 'CLOCK_OR_BUDGET')
        require(wall()<previous['expiresAt'], 'PREVIOUS_EXPIRED')
        return command(args,batch,BUDGET-elapsed)
    listing=['-j','list','table','inet',TABLE]
    checked_table(json.loads(run(listing)),fingerprint,previous['hosts'],max_remaining=previous['expiresAt']-int(wall()))
    run(['-c','-f','-'],plan.batch)
    run(['-f','-'],plan.batch)
    checked_table(json.loads(run(listing)),fingerprint,snapshot['hosts'],max_remaining=plan.expires_at-int(wall()),expected_ttl=plan.kernel_ttl_seconds)
    elapsed=monotonic()-start
    require(0<=elapsed<BUDGET and abs((wall()-started)-elapsed)<1.0 and wall()<previous['expiresAt'], 'POST_APPLY_DEADLINE')
    return plan.expires_at


def nft_command(args,batch,timeout):
    result=subprocess.run([NFT,*args], input=batch, text=True, stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=timeout)
    return result.stdout


def main():
    require(len(sys.argv)==7, 'ARGUMENT_COUNT')
    inode,cidr,lab,fingerprint,raw,deadline=sys.argv[1:]
    require(len(raw)<=32768 and re.fullmatch(r'[0-9]{1,16}',deadline), 'ARGUMENT_FORMAT')
    verify_namespace(inode,cidr,lab)
    request=json.loads(raw)
    require(type(request) is dict and set(request)=={'previous','next'}, 'REQUEST_SHAPE')
    expires=execute(request['next'],request['previous'],int(deadline),fingerprint,command=nft_command)
    print('ZOE_FIREWALL_RENEWED_AND_VERIFIED expiresAt='+str(expires),flush=True)


if __name__=='__main__':
    try:
        main()
    except Exception:
        # Do not leak arguments, arbitrary subprocess output or policy details.
        print('ZOE_FIREWALL_RENEWAL_FAILED_DO_NOT_START_GATEWAY',file=sys.stderr,flush=True)
        sys.exit(1)
