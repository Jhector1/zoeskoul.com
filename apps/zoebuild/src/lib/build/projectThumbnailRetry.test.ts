import { describe,expect,it } from "vitest";
import { THUMBNAIL_INITIAL_DELAY_MS,THUMBNAIL_MAX_ATTEMPTS,thumbnailRetryDelay } from "./projectThumbnailRetry";
describe("bounded idle thumbnail retries",()=>{
  it("waits 12 seconds and permits only two additional attempts",()=>{
    expect(THUMBNAIL_INITIAL_DELAY_MS).toBe(12000);
    expect(THUMBNAIL_MAX_ATTEMPTS).toBe(3);
    expect([1,2,3,4].map(n=>thumbnailRetryDelay(n,503))).toEqual([8000,20000,null,null]);
  });
  it("retries transient network and capacity failures, not stale or unauthorized requests",()=>{
    for(const status of [null,429,503])expect(thumbnailRetryDelay(1,status)).toBe(8000);
    for(const status of [200,400,401,403,404,409,413,500])expect(thumbnailRetryDelay(1,status)).toBeNull();
  });
});
