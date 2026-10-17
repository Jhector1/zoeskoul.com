"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
    store:
      Readonly<{
        status: string;
        defaultCurrency:
          string;
        routes:
          readonly ProviderRouteSnapshot[];
      }>;
  }>;

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

  const [
    configurationError,
    setConfigurationError,
  ] =
    useState<
      string |
      null
    >(null);

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
                      providers?:
                        readonly ProviderSnapshot[];
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
              throw new Error(
                payload?.message ??
                  "Commerce configuration could not be loaded.",
              );
            }

            if (!active) {
              return;
            }

            setConfiguration({
              providers:
                payload.providers,
              store:
                payload.store,
            });

            setConfigurationError(
              null,
            );
          },
        )
        .catch(
          (
            error,
          ) => {
            if (!active) {
              return;
            }

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

  return (
    <div className="zb-commerce-workspace">
      <div className="zb-commerce-heading">
        <div>
          <div className="zb-commerce-kicker">
            Commerce
          </div>

          <h2>
            {props.project.title}
          </h2>

          <p>
            Zoé Store is the default commerce foundation.
            You can keep it or connect another supported
            provider later without rewriting generated
            storefront code.
          </p>
        </div>

        <span className="zb-commerce-status">
          Zoé Store
        </span>
      </div>

      {configurationError ? (
        <div
          className="zb-commerce-candidate"
          role="status"
        >
          <strong>
            Commerce status unavailable
          </strong>

          <div>
            {configurationError}
          </div>
        </div>
      ) : null}

      {props.candidateHostname ? (
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

      {providers.length > 0 ? (
        <div className="zb-commerce-grid">
          {providers.map(
            (
              provider,
            ) => (
              <section
                className="zb-commerce-card"
                key={
                  provider.id
                }
              >
                <span>
                  {provider.recommendedStore
                    ? "Recommended store"
                    : provider.recommendedPayment
                      ? "Recommended payments"
                      : "Available provider"}
                </span>

                <strong>
                  {provider.displayName}
                </strong>

                <p>
                  {provider.description}
                </p>

                <small>
                  {provider.connectionRequired
                    ? "Requires separate test and live connections."
                    : "Built in — no external store connection required."}
                </small>
              </section>
            ),
          )}
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
