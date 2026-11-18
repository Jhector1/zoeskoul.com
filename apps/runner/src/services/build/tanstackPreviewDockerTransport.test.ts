import { Duplex } from "node:stream";
import { describe, expect, it, vi } from "vitest";
vi.mock("../docker/dockerClient.js",()=>({docker:{
  getContainer:vi.fn(),modem:{demuxStream:vi.fn((stream:Duplex,stdout:Duplex)=>stream.pipe(stdout))},
}}));
import { docker } from "../docker/dockerClient.js";
import {
  fetchTanstackHttpInsideSandbox,
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
