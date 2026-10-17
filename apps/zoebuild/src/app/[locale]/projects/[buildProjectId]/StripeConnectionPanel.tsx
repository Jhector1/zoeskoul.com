"use client";

import {
  useMemo,
  useState,
} from "react";

type ConnectionSnapshot =
  Readonly<{
    provider:
      string;
    environment:
      "test" |
      "live";
    status:
      string;
  }>;

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
    <section className="zb-stripe-panel">
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

      <div className="zb-stripe-environments">
        <form
          className="zb-stripe-environment"
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

            <span
              className="zb-stripe-status"
              data-active={
                testStatus ===
                  "active"
                  ? "true"
                  : "false"
              }
            >
              {testStatus ===
                "active"
                ? "Connected"
                : "Not connected"}
            </span>
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

            <span
              className="zb-stripe-status"
              data-active={
                liveStatus ===
                  "active"
                  ? "true"
                  : "false"
              }
            >
              {liveStatus ===
                "active"
                ? "Connected"
                : "Not connected"}
            </span>
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
        <section className="zb-stripe-environment">
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Test webhook
              </strong>
              <span>
                Preview payment reconciliation
              </span>
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

          <small>
            Webhook path:{" "}
            <code>
              /api/build/projects/{props.buildProjectId}/commerce/providers/stripe/webhook/test
            </code>
          </small>
        </section>

        <section className="zb-stripe-environment">
          <div className="zb-stripe-environment-heading">
            <div>
              <strong>
                Live webhook
              </strong>
              <span>
                Published payment reconciliation
              </span>
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

          <small>
            Webhook path:{" "}
            <code>
              /api/build/projects/{props.buildProjectId}/commerce/providers/stripe/webhook/live
            </code>
          </small>
        </section>
      </div>

      <div className="zb-stripe-routing">
        <div>
          <strong>
            Payment routing
          </strong>
          <span>
            Activate each environment independently. Zoé Store
            continues to own checkout orchestration.
          </span>
        </div>

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
                void activatePayments(
                  "test",
                );
              }
            }
          >
            Activate preview payments
          </button>

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
                void activatePayments(
                  "live",
                );
              }
            }
          >
            Activate live payments
          </button>
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
