import { describe, expect, it, vi } from "vitest";
import {
  createDevelopmentHmrBrowserSocket, developmentHmrBrowserWebSocketUrl,
  parseDevelopmentHmrSignal, requirePublicDevelopmentHmrIngress,
  type DevelopmentHmrWebSocket,
} from "./reactPreviewDevelopmentHmrBrowserSocket";

const previewId = "preview_123e4567-e89b-42d3-a456-426614174000";
const project = "project_a";
const ingress = "https://runner.example.org";
const ticket = "A".repeat(43);
const ticketResponse = () => new Response(JSON.stringify({ok: true, ticket, expiresInMs: 20_000, requestId: "req"}), {
  status: 200, headers: {"content-type": "application/json"},
});
function make(input?: Partial<Parameters<typeof createDevelopmentHmrBrowserSocket>[0]>) {
  const fetchClient = vi.fn(async () => ticketResponse());
  const statuses = vi.fn();
  const signals = vi.fn();
  const frames=vi.fn();
  const socket: DevelopmentHmrWebSocket = {
    onopen: null, onclose: null, onerror: null, onmessage: null,
    close: vi.fn(),
  };
  const openWebSocket = vi.fn(() => socket);
  const client = createDevelopmentHmrBrowserSocket({
    buildProjectId: project, previewId, sourceVersion: 7, publicIngressOrigin: ingress,
    fetchClient, openWebSocket, onStatus: statuses, onSignal: signals, onViteFrame: frames,
    ...input,
  });
  return {client, fetchClient, openWebSocket, socket, statuses, signals, frames};
}
const flush = async () => {await Promise.resolve();await Promise.resolve();await Promise.resolve();};

