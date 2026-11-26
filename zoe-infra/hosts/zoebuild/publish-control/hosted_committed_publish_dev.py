#!/usr/bin/env python3
"""One-shot development DB grant publication. No production configuration or daemon.
Uses the existing strict SSH alias, local native PostgreSQL and remote allowlist.
Never logs database credentials, grant payload or project IDs.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, parse_qs, unquote
import re

SSH=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5','zoeskoul-dev']
SQL=Path(__file__).resolve().with_name('hosted_committed_projection.sql')
ROOT=Path.home()/'.zoeskoul/worktrees/zoebuild-hmr-phase4f1-rc1'
PG='/usr/local/opt/postgresql@18/bin/psql'

def require(ok, message):
    if not ok: raise RuntimeError(message)

def project_scope():
    raw=subprocess.check_output(SSH+['python3 -B -'],input='''import json,os,socket,sys
from pathlib import Path
assert socket.gethostname()=='jean-VirtualBox' and os.getuid()!=0
sys.path.insert(0,str(Path.home()/'.zoeskoul/publish-pilot-tools'))
import control,hosted_control
cfg=control.configuration();allow=control.read_private(hosted_control.ALLOWLIST)
print(json.dumps({'legacy':cfg['projectId'],'ids':allow['projectIds']}))
''',text=True,timeout=15)
    d=json.loads(raw);ids=d['ids'];require(isinstance(ids,list) and 0<len(ids)<=2 and all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{4,128}',x) and x!=d['legacy'] for x in ids) and len(set(ids))==len(ids),'INVALID_SCOPE');return ids

def read_grants(ids):
    require(sys.platform=='darwin' and SQL.parent==ROOT/'zoe-infra/hosts/zoebuild/publish-control','MAC_DEVELOPMENT_ONLY')
    from dotenv import dotenv_values
    p=urlsplit(dotenv_values(ROOT/'.env.shared.local',interpolate=False)['DATABASE_URL'])
    require(p.scheme in ('postgres','postgresql') and p.hostname in ('localhost','127.0.0.1') and p.port==55432 and p.path=='/learnoir_db' and bool(p.username) and not p.fragment and parse_qs(p.query).get('schema',['public'])==['public'],'DATABASE_TARGET_DENIED')
    env={k:v for k,v in os.environ.items() if not k.startswith('PG')};env.update(PGHOST='127.0.0.1',PGPORT='55432',PGDATABASE='learnoir_db',PGUSER=unquote(p.username),PGPASSWORD=unquote(p.password or ''),PGCONNECT_TIMEOUT='5',PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000')
    def query(*args):
        r=subprocess.run([PG,'-X','-Atqw','-v','ON_ERROR_STOP=1',*args],env=env,capture_output=True,text=True,timeout=10)
        require(r.returncode==0,'DATABASE_READ_FAILED');return r.stdout.strip()
    identity=json.loads(query('-c',"SELECT json_build_object('db',current_database(),'port',inet_server_port(),'host',host(inet_server_addr()),'version',current_setting('server_version_num')::integer,'readOnly',current_setting('transaction_read_only'))"))
    require(identity['db']=='learnoir_db' and identity['port']==55432 and identity['host']=='127.0.0.1' and 180000<=identity['version']<190000 and identity['readOnly']=='on','DATABASE_IDENTITY_DENIED')
    snapshot=json.loads(query('-v','project_ids='+json.dumps(ids),'-f',str(SQL)))
    require(isinstance(snapshot,dict) and set(snapshot)=={'issuedAtMs','expiresAtMs','grants'} and isinstance(snapshot['grants'],dict) and len(snapshot['grants'])<=len(ids),'INVALID_DB_RESULT');return snapshot

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');parser.add_argument('--require-empty',action='store_true');args=parser.parse_args()
    snapshot=read_grants(project_scope());print('DATABASE_COMMITTED_GRANT_COUNT='+str(len(snapshot['grants'])),flush=True)
    if args.require_empty:require(not snapshot['grants'],'UNEXPECTED_COMMITTED_GRANTS')
    if args.install:
        out=subprocess.check_output(SSH+['python3 -B "$HOME/.zoeskoul/publish-pilot-tools/hosted_gateway.py" --install-committed-grants'],input=json.dumps(snapshot),text=True,timeout=15)
        require(out.strip()=='COMMITTED_GRANTS_INSTALLED=YES','GRANT_INSTALL_FAILED');print(out.strip())
    print('COMMITTED_PROJECTION=PASS')
if __name__=='__main__':
    try:main()
    except Exception as e: print('COMMITTED_PROJECTION_FAILED='+type(e).__name__,file=sys.stderr);raise SystemExit(1)
