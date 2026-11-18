import { describe, expect, it } from "vitest";
import { TANSTACK_PREVIEW_HMR_WORKER } from "./tanstackPreviewHmrWorker.js";

describe("TanStack preview HMR worker Vite WebSocket authorization", () => {
  it("retrieves one bounded Vite token over sandbox loopback and preserves the token check", () => {
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain("CLIENT_LIMIT=524288");
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain(
      "connection.request('GET',path+'@vite/client'",
    );
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain(
      "TOKEN=re.compile(r'(?m)^const wsToken = \"([A-Za-z0-9_-]{12})\";$')",
    );
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain("if len(matches)!=1: raise ValueError()");
    expect(TANSTACK_PREVIEW_HMR_WORKER).not.toContain("skipWebSocketTokenCheck");
  });

  it("keeps the Vite token inside the sandbox WebSocket request", () => {
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain(
      "request_path=path+'?token='+urllib.parse.quote(token,safe='')",
    );
    expect(TANSTACK_PREVIEW_HMR_WORKER).toContain(
      "request=('GET '+request_path+' HTTP/1.1\\r\\nHost: 127.0.0.1:5173\\r\\n'",
    );
    expect(TANSTACK_PREVIEW_HMR_WORKER).not.toContain("reply('token'");
  });
});
