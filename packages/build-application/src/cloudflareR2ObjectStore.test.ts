/// <reference types="node" />
import { createHmac, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCloudflareR2PrivateObjectStore, createCloudflareR2PublishBundleStore } from "./cloudflareR2ObjectStore";

const accountId = "a".repeat(32);
const config = {accountId, bucket: "zoebuild-media-dev", accessKeyId: "B".repeat(32), secretAccessKey: "C".repeat(64)};
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
const digest = createHash("sha256").update(png).digest("hex");
const key = `project-media/user_test1/build_test1/asset_test001/${digest}`;
const date = new Date("2026-11-20T17:00:00.000Z");
const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
function independentSignature(method: string, path: string, headers: Headers) {
  const raw = Object.fromEntries([...headers.entries()].filter(([k])=> k !== "authorization"));
  raw.host = `${accountId}.r2.cloudflarestorage.com`;
  const fields = Object.keys(raw).sort();
  const canonical = [method, path, "", fields.map(k=>`${k}:${raw[k]}\n`).join(""), fields.join(";"), raw["x-amz-content-sha256"]].join("\n");
  const d = raw["x-amz-date"].slice(0,8);
  const scope = `${d}/auto/s3/aws4_request`;
  const message = ["AWS4-HMAC-SHA256", raw["x-amz-date"], scope, sha(canonical)].join("\n");
  const sign = (key: Buffer | string, value: string) => createHmac("sha256",key).update(value).digest();
  const k = sign(sign(sign(sign(`AWS4${config.secretAccessKey}`,d),"auto"),"s3"),"aws4_request");
  return `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${fields.join(";")}, Signature=${createHmac("sha256",k).update(message).digest("hex")}`;
}
function fake(perform: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  let requests = 0;
  const store = createCloudflareR2PrivateObjectStore(config,{
    now: ()=>date,
    fetchImpl: (async (url, init) => { requests++; return perform(new URL(String(url)), init!); }) as typeof fetch,
  });
  return {store, get requests() {return requests;}};
}
describe("AI4B2 private Cloudflare R2 object-store adapter",()=>{
  it("rejects malformed account, bucket and credentials before network",()=>{
    expect(()=>createCloudflareR2PrivateObjectStore({...config,accountId:"localhost"})).toThrow("BUILD_MEDIA_R2_CONFIG_INVALID");
    expect(()=>createCloudflareR2PrivateObjectStore({...config,bucket:"../other"})).toThrow("BUILD_MEDIA_R2_CONFIG_INVALID");
    expect(()=>createCloudflareR2PrivateObjectStore({...config,secretAccessKey:""})).toThrow("BUILD_MEDIA_R2_CONFIG_INVALID");
    expect(()=>createCloudflareR2PrivateObjectStore(config,{timeoutMs:1})).toThrow("BUILD_MEDIA_R2_TIMEOUT_INVALID");
  });
  it("refuses traversal and non-project keys without sending",async()=>{
    const h=fake(()=>new Response(null,{status:200}));
    await expect(h.store.read("../secret")).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(h.store.read("public/mypic.png")).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    expect(h.requests).toBe(0);
  });
  it("signs immutable S3 PutObject with independent SigV4 verifier",async()=>{
    const h=fake((url,init)=>{
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe(`${accountId}.r2.cloudflarestorage.com`);
      expect(url.pathname).toBe(`/${config.bucket}/${key}`);
      expect(init.method).toBe("PUT");
      const headers=new Headers(init.headers);
      expect(headers.get("if-none-match")).toBe("*");
      expect(headers.get("content-type")).toBe("image/png");
      expect(headers.get("x-amz-content-sha256")).toBe(digest);
      expect(headers.get("authorization")).toBe(independentSignature("PUT",url.pathname,headers));
      expect(init.redirect).toBe("error");
      expect(init.cache).toBe("no-store");
      return new Response(null,{status:200});
    });
    await expect(h.store.putIfAbsent({key,bytes:png,mimeType:"image/png",sha256:digest})).resolves.toBe("created");
    expect(h.requests).toBe(1);
  });
  it("detects SHA mismatch and MIME invalid before sending",async()=>{
    const h=fake(()=>new Response(null,{status:200}));
    await expect(h.store.putIfAbsent({key,bytes:png,mimeType:"image/png",sha256:"0".repeat(64)})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_DIGEST_MISMATCH");
    await expect(h.store.putIfAbsent({key,bytes:png,mimeType:"text/html",sha256:digest})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_INVALID");
    expect(h.requests).toBe(0);
  });
  it("treats 412 as existing, not as successful overwrite",async()=>{
    const h=fake(()=>new Response(null,{status:412}));
    await expect(h.store.putIfAbsent({key,bytes:png,mimeType:"image/png",sha256:digest})).resolves.toBe("already-exists");
  });
  it("does not treat 403 or 409 as an already-existing image",async()=>{
    for (const status of [403,409,429,500]) {
      const h=fake(()=>new Response(null,{status}));
      await expect(h.store.putIfAbsent({key,bytes:png,mimeType:"image/png",sha256:digest})).rejects.toMatchObject({code:"BUILD_MEDIA_R2_WRITE_FAILED",status});
    }
  });
  it("signs S3 GetObject and reads bounded private bytes",async()=>{
    const h=fake((url,init)=>{
      expect(init.method).toBe("GET");
      const headers = new Headers(init.headers);
      expect(headers.get("authorization")).toBe(independentSignature("GET",url.pathname,headers));
      expect(headers.has("if-none-match")).toBe(false);
      return new Response(png.slice(),{status:200});
    });
    await expect(h.store.read(key)).resolves.toEqual(png);
  });
  it("returns null only on missing object, not on authorization failures",async()=>{
    await expect(fake(()=>new Response(null,{status:404})).store.read(key)).resolves.toBeNull();
    await expect(fake(()=>new Response(null,{status:403})).store.read(key)).rejects.toMatchObject({code:"BUILD_MEDIA_R2_READ_FAILED",status:403});
  });
  it("rejects oversized Content-Length without reading the body",async()=>{
    const h=fake(()=>new Response("not-an-image",{status:200,headers:{"content-length":String(20*1024*1024+1)}}));
    await expect(h.store.read(key)).rejects.toThrow("BUILD_MEDIA_R2_READ_TOO_LARGE");
  });
  it("refuses oversized streaming responses even without Content-Length",async()=>{
    const body = new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(20*1024*1024+1));c.close();}});
    const h=fake(()=>new Response(body,{status:200}));
    await expect(h.store.read(key)).rejects.toThrow("BUILD_MEDIA_R2_READ_TOO_LARGE");
  });
  it("fails closed on networking errors with no credential-bearing exception",async()=>{
    const h=fake(()=>{throw Error("SECRETKEY_IN_NETWORK_ERROR");});
    await expect(h.store.read(key)).rejects.toMatchObject({code:"BUILD_MEDIA_R2_NETWORK_UNAVAILABLE"});
  });
});


