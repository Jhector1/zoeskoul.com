import assert from "node:assert/strict";
import { test } from "vitest";
import { acknowledgeDisposableCancel, disposableCloseMessage } from "./fullPrivilegesRecovery";
test("explicit cancellation uses the existing authenticated endpoint", async () => {
  let calls = 0;
  await acknowledgeDisposableCancel("a/b", (async (url, options) => {
    calls++;
    assert.equal(url, "/api/run/pty/sessions/a%2Fb/cancel");
    assert.deepEqual(options, {method:"POST", credentials:"same-origin"});
    return new Response(JSON.stringify({ok:true}), {status:200});
  }) as typeof fetch);
  assert.equal(calls, 1);
});
test("refuses restart following rejected cancellation or malformed acknowledgement", async () => {
  for (const [body,status] of [["{\"ok\":true}",403],["{\"ok\":false}",200],["bad",200]] as const) {
    await assert.rejects(acknowledgeDisposableCancel("sid", (async () => new Response(body,{status})) as typeof fetch));
  }
});
test("network failure is not interpreted as successful cancellation", async () => {
  await assert.rejects(acknowledgeDisposableCancel("sid", (async () => {throw new Error("network");}) as typeof fetch));
});
test("terminal recovery describes timeouts and destructive restart without exposing raw close reasons", () => {
  assert.match(disposableCloseMessage("Session timed_out"),/inactivity or maximum lifetime/);
  assert.match(disposableCloseMessage("Session timed_out"),/loses its files/);
  assert.match(disposableCloseMessage("Session canceled"),/canceled/);
  assert.doesNotMatch(disposableCloseMessage("SECRET"),/SECRET/);
});
