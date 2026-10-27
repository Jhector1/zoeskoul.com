import {test} from "node:test";
import {strict as assert} from "node:assert";
import {validResultKey,inspectResultWriterKeys} from "./ai-result-key-preflight-v12k11a.mjs";
const keyA=Buffer.alloc(32,1).toString("base64");
const keyB=Buffer.alloc(32,2).toString("base64");
test("validates canonical 256-bit AES-GCM result keys",()=>{
  assert.equal(validResultKey(keyA),true);
  for(const bad of [undefined,"",keyA.slice(0,-1),"A".repeat(44),"@@@"])
    assert.equal(validResultKey(bad),false);
});
test("checks active version is configured and canonical",()=>{
  assert.equal(inspectResultWriterKeys({}).valid,false);
  assert.equal(inspectResultWriterKeys({v1:keyA,activeId:"v1"}).valid,true);
  assert.equal(inspectResultWriterKeys({v3:keyB,activeId:"v3"}).valid,true);
  assert.equal(inspectResultWriterKeys({v1:keyA,activeId:"v3"}).valid,false);
});
test("rejects duplicate rotation keys and orphan v2",()=>{
  assert.equal(inspectResultWriterKeys({v1:keyA,v2:keyA,activeId:"v2"}).valid,false);
  assert.equal(inspectResultWriterKeys({v2:keyB,activeId:"v2"}).valid,false);
  assert.equal(inspectResultWriterKeys({v1:keyA,v2:keyB,activeId:"v2"}).valid,true);
});
test("does not expose secret values in returned inventory",()=>{
  const json=JSON.stringify(inspectResultWriterKeys({v1:keyA,activeId:"v1"}));
  assert.equal(json.includes(keyA),false);
  assert.equal(json.includes("v1"),true);
});
