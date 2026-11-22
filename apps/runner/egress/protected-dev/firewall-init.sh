#!/bin/bash
# Trusted one-shot initializer. Never mounted into students or gateway.
set -euo pipefail
[[ $# == 5 ]] || exit 1
python3 -I - "$@" <<'PY'
import ipaddress,sys,socket,time,subprocess,re
inode,cidr,lab,manifest,deadline=sys.argv[1:]
assert re.fullmatch(r'[0-9]+',inode) and open('/proc/self/status').read()
import os,json
assert os.readlink('/proc/self/ns/net') == 'net:['+inode+']'
s=dict(l.split(':',1) for l in open('/proc/self/status') if ':' in l)
assert all(int(s[x],16)==0x1000 for x in ('CapEff','CapPrm','CapBnd'))
assert int(s['CapAmb'],16)==0 and s['NoNewPrivs'].strip()=='1'
assert all(not (outside <= 0 < outside+length) for inside,outside,length in (map(int,l.split()) for l in open('/proc/self/uid_map')))
n=ipaddress.IPv4Network(cidr,strict=True); a=ipaddress.IPv4Address(lab)
assert 16<=n.prefixlen<=28 and any(n.subnet_of(ipaddress.IPv4Network(x)) for x in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')) and a in n and a not in (n.network_address,n.broadcast_address)
with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as sock: sock.bind((lab,0))
hosts=json.loads(manifest); assert set(hosts)=={'archive.ubuntu.com','security.ubuntu.com','example.com'}
blocked=[ipaddress.IPv4Network(x) for x in ('0.0.0.0/8','100.64.0.0/10','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4')]
for v in hosts.values():
 assert isinstance(v,list) and 1<=len(v)<=32 and len(v)==len(set(v))
 for x in v:
  ip=ipaddress.IPv4Address(x); assert str(ip)==x and ip.is_global and not any(ip in r for r in blocked)
ttl=int(deadline)-int(time.time())-2
assert 5<=ttl<=3600
http=sorted(set(hosts['archive.ubuntu.com']+hosts['security.ubuntu.com'])); https=hosts['example.com']
def elements(ips):return ', '.join(f'{ip} timeout {ttl}s' for ip in ips)
rules=f'''table inet zoe_learning_egress {{
 set approved_http {{ type ipv4_addr; flags timeout; elements = {{ {elements(http)} }}; }}
 set approved_https {{ type ipv4_addr; flags timeout; elements = {{ {elements(https)} }}; }}
 chain input {{
  type filter hook input priority 0; policy drop;
  iifname "lo" ip saddr 127.0.0.1 ip daddr 127.0.0.1 tcp dport 3128 accept
  iifname "lo" ip saddr 127.0.0.1 ip daddr 127.0.0.1 ct state established accept
  ip saddr {cidr} ip daddr {lab} tcp dport 3128 ct state new,established accept
  ip saddr @approved_http tcp sport 80 ct state established accept
  ip saddr @approved_https tcp sport 443 ct state established accept
 }}
 chain output {{
  type filter hook output priority 0; policy drop;
  oifname "lo" ip saddr 127.0.0.1 ip daddr 127.0.0.1 tcp dport 3128 accept
  oifname "lo" ip saddr 127.0.0.1 ip daddr 127.0.0.1 ct state established accept
  ip saddr {lab} ip daddr {cidr} tcp sport 3128 ct direction reply ct state established counter accept
  ip daddr @approved_http tcp dport 80 ct state new,established counter accept
  ip daddr @approved_https tcp dport 443 ct state new,established counter accept
  counter drop
 }}
 chain forward {{ type filter hook forward priority 0; policy drop; }}
}}
'''
nft='/usr/sbin/nft'
# A newly created holder must not already contain our table.
assert subprocess.run([nft,'list','table','inet','zoe_learning_egress'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
subprocess.run([nft,'-c','-f','-'],input=rules,text=True,check=True)
subprocess.run([nft,'-f','-'],input=rules,text=True,check=True)
report=json.loads(subprocess.check_output([nft,'-j','list','table','inet','zoe_learning_egress']))['nftables']
chains={x['chain']['name']:x['chain'] for x in report if 'chain' in x}
assert set(chains)=={'input','output','forward'} and all(x['policy']=='drop' and x['hook']==name for name,x in chains.items())
sets={x['set']['name'] for x in report if 'set' in x}; assert sets=={'approved_http','approved_https'}
sys.path.insert(0, '/usr/local/lib/zoe-firewall')
from firewall_renewal_execute import inspect_table, expected_addresses
fingerprint, addresses = inspect_table({'nftables':report})
if addresses != expected_addresses(hosts): raise ValueError('Initial firewall addresses mismatch')
print('ZOE_FIREWALL_STRUCTURE_SHA256='+fingerprint)
print('ZOE_FIREWALL_INSTALLED_AND_VERIFIED')
PY
