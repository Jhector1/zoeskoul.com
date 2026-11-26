#!/usr/bin/env python3
"""Fenced-only server authority candidate. Existing provider remains dev-only.
Run on the gateway host with an operator-provisioned read-only PostgreSQL service.
No remote shell, no shared application credentials, no legacy route fallback.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

SQL_SHA = 'e458dd6b8e0bda65c0acb520df420c992d11bc44fae0ca0c33865bcffcb93a1d'
ID = re.compile(r'[A-Za-z0-9_-]{4,128}\Z')
NAME = re.compile(r'[a-z_][a-z0-9_]{0,62}\Z')
SERVICE = 'zoebuild-hosted-reader'
TABLES = ('BuildProject','CodeProject','BuildHostedHostname','BuildHostedActivation','BuildDeployment','BuildHostedPublicationOperation')
INTERVAL = 2.0

class AuthorityError(RuntimeError):
    pass

def need(ok, code):
    if not ok: raise AuthorityError(code)

def now_ms(): return time.time_ns() // 1_000_000

def private(path, directory=False):
    s = path.lstat()
    need((stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)) and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == (0o700 if directory else 0o600), 'UNSAFE_CONFIG_PATH')
    return path

def load_config(root):
    private(root, True)
    cfg = json.loads(private(root/'config.json').read_text())
    need(isinstance(cfg,dict) and set(cfg)=={'mode','database','role','port','address','psql'} and cfg['mode']=='fenced-only-dev', 'CONFIG_SHAPE')
    need(all(isinstance(cfg[k],str) and NAME.fullmatch(cfg[k]) for k in ('database','role')), 'CONFIG_DB_IDENTITY')
    need(type(cfg['port']) is int and 0<cfg['port']<=65535 and cfg['address'] in (None,'127.0.0.1','::1'), 'CONFIG_LOCAL_DB_ONLY')
    binary = Path(cfg['psql'])
    need(binary.is_absolute() and binary.is_file() and os.access(binary,os.X_OK), 'CONFIG_PSQL')
    private(root/'pg_service.conf'); private(root/'pgpass')
    return cfg

def identity_sql():
    checks = ' AND '.join('NOT has_table_privilege(current_user, \'public."'+t+'"\', \'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\') AND has_table_privilege(current_user, \'public."'+t+'"\', \'SELECT\')' for t in TABLES)
    return """SELECT json_build_object('database',current_database(),'role',current_user,'sessionRole',session_user,
    'port',current_setting('port')::int,'address',host(inet_server_addr()),'readOnly',current_setting('transaction_read_only'),
    'restricted', (SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user),
    'tablePrivileges', ("""+checks+"""), 'version',current_setting('server_version_num')::int);"""

def validate_identity(i,cfg):
    need(isinstance(i,dict) and i.get('database')==cfg['database'] and i.get('role')==cfg['role'] and i.get('sessionRole')==cfg['role'] and i.get('port')==cfg['port'] and i.get('address')==cfg['address'] and i.get('readOnly')=='on' and i.get('restricted') is True and i.get('tablePrivileges') is True and type(i.get('version')) is int and 170000<=i['version']<190000, 'DATABASE_IDENTITY_OR_PRIVILEGE_DENIED')

def read_snapshot(root,cfg,ids,sql_path,run=subprocess.run):
    need(isinstance(ids,list) and 0<len(ids)<=2 and all(isinstance(i,str) and ID.fullmatch(i) for i in ids) and len(set(ids))==len(ids), 'SCOPE_DENIED')
    sql=sql_path.read_bytes();need(hashlib.sha256(sql).hexdigest()==SQL_SHA,'PROJECTION_HASH_MISMATCH')
    env={'HOME':str(Path.home()),'PATH':'/usr/bin:/bin','LC_ALL':'C','PGSERVICE':SERVICE,'PGSERVICEFILE':str(root/'pg_service.conf'),'PGPASSFILE':str(root/'pgpass'),'PGCONNECT_TIMEOUT':'3','PGOPTIONS':'-c default_transaction_read_only=on -c statement_timeout=2500 -c idle_in_transaction_session_timeout=3000'}
    statement='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+identity_sql()+'\n'+sql.decode()+'\nCOMMIT;\n'
    try:
        result=run([cfg['psql'],'-X','-A','-t','-q','-w','-v','ON_ERROR_STOP=1','-v','project_ids='+json.dumps(ids)],input=statement,env=env,text=True,capture_output=True,timeout=5)
    except (OSError,subprocess.TimeoutExpired): raise AuthorityError('DATABASE_UNAVAILABLE') from None
    need(result.returncode==0 and len(result.stdout)<=65536,'DATABASE_QUERY_FAILED')
    try:
        lines=result.stdout.splitlines();need(len(lines)==2,'DATABASE_RESPONSE_SHAPE');identity,snapshot=map(json.loads,lines)
    except (ValueError,TypeError):raise AuthorityError('DATABASE_RESPONSE_SHAPE') from None
    validate_identity(identity,cfg)
    return snapshot

def snapshots(grants,allow,legacy,validate_grants,validate_routes,clock=now_ms):
    now=clock(); verified=validate_grants(grants,allow,legacy,now)
    need(grants['expiresAtMs']-now>=2000,'GRANT_BUDGET_TOO_SMALL')
    routes={'issuedAtMs':grants['issuedAtMs'],'expiresAtMs':grants['issuedAtMs']+30000,'routes':{host:g['projectId'] for host,g in verified.items()}}
    validate_routes(routes,allow,legacy,now)
    return routes

def publish(grants,allow,legacy,validate_grants,validate_routes,install_grants,install_routes,clock=now_ms):
    routes=snapshots(grants,allow,legacy,validate_grants,validate_routes,clock)
    # Install the more restrictive authority first. Any partial failure must not
    # renew a route without its matching grant. Existing snapshots expire normally.
    install_grants(grants)
    install_routes(routes)
    return len(routes['routes'])

def serve(root):
    need(sys.platform.startswith('linux') and os.getuid()!=0,'DEV_LINUX_REQUIRED')
    os.umask(0o077)
    import control, hosted_control, hosted_gateway, hosted_committed_authority as authority, pilot
    cfg=load_config(root)
    lock=os.open(root/'writer.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
    try:
        s=os.fstat(lock);need(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o600,'UNSAFE_WRITER_LOCK')
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # Recheck all projects before each renewal. Never replace the legacy
        # route publisher while even one allowlisted project is unfenced.
        while True:
            start=time.monotonic()
            try:
                legacy=control.configuration()['projectId'];allow=control.read_private(hosted_control.ALLOWLIST)
                ids=allow['projectIds']
                need(isinstance(ids,list) and 0<len(ids)<=2 and all(isinstance(i,str) and ID.fullmatch(i) and i!=legacy for i in ids) and len(set(ids))==len(ids),'SCOPE_DENIED')
                for project in ids:
                    authority.read_runtime(pilot.ROOT.parent/'hosted-publish-dev'/project,project)
                grants=read_snapshot(root,cfg,ids,Path(__file__).with_name('hosted_committed_projection.sql'))
                count=publish(grants,allow,legacy,authority.validate,hosted_gateway.lease_routes,authority.install,hosted_gateway.install_snapshot)
                print('AUTHORITY_RENEWED='+str(count),flush=True)
            except Exception as exc:
                # Never fabricate an empty replacement on DB failure or extend
                # an old snapshot. Gateway denies once the short grant expires.
                print('AUTHORITY_RENEWAL_FAILED='+type(exc).__name__,file=sys.stderr,flush=True)
            time.sleep(max(0.1,INTERVAL-(time.monotonic()-start)))
    finally:os.close(lock)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--serve',action='store_true',required=True);p.add_argument('--config-root',type=Path,required=True);a=p.parse_args()
    try:serve(a.config_root)
    except Exception as e:
        print('AUTHORITY_STOPPED='+type(e).__name__,file=sys.stderr);raise SystemExit(1)
