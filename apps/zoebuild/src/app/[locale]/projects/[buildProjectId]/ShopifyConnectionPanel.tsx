"use client";

import { useEffect, useState } from "react";
import styles from "./ShopifyConnectionPanel.module.css";

type Connection = Readonly<{
  provider: string;
  environment: "test" | "live";
  status: string;
  storefrontConfigured?: boolean;
}>;

const SHOP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;

export default function ShopifyConnectionPanel(props: Readonly<{
  buildProjectId: string;
  candidateHostname?: string | null;
  available: boolean;
  connections: readonly Connection[];
  onChanged: () => void;
}>) {
  const [shop, setShop] = useState(props.candidateHostname ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const test = props.connections.find((connection) =>
    connection.provider === "shopify" && connection.environment === "test",
  );
  const connected = test?.status === "active";
  const ready = connected && test.storefrontConfigured === true;

  useEffect(() => {
    if (props.candidateHostname && !shop.trim()) setShop(props.candidateHostname);
  }, [props.candidateHostname, shop]);

  async function disconnect() {
    if (!connected || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers/shopify/connection`,
        {
          method: "DELETE", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environment: "test" }),
        },
      );
      const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error("Shopify could not be disconnected.");
      props.onChanged();
      setMessage("Shopify disconnected from this project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect Shopify.");
    } finally {
      setPending(false);
    }
  }

  async function connect() {
    const hostname = shop.trim().toLowerCase();
    if (!SHOP.test(hostname)) {
      setMessage("Enter your store's permanent .myshopify.com domain.");
      return;
    }
    if (!props.available) {
      setMessage("The ZoeBuild Shopify app is not configured on this server yet.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers/shopify/oauth/test/start`,
        {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop: hostname }),
        },
      );
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; authorizationUrl?: string; code?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.authorizationUrl) {
        throw new Error("Shopify authorization could not begin. Verify your ZoeBuild HTTPS origin and app configuration.");
      }
      const authorization = new URL(payload.authorizationUrl);
      if (authorization.protocol !== "https:" || authorization.hostname !== hostname ||
          authorization.pathname !== "/admin/oauth/authorize") {
        throw new Error("Invalid Shopify authorization URL.");
      }
      window.location.assign(authorization.href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect Shopify.");
      setPending(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Shopify connection">
      <div className={styles.topline}>
        <div>
          <span className={styles.eyebrow}>EXTERNAL COMMERCE</span>
          <h3>Connect Shopify</h3>
          <p>Authorize your Shopify store. ZoeBuild configures secure Storefront access automatically—no API keys to copy.</p>
        </div>
        {ready ? (
          <span className={styles.ready} title="Shopify is authorized and Storefront access is configured">
            <span aria-hidden="true">✓</span> Connected
          </span>
        ) : (
          <span className={styles.inactive}>{connected ? "Setup incomplete" : "Not connected"}</span>
        )}
      </div>
      <div className={styles.content}>
        <label className={styles.label} htmlFor="shopify-shop-domain">Shopify store</label>
        <div className={styles.controls}>
          <input
            id="shopify-shop-domain" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={shop} onChange={(event) => setShop(event.target.value)}
            placeholder="your-store.myshopify.com"
            disabled={pending}
          />
          <button type="button" onClick={() => void connect()} disabled={pending || !props.available}>
            {pending ? "Connecting…" : ready ? "Reconnect Shopify" : "Connect with Shopify"}
          </button>
        </div>
        {connected ? (
          <button className={styles.disconnect} type="button" disabled={pending} onClick={() => void disconnect()}>
            Disconnect Shopify from this project
          </button>
        ) : null}
        <p className={styles.help}>
          The Shopify app is authorized per merchant and project. Test and live credentials never cross environments.
          Connecting does not activate Shopify checkout or change the current store routes.
        </p>
        {!props.available ? (
          <p className={styles.warning} role="status">Configure the ZoeBuild Connector app ID, secret and HTTPS origin on the ZoeBuild server first.</p>
        ) : null}
        {connected && !ready ? (
          <p className={styles.warning} role="status">Authorization exists, but Storefront setup is incomplete. Reconnect to retry secure setup.</p>
        ) : null}
        {message ? <p className={styles.warning} role="alert">{message}</p> : null}
      </div>
    </section>
  );
}
