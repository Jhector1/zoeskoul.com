#!/usr/bin/env python3
"""Read-only bounded collector for missing Stripe CREDIT FUNDING integration sources.
Does not read env, secrets, credentials, cookie stores or DB. Review before upload.
"""
from pathlib import Path
import sys,os,json,hashlib,zipfile
SKIP={'.git','.next','node_modules','.turbo','dist','coverage','.cache','.secrets'}
ENDINGS={'.ts','.tsx','.mjs','.prisma'}
MAX_FILE=150_000
MAX_FILES=100
MAX_BYTES=3_000_000
ROOTS=('apps/web/src','apps/zoebuild/src','packages/platform-server/src','packages/db')
KEYS=('stripe','checkout','billing','aicredit','ai-credit','creditpack','credit-pack','refund','webhook','catalog','payment')
PATTERNS=('Stripe','stripe','grantAiCreditLot','freezeAiCreditWalletForVerifiedStripeRisk','billingWebhook','credit','invoice.paid')
EXACT=(
 'apps/web/src/lib/billing/buildAiSubscriptionPolicy.ts',
 'apps/web/src/lib/billing/reconcileBuilderAiSubscriptionGrants.ts',
 'apps/zoebuild/src/app/api/billing/verification/route.ts',
 'apps/zoebuild/src/app/api/billing/credits/route.ts',
 'packages/platform-server/src/ai-credits/aiCreditLedger.ts',
 'packages/platform-server/src/ai-credits/creditMath.ts',
 'apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts',
 'apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts',
)
def safe(repo,p):
 if p.is_symlink() or not p.is_file() or p.suffix not in ENDINGS:return False
 r=p.relative_to(repo)
 if any(part.startswith('.') or part in SKIP for part in r.parts[:-1]):return False
 if p.name.startswith('.') or p.name.endswith('.d.ts'):return False
 return p.stat().st_size<=MAX_FILE

def collect(repo,dest):
 if not repo.is_dir():raise ValueError('REPOSITORY_NOT_FOUND')
 if dest.exists():raise ValueError('OUTPUT_EXISTS_REFUSE_OVERWRITE')
 found={}
 for r in EXACT:
  p=repo/r
  if p.is_file() and safe(repo,p):found[r]=(p,'named')
 candidates=[]
 for root in ROOTS:
  directory=repo/root
  if not directory.is_dir():continue
  for parent,dirs,names in os.walk(directory,followlinks=False):
   dirs[:]=[d for d in dirs if not d.startswith('.') and d not in SKIP and not (Path(parent)/d).is_symlink()]
   for name in names:
    p=Path(parent)/name
    if not safe(repo,p):continue
    rel=p.relative_to(repo).as_posix()
    if rel in found:continue
    if not any(key in rel.lower() for key in KEYS):continue
    try:content=p.read_text('utf8')
    except UnicodeDecodeError:continue
    matched=[key for key in PATTERNS if key in content]
    if not matched:continue
    score=12*len(matched)+ (45 if 'webhook' in rel.lower() else 0)+(25 if 'stripe' in rel.lower() else 0)+(15 if 'test.' in rel.lower() else 0)
    candidates.append((-score,rel,p,'patterns:'+','.join(matched[:5])))
 for _,rel,p,why in sorted(candidates):
  if len(found)>=MAX_FILES:break
  found.setdefault(rel,(p,why))
 total=0;rows=[];omitted=[]
 for r,(p,why) in sorted(found.items()):
  data=p.read_bytes()
  if total+len(data)>MAX_BYTES:omitted.append(r);continue
  total+=len(data);rows.append((r,data,why))
 if len(rows)<10:raise RuntimeError('INSUFFICIENT_FUNDING_SOURCE')
 manifest={'task':'V12J14A_VERIFIED_CREDIT_PACK_WEBHOOK_SOURCE_AUDIT','readOnly':True,
  'fileCount':len(rows),'bytes':total,'omittedForCap':omitted,
  'envRead':False,'dbAccess':False,'providerAccess':False,'gitAccess':False,
  'source':[{'path':r,'bytes':len(d),'sha256':hashlib.sha256(d).hexdigest(),'reason':why} for r,d,why in rows]}
 dest.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_DEFLATED) as z:
  z.writestr('V12J14A_FUNDING_SOURCE_MANIFEST.json',json.dumps(manifest,indent=2))
  for r,data,_ in rows:z.writestr('source/'+r,data)
 print(f'V12J14A_FUNDING_SOURCE_PASS files={len(rows)} bytes={total} omitted={len(omitted)}')
 print('OUTPUT='+str(dest))
 print('ENV=NO DB=NO STRIPE=NO PROVIDER=NO GIT=NO SOURCE_MUTATION=NO')
 print('REVIEW_SOURCE_BEFORE_SHARING=YES')
if __name__=='__main__':
 try:
  if len(sys.argv)!=3:raise ValueError('USAGE collect.py <repo> <new-review-zip>')
  collect(Path(sys.argv[1]).expanduser().resolve(),Path(sys.argv[2]).expanduser().absolute())
 except Exception as err:
  print('V12J14A_FUNDING_SOURCE_REFUSED '+str(err),file=sys.stderr);sys.exit(1)
