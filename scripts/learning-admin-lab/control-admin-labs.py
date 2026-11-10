#!/usr/bin/env python3
"""Operator-only admin lab switch. No secrets on CLI arguments or in logs."""
import argparse
import getpass
import json
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('action',choices=('on','off','status'))
p.add_argument('--runner-url',required=True,help='HTTPS Runner URL or an SSH-forwarded loopback HTTP endpoint')
a=p.parse_args()
base=a.runner_url.rstrip('/')
u=urlparse(base)
if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ('127.0.0.1','localhost','::1')):
    p.error('Refusing credentials over non-HTTPS remote connection; SSH forward to localhost instead.')
if u.username or u.password or u.query or u.fragment:
    p.error('Do not include credentials, query, or fragment in Runner URL.')
shared=getpass.getpass('Runner service secret: ')
control=getpass.getpass('Admin control secret: ')
if len(shared)<32 or len(control)<32:
    p.error('Both secrets must be at least 32 characters.')
endpoint='/sessions/admin/control/status' if a.action=='status' else '/sessions/admin/control'
body={} if a.action=='status' else {'enabled':a.action=='on'}
req=Request(base+endpoint,data=json.dumps(body).encode(),headers={
  'content-type':'application/json',
  'x-runner-secret':shared,
  'x-actor-key':'operator-learning-admin',
  'x-learning-admin-control':control,
},method='POST')
try:
    with urlopen(req,timeout=20) as response:
        result=json.loads(response.read())
except HTTPError as exc:
    print('ADMIN_CONTROL_FAILED HTTP',exc.code,file=sys.stderr)
    sys.exit(1)
except (URLError,ValueError) as exc:
    print('ADMIN_CONTROL_UNAVAILABLE',type(exc).__name__,file=sys.stderr)
    sys.exit(1)
print(json.dumps(result,indent=2))
if not result.get('ok'): sys.exit(1)
