import {describe,expect,it} from "vitest";
import {groupRevisionsByDate} from "./historyDateGroups";

describe("version history date folders",()=>{
  it("groups versions by local date and sorts most recent first",()=>{
    const groups=groupRevisionsByDate([
      {version:1,createdAt:"2026-10-25T09:00:00"},
      {version:4,createdAt:"2026-10-27T17:20:00"},
      {version:2,createdAt:"2026-10-25T21:00:00"},
      {version:3,createdAt:"2026-10-26T08:00:00"},
    ],"en-US");
    expect(groups.map(g=>g.key)).toEqual(["2026-10-27","2026-10-26","2026-10-25"]);
    expect(groups[2].revisions.map(r=>r.version)).toEqual([2,1]);
  });
  it("does not mutate server-provided revision ordering",()=>{
    const input=[{version:1,createdAt:"2026-10-25T00:00:00"},
      {version:2,createdAt:"2026-10-26T00:00:00"}];
    groupRevisionsByDate(input);
    expect(input.map(r=>r.version)).toEqual([1,2]);
  });
});
