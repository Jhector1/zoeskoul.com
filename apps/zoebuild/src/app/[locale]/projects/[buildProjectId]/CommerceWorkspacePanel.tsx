"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import StripeConnectionPanel from "./StripeConnectionPanel";
import directoryStyles from "@/components/builder/ProviderDirectory.module.css";
import ShopifyConnectionPanel from "./ShopifyConnectionPanel";
import ProviderDirectory, { type ProviderDirectoryEntry, type ProviderDirectoryStatus } from "@/components/builder/ProviderDirectory";
import { PROVIDER_PRESENTATIONS } from "@/lib/integrations/providerDirectoryCatalog";

type CommerceProject =
  Readonly<{
    buildProjectId: string;
    title: string;
    stackId: string | null;
  }>;

type ProviderSnapshot =
  Readonly<{
    id: string;
    displayName: string;
    description: string;
    connectionRequired: boolean;
    recommendedStore: boolean;
    recommendedPayment: boolean;
    executableCapabilities?: Readonly<Record<string, boolean>>;
    capabilities:
      Readonly<
        Record<
          string,
          boolean
        >
      >;
  }>;

type ProviderRouteSnapshot =
  Readonly<{
    environment:
      "test" |
      "live";
    capability:
      string;
    provider:
      string;
    connected:
      boolean;
  }>;

type CommerceConfiguration =
  Readonly<{
    providers:
      readonly ProviderSnapshot[];
    shopifyOAuthConfigured?: boolean;
    store:
      Readonly<{
        status: string;
        defaultCurrency:
          string;
        routes:
          readonly ProviderRouteSnapshot[];
        connections:
          readonly Readonly<{
            provider: string;
            environment:
              "test" |
              "live";
            status: string;
            webhookConfigured?: boolean;
            storefrontConfigured?: boolean;
          }>[];
      }>;
  }>;

type CommerceFetchFailure = Readonly<{
  status: number;
  code: string;
  requestId: string | null;
}>;

class CommerceConfigurationError extends Error {
  constructor(message: string, readonly details: CommerceFetchFailure) {
    super(message);
    this.name = "CommerceConfigurationError";
  }
}

function providerLabel(
  providers:
    readonly ProviderSnapshot[],
  providerId:
    string | null,
) {
  if (!providerId) {
    return "Not configured";
  }

  if (
    providerId ===
    "zoebuild-native"
  ) {
    return "Zoé Store";
  }

  return (
    providers.find(
      (provider) =>
        provider.id ===
        providerId,
    )?.displayName ??
    providerId
  );
}

