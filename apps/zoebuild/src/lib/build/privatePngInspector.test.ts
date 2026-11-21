import {describe,expect,it,vi} from "vitest";
import {deflateSync} from "node:zlib";
vi.mock("server-only",()=>({}));
import {inspectPrivatePng} from "./privatePngInspector";

function be32(n:number) {return Uint8Array.from([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);}
function concat(parts:readonly Uint8Array[]):Uint8Array {
  const out=new Uint8Array(parts.reduce((v,p)=>v+p.length,0));let i=0;
  for(const p of parts){out.set(p,i);i+=p.length;}return out;
}
function crc32(b:Uint8Array):number {
  let x=0xffffffff;
  for(const n of b){x^=n;for(let j=0;j<8;j++)x=(x>>>1)^((x&1)?0xedb88320:0);}
  return (x^0xffffffff)>>>0;
}
function chunk(type:string,data:Uint8Array):Uint8Array {
  const bytes=concat([new TextEncoder().encode(type),data]);
  return concat([be32(data.length),bytes,be32(crc32(bytes))]);
}
const sig=Uint8Array.of(137,80,78,71,13,10,26,10);
function png(width=2,height=2,filter=0):Uint8Array {
  const header=concat([be32(width),be32(height),Uint8Array.of(8,6,0,0,0)]);
  const rows=Array.from({length:height},()=>Uint8Array.from([filter,...Array(width*4).fill(32)]));
  return concat([sig,chunk("IHDR",header),chunk("IDAT",deflateSync(concat(rows))),chunk("IEND",new Uint8Array())]);
}
describe("AI4B4A bounded PNG decoder",()=>{
  it("decodes actual scanlines and dimensions",()=>{
    expect(inspectPrivatePng(png())).toEqual({mimeType:"image/png",width:2,height:2});
    for(const filter of [0,1,2,3,4])expect(inspectPrivatePng(png(3,3,filter))).toMatchObject({width:3,height:3});
  });
  it("rejects truncation, altered CRC, fake IHDR and invalid zlib",()=>{
    const valid=png();
    expect(()=>inspectPrivatePng(valid.subarray(0,valid.length-2))).toThrow("BUILD_MEDIA_IMAGE_DECODE_INVALID");
    const corrupt=Uint8Array.from(valid);corrupt[20]^=1;
    expect(()=>inspectPrivatePng(corrupt)).toThrow("BUILD_MEDIA_IMAGE_DECODE_INVALID");
    const huge=png(5000,4000);expect(()=>inspectPrivatePng(huge)).toThrow("BUILD_MEDIA_IMAGE_DECODE_INVALID");
    expect(()=>inspectPrivatePng(Uint8Array.from([137,80,78,71,13,10,26,10]))).toThrow();
  });
  it("rejects animated PNG and unsupported interlace",()=>{
    const initial=png();
    const apng=concat([initial.subarray(0,33),chunk("acTL",new Uint8Array(8)),initial.subarray(33)]);
    expect(()=>inspectPrivatePng(apng)).toThrow("BUILD_MEDIA_IMAGE_DECODE_INVALID");
    const header=concat([be32(2),be32(2),Uint8Array.of(8,6,0,0,1)]);
    const interlaced=concat([sig,chunk("IHDR",header),chunk("IDAT",deflateSync(new Uint8Array(18))),chunk("IEND",new Uint8Array())]);
    expect(()=>inspectPrivatePng(interlaced)).toThrow("BUILD_MEDIA_IMAGE_DECODE_INVALID");
  });
});
