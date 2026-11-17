import {describe,it,expect,vi} from "vitest";
import {makeTanstackDevelopmentHmrTicketRoute} from "./build.previews.developmentHmrTicket.js";

const previewId="preview_123e4567-e89b-42d3-a456-426614174000";
const actorKey=`u:${"a".repeat(64)}`;
const body={buildProjectId:"project_abc",sourceVersion:7,origin:"https://zoeskoul.example"};

function fixture(enabled=true) {
  const deps={
    enabled:vi.fn(()=>enabled), actorKey:vi.fn(()=>actorKey),
    assertLease:vi.fn(), issue:vi.fn(()=>"one-use-secret"),
    allowedOrigins:vi.fn(()=>["https://zoeskoul.example"]),
  };
  const res={status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};
  const invoke=(override:unknown=body) => makeTanstackDevelopmentHmrTicketRoute(deps)({
    params:{previewId},body:override,
  } as never,res as never,vi.fn());
  return {deps,res,invoke};
}

describe("Phase 4E3C3 service-only HMR ticket route",()=>{
  it("denies disabled mode before ticket allocation",()=>{
    const f=fixture(false);f.invoke();
    expect(f.res.status).toHaveBeenCalledWith(404);
    expect(f.deps.issue).not.toHaveBeenCalled();
  });
  it("asserts the exact service actor and current development lease",()=>{
    const f=fixture();f.invoke();
    expect(f.deps.assertLease).toHaveBeenCalledWith({
      ownerKey:actorKey,previewId,buildProjectId:"project_abc",sourceVersion:7,
    });
    expect(f.deps.issue).toHaveBeenCalledOnce();
    expect(f.res.set).toHaveBeenCalledWith("Cache-Control","no-store");
    expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({ok:true,expiresInMs:20000}));
  });
  it("rejects extra browser fields, invalid revision and unapproved Origin",()=>{
    const f=fixture();
    f.invoke({...body,files:[]});f.invoke({...body,sourceVersion:8.4});
    f.invoke({...body,origin:"https://attacker.example"});
    expect(f.deps.issue).not.toHaveBeenCalled();
    expect(f.res.status).toHaveBeenCalledWith(404);
  });
  it("refuses a stale lease with no ticket or sensitive response",()=>{
    const f=fixture();f.deps.assertLease.mockImplementationOnce(()=>{throw Error("secret internal docker path");});
    f.invoke();expect(f.deps.issue).not.toHaveBeenCalled();
    expect(f.res.json).toHaveBeenCalledWith({ok:false,code:"NOT_FOUND"});
  });
});