describe("Phase 4E3C4A browser WebSocket admission (no iframe wiring)", () => {
  it("accepts only canonical HTTPS public ingress, never private URLs", () => {
    for (const invalid of [
      "http://runner.example.org", "https://runner.example.org/a", "https://runner.example.org/?k=1",
      "https://user:pass@runner.example.org", "https://127.0.0.1", "https://localhost",
      "https://runner.internal", "https://runner.local", "https://runner", "https://runner.example.org/",
    ]) expect(() => requirePublicDevelopmentHmrIngress(invalid)).toThrow();
    expect(requirePublicDevelopmentHmrIngress(ingress)).toBe(ingress);
    expect(developmentHmrBrowserWebSocketUrl({publicIngressOrigin:ingress,previewId,ticket}))
      .toBe(`wss://runner.example.org/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`);
    expect(() => developmentHmrBrowserWebSocketUrl({publicIngressOrigin:ingress,previewId,ticket:"bad"})).toThrow();
  });
  it("permits ONLY exact loopback HTTP ingress with explicit development opt-in", () => {
    const local = "http://runner.localhost";
    expect(() => requirePublicDevelopmentHmrIngress(local)).toThrow();
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(requirePublicDevelopmentHmrIngress(local, true)).toBe(local);
      expect(developmentHmrBrowserWebSocketUrl({
        publicIngressOrigin: local, previewId, ticket, allowLocalHttp: true,
      })).toBe(`ws://runner.localhost/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`);
      for (const rejected of [
        "http://localhost", "http://127.0.0.1", "http://runner.localhost:80",
        "http://runner.localhost/", "http://runner.localhost.evil.test",
        "http://evil.test", "http://user@runner.localhost", "http://runner.localhost/a",
        "http://runner.localhost?ticket=abc", "http://runner.localhost:8081",
      ]) expect(() => requirePublicDevelopmentHmrIngress(rejected, true)).toThrow();
      expect(() => developmentHmrBrowserWebSocketUrl({
        publicIngressOrigin: local, previewId, ticket,
      })).toThrow();
    } finally { vi.unstubAllEnvs(); }
    vi.stubEnv("NODE_ENV", "production");
    try { expect(() => requirePublicDevelopmentHmrIngress(local, true)).toThrow(); }
    finally { vi.unstubAllEnvs(); }
  });
  it("allows port 8080 only with explicit local development opt-in", async () => {
    const local = "http://runner.localhost:8080";

    vi.stubEnv("NODE_ENV", "development");

    try {
      expect(() =>
        requirePublicDevelopmentHmrIngress(local)
      ).toThrow();

      expect(
        requirePublicDevelopmentHmrIngress(local, true)
      ).toBe(local);

      expect(
        developmentHmrBrowserWebSocketUrl({
          publicIngressOrigin: local,
          previewId,
          ticket,
          allowLocalHttp: true,
        })
      ).toBe(
        `ws://runner.localhost:8080/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`
      );

      for (const rejected of [
        "http://runner.localhost:8081",
        "http://runner.localhost:3004",
        "http://runner.localhost:8080/",
        "http://runner.localhost:8080/path",
        "http://runner.localhost:8080?x=1",
        "http://runner.localhost.evil.test:8080",
        "http://user@runner.localhost:8080",
      ]) {
        expect(() =>
          requirePublicDevelopmentHmrIngress(rejected, true)
        ).toThrow();
      }

      const f = make({
        publicIngressOrigin: local,
        allowLocalHttp: true,
      });

      const pending = f.client.connect();

      await vi.waitFor(() =>
        expect(f.openWebSocket).toHaveBeenCalledTimes(1)
      );

      expect(f.openWebSocket).toHaveBeenCalledWith(
        `ws://runner.localhost:8080/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`,
        "vite-hmr",
      );

      f.socket.onopen?.();
      await pending;
      f.client.close();

    } finally {
      vi.unstubAllEnvs();
    }

    vi.stubEnv("NODE_ENV", "production");

    try {
      expect(() =>
        requirePublicDevelopmentHmrIngress(local, true)
      ).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("opens dev-only ws:// with the same one-use ticket and Vite subprotocol", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const f = make({publicIngressOrigin:"http://runner.localhost",allowLocalHttp:true});
      const pending = f.client.connect();
      await vi.waitFor(() => expect(f.openWebSocket).toHaveBeenCalledTimes(1));
      expect(f.openWebSocket).toHaveBeenCalledWith(
        `ws://runner.localhost/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`,
        "vite-hmr",
      );
      f.socket.onopen?.();
      await pending;
      f.client.close();
    } finally { vi.unstubAllEnvs(); }
  });
  it("mints exactly one server-authorized revision-bound ticket then uses Vite subprotocol", async () => {
    const f = make();
    const connected = f.client.connect();
    await vi.waitFor(() => expect(f.openWebSocket).toHaveBeenCalledTimes(1));
    expect(f.fetchClient).toHaveBeenCalledWith(
      `/api/build/projects/${project}/preview/${previewId}/development/hmr-ticket`,
      {method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify({sourceVersion:7})},
    );
    expect(f.openWebSocket).toHaveBeenCalledWith(
      `wss://runner.example.org/build/previews/${previewId}/development-hmr/ws?ticket=${ticket}`, "vite-hmr",
    );
    f.socket.onopen?.(); await connected;
    expect(f.statuses).toHaveBeenCalledWith("connected");
    f.socket.onmessage?.({data:JSON.stringify({type:"update",updates:[{path:"/private/path"}]})});
    expect(f.signals).toHaveBeenCalledWith("update");
    expect(f.signals).toHaveBeenCalledTimes(1);
    expect(f.frames).toHaveBeenCalledWith(JSON.stringify({type:"update",updates:[{path:"/private/path"}]}));
    await expect(f.client.connect()).rejects.toThrow("unavailable");
    f.client.close();
    expect(f.socket.close).toHaveBeenCalledWith(1000);
  });
  it("never forwards source, private paths, or malformed Vite payloads to the editor", () => {
    expect(parseDevelopmentHmrSignal(JSON.stringify({type:"full-reload",path:"/private"}))).toBe("full-reload");
    for (const raw of ["bad", 12, {type:"update"}, JSON.stringify({type:"unknown"}), "x".repeat(70_000)])
      expect(parseDevelopmentHmrSignal(raw)).toBeNull();
  });
  it("fails closed on error, malformed ticket, forbidden response, and never opens a socket", async () => {
    for (const response of [
      new Response("denied",{status:403}),
      new Response(JSON.stringify({ok:true,ticket:"bad",expiresInMs:20_000}),{headers:{"content-type":"application/json"}}),
      new Response(JSON.stringify({ok:true,ticket,expiresInMs:20_000,wsPath:"/private"}),{headers:{"content-type":"application/json"}}),
    ]) {
      const f = make({fetchClient:vi.fn(async()=>response)});
      await expect(f.client.connect()).rejects.toThrow("unavailable");
      expect(f.openWebSocket).not.toHaveBeenCalled();
      expect(f.statuses).toHaveBeenCalledWith("unavailable");
    }
  });
  it("closes on failed handshake and refuses reuse of a consumed ticket", async () => {
    const f = make();
    const pending = f.client.connect();
    await vi.waitFor(() => expect(f.openWebSocket).toHaveBeenCalledTimes(1));
    f.socket.onerror?.();
    await expect(pending).rejects.toThrow("unavailable");
    await expect(f.client.connect()).rejects.toThrow("unavailable");
    expect(f.fetchClient).toHaveBeenCalledTimes(1);
  });
  it("disposal during ticket issuance suppresses the late WebSocket", async () => {
    let done!: (response:Response)=>void;
    const f=make({fetchClient:()=>new Promise(resolve=>{done=resolve;})});
    const pending=f.client.connect();await flush();
    f.client.close(); done(ticketResponse());
    await expect(pending).rejects.toThrow("unavailable");
    expect(f.openWebSocket).not.toHaveBeenCalled();
  });
  it("disposal while connecting rejects the pending handshake without a timer leak", async () => {
    const f=make();const pending=f.client.connect();
    await vi.waitFor(() => expect(f.openWebSocket).toHaveBeenCalledTimes(1));
    f.client.close();
    await expect(pending).rejects.toThrow("unavailable");
    expect(f.socket.close).toHaveBeenCalled();
  });
});