describe("private publish bundle namespace",()=>{
  it("keeps media and publish keys strictly separate and signs immutable JSON",async()=>{
    const data=new TextEncoder().encode('{"bundle":true}');const digest=sha(data);
    const publishKey=`published-artifacts/user_test1/build_test1/1/${"a".repeat(64)}/${digest}`;
    const seen:string[]=[];
    const fetchImpl=(async(url,init)=>{seen.push(String(url));const headers=new Headers(init?.headers);expect(headers.get("authorization")).toBe(independentSignature("PUT",new URL(String(url)).pathname,headers));expect(headers.get("if-none-match")).toBe("*");return new Response(null,{status:200});}) as typeof fetch;
    const publisher=createCloudflareR2PublishBundleStore(config,{fetchImpl,now:()=>date});
    const media=createCloudflareR2PrivateObjectStore(config,{fetchImpl,now:()=>date});
    await expect(publisher.read(key)).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(media.read(publishKey)).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(publisher.putIfAbsent({key:publishKey,bytes:data,mimeType:"image/png",sha256:digest})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_INVALID");
    await expect(publisher.putIfAbsent({key:publishKey,bytes:data,mimeType:"application/json",sha256:digest})).resolves.toBe("created");
    expect(seen).toHaveLength(1);
  });
});

describe("private versioned homepage thumbnails",()=>{
  it("uses only its own namespace, verifies bytes and never overwrites a saved revision",async()=>{
    const {createCloudflareR2ThumbnailStore}=await import("./cloudflareR2ObjectStore");
    const jpeg=Uint8Array.from([255,216,255,217]);
    const thumbKey=`project-thumbnails/${"a".repeat(64)}/build_test1/3/homepage-v1`;
    const seen:string[]=[];
    const fetchImpl=(async(url,init)=>{
      seen.push(String(url));
      expect(new Headers(init?.headers).get("if-none-match")).toBe("*");
      return new Response(null,{status:412});
    }) as typeof fetch;
    const store=createCloudflareR2ThumbnailStore(config,{fetchImpl,now:()=>date});
    await expect(store.read(key)).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(createCloudflareR2PrivateObjectStore(config,{fetchImpl}).read(thumbKey)).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(store.putIfAbsent({key:thumbKey,bytes:jpeg,mimeType:"image/jpeg",sha256:"0".repeat(64)})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_DIGEST_MISMATCH");
    await expect(store.putIfAbsent({key:thumbKey,bytes:jpeg,mimeType:"image/jpeg",sha256:sha(jpeg)})).resolves.toBe("already-exists");
    expect(seen).toHaveLength(1);
  });
});


describe("explicit thumbnail refresh",()=>{
  it("signs replacement only in the thumbnail namespace and leaves media and publish immutable",async()=>{
    const {createCloudflareR2ThumbnailStore}=await import("./cloudflareR2ObjectStore");
    const jpeg=Uint8Array.from([255,216,255,217]);
    const thumbKey=`project-thumbnails/${"a".repeat(64)}/build_test1/3/homepage-v1`;
    const fetchImpl=(async(url,init)=>{
      const headers=new Headers(init?.headers);
      expect(headers.has("if-none-match")).toBe(false);
      expect(headers.get("authorization")).toBe(independentSignature("PUT",new URL(String(url)).pathname,headers));
      return new Response(null,{status:200});
    }) as typeof fetch;
    const store=createCloudflareR2ThumbnailStore(config,{fetchImpl,now:()=>date});
    expect("replace" in createCloudflareR2PrivateObjectStore(config)).toBe(false);
    expect("replace" in createCloudflareR2PublishBundleStore(config)).toBe(false);
    await expect(store.replace({key,bytes:jpeg,mimeType:"image/jpeg",sha256:sha(jpeg)})).rejects.toThrow("BUILD_MEDIA_R2_KEY_INVALID");
    await expect(store.replace({key:thumbKey,bytes:jpeg,mimeType:"image/png",sha256:sha(jpeg)})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_INVALID");
    await expect(store.replace({key:thumbKey,bytes:jpeg,mimeType:"image/jpeg",sha256:"0".repeat(64)})).rejects.toThrow("BUILD_MEDIA_R2_UPLOAD_DIGEST_MISMATCH");
    await expect(store.replace({key:thumbKey,bytes:jpeg,mimeType:"image/jpeg",sha256:sha(jpeg)})).resolves.toBeUndefined();
  });
});
