import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import { bindAiCreditProviderRequest, captureAiCreditProviderResponse,
  recordAiCreditPricedProviderReceipt }
  from "./aiCreditProviderRequest";

const trace = "zb-123e4567-e89b-12d3-a456-426614174000";
const requestSha256 = "a".repeat(64);
function fake(input: { owner?: string; status?: "reserved" | "settled"; key?: string } = {}) {
  let row: any = null;
  const records = {
    aiCreditReservation: { findUnique: vi.fn(async () => ({ userId: input.owner ?? "user-123",
      idempotencyKey: input.key ?? "operation-123", status: input.status ?? "reserved",
      pricingVersionId: "price-reviewed-v1" })) },
    aiCreditProviderRequest: {
      createMany: vi.fn(async ({ data }: any) => {
        if (row) return {count:0};
        row = { id:"binding-1", ...data[0], providerResponseId:null, providerHttpRequestId:null,
          receiptPricingVersionId:null, receiptCostUsdNano:null, receiptUsageSha256:null };
        return {count:1};
      }),
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!row || row.reservationId !== where.reservationId ||
            row.clientRequestId !== where.clientRequestId) return {count:0};
        if ("receiptPricingVersionId" in where) {
          if (row.providerResponseId !== where.providerResponseId ||
              row.receiptPricingVersionId !== null || row.provider !== where.provider) return {count:0};
        } else if (row.providerResponseId !== null) return {count:0};
        Object.assign(row,data); return {count:1};
      }),
    },
  };
  const client = { $transaction: async <T>(fn: (tx: typeof records) => Promise<T>) => fn(records) } as unknown as PrismaClient;
  return { client, records, getRow: () => row };
}
const bind = (client: PrismaClient) => ({client, userId:"user-123", reservationId:"r-1",
  idempotencyKey:"operation-123",provider:"openai" as const,model:"unit-model",
  clientRequestId:trace,requestSha256});
const capture = (client: PrismaClient) => ({client, userId:"user-123",reservationId:"r-1",
  clientRequestId:trace,providerResponseId:"resp-openai-1",providerHttpRequestId:"req-provider-1"});
