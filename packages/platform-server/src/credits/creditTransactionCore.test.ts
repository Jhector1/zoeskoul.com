import {describe,it,expect,vi} from "vitest";
import {classifyCreditReservation,runSerializableCreditTransaction,
  splitCreditReservationAllocation,assertCreditSettlementCovered} from "./creditTransactionCore";

const code=(value:string)=>Object.assign(new Error(value),{code:value});
describe("shared credit transaction contracts — distinct units and writers",()=>{
  it("retries P2034 twice with SERIALIZABLE and returns the third committed result",async()=>{
    let attempts=0;
    // Keep the generic transaction contract intact: vi.fn() erases the
    // polymorphic <T> and widens its return type to Promise<unknown>.
    const db={$transaction:async <T>(fn:(tx:{id:number})=>Promise<T>,option:{isolationLevel:"Serializable"}):Promise<T>=>{
      expect(option).toEqual({isolationLevel:"Serializable"});
      if(++attempts<3)throw code("P2034");
      return fn({id:3});
    }};
    expect(await runSerializableCreditTransaction<{id:number},number>(db,async tx=>tx.id)).toBe(3);
    expect(attempts).toBe(3);
  });
  it("never retries unknown failures, and P2034 exhaustion fails without a fourth attempt",async()=>{
    const run=vi.fn(async()=>{throw code("P2034")});
    await expect(runSerializableCreditTransaction({$transaction:run},async()=>1)).rejects.toMatchObject({code:"P2034"});
    expect(run).toHaveBeenCalledTimes(3);
    const other=vi.fn(async()=>{throw code("P2002")});
    await expect(runSerializableCreditTransaction({$transaction:other},async()=>1)).rejects.toMatchObject({code:"P2002"});
    expect(other).toHaveBeenCalledOnce();
  });
  it("never retries a failed external operation after an application error",async()=>{
    const invoked=vi.fn(async()=>{throw Error("OUTSIDE_DB_FAILED")});
    // Preserve the generic return type and spy on the invoked operation instead.
    const db={$transaction:async <T>(fn:(tx:undefined)=>Promise<T>,_option:{isolationLevel:"Serializable"}):Promise<T>=>fn(undefined)};
    await expect(runSerializableCreditTransaction(db,invoked)).rejects.toThrow("OUTSIDE_DB_FAILED");
    expect(invoked).toHaveBeenCalledOnce();
  });
  it("simulates competing SERIALIZABLE reservations without double spending",async()=>{
    let available=10n;let pending=Promise.resolve();
    const db={$transaction:async <T>(fn:(tx:{reserve:(units:bigint)=>bigint})=>Promise<T>,
      option:{isolationLevel:"Serializable"})=>{
      expect(option.isolationLevel).toBe("Serializable");
      const before=pending;let unlock!:()=>void;
      pending=new Promise<void>(r=>{unlock=r});await before;
      let snapshot=available;
      try{const result=await fn({reserve:n=>{
        if(snapshot<n)throw Error("INSUFFICIENT_TUTORING_MINUTES");
        snapshot-=n;return snapshot;
      }});available=snapshot;return result;}
      finally{unlock();}
    }};
    const attempt=()=>runSerializableCreditTransaction(db,async tx=>tx.reserve(7n));
    const results=await Promise.allSettled([attempt(),attempt()]);
    expect(results.map(r=>r.status).sort()).toEqual(["fulfilled","rejected"]);
    expect(available).toBe(3n);
  });
  it("classifies new, fully held and inconsistent tutoring booking reservations",()=>{
    expect(classifyCreditReservation(0,60)).toBe("unreserved");
    expect(classifyCreditReservation(60,60)).toBe("reserved");
    expect(classifyCreditReservation(30,60)).toBe("inconsistent");
    expect(classifyCreditReservation(90n,60n)).toBe("inconsistent");
  });
  it("rejects invalid and unsafe accounting quantities without rounding",()=>{
    for(const [a,b] of [[-1,60],[0,0],[1,1.5],[Number.MAX_SAFE_INTEGER+1,60]])
      expect(()=>classifyCreditReservation(a,b)).toThrow();
  });
  it("settles AI units and releases only confirmed unused units",()=>{
    const first=splitCreditReservationAllocation({reservedUnits:7n,remainingCharge:9n});
    expect(first).toEqual({consumed:7n,released:0n,remainingCharge:2n});
    const second=splitCreditReservationAllocation({reservedUnits:5n,remainingCharge:first.remainingCharge});
    expect(second).toEqual({consumed:2n,released:3n,remainingCharge:0n});
    assertCreditSettlementCovered(second.remainingCharge);
    expect(first.consumed+second.consumed).toBe(9n);
    expect(first.released+second.released).toBe(3n);
  });
  it("never manufactures availability for fully consumed allocations",()=>{
    const s=splitCreditReservationAllocation({reservedUnits:100n,remainingCharge:100n});
    expect(s).toEqual({consumed:100n,released:0n,remainingCharge:0n});
  });
  it("refuses settlement shortfalls, negative allocations and fractional quantities",()=>{
    expect(()=>assertCreditSettlementCovered(1n)).toThrow("CREDIT_SETTLEMENT_ALLOCATION_SHORTFALL");
    expect(()=>splitCreditReservationAllocation({reservedUnits:-1n,remainingCharge:0n})).toThrow();
    expect(()=>splitCreditReservationAllocation({reservedUnits:3,remainingCharge:1.25})).toThrow();
  });
  it("models refund holds separately from reservations, with no cross-domain conversion",()=>{
    // Refund liabilities remain in their product writers. No conversion exists
    // from tutoring minutes to AI settlement units in these contracts.
    const tutoringMinutes=60n,aiUnits=10000n;
    expect(classifyCreditReservation(0n,tutoringMinutes)).toBe("unreserved");
    expect(splitCreditReservationAllocation({reservedUnits:aiUnits,remainingCharge:0n}).released).toBe(aiUnits);
  });
});
