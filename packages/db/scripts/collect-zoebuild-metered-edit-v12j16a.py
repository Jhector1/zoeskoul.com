#!/usr/bin/env python3
"""Read-only scoped source collector for the first real customer-funded Zoé edit."""
import hashlib, json, sys, zipfile
from pathlib import Path
FILES = [
"apps/zoebuild/src/lib/build/boundedLunaEditReviewV12J16.ts",
"apps/zoebuild/src/lib/build/reviewedAiBillingRegistry.ts",
"apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts",
"apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts",
"apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts",
"apps/zoebuild/src/lib/build/serverOwnedZoeBuildMetering.ts",
"apps/zoebuild/src/lib/build/meteredAiJsonExecution.ts",
"apps/zoebuild/src/lib/build/aiCreditResultJournal.ts",
"apps/zoebuild/src/lib/build/createZoeBuildAiPlanner.ts",
"apps/zoebuild/src/lib/build/aiBillingOperationIdentity.ts",
"apps/zoebuild/src/lib/build/zoeTargetedSourceEdit.ts",
"apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",
"apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/intent/route.ts",
"apps/zoebuild/src/app/api/build/plan/route.ts",
"packages/ai-json/src/openai.ts",
"packages/ai-json/src/pricing.ts",
"packages/ai-json/src/usage.ts",
"packages/ai-json/src/textTokenCeiling.ts",
"packages/platform-server/src/ai-credits/aiCreditLedger.ts",
"packages/platform-server/src/ai-credits/creditMath.ts",
"packages/platform-server/src/ai-credits/aiCreditProviderRequest.ts",
"packages/platform-server/src/ai-credits/aiCreditReconciliation.ts",
]
def main():
 if len(sys.argv)!=3:raise SystemExit("usage: collect-zoebuild-metered-edit-v12j16a.py REPO OUTPUT.zip")
 repo=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve()
 if out.exists():raise SystemExit("SOURCE_REFUSED OUTPUT_EXISTS")
 if not (repo/"apps/zoebuild").is_dir():raise SystemExit("REPO_INVALID")
 rows=[]
 for rel in FILES:
  p=repo/rel
  if p.is_file():
   b=p.read_bytes()
   if b"\x00" in b or len(b)>250_000:raise SystemExit("SOURCE_REFUSED UNSAFE_FILE "+rel)
   rows.append((rel,b))
 if len(rows)<16:raise SystemExit("SOURCE_REFUSED MISSING_CORE_FILES")
 out.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED) as z:
  z.writestr("manifest.json",json.dumps({"readOnly":True,"files":[{"path":r,"sha256":hashlib.sha256(b).hexdigest()} for r,b in rows]},indent=2))
  for rel,b in rows:z.writestr("source/"+rel,b)
 print(f"V12J16A_METERED_EDIT_SOURCE_PASS files={len(rows)} bytes={sum(len(b) for _,b in rows)}")
 print("READ_ONLY=YES ENV=NO DB=NO PROVIDER=NO STRIPE=NO GIT=NO")
 print("REVIEW_BEFORE_UPLOAD=YES")
if __name__=="__main__":main()
