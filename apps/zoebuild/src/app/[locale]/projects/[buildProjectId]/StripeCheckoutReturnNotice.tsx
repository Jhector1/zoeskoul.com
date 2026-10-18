"use client";

import { useEffect, useState } from "react";
import styles from "./StripeCheckoutReturnNotice.module.css";

type Confirmation = Readonly<{
  id: string;
  status: string;
  paymentStatus: string;
  reservationCount: number;
  committedCount: number;
  confirmed: boolean;
}>;

type NoticeState =
  | { kind: "hidden" }
  | { kind: "pending"; orderId: string }
  | { kind: "verified"; order: Confirmation }
  | { kind: "unconfirmed"; message: string }
  | { kind: "canceled" };

/** A buyer redirect is never proof of payment. This preview-only notice polls
 *  an owner-authorized database projection of the webhook-reconciled order. */
export default function StripeCheckoutReturnNotice(props: { buildProjectId: string }) {
  const [notice, setNotice] = useState<NoticeState>({ kind: "hidden" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const orderId = params.get("orderId")?.trim() ?? "";
    if (checkout !== "success" && checkout !== "cancel") {
      setNotice({ kind: "hidden" });
      return;
    }
    if (checkout === "cancel") {
      setNotice({ kind: "canceled" });
      return;
    }
    if (!orderId || orderId.length > 128) {
      setNotice({ kind: "unconfirmed", message: "Missing or invalid order reference." });
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setNotice({ kind: "pending", orderId });

    const verify = async (attempt: number) => {
      try {
        const response = await fetch(
          `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/orders/${encodeURIComponent(orderId)}/status`,
          { credentials: "same-origin", cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json() as {
          ok?: boolean;
          message?: string;
          order?: Confirmation;
        };
        if (stopped) return;
        if (!response.ok || !payload.ok || !payload.order) {
          setNotice({ kind: "unconfirmed", message: payload.message ?? "Order verification failed." });
          return;
        }
        const order = payload.order;
        if (order.confirmed && order.paymentStatus === "paid" &&
            order.committedCount === order.reservationCount) {
          setNotice({ kind: "verified", order });
          return;
        }
        if (["failed", "expired", "refunded"].includes(order.paymentStatus) ||
            order.status === "canceled") {
          setNotice({ kind: "unconfirmed", message: "The order is not paid. Check the payment or try again." });
          return;
        }
        if (attempt >= 19) {
          setNotice({ kind: "unconfirmed", message: "Payment is not confirmed yet. Check webhook delivery or recheck this order." });
          return;
        }
        timer = setTimeout(() => void verify(attempt + 1), 1500);
      } catch {
        if (!stopped) {
          setNotice({ kind: "unconfirmed", message: "Unable to verify payment. Recheck when the server is available." });
        }
      }
    };
    void verify(0);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [props.buildProjectId, retry]);

  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("orderId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setNotice({ kind: "hidden" });
  }

  if (notice.kind === "hidden") return null;
  const verified = notice.kind === "verified";
  const pending = notice.kind === "pending";
  const orderLabel = verified
    ? `${notice.order.id.slice(0, 10)}…`
    : "";

  return (
    <section
      className={styles.notice}
      data-status={notice.kind}
      role="status"
      aria-live="polite"
      aria-label="Stripe checkout status"
    >
      <span className={styles.statusIcon} aria-hidden="true">
        {verified ? "✓" : pending ? "·" : "!"}
      </span>
      <div className={styles.content}>
        <strong className={styles.title}>
          {verified
            ? "Payment confirmed"
            : pending
              ? "Verifying your payment"
              : notice.kind === "canceled"
                ? "Checkout canceled"
                : "Payment needs attention"}
        </strong>
        {verified ? (
          <>
            <p className={styles.description}>
              ZoeStore confirmed this order in the database.
              {notice.order.reservationCount > 0
                ? ` ${notice.order.committedCount} inventory reservation(s) committed.`
                : " No tracked inventory reservation was required."}
            </p>
            <span className={styles.orderReference} title={notice.order.id}>
              Verified order · {orderLabel}
            </span>
          </>
        ) : pending ? (
          <p className={styles.description}>
            Checking the order and inventory after Stripe Checkout.
          </p>
        ) : notice.kind === "canceled" ? (
          <p className={styles.description}>No payment has been confirmed.</p>
        ) : (
          <p className={styles.description}>{notice.message}</p>
        )}
        {notice.kind === "unconfirmed" ? (
          <button type="button" className={styles.action} onClick={() => setRetry((n) => n + 1)}>
            Recheck order
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismiss}
        aria-label="Dismiss checkout status"
        title="Dismiss"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </section>
  );
}
