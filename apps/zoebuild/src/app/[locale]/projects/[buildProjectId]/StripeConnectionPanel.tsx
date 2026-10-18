"use client";

import {
  useMemo,
  useState,
} from "react";
import styles from "./StripeConnectionPanel.module.css";

type ConnectionSnapshot =
  Readonly<{
    provider:
      string;
    environment:
      "test" |
      "live";
    status:
      string;
    webhookConfigured?: boolean;
  }>;

type RouteSnapshot = Readonly<{
  environment: "test" | "live";
  capability: string;
  provider: string;
  connected: boolean;
}>;

// Display a single configuration indicator only when the server reports
// an active connection, signing secret, and payments route for this environment.
function ReadyCheck() {
  return (
    <span
      className={styles.readyCheck}
      role="img"
      aria-label="API key, webhook and payment routing configured"
      title="API key, webhook and payment routing configured"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function connectionStatus(
  connections:
    readonly ConnectionSnapshot[],
  environment:
    "test" |
    "live",
) {
  return connections.find(
    (connection) =>
      connection.provider ===
        "stripe" &&
      connection.environment ===
        environment,
  )?.status ??
    "disconnected";
}

export default function StripeConnectionPanel(
  props: {
    buildProjectId:
      string;
    connections:
      readonly ConnectionSnapshot[];
    routes: readonly RouteSnapshot[];
    onChanged:
      () => void;
  },
) {
  const [
    testKey,
    setTestKey,
  ] =
    useState("");

  const [
    liveKey,
    setLiveKey,
  ] =
    useState("");

  const [
    testWebhookSecret,
    setTestWebhookSecret,
  ] =
    useState("");

  const [
    liveWebhookSecret,
    setLiveWebhookSecret,
  ] =
    useState("");

  const [
    pending,
    setPending,
  ] =
    useState<
      "test" |
      "live" |
      "activate-test" |
      "activate-live" |
      "webhook-test" |
      "webhook-live" |
      null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState<
      string |
      null
    >(null);

  const [copiedWebhook, setCopiedWebhook] = useState<"test" | "live" | null>(null);
  // The tabs change only which configuration controls are visible.
  // Existing per-environment server connections and routing remain authoritative.
  const [visibleEnvironment, setVisibleEnvironment] = useState<"test" | "live">("test");

  function webhookPath(environment: "test" | "live") {
    return `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers/stripe/webhook/${environment}`;
  }

  async function copyWebhookPath(environment: "test" | "live") {
    if (window.location.protocol !== "https:") {
      setMessage("Connect a public HTTPS domain before registering this webhook in Stripe.");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        new URL(webhookPath(environment), window.location.origin).toString(),
      );
      setCopiedWebhook(environment);
    } catch {
      setCopiedWebhook(null);
      setMessage("Could not copy the webhook URL. Copy the displayed path manually.");
    }
  }

  const testStatus =
    useMemo(
      () =>
        connectionStatus(
          props.connections,
          "test",
        ),
      [
        props.connections,
      ],
    );

  const liveStatus =
    useMemo(
      () =>
        connectionStatus(
          props.connections,
          "live",
        ),
      [
        props.connections,
      ],
    );

  function webhookConfigured(environment: "test" | "live") {
    return props.connections.some(
      (connection) =>
        connection.provider === "stripe" &&
        connection.environment === environment &&
        connection.status === "active" &&
        connection.webhookConfigured === true,
    );
  }

  const testWebhookReady = webhookConfigured("test");
  const liveWebhookReady = webhookConfigured("live");

  function paymentRouteActive(environment: "test" | "live") {
    return props.routes.some(
      (route) =>
        route.environment === environment &&
        route.capability === "payments" &&
        route.provider === "stripe" &&
        route.connected === true,
    );
  }

  const previewPaymentsActive = paymentRouteActive("test");
  const publishedPaymentsActive = paymentRouteActive("live");

  async function connect(
    environment:
      "test" |
      "live",
  ) {
    const apiKey =
      environment ===
        "test"
        ? testKey.trim()
        : liveKey.trim();

    if (!apiKey) {
      setMessage(
        `Enter the Stripe ${environment} API key first.`,
      );

      return;
    }

    setPending(
      environment,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers/stripe/connection`,
          {
            method:
              "POST",
            credentials:
              "same-origin",
            cache:
              "no-store",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                environment,
                apiKey,
              }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () =>
              null,
          ) as
            | {
                ok?:
                  boolean;
                message?:
                  string;
              }
            | null;

      if (
        !response.ok ||
        !payload?.ok
      ) {
        throw new Error(
          payload?.message ??
            "Stripe connection could not be saved.",
        );
      }

      if (
        environment ===
          "test"
      ) {
        setTestKey(
          "",
        );
      } else {
        setLiveKey(
          "",
        );
      }

      setMessage(
        `Stripe ${environment} connection saved securely.`,
      );

      props.onChanged();
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Stripe connection could not be saved.",
      );
    } finally {
      setPending(
        null,
      );
    }
  }

  async function saveWebhookSecret(
    environment:
      "test" |
      "live",
  ) {
    const webhookSecret =
      environment ===
        "test"
        ? testWebhookSecret.trim()
        : liveWebhookSecret.trim();

    const active =
      environment ===
        "test"
        ? testStatus ===
            "active"
        : liveStatus ===
            "active";

    if (!active) {
      setMessage(
        `Connect the Stripe ${environment} environment before saving its webhook secret.`,
      );

      return;
    }

    if (!webhookSecret) {
      setMessage(
        `Enter the Stripe ${environment} webhook signing secret first.`,
      );

      return;
    }

    setPending(
      environment ===
        "test"
        ? "webhook-test"
        : "webhook-live",
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers/stripe/webhook/${environment}`,
          {
            method:
              "PUT",
            credentials:
              "same-origin",
            cache:
              "no-store",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                webhookSecret,
              }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () =>
              null,
          ) as
            | {
                ok?:
                  boolean;
                message?:
                  string;
              }
            | null;

      if (
        !response.ok ||
        !payload?.ok
      ) {
        throw new Error(
          payload?.message ??
            "Stripe webhook signing secret could not be saved.",
        );
      }

      if (
        environment ===
        "test"
      ) {
        setTestWebhookSecret(
          "",
        );
      } else {
        setLiveWebhookSecret(
          "",
        );
      }

      setMessage(
        `Stripe ${environment} webhook signing secret saved securely.`,
      );
      props.onChanged();
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : "Stripe webhook signing secret could not be saved.",
      );
    } finally {
      setPending(
        null,
      );
    }
  }

  async function activatePayments(
    environment:
      "test" |
      "live",
  ) {
    const active =
      environment ===
        "test"
        ? testStatus ===
            "active"
        : liveStatus ===
            "active";

    if (!active) {
      setMessage(
        `Connect the Stripe ${environment} environment before activation.`,
      );

      return;
    }

    if (!webhookConfigured(environment)) {
      setMessage(
        `Configure the Stripe ${environment} webhook signing secret before activating payments.`,
      );
      return;
    }

    setPending(
      environment ===
        "test"
        ? "activate-test"
        : "activate-live",
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/commerce/providers`,
          {
            method:
              "PATCH",
            credentials:
              "same-origin",
            cache:
              "no-store",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                provider:
                  "stripe",
                environment,
                capabilities: [
                  "payments",
                ],
              }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () =>
              null,
          ) as
            | {
                ok?:
                  boolean;
                message?:
                  string;
              }
            | null;

      if (
        !response.ok ||
        !payload?.ok
      ) {
        throw new Error(
          payload?.message ??
            `Stripe ${environment} payments could not be activated.`,
        );
      }

      setMessage(
        environment ===
          "test"
          ? "Stripe test payments are active for preview. Zoé Store still owns checkout orchestration."
          : "Stripe live payments are active for published stores. Zoé Store still owns checkout orchestration.",
      );

      props.onChanged();
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : `Stripe ${environment} payments could not be activated.`,
      );
    } finally {
      setPending(
        null,
      );
    }
  }

  return (
    <section className={`zb-stripe-panel ${styles.panel}`}>
      <div className="zb-stripe-heading">
        <div>
          <span className="zb-stripe-kicker">
            Stripe payments
          </span>

          <h3>
            Connect Stripe
          </h3>

          <p>
            Keep test and live credentials separate. Keys are
            validated against Stripe, encrypted in the
            server-side BuildSecret vault, and never exposed to
            generated storefront code.
          </p>
        </div>

        <span className="zb-stripe-mode-note">
          Test + live isolated
        </span>
      </div>

      <div className={styles.environmentTabs} role="group" aria-label="Stripe environment">
        <button
          type="button"
          className={styles.environmentTab}
          data-active={visibleEnvironment === "test" ? "true" : "false"}
          aria-pressed={visibleEnvironment === "test"}
          onClick={() => setVisibleEnvironment("test")}
        >
          <span className={styles.tabTitle}>
            Test environment
            {testStatus === "active" && testWebhookReady && previewPaymentsActive ? <ReadyCheck /> : null}
          </span>
        </button>
        <button
          type="button"
          className={styles.environmentTab}
          data-active={visibleEnvironment === "live" ? "true" : "false"}
          aria-pressed={visibleEnvironment === "live"}
          onClick={() => setVisibleEnvironment("live")}
        >
          <span className={styles.tabTitle}>
            Live environment
            {liveStatus === "active" && liveWebhookReady && publishedPaymentsActive ? <ReadyCheck /> : null}
          </span>
        </button>
      </div>

      <div className="zb-stripe-environments">
        <form
          className="zb-stripe-environment"
          hidden={visibleEnvironment !== "test"}
          onSubmit={(
            event,
          ) => {
            event.preventDefault();
            void connect(
              "test",
            );
          }}
        >
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Test mode
              </strong>
              <span>
                Preview payments only
              </span>
            </div>

          </div>

          <label className="zb-stripe-field">
            <span>
              Test secret key
            </span>
            <input
              type="password"
              value={testKey}
              onChange={(
                event,
              ) =>
                setTestKey(
                  event.target.value,
                )}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk_test_… or rk_test_…"
            />
          </label>


          <div className="zb-stripe-actions">
            <button
              type="submit"
              disabled={
                pending !==
                  null
              }
            >
              {testStatus ===
                "active"
                ? "Replace test connection"
                : "Connect test"}
            </button>
          </div>
        </form>

        <form
          className="zb-stripe-environment"
          hidden={visibleEnvironment !== "live"}
          onSubmit={(
            event,
          ) => {
            event.preventDefault();
            void connect(
              "live",
            );
          }}
        >
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Live mode
              </strong>
              <span>
                Published payments only
              </span>
            </div>

          </div>

          <label className="zb-stripe-field">
            <span>
              Live secret key
            </span>
            <input
              type="password"
              value={liveKey}
              onChange={(
                event,
              ) =>
                setLiveKey(
                  event.target.value,
                )}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk_live_… or rk_live_…"
            />
          </label>


          <div className="zb-stripe-actions">
            <button
              type="submit"
              disabled={
                pending !==
                  null
              }
            >
              {liveStatus ===
                "active"
                ? "Replace live connection"
                : "Connect live"}
            </button>
          </div>
        </form>
      </div>

      <div className="zb-stripe-environments">
        <section className="zb-stripe-environment" hidden={visibleEnvironment !== "test"}>
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Test webhook
              </strong>
              <span>Preview payment reconciliation</span>
            </div>
          </div>


          <label className="zb-stripe-field">
            <span>
              Test webhook signing secret
            </span>
            <input
              type="password"
              value={testWebhookSecret}
              onChange={(
                event,
              ) =>
                setTestWebhookSecret(
                  event.target.value,
                )}
              autoComplete="off"
              spellCheck={false}
              placeholder="whsec_…"
            />
          </label>

          <div className="zb-stripe-actions">
            <button
              type="button"
              disabled={
                testStatus !==
                  "active" ||
                pending !==
                  null
              }
              onClick={
                () => {
                  void saveWebhookSecret(
                    "test",
                  );
                }
              }
            >
              Save test webhook secret
            </button>
          </div>

          <div className="zb-stripe-webhook-url">
            <span>Webhook endpoint path</span>
            <code title={webhookPath("test")}>{webhookPath("test")}</code>
            <button type="button" onClick={() => void copyWebhookPath("test")}>
              {copiedWebhook === "test" ? "Copied URL" : "Copy URL"}
            </button>
            <small>Use the public HTTPS address for this endpoint in Stripe. Localhost is only for development.</small>
          </div>
        </section>

        <section className="zb-stripe-environment" hidden={visibleEnvironment !== "live"}>
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Live webhook
              </strong>
              <span>Published payment reconciliation</span>
            </div>
          </div>


          <label className="zb-stripe-field">
            <span>
              Live webhook signing secret
            </span>
            <input
              type="password"
              value={liveWebhookSecret}
              onChange={(
                event,
              ) =>
                setLiveWebhookSecret(
                  event.target.value,
                )}
              autoComplete="off"
              spellCheck={false}
              placeholder="whsec_…"
            />
          </label>

          <div className="zb-stripe-actions">
            <button
              type="button"
              disabled={
                liveStatus !==
                  "active" ||
                pending !==
                  null
              }
              onClick={
                () => {
                  void saveWebhookSecret(
                    "live",
                  );
                }
              }
            >
              Save live webhook secret
            </button>
          </div>

          <div className="zb-stripe-webhook-url">
            <span>Webhook endpoint path</span>
            <code title={webhookPath("live")}>{webhookPath("live")}</code>
            <button type="button" onClick={() => void copyWebhookPath("live")}>
              {copiedWebhook === "live" ? "Copied URL" : "Copy URL"}
            </button>
            <small>Use the public HTTPS address for this endpoint in Stripe. Localhost is only for development.</small>
          </div>
        </section>
      </div>

      <div className="zb-stripe-routing">
        <div>
          <strong>
            Payment routing
          </strong>
          <span>
            Activate each environment independently. Zoé Store
            continues to own checkout orchestration. A saved signing
            secret is required; actual Stripe webhook delivery must
            still be tested before accepting payments.
          </span>
        </div>

        <div className="zb-stripe-actions">
          {visibleEnvironment === "test" && !previewPaymentsActive ? (
          <button
            type="button"
            disabled={
              testStatus !==
                "active" ||
              !testWebhookReady ||
              pending !==
                null
            }
            onClick={
              () => {
                void activatePayments(
                  "test",
                );
              }
            }
          >
            Activate preview payments
          </button>
          ) : null}

          {visibleEnvironment === "live" && !publishedPaymentsActive ? (
          <button
            type="button"
            disabled={
              liveStatus !==
                "active" ||
              !liveWebhookReady ||
              pending !==
                null
            }
            onClick={
              () => {
                void activatePayments(
                  "live",
                );
              }
            }
          >
            Activate live payments
          </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div
          className="zb-stripe-message"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}
