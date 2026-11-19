import assert from "node:assert/strict";
import { test } from "vitest";
import { classifySequence, reconnectDelaysMs, requestAdminReattach, ReattachRejected, terminalCloseIsFinal, terminalSessionEnded, validatedSocketUrl } from "./fullPrivilegesReconnect";
const first = "ws://localhost:4001/sessions/sid/ws?token=first";
const fresh = "ws://localhost:4001/sessions/sid/ws?token=fresh";
const signal = new AbortController().signal;
const reply = (value: unknown, status = 200) => (async () => new Response(JSON.stringify(value), {status})) as typeof fetch;
test("sequence accepts monotonic output and ignores repeated events", () => {
  assert.equal(classifySequence(0,1),"next");
  assert.equal(classifySequence(10,10),"duplicate");
  assert.equal(classifySequence(10,1),"duplicate");
  assert.equal(classifySequence(10,11),"next");
});
test("sequence flags missing history and rejects malformed events", () => {
  assert.equal(classifySequence(10,13),"gap");
  for (const value of [null,undefined,"11",0,-1,1.3,Infinity]) assert.equal(classifySequence(10,value),"invalid");
});
test("terminal cancellation and expiry are final", () => {
  for (const state of ["completed","canceled","failed","timed_out"]) {assert.equal(terminalSessionEnded(state),true); assert.equal(terminalCloseIsFinal(1012,`Session ${state}`),true);}
  assert.equal(terminalCloseIsFinal(1008,""),true);
  assert.equal(terminalCloseIsFinal(1006,""),false);
  assert.equal(terminalSessionEnded("waiting_for_input"),false);
});
test("retry schedule is bounded",()=>{assert.deepEqual([...reconnectDelaysMs],[1000,2000,4000,8000]);});
test("fresh token uses exact existing endpoint and no body", async()=>{
  const result=await requestAdminReattach("sid",first,signal,(async (url,options)=>{
    assert.equal(url,"/api/run/pty/sessions/sid/admin/reattach");
    assert.deepEqual(options,{method:"POST",credentials:"same-origin",cache:"no-store",signal});
    return new Response(JSON.stringify({ok:true,sessionId:"sid",state:"running",wsUrl:fresh}));
  }) as typeof fetch);
  assert.equal(result,fresh);
});
test("authorization rejection is terminal",async()=>{
  for(const status of [400,401,403,404,410]) await assert.rejects(requestAdminReattach("sid",first,signal,reply({},status)),ReattachRejected);
});
test("service failures may be retried without creating a session",async()=>{
  for(const status of [429,500,503]) await assert.rejects(requestAdminReattach("sid",first,signal,reply({},status)),e=>e instanceof Error && !(e instanceof ReattachRejected));
});
test("foreign or final session response cannot attach",async()=>{
  for(const value of [{ok:true,sessionId:"other",state:"running",wsUrl:fresh},{ok:true,sessionId:"sid",state:"timed_out",wsUrl:fresh},{ok:false,sessionId:"sid",state:"running",wsUrl:fresh}]) await assert.rejects(requestAdminReattach("sid",first,signal,reply(value)),ReattachRejected);
});
test("fresh socket cannot change server, path, or reuse token",()=>{
  for(const value of [first,"wss://localhost:4001/sessions/sid/ws?token=fresh","ws://other:4001/sessions/sid/ws?token=fresh","ws://localhost:4001/sessions/other/ws?token=fresh","ws://localhost:4001/sessions/sid/ws?token=a&token=b","ws://user@localhost:4001/sessions/sid/ws?token=fresh","https://localhost:4001/sessions/sid/ws?token=fresh"]) assert.throws(()=>validatedSocketUrl(value,first),ReattachRejected);
  assert.equal(validatedSocketUrl(fresh,first),fresh);
});