export default function CommerceWorkspacePanel(
  props: {
    project:
      CommerceProject;
    candidateHostname?:
      string |
      null;
    section?: "commerce" | "payments";
    onNavigate?: () => void;
  },
) {
  const [
    configuration,
    setConfiguration,
  ] =
    useState<
      CommerceConfiguration |
      null
    >(null);

  const [configurationFailure, setConfigurationFailure] = useState<CommerceFetchFailure | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [openedProvider, setOpenedProvider] = useState<string | null>(null);

  const [
    configurationError,
    setConfigurationError,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    configurationRevision,
    setConfigurationRevision,
  ] =
    useState(
      0,
    );

  useEffect(
    () => {
      let active =
        true;

      void fetch(
        `/api/build/projects/${encodeURIComponent(props.project.buildProjectId)}/commerce/providers`,
        {
          method:
            "GET",
          credentials:
            "same-origin",
          cache:
            "no-store",
        },
      )
        .then(
          async (
            response,
          ) => {
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
                      code?: string;
                      requestId?: string;
                      providers?:
                        readonly ProviderSnapshot[];
                      shopifyOAuthConfigured?: boolean;
                      store?:
                        CommerceConfiguration["store"];
                    }
                  | null;

            if (
              !response.ok ||
              !payload?.ok ||
              !payload.providers ||
              !payload.store
            ) {
              throw new CommerceConfigurationError(
                payload?.message ?? "Commerce configuration could not be loaded.",
                {
                  status: response.status,
                  code: payload?.code ?? "COMMERCE_STATUS_READ_FAILED",
                  requestId: response.headers.get("X-Request-Id") ?? payload?.requestId ?? null,
                },
              );
            }

            if (!active) {
              return;
            }

            setLoadedProjectId(props.project.buildProjectId);
            setConfiguration({
              providers:
                payload.providers,
              shopifyOAuthConfigured: payload.shopifyOAuthConfigured === true,
              store:
                payload.store,
            });

            setConfigurationError(null);
            setConfigurationFailure(null);
          },
        )
        .catch(
          (
            error,
          ) => {
            if (!active) {
              return;
            }

            setLoadedProjectId(null);
            setConfiguration(null);
            setConfigurationFailure(error instanceof CommerceConfigurationError ? error.details : null);
            setConfigurationError(
              error instanceof
                Error
                ? error.message
                : "Commerce configuration could not be loaded.",
            );
          },
        );

      return () => {
        active =
          false;
      };
    },
    [
      props.project
        .buildProjectId,
      configurationRevision,
    ],
  );

  const testRoutes =
    useMemo(
      () =>
        new Map(
          (
            configuration
              ?.store
              .routes ??
            []
          )
            .filter(
              (route) =>
                route.environment ===
                "test",
            )
            .map(
              (route) => [
                route.capability,
                route,
              ] as const,
            ),
        ),
      [
        configuration,
      ],
    );

  if (
    props.project.stackId !==
      "commerce-static-v1" &&
    props.project.stackId !==
      "commerce-react-vite-v1"
  ) {
    return null;
  }

  const providers =
    configuration
      ?.providers ??
    [];

  const owner = (
    capability:
      string,
  ) =>
    providerLabel(
      providers,
      testRoutes.get(
        capability,
      )?.provider ??
        (
          capability ===
            "payments"
            ? null
            : "zoebuild-native"
        ),
    );

  const paymentOwner =
    owner(
      "payments",
    );

  const paymentConfigured =
    testRoutes.has(
      "payments",
    );

  const paymentsOnly = props.section === "payments";
  const currentConfiguration = loadedProjectId === props.project.buildProjectId ? configuration : null;
  const availableProviders = currentConfiguration?.providers ?? [];
  const connections = currentConfiguration?.store.connections ?? [];
  const retryConfiguration = () => {
    setLoadedProjectId(null);
    setConfiguration(null);
    setConfigurationError(null);
    setConfigurationFailure(null);
    setConfigurationRevision((value) => value + 1);
  };
  const configurationErrorPanel = configurationError ? (
    <div className="zb-commerce-candidate" role="alert">
      <strong>Commerce status unavailable</strong>
      <p>{configurationError}</p>
      {configurationFailure ? (
        <p>HTTP {configurationFailure.status} · {configurationFailure.code}
          {configurationFailure.requestId ? ` · Request ${configurationFailure.requestId}` : ""}
        </p>
      ) : null}
      <button type="button" onClick={retryConfiguration}>Retry status</button>
    </div>
  ) : null;
  const providerCards: readonly ProviderDirectoryEntry[] =
    PROVIDER_PRESENTATIONS[paymentsOnly ? "payments" : "commerce"].map((provider): ProviderDirectoryEntry => {
      let status: ProviderDirectoryStatus = "unavailable";
      let note = "Connector not implemented in ZoeBuild yet.";
      if (!currentConfiguration) {
        if (provider.id === "zoebuild-native" && !paymentsOnly) {
          // The native capability is part of the registered commerce stack;
          // do not confuse a failed status read with missing implementation.
          status = "built-in";
          note = "Native capability included; live configuration not yet verified.";
        } else if ((provider.id === "shopify" && !paymentsOnly) || (provider.id === "stripe" && paymentsOnly)) {
          status = configurationError ? "unverified" : "checking";
          note = configurationError
            ? "Connection could not be verified. Inspect the error and retry safely."
            : "Checking this project's connection and runtime capability…";
        } else {
          note = "Connector not implemented in ZoeBuild yet.";
        }
      } else if (provider.id === "zoebuild-native" && !paymentsOnly) {
        status = "built-in";
        note = "Built in · No external credentials required";
      } else if (provider.id === "shopify" && !paymentsOnly) {
        const active = connections.filter((item) => item.provider === "shopify" && item.status === "active");
        if (active.length > 0) {
          const testReady = active.some((item) => item.environment === "test" && item.storefrontConfigured === true);
          status = testReady ? "connected" : "attention";
          note = active.map((item) => `${item.environment}: ${item.storefrontConfigured ? "ready" : "setup incomplete"}`).join(" · ");
        } else if (currentConfiguration.shopifyOAuthConfigured === true) {
          status = "available";
          note = "Authorize your shop in the existing Shopify setup.";
        } else {
          note = "Shopify app setup required on the ZoeBuild server.";
        }
      } else if (provider.id === "stripe" && paymentsOnly) {
        const active = connections.filter((item) => item.provider === "stripe" && item.status === "active");
        const supported = availableProviders.some((item) =>
          item.id === "stripe" && item.executableCapabilities?.payments === true,
        );
        if (active.length) {
          status = "connected";
          note = active.map((item) => `${item.environment}: connected`).join(" · ");
        } else if (supported) {
          status = "available";
          note = "Manage test and live credentials separately.";
        } else {
          note = "Stripe provider not executable on this server.";
        }
      }
      return { provider, status, note };
    });

  if (openedProvider === null) {
    return (
      <div className={`zb-commerce-workspace ${directoryStyles.overview}`}>
        {configurationErrorPanel}
        {props.candidateHostname && !paymentsOnly ? (
          <div className="zb-commerce-candidate" role="status">
            <strong>Shopify store detected: </strong>{props.candidateHostname}
            <div>This detected hostname is not proof of a connected store. Open Shopify when its connector is available.</div>
          </div>
        ) : null}
        <ProviderDirectory
          title={paymentsOnly ? "Payments" : "Store & commerce"}
          description={paymentsOnly
            ? "Choose payment connections for this project. Test and live credentials are kept separate."
            : "Select a provider to open its own settings. Connecting a provider never changes active routes automatically."}
          entries={providerCards}
          onOpen={(id) => { setOpenedProvider(id); props.onNavigate?.(); }}
        />
      </div>
    );
  }

  return (
    <div className="zb-commerce-workspace">
      <button
        type="button"
        className={directoryStyles.backButton}
        onClick={() => { setOpenedProvider(null); props.onNavigate?.(); }}
      >
        ← All {paymentsOnly ? "payment" : "commerce"} providers
      </button>
      <div className="zb-commerce-heading">
        <div>
          <div className="zb-commerce-kicker">
            {paymentsOnly ? "Payments" : "Store & commerce"}
          </div>

          <h2>
            {openedProvider === "zoebuild-native" ? "Zoé Store" : openedProvider === "shopify" ? "Shopify" : "Stripe"}
          </h2>

          <p>
            {paymentsOnly
              ? "Connect and manage Stripe payments independently for test and live environments."
              : openedProvider === "shopify"
                ? "Authorize Shopify and manage this project's external commerce connection."
                : "Zoé Store is the default commerce foundation. You can connect another supported provider without rewriting generated storefront code."}
          </p>
        </div>

        <span className="zb-commerce-status">
          {(() => {
            const status = providerCards.find((item) => item.provider.id === openedProvider)?.status;
            if (status === "connected") return "Connected";
            if (status === "active") return "Active";
            if (status === "built-in") return "Built in";
            if (status === "available") return "Available to connect";
            if (status === "attention") return "Needs attention";
            if (status === "unverified" || status === "checking") return "Status unverified";
            return "Unavailable";
          })()}
        </span>
      </div>

      {configurationErrorPanel}
      {!currentConfiguration ? (
        <p role="status">Provider connection and routing details are not verified. Retry the status check before making configuration changes.</p>
      ) : null}

      {props.candidateHostname && openedProvider === "shopify" ? (
        <div className="zb-commerce-candidate">
          <strong>
            Shopify store detected:
          </strong>{" "}
          {props.candidateHostname}

          <div>
            The address is validated, but no provider
            connection or credential has been created yet.
            Zoé Store remains active until Shopify is
            explicitly connected.
          </div>
        </div>
      ) : null}

      {!paymentsOnly && openedProvider === "shopify" && currentConfiguration ? (
        <ShopifyConnectionPanel
          buildProjectId={props.project.buildProjectId}
          candidateHostname={props.candidateHostname}
          available={currentConfiguration?.shopifyOAuthConfigured === true}
          connections={currentConfiguration?.store.connections ?? []}
          onChanged={() => setConfigurationRevision((current) => current + 1)}
        />
      ) : null}

      {!paymentsOnly && openedProvider === "zoebuild-native" && currentConfiguration ? (
      <div className="zb-commerce-grid">
        <section className="zb-commerce-card">
          <span>
            Products &amp; inventory
          </span>

          <strong>
            {owner(
              "catalog",
            )}
          </strong>

          <p>
            New stores use Zoé Store automatically. Existing
            Shopify, Square, or future provider catalogs can
            be connected later.
          </p>
        </section>

        <section className="zb-commerce-card">
          <span>
            Cart
          </span>

          <strong>
            {owner(
              "cart",
            )}
          </strong>

          <p>
            Cart behavior stays behind the trusted commerce
            facade and is never regenerated by AI.
          </p>
        </section>

        <section className="zb-commerce-card">
          <span>
            Checkout
          </span>

          <strong>
            {owner(
              "checkout",
            )}
          </strong>

          <p>
            Checkout ownership is provider-neutral and uses
            test connections in preview and live connections
            only after publishing.
          </p>
        </section>

        <section className="zb-commerce-card">
          <span>
            Payments
          </span>

          <strong>
            {paymentConfigured
              ? paymentOwner
              : "Choose a payment provider"}
          </strong>

          <p>
            Payments are intentionally not auto-selected.
            Stripe is recommended for merchants who do not
            already use another payment provider.
          </p>
        </section>

        <section className="zb-commerce-card">
          <span>
            Orders
          </span>

          <strong>
            {owner(
              "orders",
            )}
          </strong>

          <p>
            Zoé Store owns orders by default. A connected
            full-commerce provider can take ownership
            explicitly.
          </p>
        </section>

        <section className="zb-commerce-card">
          <span>
            Environments
          </span>

          <strong>
            Test + Live separated
          </strong>

          <p>
            Preview never falls back to live credentials and
            published stores never fall back to test
            credentials.
          </p>
        </section>
      </div>
      ) : null}

      {paymentsOnly && openedProvider === "stripe" && currentConfiguration ? (
      <StripeConnectionPanel
        buildProjectId={
          props.project.buildProjectId
        }
        connections={
          currentConfiguration
            ?.store
            .connections ??
          []
        }
        routes={currentConfiguration?.store.routes ?? []}
        onChanged={
          () =>
            setConfigurationRevision(
              (
                current,
              ) =>
                current +
                1,
            )
        }
      />
      ) : null}

      {!paymentsOnly && openedProvider === "zoebuild-native" ? (
      <div className="zb-commerce-security">
        <strong>
          Provider options
        </strong>

        <span>
          Zoé Store is recommended for a new store. Shopify
          can own the full commerce stack; Square can own
          catalog, inventory, orders, checkout, and payments;
          Stripe and PayPal can own checkout and payments.
        </span>
      </div>
      ) : null}

      <div className="zb-commerce-security">
        <strong>
          Commerce security boundary
        </strong>

        <span>
          Provider credentials stay in server-side ZoeBuild
          resource bindings. Generated storefront source
          never receives secret keys or selects a provider
          environment.
        </span>
      </div>
    </div>
  );
}
