import {afterEach, describe, expect, it, vi} from "vitest";
import {EventEmitter} from "node:events";

const {lease, openRelay, upgrade} = vi.hoisted(() => ({
  lease:vi.fn(), openRelay:vi.fn(), upgrade:vi.fn(),
}));
vi.mock("../services/build/sharedPreviewRegistry.js", () => ({
  sharedFullStackPreviews: {assertDevelopmentReadOpen:lease},
}));
vi.mock("../services/build/tanstackPreviewHmrDockerRelay.js", () => ({
  openOwnedTanstackDevelopmentHmrRelay:openRelay,
}));
vi.mock("ws", () => ({
  WebSocket: {OPEN:1},
  WebSocketServer:class {handleUpgrade(...args: unknown[]) { upgrade(...args); }},
}));
import {attachTanstackDevelopmentHmrWsServer} from "./tanstackDevelopmentHmrWsServer.js";
import {developmentHmrTickets} from "../services/build/tanstackDevelopmentHmrTickets.js";

const identity={ownerKey:`u:${"a".repeat(64)}`,previewId:"preview_123e4567-e89b-42d3-a456-426614174000",buildProjectId:"project_abc",sourceVersion:7};
const origin="https://zoeskoul.example";
function fixture(ticket: string) {
  const req={url:`/build/previews/${identity.previewId}/development-hmr/ws?ticket=${ticket}`,
    headers:{origin,upgrade:"websocket","sec-websocket-protocol":"vite-hmr"}};
  const socket={end:vi.fn(),destroy:vi.fn()};
  return {req,socket};
}
afterEach(()=>{
  delete process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED;
  delete process.env.RUNNER_EXECUTION_POOL;
  delete process.env.ALLOWED_WEB_ORIGINS;
  upgrade.mockReset();lease.mockReset();openRelay.mockReset();
});
describe("Phase 4E3C3 Runner WebSocket upgrade boundary",()=>{
  it("does not intercept existing learner terminal WebSocket paths",()=>{
    const f=fixture("bad"); f.req.url="/sessions/learner/ws";
    expect(attachTanstackDevelopmentHmrWsServer()(f.req as never,f.socket as never,Buffer.alloc(0))).toBe(false);
  });
  it("does not expose a socket when the dedicated feature flag is disabled",()=>{
    const f=fixture("bad");
    expect(attachTanstackDevelopmentHmrWsServer()(f.req as never,f.socket as never,Buffer.alloc(0))).toBe(true);
    expect(f.socket.end).toHaveBeenCalledWith(expect.stringContaining("404"));
    expect(upgrade).not.toHaveBeenCalled();
  });
  it("rejects unlisted Origins before upgrading even when enabled",()=>{
    process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED="true";
    process.env.RUNNER_EXECUTION_POOL="zoebuild";
    process.env.ALLOWED_WEB_ORIGINS="https://other.example";
    const f=fixture("bad");
    attachTanstackDevelopmentHmrWsServer()(f.req as never,f.socket as never,Buffer.alloc(0));
    expect(f.socket.end).toHaveBeenCalledWith(expect.stringContaining("403"));
    expect(upgrade).not.toHaveBeenCalled();
  });
  it("consumes a one-use exact lease ticket and opens a restricted relay",async()=>{
    process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED="true";
    process.env.RUNNER_EXECUTION_POOL="zoebuild";
    process.env.ALLOWED_WEB_ORIGINS=origin;
    const ticket=developmentHmrTickets.issue(identity,origin);
    const f=fixture(ticket);
    const ws=new EventEmitter() as EventEmitter & {readyState:number;send:ReturnType<typeof vi.fn>;close:ReturnType<typeof vi.fn>;terminate:ReturnType<typeof vi.fn>};
    ws.readyState=1;ws.send=vi.fn();ws.close=vi.fn();ws.terminate=vi.fn();
    const sendText=vi.fn();const close=vi.fn();
    openRelay.mockResolvedValue({sendText,close});
    upgrade.mockImplementation((_req,_socket,_head,ready)=>ready(ws));
    expect(attachTanstackDevelopmentHmrWsServer()(f.req as never,f.socket as never,Buffer.alloc(0))).toBe(true);
    await vi.waitFor(()=>expect(openRelay).toHaveBeenCalledOnce());
    expect(lease).toHaveBeenCalledWith(identity);
    await vi.waitFor(()=>expect(ws.listenerCount("message")).toBe(1));
    ws.emit("message",Buffer.from('{"type":"ping"}'),false);
    expect(sendText).toHaveBeenCalledWith('{"type":"ping"}');
    ws.emit("message",Buffer.from('{"type":"custom"}'),false);
    expect(close).toHaveBeenCalledOnce();
    expect(ws.close).toHaveBeenCalled();
    expect(()=>developmentHmrTickets.consume(ticket,identity.previewId,origin)).toThrow();
  });
});
