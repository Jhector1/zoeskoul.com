import { Duplex } from "node:stream";
import { describe, expect, it, vi } from "vitest";
vi.mock("../docker/dockerClient.js",()=>({docker:{
  getContainer:vi.fn(),modem:{demuxStream:vi.fn((stream:Duplex,stdout:Duplex)=>stream.pipe(stdout))},
}}));
import { docker } from "../docker/dockerClient.js";
import {
  fetchTanstackHttpInsideSandbox,
  probeTanstackListenerInsideSandbox,
  retireTanstackHttpWorker,
  TanstackPreviewTransportError,
  validateTanstackPreviewWorkerReply,
} from "./tanstackPreviewDockerTransport.js";

class FakeDockerStream extends Duplex {
  readonly writes:string[]=[];
  _read() {/* replies are explicitly pushed by the test */}
  _write(chunk:Buffer,_encoding:BufferEncoding,done:(error?:Error|null)=>void) {
    this.writes.push(chunk.toString("utf8"));done();
  }
  reply(value:unknown){this.push(Buffer.from(JSON.stringify(value)+"\n"));}
}

function stage(value: unknown) {
  try {
    validateTanstackPreviewWorkerReply(value);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(TanstackPreviewTransportError);
    return (error as TanstackPreviewTransportError).stage;
  }
}

describe("TanStack Docker HTTP worker protocol diagnostics", () => {
  it("accepts a matching success envelope", () => {
    expect(validateTanstackPreviewWorkerReply({ id: 1, status: 200 }))
      .toEqual({ id: 1, status: 200 });
  });

  it("correlates multiplexed replies to the exact pending request",()=>{
    expect(validateTanstackPreviewWorkerReply({id:17,status:200},17))
      .toEqual({id:17,status:200});
    expect(stage({id:17,status:200})).toBe("worker_protocol");
  });

  it.each([
    "loopback_connection",
    "vite_request",
    "vite_response",
    "worker_protocol",
  ] as const)("preserves the bounded %s category", expected => {
    expect(stage({ id: 1, error: expected })).toBe(expected);
  });

  it("maps malformed and worker-controlled errors to the protocol category", () => {
    expect(stage({ id: 2, error: "loopback_connection" })).toBe("worker_protocol");
    expect(stage({ id: 1, error: "capability-token-or-user-source" }))
      .toBe("worker_protocol");
    expect(stage("not-an-envelope")).toBe("worker_protocol");
  });

  it("multiplexes correlated replies through one exact-container Docker exec",async()=>{
    const stream=new FakeDockerStream();
    const start=vi.fn(async()=>stream);
    const exec=vi.fn(async()=>({start}));
    vi.mocked(docker.getContainer).mockReturnValue({exec} as never);
    const request={method:"GET" as const,path:"/asset.js",headers:{accept:"*/*"},bodyBase64:""};
    const first=fetchTanstackHttpInsideSandbox("container-multiplex",request);
    const second=fetchTanstackHttpInsideSandbox("container-multiplex",{...request,path:"/style.css"});
    await vi.waitFor(()=>expect(stream.writes).toHaveLength(2));
    const ids=stream.writes.map(line=>(JSON.parse(line) as {id:number}).id);
    stream.reply({id:ids[1],status:202,headers:{"content-type":"text/css"},bodyBase64:"",upstreamDurationMs:2});
    stream.reply({id:ids[0],status:200,headers:{"content-type":"application/javascript"},bodyBase64:"",upstreamDurationMs:1});
    await expect(first).resolves.toMatchObject({status:200});
    await expect(second).resolves.toMatchObject({status:202});
    expect(exec).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    await retireTanstackHttpWorker("container-multiplex");
    expect(stream.destroyed).toBe(true);
  });
});

