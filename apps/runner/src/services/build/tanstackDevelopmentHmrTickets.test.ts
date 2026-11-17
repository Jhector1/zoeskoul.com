import { describe, expect, it } from "vitest";
import {
  DevelopmentHmrTicketStore, allowedDevelopmentHmrOrigin,
  DevelopmentHmrTicketError, validDevelopmentHmrClientMessage,
} from "./tanstackDevelopmentHmrTickets.js";

const identity = {
  ownerKey: `u:${"a".repeat(64)}`,
  buildProjectId: "project_abc",
  previewId: "preview_123e4567-e89b-42d3-a456-426614174000",
  sourceVersion: 7,
} as const;
const origin = "https://zoeskoul.example";

describe("Phase 4E3C3 private WebSocket ticket admission", () => {
  it("issues a non-reusable random token that binds owner, preview, revision and Origin", () => {
    const tickets = new DevelopmentHmrTicketStore();
    const token = tickets.issue(identity, origin, 1000);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tickets.consume(token, identity.previewId, origin, 1001)).toEqual(identity);
    expect(() => tickets.consume(token, identity.previewId, origin, 1002)).toThrow(DevelopmentHmrTicketError);
  });
  it("rejects a stolen ticket with another Origin and burns it", () => {
    const tickets = new DevelopmentHmrTicketStore();
    const token = tickets.issue(identity, origin, 1000);
    expect(() => tickets.consume(token, identity.previewId, "https://attacker.example", 1001)).toThrow();
    expect(() => tickets.consume(token, identity.previewId, origin, 1001)).toThrow();
  });
  it("refuses stale, cross-preview, malformed and missing tokens", () => {
    const tickets = new DevelopmentHmrTicketStore();
    const a = tickets.issue(identity, origin, 1000);
    expect(() => tickets.consume(a, "preview_123e4567-e89b-42d3-a456-426614174001", origin, 1001)).toThrow();
    const b = tickets.issue(identity, origin, 1000);
    expect(() => tickets.consume(b, identity.previewId, origin, 21_000)).toThrow();
    expect(() => tickets.consume("not-a-token", identity.previewId, origin, 1001)).toThrow();
  });
  it("rejects unsafe identities and bounds queued tickets", () => {
    const tickets = new DevelopmentHmrTicketStore();
    expect(() => tickets.issue({...identity,sourceVersion:7.5},origin,1000)).toThrow();
    expect(() => tickets.issue({...identity,ownerKey:"another"},origin,1000)).toThrow();
    for(let index=0;index<128;index++) tickets.issue(identity,origin,1000);
    expect(tickets.pendingCount).toBe(128);
    expect(() => tickets.issue(identity,origin,1000)).toThrow();
    tickets.issue(identity,origin,50_000);
    expect(tickets.pendingCount).toBe(1);
  });
  it("allows only canonical exact configured HTTPS origins or explicit local development", () => {
    const allowed=[origin,"http://127.0.0.1:3000"];
    expect(allowedDevelopmentHmrOrigin(origin,allowed)).toBe(true);
    expect(allowedDevelopmentHmrOrigin("http://127.0.0.1:3000",allowed)).toBe(true);
    for(const value of ["null", "https://zoeskoul.example/extra", "https://attacker.example", "http://zoeskoul.example", "https://zoeskoul.example@attacker.example", "HTTPS://zoeskoul.example"])
      expect(allowedDevelopmentHmrOrigin(value,allowed)).toBe(false);
  });
  it("only forwards bounded Vite ping messages from untrusted browser code", () => {
    expect(validDevelopmentHmrClientMessage('{"type":"ping"}')).toBe(true);
    for(const value of ['{"type":"custom","event":"bad"}', '{"type":"ping","payload":1}',"not JSON", "x".repeat(4097)])
      expect(validDevelopmentHmrClientMessage(value)).toBe(false);
  });
});
