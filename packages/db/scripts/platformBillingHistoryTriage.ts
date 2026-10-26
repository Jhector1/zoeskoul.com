/**
 * Read-only multi-subscription triage to explain V12H.1 release audit warnings.
 * NO writes, Stripe calls, migrations, or event replay; no PII, account IDs, price IDs, secrets.
 * Only run on an independently verified sandbox DB. This is NOT a release approval.
 */
import {getPrismaClient,FeatureKey} from '../src/client';
import {classifyHistory} from './platformBillingHistoryPolicy';
function arg(name:string):string{
  const i=process.argv.indexOf(name);
  if(i<0||!process.argv[i+1])throw Error('Missing '+name);
  return process.argv[i+1]!;
}
function dbTarget():{host:string;db:string}{
  const raw=process.env.ADMIN_DATABASE_URL??process.env.WEB_DATABASE_URL??process.env.DATABASE_URL;
  if(!raw)throw Error('Database configuration missing');
  const u=new URL(raw);
  if(!['postgresql:','postgres:'].includes(u.protocol)||!u.hostname)throw Error('Invalid PostgreSQL target');
  const db=decodeURIComponent(u.pathname.replace(/^\//,''));
  if(!db||db.includes('/')||u.searchParams.has('schema')&&u.searchParams.get('schema')!=='public')throw Error('Invalid database target');
  return {host:u.hostname,db};
}
async function main(){
  if(process.env.NODE_ENV==='production')throw Error('Production use not authorized');
  const t=dbTarget();
  if(t.host!==arg('--expect-host')||t.db!==arg('--expect-database'))throw Error('Expected DB target mismatch');
  const historicalId=arg('--subscription-id'),eventId=arg('--event-id');
  if(!/^sub_[A-Za-z0-9_]{6,160}$/.test(historicalId)||!/^evt_[A-Za-z0-9_]{6,160}$/.test(eventId))throw Error('Invalid identifiers');
  const db=getPrismaClient();
  try{
    const [historical,event]=await Promise.all([
      db.subscription.findUnique({where:{stripeSubscriptionId:historicalId},select:{
        stripeSubscriptionId:true,userId:true,stripeCustomerId:true,priceId:true,billingProduct:true,
        status:true,currentPeriodEnd:true,trialEnd:true,
      }}),
      db.stripeEvent.findUnique({where:{id:eventId},select:{status:true,subscriptionId:true,livemode:true}}),
    ]);
    if(!historical){console.log('HISTORICAL_SUBSCRIPTION=MISSING');process.exitCode=2;return;}
    const [user,rows,grants]=await Promise.all([
      db.user.findUnique({where:{id:historical.userId},select:{stripeCustomerId:true}}),
      db.subscription.findMany({where:{userId:historical.userId},select:{
        stripeSubscriptionId:true,stripeCustomerId:true,priceId:true,billingProduct:true,status:true,currentPeriodEnd:true,trialEnd:true,
      }}),
      db.featureGrant.findMany({where:{userId:historical.userId,type:'subscription',revokedAt:null,
        feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}},
        select:{feature:true,endsAt:true,startsAt:true,meta:true}}),
    ]);
    const owner=Boolean(user?.stripeCustomerId&&user.stripeCustomerId===historical.stripeCustomerId);
    const builderPrices=(process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
    const learningPrices=[process.env.STRIPE_PRICE_MONTHLY_ID??'',process.env.STRIPE_PRICE_YEARLY_ID??''];
    const result=classifyHistory({historicalId,verifiedCustomerId:user?.stripeCustomerId??'',rows,
      builderPriceIds:builderPrices,learningPriceIds:learningPrices,now:new Date()});
    const now=new Date();
    const currentGrants=new Set(grants.filter(g=>(!g.startsAt||g.startsAt<=now)&&(!g.endsAt||g.endsAt>now)).map(g=>g.feature));
    const grantsActive=currentGrants.has(FeatureKey.build_ai_generate)&&currentGrants.has(FeatureKey.build_ai_edit);
    const grantProvenance=grants.filter(g=>currentGrants.has(g.feature)).every(g=>
      typeof g.meta==='object'&&g.meta!==null&&!Array.isArray(g.meta)&&
      (g.meta as Record<string,unknown>).source==='verified_builder_subscription');
    const processedEvent=Boolean(event?.status==='processed'&&event.subscriptionId===historicalId&&event.livemode===false);
    console.log('=== ZOEBUILD BILLING HISTORY TRIAGE V12H.2 ===');
    console.log('READ_ONLY=YES STRIPE_CALLS=NO DATABASE_WRITES=NO');
    console.log('OWNER_MATCH='+ (owner?'YES':'NO'));
    console.log('EXACT_EVENT_PROCESSED='+ (processedEvent?'YES':'NO'));
    console.log('BUILDER_PRICE_REGISTRY_COUNT='+builderPrices.length);
    console.log('LEARNING_PRICE_CONFIG_PRESENT='+(learningPrices.some(x=>x.trim())?'YES':'NO'));
    console.log('HISTORICAL_PRICE_CLASS_SCOPE=LOADED_ENV_ONLY');
    console.log('PRICE_CATALOG_COLLISION='+ (result.priceCatalogCollision?'YES':'NO'));
    console.log('ORIGINAL_PRICE_CLASS='+result.historicalPriceClass.toUpperCase());
    console.log('ORIGINAL_STORED_PRODUCT='+result.historicalProduct.toUpperCase());
    console.log('ORIGINAL_PERIOD_ELIGIBLE='+(result.historicalEligible?'YES':'NO'));
    console.log('ORIGINAL_IS_CURRENT_BUILDER_SOURCE='+(result.currentBuilderIsHistorical?'YES':'NO'));
    console.log('CURRENT_BUILDER_SUBSCRIPTION_COUNT='+result.currentBuilderCount);
    console.log('OTHER_CURRENT_BUILDER_COUNT='+result.otherCurrentBuilderCount);
    console.log('OTHER_CURRENT_BUILDER_PERIOD_DIFFERS='+(result.otherCurrentBuilderWithDifferentPeriod?'YES':'NO'));
    console.log('CURRENT_BUILDER_ROWS_MISSING_PRODUCT='+result.currentBuilderMissingProductCount);
    console.log('CURRENT_BUILDER_ROWS_CONFLICTING_PRODUCT='+result.currentBuilderConflictingProductCount);
    console.log('USER_LEVEL_BUILDER_GRANTS_ACTIVE='+(grantsActive?'YES':'NO'));
    console.log('GRANT_PROJECTION_SOURCE_CHECK='+(grantsActive&&grantProvenance?'MATCHED':'NOT_VERIFIED'));
    console.log('GRANTS_EXACT_SUBSCRIPTION_LINK=NOT_PROVEN_BY_USER_LEVEL_PROJECTION');
    // Prevent user from assuming a historical Checkout automatically backs the active source.
    const blocked=!owner||!processedEvent||!grantsActive||result.historyRequiresReview||result.currentBuilderCount!==1;
    console.log('HISTORY_TRIAGE='+ (blocked?'REVIEW_REQUIRED':'NO_HISTORY_WARNINGS'));
    if(blocked)process.exitCode=2;
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('READ_ONLY_TRIAGE_ABORTED: check local configuration/connection without sharing secrets');process.exitCode=2;});
