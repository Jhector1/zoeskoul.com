import { describe, expect, it, vi } from "vitest";
import {
  createShopifyStorefrontGraphql,
  SHOPIFY_STOREFRONT_GRAPHQL_VERSION,
  ShopifyStorefrontGraphqlError,
} from "./shopifyStorefrontGraphql";

const SHOP = "a-shop.myshopify.com";
const TOKEN = "sensitive-private-test-token";
const document = "query Products { products(first: 1) { nodes { title } } }";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function port(fetchImpl: typeof fetch, environment: "test" | "live" = "test") {
  return createShopifyStorefrontGraphql({
    shopHostname: SHOP, environment, privateToken: TOKEN, fetchImpl,
  });
}
function expectCode(code: ShopifyStorefrontGraphqlError["code"]) {
  return expect.objectContaining({ code });
}

describe("Shopify Storefront GraphQL private transport", () => {
  it("pins the supported Storefront API version", () => {
    expect(SHOPIFY_STOREFRONT_GRAPHQL_VERSION).toBe("2026-10");
  });

  it("passes trusted system query to an exact canonical shop with private token only", async () => {
    const mocked = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ data: { products: { nodes: [] } } }));
    const result = await port(mocked).execute<{ products: { nodes: unknown[] } }>({
      document, audience: { kind: "system" },
    });
    expect(result).toEqual({ products: { nodes: [] } });
    expect(mocked).toHaveBeenCalledTimes(1);
    const [url, init] = mocked.mock.calls[0] ?? [];
    expect(url).toBe(`https://${SHOP}/api/2026-10/graphql.json`);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    const headers = new Headers(init?.headers);
    expect(headers.get("Shopify-Storefront-Private-Token")).toBe(TOKEN);
    expect(headers.get("X-Shopify-Storefront-Access-Token")).toBeNull();
    expect(headers.get("Shopify-Storefront-Buyer-IP")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ query: document, variables: {} });
  });

  it("passes validated IPv4/IPv6 buyer IP for buyer operations", async () => {
    const mocked = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ data: { cartCreate: {} } }));
    for (const ip of ["198.51.100.20", "2001:db8::1234"]) {
      await port(mocked, "live").execute({
        document: "mutation CartCreate { cartCreate { cart { id } } }",
        audience: { kind: "buyer", ip },
      });
    }
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(new Headers(mocked.mock.calls[0]?.[1]?.headers).get("Shopify-Storefront-Buyer-IP"))
      .toBe("198.51.100.20");
    expect(new Headers(mocked.mock.calls[1]?.[1]?.headers).get("Shopify-Storefront-Buyer-IP"))
      .toBe("2001:db8::1234");
  });

  it("rejects non-Shopify or malformed hosts and invalid environments without fetching", () => {
    const mocked = vi.fn(async () => response({ data: {} }));
    for (const host of ["evil.example.com", "shop.myshopify.com.evil.test", "../other", "A.myshopify.com", "a-.myshopify.com"]) {
      expect(() => createShopifyStorefrontGraphql({
        shopHostname: host, environment: "test", privateToken: TOKEN, fetchImpl: mocked,
      })).toThrow(expectCode("SHOPIFY_STOREFRONT_CONFIG_INVALID"));
    }
    expect(() => createShopifyStorefrontGraphql({
      shopHostname: SHOP, environment: "production" as "live", privateToken: TOKEN, fetchImpl: mocked,
    })).toThrow(expectCode("SHOPIFY_STOREFRONT_CONFIG_INVALID"));
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects empty and header-injection tokens", () => {
    for (const value of ["", "bad\r\nHeader: injected", " wrong "]) {
      expect(() => createShopifyStorefrontGraphql({
        shopHostname: SHOP, environment: "test", privateToken: value,
      })).toThrow(expectCode("SHOPIFY_STOREFRONT_CONFIG_INVALID"));
    }
  });

  it("rejects buyer calls without a valid IP or valid operation input without fetch", async () => {
    const mocked = vi.fn(async () => response({ data: {} }));
    const client = port(mocked);
    await expect(client.execute({ document, audience: { kind: "buyer", ip: "not-an-ip" } }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_INPUT_INVALID" });
    await expect(client.execute({ document: "  ", audience: { kind: "system" } }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_INPUT_INVALID" });
    await expect(client.execute({ document, audience: { kind: "system" }, variables: [] as unknown as Record<string, unknown> }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_INPUT_INVALID" });
    expect(mocked).not.toHaveBeenCalled();
  });

  it("fails closed on top-level GraphQL errors without surfacing provider messages", async () => {
    const mocked = vi.fn(async () => response({ errors: [{ message: "sensitive provider text" }], data: {} }));
    let message = "";
    try { await port(mocked).execute({ document, audience: { kind: "system" } }); }
    catch (error) {
      expect(error).toMatchObject({ code: "SHOPIFY_STOREFRONT_GRAPHQL_FAILED" });
      message = (error as Error).message;
    }
    expect(message).not.toContain("sensitive provider text");
    expect(message).not.toContain(TOKEN);
  });

  it("fails closed on malformed JSON, missing data, or oversized payload", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(response({ nonsense: true }))
      .mockResolvedValueOnce(response({ data: { x: "x".repeat(1024 * 1024) } }));
    const client = port(mocked);
    for (let i = 0; i < 3; i += 1) {
      await expect(client.execute({ document, audience: { kind: "system" } }))
        .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_RESPONSE_INVALID" });
    }
    expect(mocked).toHaveBeenCalledTimes(3);
  });

  it("does not retry failed mutations and hides HTTP error bodies", async () => {
    const mocked = vi.fn(async () => new Response("private error content", { status: 503 }));
    await expect(port(mocked).execute({
      document: "mutation CartCreate { cartCreate { cart { id } } }",
      audience: { kind: "system" },
    })).rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_UNAVAILABLE" });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("distinguishes authorization failure from rate limiting without disclosing tokens", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response("bad credential", { status: 401 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    const client = port(mocked);
    await expect(client.execute({ document, audience: { kind: "system" } }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_AUTH_FAILED" });
    await expect(client.execute({ document, audience: { kind: "system" } }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_RATE_LIMITED" });
  });

  it("requires a complete GraphQL data object", async () => {
    const mocked = vi.fn(async () => response({ data: null }));
    await expect(port(mocked).execute({ document, audience: { kind: "system" } }))
      .rejects.toMatchObject({ code: "SHOPIFY_STOREFRONT_RESPONSE_INVALID" });
  });
});
