#!/usr/bin/env python3
"""Read-only platform-billing migration target preflight. NO migrations or writes."""
from __future__ import annotations
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit, parse_qs

MIGRATION = '20261021040000_platform_subscription_product_owner'

def safe_env_value(text: str) -> str:
    value = text.strip()
    if value[:1] in ("'", '"'):
        quote=value[0]
        if len(value)<2 or value[-1]!=quote:
            raise ValueError('Malformed quoted DATABASE_URL')
        value=value[1:-1]
    elif ' #' in value:
        value=value.split(' #',1)[0].strip()
    if not value or '${' in value or '\\n' in value:
        raise ValueError('DATABASE_URL is missing, interpolated, or malformed')
    return value

def read_url(env_file: Path) -> str:
    if not env_file.is_file():
        raise ValueError('Missing .env.shared.local (not read from process environment)')
    rows=[]
    for line in env_file.read_text(encoding='utf8').splitlines():
        found=re.match(r'^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$',line)
        if found:rows.append(safe_env_value(found.group(1)))
    if len(rows)!=1:raise ValueError('Expected exactly one DATABASE_URL assignment in .env.shared.local')
    return rows[0]

def target_info(raw: str) -> dict[str,str]:
    u=urlsplit(raw)
    if u.scheme not in ('postgresql','postgres') or not u.hostname or not u.path or u.fragment:
        raise ValueError('DATABASE_URL must be a PostgreSQL URI with hostname and database')
    q=parse_qs(u.query)
    # Prisma and psql may otherwise reach different PostgreSQL schemas.
    if q.get('schema',['public'])!=['public']:
        raise ValueError('Non-public Prisma schema: manual mapping needed before preflight')
    ssl=q.get('sslmode',[None])[0]
    if ssl not in (None,'require','verify-ca','verify-full','prefer','disable'):
        raise ValueError('Unsupported sslmode')
    db=unquote(u.path.lstrip('/'))
    if not db or '/' in db:raise ValueError('Invalid database name')
    return {'host':u.hostname,'port':str(u.port or 5432),'database':db,
            'user':unquote(u.username or ''),'password':unquote(u.password or ''),'sslmode':ssl or ''}

def assert_static(repo: Path) -> str:
    sql=repo/'packages/db/prisma/migrations'/MIGRATION/'migration.sql'
    schema=repo/'packages/db/prisma/schema.prisma'
    if not sql.is_file() or not schema.is_file():raise ValueError('Missing V12B Prisma schema or migration')
    sqltext=sql.read_text()
    schematext=schema.read_text()
    required=('ALTER TABLE "Subscription" ADD COLUMN "billingProduct" TEXT;',
              'CREATE INDEX "Subscription_userId_billingProduct_idx"',
              'ADD CONSTRAINT "Subscription_billingProduct_allowed"')
    if not all(x in sqltext for x in required) or not re.search(r'\bbillingProduct\s+String\?',schematext):
        raise ValueError('Unexpected V12B schema or migration content')
    # This preflight never gives migration permission, even for verified static files.
    forbidden=re.compile(r'\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE\s+TABLE)\b',re.I)
    sql_no_comments='\n'.join(line for line in sqltext.splitlines() if not line.strip().startswith('--'))
    if forbidden.search(sql_no_comments):raise ValueError('Unexpected data-changing migration operation')
    return hashlib.sha256(sql.read_bytes()).hexdigest()[:16]

def inspect_read_only(target: dict[str,str]) -> tuple[str,str,str,str]:
    if not shutil.which('psql'):raise ValueError('psql unavailable; database inspection not attempted')
    env=os.environ.copy()
    env.update({'PGHOST':target['host'],'PGPORT':target['port'],'PGDATABASE':target['database'],
                'PGUSER':target['user'],'PGPASSWORD':target['password'],
                'PGCONNECT_TIMEOUT':'8'})
    if target['sslmode']:env['PGSSLMODE']=target['sslmode']
    # psql's command line never contains credentials; all statements are read-only.
    sql="""BEGIN TRANSACTION READ ONLY;
SELECT current_database() || '|' ||
CASE WHEN to_regclass('"Subscription"') IS NULL THEN 'MISSING' ELSE 'PRESENT' END || '|' ||
CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Subscription' AND column_name='billingProduct') THEN 'PRESENT' ELSE 'MISSING' END || '|' ||
CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='Subscription_userId_billingProduct_idx') THEN 'PRESENT' ELSE 'MISSING' END;
ROLLBACK;
"""
    result=subprocess.run(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=sql,
                          text=True,capture_output=True,env=env,timeout=20,check=False)
    # Provider error output may include sensitive URLs or hostnames: never print it.
    if result.returncode!=0:raise ValueError('Read-only PostgreSQL probe failed; diagnostics intentionally redacted')
    rows=[line.strip() for line in result.stdout.splitlines() if '|' in line]
    if len(rows)!=1 or len(rows[0].split('|'))!=4:
        raise ValueError('Unexpected read-only PostgreSQL inspection result')
    return tuple(rows[0].split('|'))

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('repo',type=Path)
    p.add_argument('--show-target',action='store_true',help='Show hostname and database name only; NO connection')
    p.add_argument('--inspect-database',action='store_true',help='Make read-only connection after exact target confirmation')
    p.add_argument('--expect-host')
    p.add_argument('--expect-database')
    args=p.parse_args(argv)
    repo=args.repo.resolve()
    digest=assert_static(repo)
    print('STATIC_SCHEMA_PREFLIGHT_PASS migration_sha256_prefix='+digest)
    if not args.show_target and not args.inspect_database:
        print('STATIC_ONLY: no env file, DB connection, migration or writes');return 0
    target=target_info(read_url(repo/'.env.shared.local'))
    if args.show_target:
        print('CANDIDATE_HOST='+target['host'])
        print('CANDIDATE_DATABASE='+target['database'])
        print('TARGET_DISPLAY_ONLY: no DB connection or writes')
    if args.inspect_database:
        if not args.expect_host or not args.expect_database:
            raise ValueError('Explicit --expect-host and --expect-database required')
        if args.expect_host!=target['host'] or args.expect_database!=target['database']:
            raise ValueError('Exact target mismatch; no DB connection attempted')
        db,table,column,index=inspect_read_only(target)
        if db!=target['database']:raise ValueError('Connected database did not match verified target')
        print('READ_ONLY_DB_INSPECTION table='+table+' billingProduct='+column+' index='+index)
        print('MIGRATION_NOT_AUTHORIZED: NO migrations or writes performed')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as ex:
        # Don't dump secrets, URLs, connection details or exception traces.
        print('ABORT: '+str(ex),file=sys.stderr)
        sys.exit(2)
