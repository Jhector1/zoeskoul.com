#!/usr/bin/env python3
import sys,json,hashlib,zipfile
from pathlib import Path
PATHS = [
 'apps/web/src/app/api/billing/checkout/route.ts',
 'apps/web/src/lib/auth.ts',
 'apps/web/src/lib/practice/api/shared/http.ts',
 'apps/web/src/lib/billing/zoeBuildAiCreditCheckoutAttempt.ts',
 'apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.server.ts',
 'apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts',
 'apps/zoebuild/src/app/api/billing/checkout/route.ts',
 'apps/zoebuild/src/app/api/billing/status/route.ts',
 'apps/zoebuild/src/lib/build/currentBuildAccess.ts',
 'apps/zoebuild/src/app/[locale]/billing/BuilderBillingClient.tsx',
 'apps/zoebuild/src/lib/appOrigins.ts',
 'packages/platform-server/src/billing/platformBillingRequest.ts',
]
def main():
 if len(sys.argv)!=3: raise SystemExit('usage: collect_next_funding_routes.py /REPO /OUTPUT.zip')
 root=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve()
 if out.exists(): raise SystemExit('OUTPUT_EXISTS: refusing overwrite')
 if not (root/'apps/web').is_dir() or not (root/'apps/zoebuild').is_dir():
  raise SystemExit('NOT_ZOESKOUL_REPO')
 manifest=[]; contents=[]
 for rel in PATHS:
  path=(root/rel).resolve()
  if not path.is_relative_to(root) or not path.is_file(): raise SystemExit(f'MISSING_REQUIRED_SOURCE {rel}')
  raw=path.read_bytes()
  if len(raw)>120000 or b'\x00' in raw: raise SystemExit(f'SOURCE_TOO_LARGE_OR_BINARY {rel}')
  contents.append((rel,raw));manifest.append({'path':rel,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
 out.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED) as z:
  z.writestr('manifest.json',json.dumps({'name':'V12J14B_AUTHENTICATED_CHECKOUT_SOURCE','files':manifest},indent=2))
  for rel,raw in contents:z.writestr('source/'+rel,raw)
 print(f'V12J14B_CHECKOUT_SOURCE_PASS files={len(manifest)} bytes={sum(row["bytes"] for row in manifest)}')
 print('SOURCE_READ_ONLY=YES ENV=NO DB=NO STRIPE=NO PROVIDER=NO GIT=NO')
 print('REVIEW_BEFORE_UPLOADING=YES')
if __name__=='__main__':main()
