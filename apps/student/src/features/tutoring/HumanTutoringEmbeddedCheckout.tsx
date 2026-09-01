import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";

import type {
  TutoringEmbeddedCheckoutResult,
  TutoringPricingPresentation,
  TutoringSavedCardPaymentResult,
  TutoringSavedPaymentMethod,
} from "./humanTutoringClient";

type Props = {
  locale: string;
  requestedMinutes: number;
  availableMinutes: number;
  pricing: TutoringPricingPresentation;
  savedPaymentMethod:
    TutoringSavedPaymentMethod | null;
  savedPaymentMethodLoading: boolean;
  onAuthorizeSavedPaymentMethod: () => Promise<TutoringSavedPaymentMethod>;
  onStartSavedCardPayment: (
    shortfallMinutes: number,
    checkoutAttemptId: string,
  ) => Promise<TutoringSavedCardPaymentResult>;
  onStartCheckout: (
    shortfallMinutes: number,
  ) => Promise<
    TutoringEmbeddedCheckoutResult | null
  >;
  onRefreshCredits: () => Promise<number>;
};

function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
) {
  return new Intl.NumberFormat(
    locale,
    {
      style: "currency",
      currency: currency.toUpperCase(),
    },
  ).format(amountMinor / 100);
}

function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function CheckoutFrame(props: {
  checkout: TutoringEmbeddedCheckoutResult;
  onComplete: () => void;
}) {
  const stripePromise =
    useMemo(
      () =>
        loadStripe(
          props.checkout
            .publishableKey,
        ),
      [
        props.checkout
          .publishableKey,
      ],
    );

  const options =
    useMemo(
      () => ({
        clientSecret:
          props.checkout
            .clientSecret,
        onComplete:
          props.onComplete,
      }),
      [
        props.checkout
          .clientSecret,
        props.onComplete,
      ],
    );

  return (
    <EmbeddedCheckoutProvider
      key={
        props.checkout
          .checkoutSessionId
      }
      stripe={stripePromise}
      options={options}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}

export default function HumanTutoringEmbeddedCheckout(
  props: Props,
) {
  const shortfallMinutes =
    Math.max(
      0,
      props.requestedMinutes -
        props.availableMinutes,
    );

  const purchaseMinutes =
    shortfallMinutes > 0
      ? Math.max(
          shortfallMinutes,
          props.pricing.minimumMinutes,
        )
      : 0;

  const amountMinor =
    purchaseMinutes *
    props.pricing
      .rateMinorPerMinute;

  const [
    savedCardAttemptId,
    setSavedCardAttemptId,
  ] = useState(
    () =>
      crypto.randomUUID(),
  );

  const [
    checkout,
    setCheckout,
  ] = useState<
    TutoringEmbeddedCheckoutResult | null
  >(null);
  const [
    starting,
    setStarting,
  ] = useState(false);
  const [
    confirming,
    setConfirming,
  ] = useState(false);
  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  useEffect(
    () => {
      if (
        props.availableMinutes >=
        props.requestedMinutes
      ) {
        setCheckout(null);
        setConfirming(false);
        setError(null);
      }
    },
    [
      props.availableMinutes,
      props.requestedMinutes,
    ],
  );

  if (
    shortfallMinutes <= 0
  ) {
    return null;
  }

  async function beginSavedCardPayment() {
    if (
      starting ||
      confirming
    ) {
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const result =
        await props
          .onStartSavedCardPayment(
            purchaseMinutes,
            savedCardAttemptId,
          );

      if (
        result.kind ===
        "saved_card_requires_action"
      ) {
        const stripe =
          await loadStripe(
            result.publishableKey,
          );

        if (!stripe) {
          throw new Error(
            "Stripe could not start payment authentication.",
          );
        }

        const next =
          await stripe
            .handleNextAction({
              clientSecret:
                result.clientSecret,
            });

        if (next.error) {
          throw new Error(
            next.error.message ??
              "Payment authentication failed.",
          );
        }

        if (
          next.paymentIntent &&
          next.paymentIntent
            .status !==
            "succeeded" &&
          next.paymentIntent
            .status !==
            "processing"
        ) {
          throw new Error(
            "The saved-card payment was not completed.",
          );
        }
      }

      await confirmCredit();
    } catch (caught) {
      setSavedCardAttemptId(
        crypto.randomUUID(),
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to charge the saved payment method.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function beginCheckout(
    options: {
      authorizeSaved?: boolean;
    } = {},
  ) {
    if (
      starting ||
      confirming
    ) {
      return;
    }

    setStarting(true);
    setError(null);

    try {
      if (
        options.authorizeSaved
      ) {
        await props
          .onAuthorizeSavedPaymentMethod();
      }

      const result =
        await props.onStartCheckout(
          purchaseMinutes,
        );

      if (result) {
        setCheckout(result);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start secure payment.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function confirmCredit() {
    if (confirming) return;

    setConfirming(true);
    setError(null);

    try {
      for (
        let attempt = 0;
        attempt < 24;
        attempt += 1
      ) {
        const available =
          await props.onRefreshCredits();

        if (
          available >=
          props.requestedMinutes
        ) {
          setCheckout(null);
          return;
        }

        await sleep(750);
      }

      setError(
        "Payment completed. Your tutoring credit is still being confirmed. Check again in a moment.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to confirm your tutoring credit yet.",
      );
    } finally {
      setConfirming(false);
    }
  }

  if (checkout) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
        <div className="border-b border-neutral-200 px-4 py-4 dark:border-white/10">
          <div className="text-sm font-semibold">
            Secure payment
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-white/45">
            Add{" "}
            {purchaseMinutes}{" "}
            tutoring minutes without leaving your scheduling request.
          </p>
        </div>

        <div className="p-2 sm:p-4">
          <CheckoutFrame
            checkout={checkout}
            onComplete={() => {
              void confirmCredit();
            }}
          />
        </div>

        {confirming ? (
          <div className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-white/10 dark:text-white/60">
            Payment received. Confirming your tutoring credit…
          </div>
        ) : null}

        {error ? (
          <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
            {error}
            <button
              type="button"
              className="ml-2 font-semibold underline underline-offset-2"
              onClick={() => {
                void confirmCredit();
              }}
            >
              Check again
            </button>
          </div>
        ) : null}

        <div className="border-t border-neutral-200 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            className="text-sm font-semibold text-neutral-600 hover:text-neutral-950 dark:text-white/55 dark:hover:text-white"
            disabled={confirming}
            onClick={() =>
              setCheckout(null)
            }
          >
            Back to request review
          </button>
        </div>
      </div>
    );
  }

  const saved =
    props.savedPaymentMethod;
  const savedBrand =
    saved
      ? saved.brand
          .charAt(0)
          .toUpperCase() +
        saved.brand.slice(1)
      : "";
  const savedLabel =
    saved
      ? `${savedBrand} •••• ${saved.last4}`
      : "";

  if (
    props.savedPaymentMethodLoading
  ) {
    return (
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/[0.025]">
        Checking saved payment methods…
      </div>
    );
  }

  if (saved) {
    return (
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="text-sm font-semibold">
          Saved payment method
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 dark:border-white/10">
          <div>
            <div className="font-semibold">
              {savedLabel}
            </div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-white/45">
              Expires{" "}
              {String(
                saved.expMonth,
              ).padStart(
                2,
                "0",
              )}
              /
              {String(
                saved.expYear,
              ).slice(-2)}
            </div>
          </div>

          <div className="text-sm font-semibold">
            {formatMoney(
              amountMinor,
              props.pricing
                .currency,
              props.locale,
            )}
          </div>
        </div>

        <button
          type="button"
          className="ui-btn-primary mt-4 min-h-11 w-full px-5"
          disabled={starting}
          onClick={() => {
            void beginSavedCardPayment();
          }}
        >
          {starting
            ? "Processing payment…"
            : `Pay ${formatMoney(
                amountMinor,
                props.pricing
                  .currency,
                props.locale,
              )} with ${savedLabel}`}
        </button>

        <button
          type="button"
          className="ui-btn-secondary mt-2 min-h-11 w-full px-5"
          disabled={starting}
          onClick={() => {
            void beginCheckout();
          }}
        >
          Use another payment method
        </button>

        <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-white/45">
          Stripe will securely confirm the payment. Your card number never passes through ZoeSkoul.
        </p>

        {error ? (
          <div className="mt-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
      <div className="text-sm font-semibold">
        Add tutoring credit to continue
      </div>
      <p className="mt-1 text-sm leading-6">
        You have{" "}
        {props.availableMinutes}{" "}
        minutes and need{" "}
        {props.requestedMinutes}.
        You are short{" "}
        {shortfallMinutes}{" "}
        minutes.
        {purchaseMinutes >
        shortfallMinutes ? (
          <>
            {" "}
            The minimum credit purchase is{" "}
            {props.pricing
              .minimumMinutes}{" "}
            minutes, so{" "}
            {purchaseMinutes -
              shortfallMinutes}{" "}
            extra minutes will remain in your wallet.
          </>
        ) : null}
        {" "}
        Total:{" "}
        <strong>
          {formatMoney(
            amountMinor,
            props.pricing
              .currency,
            props.locale,
          )}
        </strong>
        .
      </p>

      {error ? (
        <div className="mt-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        className="ui-btn-primary mt-4 min-h-11 px-5"
        disabled={starting}
        onClick={() => {
          void beginCheckout();
        }}
      >
        {starting
          ? "Preparing secure payment…"
          : `Add ${purchaseMinutes} minutes & continue`}
      </button>

      <p className="mt-3 text-xs leading-5 text-amber-800/80 dark:text-amber-100/65">
        Payment is handled securely by Stripe. Your scheduling choices stay here while you pay.
      </p>
    </div>
  );
}