describe("H10W2C private listener protocol",()=>{
  it("correlates boolean listener replies using the same worker and fixed request grammar",async()=>{
    const container="listener-probe";
    const stream=new FakeDockerStream();
    const exec=vi.fn(async()=>({start:async()=>stream}));
    vi.mocked(docker.getContainer).mockReturnValue({exec} as never);
    try {
      const probe=probeTanstackListenerInsideSandbox(container,500);
      await vi.waitFor(()=>expect(stream.writes).toHaveLength(1));
      const sent=JSON.parse(stream.writes[0]);
      expect(sent).toEqual({id:1,operation:"probe-listener",timeoutMs:500});
      stream.reply({id:1,listening:false});
      await expect(probe).resolves.toBe(false);
      const ready=probeTanstackListenerInsideSandbox(container,500);
      await vi.waitFor(()=>expect(stream.writes).toHaveLength(2));
      stream.reply({id:2,listening:true});
      await expect(ready).resolves.toBe(true);
      expect(exec).toHaveBeenCalledTimes(1);
      const malformed=probeTanstackListenerInsideSandbox(container,500).catch(error=>error);
      await vi.waitFor(()=>expect(stream.writes).toHaveLength(3));
      stream.reply({id:3,listening:"true"});
      expect(await malformed).toMatchObject({stage:"worker_protocol"});
      await expect(probeTanstackListenerInsideSandbox(container,1001)).rejects.toMatchObject({stage:"worker_protocol"});
      expect(stream.writes).toHaveLength(3);
    }finally{await retireTanstackHttpWorker(container);}
  });
});

// Simulate the caller deadline, not the actual Python socket timeout.
describe("H10S2 isolated transport deadlines",()=>{
  const request={method:"GET" as const,path:"/asset.js",headers:{accept:"*/*"},bodyBase64:""};
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  function fixture(){
    const stream=new FakeDockerStream();
    const exec=vi.fn(async()=>({start:async()=>stream}));
    vi.mocked(docker.getContainer).mockReturnValue({exec} as never);
    return {stream,exec};
  }
  function reply(stream:FakeDockerStream,index:number){
    stream.reply({id:JSON.parse(stream.writes[index]).id,status:200,headers:{"content-type":"text/css"},bodyBase64:"",upstreamDurationMs:1});
  }
  it("preserves healthy requests and consumes one correlated late reply",async()=>{
    vi.useFakeTimers();const container="isolated-deadline";const {stream,exec}=fixture();
    try{
      const first=fetchTanstackHttpInsideSandbox(container,request).catch(error=>error);
      await flush();expect(stream.writes).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(12_000);
      const second=fetchTanstackHttpInsideSandbox(container,request);
      await flush();expect(stream.writes).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(await first).toMatchObject({stage:"deadline"});expect(stream.destroyed).toBe(false);
      reply(stream,0);reply(stream,1);await expect(second).resolves.toMatchObject({status:200});
      const third=fetchTanstackHttpInsideSandbox(container,request);await flush();reply(stream,2);
      await expect(third).resolves.toMatchObject({status:200});expect(exec).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(48_000);expect(stream.destroyed).toBe(false);
    }finally{await retireTanstackHttpWorker(container);vi.useRealTimers();}
  });
  it("retains timed-out slots and retires a persistently stuck worker",async()=>{
    vi.useFakeTimers();const container="bounded-deadlines";const {stream}=fixture();
    try{
      const operations=Array.from({length:32},()=>fetchTanstackHttpInsideSandbox(container,request).catch(error=>error));
      await flush();expect(stream.writes).toHaveLength(32);
      await vi.advanceTimersByTimeAsync(24_000);
      for(const result of await Promise.all(operations))expect(result).toMatchObject({stage:"deadline"});
      expect(stream.destroyed).toBe(false);
      await expect(fetchTanstackHttpInsideSandbox(container,request)).rejects.toMatchObject({stage:"worker_protocol"});
      expect(stream.writes).toHaveLength(32);
      await vi.advanceTimersByTimeAsync(24_000);expect(stream.destroyed).toBe(true);
    }finally{await retireTanstackHttpWorker(container);vi.useRealTimers();}
  });
  it("rejects an unknown reply and never replays outstanding requests",async()=>{
    const container="unknown-deadline-reply";const {stream}=fixture();
    try{
      const p=fetchTanstackHttpInsideSandbox(container,request).catch(error=>error);
      await flush();expect(stream.writes).toHaveLength(1);
      stream.reply({id:999,status:200});expect(await p).toMatchObject({stage:"worker_protocol"});
      expect(stream.destroyed).toBe(true);expect(stream.writes).toHaveLength(1);
    }finally{await retireTanstackHttpWorker(container);}
  });
});
