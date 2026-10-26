/**
 * Cross-domain credit transaction invariants. The tutoring writer retains
 * PostgreSQL SERIALIZABLE retries; the AI writer retains its per-wallet row
 * lock. These pure primitives NEVER move units between credit domains.
 */
import {CreditAccountingInvariantError,type CreditQuantity} from "./creditLedgerCore";

function units(value:CreditQuantity, field:string):bigint {
  if (typeof value==="bigint")return value;
  if (!Number.isSafeInteger(value))throw new CreditAccountingInvariantError(`UNSAFE_${field}`);
  return BigInt(value);
}

/** Retry only the explicitly documented Prisma write/serialization conflict.
 * All callers must supply a real SERIALIZABLE transactional implementation.
 * A callback MUST have no external side effects because it can be retried.
 */
export async function runSerializableCreditTransaction<Tx,Result>(
  db:Readonly<{$transaction<T>(fn:(tx:Tx)=>Promise<T>,
    options:{isolationLevel:"Serializable"}):Promise<T>}>,
  operation:(tx:Tx)=>Promise<Result>,
):Promise<Result>{
  for(let attempt=0;attempt<3;attempt++){
    try{return await db.$transaction(operation,{isolationLevel:"Serializable"});}
    catch(error){
      const code=error&&typeof error==="object"&&"code" in error
        ? (error as {code:unknown}).code:null;
      if(code!=="P2034"||attempt===2)throw error;
    }
  }
  throw new CreditAccountingInvariantError("CREDIT_TRANSACTION_RETRY_EXHAUSTED");
}

export type CreditReservationState="unreserved"|"reserved"|"inconsistent";
/** Credit-domain-agnostic reservation state; domain adapters supply their
 * own owner IDs, operation keys, booking constraints and errors.
 */
export function classifyCreditReservation(
  observed:CreditQuantity,expected:CreditQuantity,
):CreditReservationState {
  const actual=units(observed,"RESERVED");
  const required=units(expected,"REQUIRED");
  if(actual<0n||required<=0n)throw new CreditAccountingInvariantError("INVALID_CREDIT_RESERVATION");
  if(actual===0n)return "unreserved";
  if(actual===required)return "reserved";
  return "inconsistent";
}

/** One atomic settlement split. Never make more credits available than were
 * reserved; the caller still handles lot expiry, refunds and provider receipts.
 */
export function splitCreditReservationAllocation(input:Readonly<{
  reservedUnits:CreditQuantity; remainingCharge:CreditQuantity;
}>):Readonly<{consumed:bigint;released:bigint;remainingCharge:bigint}>{
  const held=units(input.reservedUnits,"ALLOCATION_RESERVED");
  const requested=units(input.remainingCharge,"REMAINING_CHARGE");
  if(held<0n||requested<0n)throw new CreditAccountingInvariantError("INVALID_CREDIT_SETTLEMENT");
  const consumed=requested<held?requested:held;
  const released=held-consumed;
  return {consumed,released,remainingCharge:requested-consumed};
}

/** Call before committing a settlement; missing allocations must NEVER be
 * silently considered consumed. Caller must roll back the same transaction.
 */
export function assertCreditSettlementCovered(remainingCharge:CreditQuantity):void{
  if(units(remainingCharge,"UNCOVERED_CHARGE")!==0n)
    throw new CreditAccountingInvariantError("CREDIT_SETTLEMENT_ALLOCATION_SHORTFALL");
}
