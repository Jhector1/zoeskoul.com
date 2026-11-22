import {describe,expect,it} from "vitest";
import {readDevelopmentPreviewRevision} from "./reactPreviewDevelopmentHttp";

const endpoint="http://localhost/api/build/projects/p/preview/development/start";
function req(body:string,headers:Record<string,string>={}) {
  return new Request(endpoint,{method:"POST",headers:{"content-type":"application/json",...headers},body});
}
describe("Phase 4E1 bounded development revision request",()=>{
  it("accepts only one positive integer revision",async()=>{
    expect(await readDevelopmentPreviewRevision(req('{"sourceVersion":8}'))).toBe(8);
    for(const invalid of [
      '{"sourceVersion":"8"}','{"sourceVersion":0}',
      '{"sourceVersion":1.5}','{"sourceVersion":8,"workspace":{}}',
      '{"sourceVersion":8,"actorKey":"fake"}','[8]','{"sourceVersion":1e100}',
      '{"sourceVersion":8,"__proto__":1}', 'garbage',
    ]) await expect(readDevelopmentPreviewRevision(req(invalid))).rejects.toMatchObject({status:400});
  });
  it("enforces upload size with and without Content-Length",async()=>{
    await expect(readDevelopmentPreviewRevision(req('{"sourceVersion":8}',{"content-length":"10000"})))
      .rejects.toMatchObject({status:413});
    await expect(readDevelopmentPreviewRevision(req(' '.repeat(5000)+ '{"sourceVersion":8}')))
      .rejects.toMatchObject({status:413});
  });
  it("requires JSON content type and a body",async()=>{
    await expect(readDevelopmentPreviewRevision(req('{"sourceVersion":8}',{"content-type":"text/plain"})))
      .rejects.toMatchObject({status:400});
    await expect(readDevelopmentPreviewRevision(new Request(endpoint,{method:"POST"})))
      .rejects.toMatchObject({status:400});
  });
});
