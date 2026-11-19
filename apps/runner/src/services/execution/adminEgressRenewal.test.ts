import assert from "node:assert/strict";
import { test } from "vitest";
import { AdminEgressRenewal, adminEgressPinsForConfiguration, renewalEligible } from "./adminEgressRenewal.js";
import { parseAdminEgressPins } from "./adminEgressPins.js";

const hosts = () => ({"archive.ubuntu.com":["185.125.190.81"],"security.ubuntu.com":["185.125.190.82"],"example.com":["93.184.216.34"]});
const seed = (expiresAt: number) => JSON.stringify({expiresAt,hosts:hosts()});
const eligible = () => ({
  RUNNER_EXECUTION_POOL: "zoeskoul-learning",
  ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED: "true",
  ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development",
  ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "per-session-controlled-egress",
  ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "false",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK: "PROTECTED_LIFECYCLE_TEST_ONLY",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE: `sha256:${"a".repeat(64)}`,
  ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE: `sha256:${"b".repeat(64)}`,
});

test("renewal publishes fresh complete pins without mutating an existing session snapshot",async()=>{
 let now=1000;
 const c=new AdminEgressRenewal(seed(1400),async()=>({...hosts(),"example.com":["104.20.23.154"]}),()=>now);
 const old=c.current(); now+=100;
 assert.equal(await c.refresh(),true);
 assert.equal(JSON.parse(c.current()).expiresAt,4700);
 assert.deepEqual(JSON.parse(c.current()).hosts["example.com"],["104.20.23.154"]);
 assert.equal(JSON.parse(old).expiresAt,1400);
 assert.deepEqual(JSON.parse(old).hosts["example.com"],["93.184.216.34"]);
});
test("expired bootstrap can recover from trusted lookup",async()=>{
 const c=new AdminEgressRenewal(seed(999),async()=>hosts(),()=>1000);
 assert.throws(()=>c.current()); assert.equal(await c.refresh(),true); assert.equal(c.expiry(),4600);
});
test("DNS failure preserves last good policy only during original validity",async()=>{
 let now=1000;
 const c=new AdminEgressRenewal(seed(1200),async()=>{throw Error("DNS failure")},()=>now);
 const old=c.current(); assert.equal(await c.refresh(),false); assert.equal(c.current(),old);
 now=1141; assert.throws(()=>c.current()); now=1200; assert.throws(()=>c.current());
 assert.equal(await c.refresh(),false); assert.throws(()=>c.current());
});
test("rejects private, loopback, metadata and special-use IPv4 without replacing seed",async()=>{
 for(const ip of ["10.0.0.1","127.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","192.0.2.1","224.0.0.1","240.0.0.1","::1","001.2.3.4"]){
  const c=new AdminEgressRenewal(seed(1300),async()=>({...hosts(),"example.com":[ip]}),()=>1000);
  assert.equal(await c.refresh(),false); assert.equal(c.current(),seed(1300));
 }
});
test("rejects missing, extra, empty, duplicate or excessive DNS answers",async()=>{
 const bad=[{"example.com":["8.8.8.8"]},{...hosts(),"other.test":["8.8.8.8"]},{...hosts(),"example.com":[]},{...hosts(),"example.com":["8.8.8.8","8.8.8.8"]},{...hosts(),"example.com":Array.from({length:33},(_,i)=>`8.8.8.${i+1}`)}];
 for(const records of bad){
  const c=new AdminEgressRenewal("",async()=>records as ReturnType<typeof hosts>,()=>1000);
  assert.equal(await c.refresh(),false); assert.throws(()=>c.current());
 }
});
test("concurrent refresh callers share one lookup",async()=>{
 let release!: (value:ReturnType<typeof hosts>)=>void;
 let calls=0;
 const c=new AdminEgressRenewal("",()=>{calls++;return new Promise(r=>{release=r})},()=>1000);
 const a=c.refresh(), b=c.refresh(); assert.equal(a,b);
 await Promise.resolve(); assert.equal(calls,1); release(hosts());
 assert.equal(await a,true); assert.equal(await b,true);
 assert.equal(c.expiry(),4600);
});
test("failed lookup can retry and recover",async()=>{
 let calls=0;
 const c=new AdminEgressRenewal("",async()=>{if(++calls===1)throw Error();return hosts()},()=>1000);
 assert.equal(await c.refresh(),false); assert.equal(await c.refresh(),true); assert.equal(calls,2);
});
test("backwards clock cannot publish older deadline",async()=>{
 let now=1000;
 const c=new AdminEgressRenewal("",async()=>hosts(),()=>now);
 assert.equal(await c.refresh(),true); now=900;
 assert.equal(await c.refresh(),false); assert.equal(c.expiry(),4600); assert.throws(()=>c.current());
});
test("admission remains bounded to 60 through 3600 seconds",()=>{
 for(const exp of [999,1000,1059,4601])assert.throws(()=>parseAdminEgressPins(seed(exp),1000));
 for(const exp of [1060,4600])assert.equal(parseAdminEgressPins(seed(exp),1000).expiresAt,exp);
});
test("scope restricted to acknowledged protected Learning development",()=>{
 assert.equal(renewalEligible(eligible()),true);
 for(const patch of [{RUNNER_EXECUTION_POOL:"zoebuild"},{ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED:"false"},{ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE:"production"},{ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY:"per-session-internal"},{ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK:"true"},{ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK:"wrong"},{ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE:"latest"},{ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE:`sha256:${"a".repeat(64)}`}])assert.equal(renewalEligible({...eligible(),...patch}),false);
});
test("explicit configuration retains static path and never inherits process runtime",()=>{
 const e={...eligible(),ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON:seed(1300)};
 assert.equal(adminEgressPinsForConfiguration(e),seed(1300)); assert.equal(adminEgressPinsForConfiguration({}),"");
});

test("wall-clock rollback cannot resurrect a snapshot after monotonic expiration",()=>{
 let wall=1000, mono=0;
 const c=new AdminEgressRenewal(seed(1300),async()=>hosts(),()=>wall,()=>mono);
 assert.equal(c.current(),seed(1300));
 mono=301; wall=1000;
 assert.throws(()=>c.current());
});

test("small wall-clock rollback cannot lengthen the remaining kernel lease",()=>{
 let wall=1000, mono=0;
 const c=new AdminEgressRenewal(seed(1300),async()=>hosts(),()=>wall,()=>mono);
 mono=100; wall=1050;
 assert.equal(JSON.parse(c.current()).expiresAt,1250);
});
