import {describe,expect,it} from "vitest";
import {readPrivateMediaUpload,publicMediaMetadata} from "./privateMediaTransport";

describe("AI4B4A private media HTTP helpers",()=>{
  it("bounds request bodies without trusting content length",async()=>{
    const raw=Uint8Array.of(1,2,3,4);
    expect(await readPrivateMediaUpload(new Request("https://test.invalid",{method:"POST",body:raw}))).toEqual(raw);
    await expect(readPrivateMediaUpload(new Request("https://test.invalid",{method:"POST",headers:{"content-length":String(25*1024*1024)},body:raw}))).rejects.toMatchObject({status:413});
    await expect(readPrivateMediaUpload(new Request("https://test.invalid",{method:"POST",body:new Uint8Array()}))).rejects.toMatchObject({status:400});
  });
  it("returns safe media listing metadata without object keys or owner ids",()=>{
    const result=publicMediaMetadata({id:"asset_abcdefghijkl",kind:"image",origin:"uploaded",mimeType:"image/png",width:2,height:3,byteLength:91,altText:null},"build-project123");
    expect(result.previewPath).toContain("/media/asset_abcdefghijkl");
    expect(JSON.stringify(result)).not.toContain("objectKey");
  });
});
