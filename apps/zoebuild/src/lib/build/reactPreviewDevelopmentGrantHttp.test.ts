import {describe,expect,it} from "vitest";
import {readDevelopmentPreviewGrantRenewal,readDevelopmentPreviewUpdate} from "./reactPreviewDevelopmentGrantHttp";
const good="dpg1."+"a".repeat(43);
function request(body:unknown,type="application/json"){return new Request("https://app.example/renew",{
 method:"POST",headers:{"Content-Type":type},body:JSON.stringify(body)});}
describe("Phase 4E3C4B2 bounded renewal request",()=>{
 it("accepts only exact revision plus opaque durable token",async()=>{
  expect(await readDevelopmentPreviewGrantRenewal(request({sourceVersion:7,grantToken:good})))
   .toEqual({sourceVersion:7,grantToken:good});
  for(const body of [{sourceVersion:7,grantToken:good,actorKey:"x"},
   {sourceVersion:"7",grantToken:good},{sourceVersion:0,grantToken:good},
   {sourceVersion:7,grantToken:"dpv1."+"a".repeat(100)},[]])
   await expect(readDevelopmentPreviewGrantRenewal(request(body))).rejects.toMatchObject({status:400});
 });
 it("rejects oversized payload and invalid content-type",async()=>{
  await expect(readDevelopmentPreviewGrantRenewal(request({sourceVersion:7,grantToken:good},"text/plain")))
   .rejects.toMatchObject({status:400});
  await expect(readDevelopmentPreviewGrantRenewal(request({sourceVersion:7,grantToken:good,padding:"z".repeat(5000)})))
   .rejects.toMatchObject({status:413});
 });
});

it("accepts only revision or revision plus durable grant on update",async()=>{
 expect(await readDevelopmentPreviewUpdate(request({sourceVersion:7}))).toEqual({sourceVersion:7});
 expect(await readDevelopmentPreviewUpdate(request({sourceVersion:7,grantToken:good}))).toEqual({sourceVersion:7,grantToken:good});
 for(const body of [{sourceVersion:7,grantToken:null},{sourceVersion:7,grantToken:good,workspace:{}},{sourceVersion:7,unknown:true},{sourceVersion:7,grantToken:"bad"}])
  await expect(readDevelopmentPreviewUpdate(request(body))).rejects.toMatchObject({status:400});
 await expect(readDevelopmentPreviewGrantRenewal(request({sourceVersion:7}))).rejects.toMatchObject({status:400});
});
