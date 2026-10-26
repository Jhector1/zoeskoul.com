import {describe,expect,it} from 'vitest';
import {classifyHistory,eligible,priceClass,type HistorySubscription} from '../../scripts/platformBillingHistoryPolicy';
const now=new Date('2026-10-21T00:00:00Z');
const old=():HistorySubscription=>({stripeSubscriptionId:'sub_original',stripeCustomerId:'cus_owner',priceId:'price_old',
  billingProduct:null,status:'active',currentPeriodEnd:new Date('2026-11-21T00:00:00Z'),trialEnd:null});
const newer=():HistorySubscription=>({stripeSubscriptionId:'sub_new',stripeCustomerId:'cus_owner',priceId:'price_builder',
  billingProduct:'builder_ai',status:'active',currentPeriodEnd:new Date('2027-08-22T00:00:00Z'),trialEnd:null});
const run=(rows:HistorySubscription[])=>classifyHistory({historicalId:'sub_original',verifiedCustomerId:'cus_owner',
  rows,builderPriceIds:['price_builder'],learningPriceIds:['price_learning'],now});
describe('read-only historical Builder billing evidence classification',()=>{
  it('distinguishes historical unmapped price from different current Builder subscription',()=>{
    const a=run([old(),newer()]);
    expect(a).toMatchObject({historicalPriceClass:'unmapped',historicalProduct:'MISSING',historicalEligible:true,
      ownerMatched:true,currentBuilderCount:1,currentBuilderIsHistorical:false,otherCurrentBuilderCount:1,
      otherCurrentBuilderWithDifferentPeriod:true,historyRequiresReview:true});
  });
  it('allows one clean current Builder source without history warnings',()=>{
    const a=run([{...old(),priceId:'price_builder',billingProduct:'builder_ai'}]);
    expect(a).toMatchObject({currentBuilderCount:1,currentBuilderIsHistorical:true,otherCurrentBuilderCount:0,
      storedProductWarning:false,historyRequiresReview:false});
  });
  it('never includes another Stripe customer',()=>{
    const a=run([old(),{...newer(),stripeCustomerId:'cus_foreign'}]);
    expect(a.currentBuilderCount).toBe(0);
  });
  it('fails closed for a foreign historical subscription',()=>{
    const a=run([{...old(),stripeCustomerId:'cus_foreign'},newer()]);
    expect(a.ownerMatched).toBe(false);expect(a.historyRequiresReview).toBe(true);
  });
  it('flags Builder and learning price collisions',()=>{
    const a=classifyHistory({historicalId:'sub_original',verifiedCustomerId:'cus_owner',rows:[old()],
      builderPriceIds:['price_shared'],learningPriceIds:['price_shared'],now});
    expect(a.priceCatalogCollision).toBe(true);
    expect(priceClass('price_shared',new Set(['price_shared']),new Set(['price_shared']))).toBe('collision');
  });
  it('flags active Builder subscription mislabeled as learning',()=>{
    const a=run([old(),{...newer(),billingProduct:'learning'}]);
    expect(a.currentBuilderConflictingProductCount).toBe(1);
    expect(a.historyRequiresReview).toBe(true);
  });
  it('flags active Builder subscription with missing product label',()=>{
    const a=run([old(),{...newer(),billingProduct:null}]);
    expect(a.currentBuilderMissingProductCount).toBe(1);
  });
  it('excludes expired canceled, incomplete, unpaid and paused periods',()=>{
    for(const status of ['canceled','incomplete','unpaid','paused']){
      expect(eligible({...newer(),status,currentPeriodEnd:new Date('2020-01-01')},now)).toBe(false);
    }
    for(const status of ['incomplete','unpaid','paused'])expect(eligible({...newer(),status},now)).toBe(false);
    expect(eligible({...newer(),status:'canceled'},now)).toBe(true);
  });
  it('uses trial end and not a different period to determine trial eligibility',()=>{
    expect(eligible({...newer(),status:'trialing',trialEnd:new Date('2020-01-01')},now)).toBe(false);
    expect(eligible({...newer(),status:'trialing',trialEnd:new Date('2026-10-22')},now)).toBe(true);
  });
  it('flags multiple currently eligible Builder sources',()=>{
    const a=run([{...old(),priceId:'price_builder',billingProduct:'builder_ai'},newer()]);
    expect(a.currentBuilderCount).toBe(2);expect(a.otherCurrentBuilderCount).toBe(1);expect(a.historyRequiresReview).toBe(true);
  });
});