describe("E16C4E1B2B1 provider request identity (no financial authorization)", () => {
  const priced = (client: PrismaClient) => ({client, userId:"user-123", reservationId:"r-1",
    clientRequestId:trace, providerResponseId:"resp-openai-1",
    pricingVersionId:"price-reviewed-v1",costUsdNano:"2500000",usageSha256:"a".repeat(64)});
  it("freezes only the priced original HTTPS response, without moving credits", async () => {
    const {client,getRow}=fake();
    await bindAiCreditProviderRequest(bind(client));
    await captureAiCreditProviderResponse(capture(client));
    expect(await recordAiCreditPricedProviderReceipt(priced(client))).toEqual({recorded:true});
    expect(await recordAiCreditPricedProviderReceipt(priced(client))).toEqual({recorded:false});
    expect(getRow().receiptCostUsdNano).toBe("2500000");
  });
  it("never creates a receipt without captured response identity", async () => {
    const {client}=fake(); await bindAiCreditProviderRequest(bind(client));
    await expect(recordAiCreditPricedProviderReceipt(priced(client)))
      .rejects.toThrow("AI_RECEIPT_IDENTITY_CONFLICT");
  });
  it("rejects conflicting replay, wrong owner and altered provider price", async () => {
    const {client}=fake(); await bindAiCreditProviderRequest(bind(client));
    await captureAiCreditProviderResponse(capture(client));
    await recordAiCreditPricedProviderReceipt(priced(client));
    await expect(recordAiCreditPricedProviderReceipt({...priced(client),costUsdNano:"2600000"}))
      .rejects.toThrow("AI_RECEIPT_IDENTITY_CONFLICT");
    await expect(recordAiCreditPricedProviderReceipt({...priced(client),userId:"not-the-user"}))
      .rejects.toThrow("AI_RECEIPT_RESERVATION_NOT_FOUND");
    await expect(recordAiCreditPricedProviderReceipt({...priced(client),pricingVersionId:"unreviewed-price"}))
      .rejects.toThrow("AI_RECEIPT_PRICE_MISMATCH");
  });
  it("rejects invalid usage hash and unknown cost before database access", async () => {
    const {client,records}=fake();
    await expect(recordAiCreditPricedProviderReceipt({...priced(client),usageSha256:"bad"}))
      .rejects.toThrow("AI_RECEIPT_INVALID_DIGEST");
    await expect(recordAiCreditPricedProviderReceipt({...priced(client),costUsdNano:"-1"}))
      .rejects.toThrow("AI_RECEIPT_INVALID_COST");
    expect(records.aiCreditReservation.findUnique).not.toHaveBeenCalled();
  });
  it("binds one outbound request before payment call, with idempotent readback", async () => {
    const {client,records} = fake();
    expect(await bindAiCreditProviderRequest(bind(client))).toEqual({id:"binding-1",created:true});
    expect(await bindAiCreditProviderRequest(bind(client))).toEqual({id:"binding-1",created:false});
    expect(records.aiCreditProviderRequest.createMany).toHaveBeenCalledTimes(2);
  });
  it("rejects changed outbound request fingerprints", async () => {
    const {client} = fake(); await bindAiCreditProviderRequest(bind(client));
    await expect(bindAiCreditProviderRequest({...bind(client),requestSha256:"b".repeat(64)}))
      .rejects.toThrow("AI_DISPATCH_IDENTITY_CONFLICT");
  });
  it("rejects owner mismatch and non-held reservations", async () => {
    await expect(bindAiCreditProviderRequest(bind(fake({owner:"else"}).client)))
      .rejects.toThrow("AI_DISPATCH_RESERVATION_NOT_FOUND");
    await expect(bindAiCreditProviderRequest(bind(fake({status:"settled"}).client)))
      .rejects.toThrow("AI_DISPATCH_RESERVATION_NOT_HELD");
  });
  it("rejects invalid and unsupported source identities before transaction", async () => {
    const {client,records}=fake();
    await expect(bindAiCreditProviderRequest({...bind(client),provider:"gemini" as never}))
      .rejects.toThrow("AI_DISPATCH_PROVIDER_UNSUPPORTED");
    await expect(bindAiCreditProviderRequest({...bind(client),requestSha256:"bad"}))
      .rejects.toThrow("AI_DISPATCH_INVALID_DIGEST");
    expect(records.aiCreditReservation.findUnique).not.toHaveBeenCalled();
  });
  it("records only the first consistent HTTPS response identity", async () => {
    const {client,getRow}=fake(); await bindAiCreditProviderRequest(bind(client));
    expect(await captureAiCreditProviderResponse(capture(client))).toEqual({captured:true});
    expect(await captureAiCreditProviderResponse(capture(client))).toEqual({captured:false});
    expect(getRow().providerResponseId).toBe("resp-openai-1");
  });
  it("refuses changed response or client-request identity", async () => {
    const {client}=fake(); await bindAiCreditProviderRequest(bind(client));
    await captureAiCreditProviderResponse(capture(client));
    for (const input of [{...capture(client), providerResponseId:"resp-other"},
      {...capture(client),clientRequestId:"zb-other-request"}])
      await expect(captureAiCreditProviderResponse(input))
        .rejects.toThrow("AI_DISPATCH_RESPONSE_IDENTITY_CONFLICT");
  });
  it("rejects malformed response IDs and finalized reservations", async () => {
    const missing=fake();
    await expect(captureAiCreditProviderResponse({...capture(missing.client),providerResponseId:"!"}))
      .rejects.toThrow("AI_DISPATCH_INVALID_RESPONSE_ID");
    const final=fake({status:"settled"});
    await expect(captureAiCreditProviderResponse(capture(final.client)))
      .rejects.toThrow("AI_DISPATCH_RESERVATION_NOT_HELD");
  });
});
