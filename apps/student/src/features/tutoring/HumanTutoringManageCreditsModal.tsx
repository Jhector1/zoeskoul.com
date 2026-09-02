import {
  useEffect,
} from "react";

import type {
  TutoringCreditsPayload,
  TutoringRefundableCredits,
} from "./humanTutoringClient";

type Props = {
  open: boolean;
  locale: string;
  loading: boolean;
  busy: boolean;
  credits: TutoringCreditsPayload | null;
  refundable: TutoringRefundableCredits | null;
  refundLoading: boolean;
  refundBusyPurchaseId: string | null;
  purchaseMinutes: number;
  onPurchaseMinutesChange: (minutes: number) => void;
  onBuyMinutes: (minutes: number) => void;
  onRequestRefund: (
    purchaseId: string,
    minutes: number,
  ) => Promise<void>;
  onClose: () => void;
};

function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function formatPurchaseDate(
  value: string | null,
  locale: string,
) {
  if (!value) {
    return "Purchase";
  }

  const date =
    new Date(
      value,
    );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return "Purchase";
  }

  return new Intl.DateTimeFormat(
    locale,
    {
      dateStyle:
        "medium",
    },
  ).format(
    date,
  );
}

export default function HumanTutoringManageCreditsModal(
  props: Props,
) {
  useEffect(() => {
    if (!props.open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  const credits = props.credits;
  const balance = credits?.balance;
  const pricing = credits?.pricing;
  const packages = credits?.purchasePackages ?? [];

  const valid = Boolean(
    pricing &&
      Number.isSafeInteger(props.purchaseMinutes) &&
      props.purchaseMinutes >= pricing.minimumMinutes &&
      props.purchaseMinutes <= pricing.maximumMinutes,
  );

  const customAmount =
    valid && pricing
      ? props.purchaseMinutes * pricing.rateMinorPerMinute
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-tutoring-credits-title"
        className="ui-surface-floating max-h-[92vh] w-full overflow-y-auto rounded-t-2xl rounded-b-none sm:max-w-3xl sm:rounded-xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[rgb(var(--ui-border)/0.58)] bg-[rgb(var(--ui-surface)/0.96)] px-5 py-5 sm:px-6">
          <div>
            <div className="ui-section-kicker">
              Tutoring wallet
            </div>
            <h2
              id="manage-tutoring-credits-title"
              className="mt-1 text-xl font-semibold"
            >
              Manage credits
            </h2>
            <p className="mt-1 ui-meta">
              Add tutoring minutes and review your wallet.
            </p>
          </div>
          <button
            type="button"
            className="ui-btn-secondary min-h-10 px-3"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="ui-surface-soft p-4">
            <div className="text-2xl font-semibold">
              {props.loading
                ? "—"
                : `${balance?.totalMinutes ?? 0} tutoring minutes`}
            </div>
            <div className="mt-1 ui-meta">
              {props.loading
                ? "Loading wallet…"
                : `${balance?.availableMinutes ?? 0} available · ${balance?.reservedMinutes ?? 0} reserved`}
            </div>
          </div>

          <div>
            <div className="font-semibold">
              Add tutoring minutes
            </div>
            <p className="mt-1 ui-meta">
              Credits accumulate in your wallet. Stripe uses the server-calculated amount.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.minutes}
                  type="button"
                  className="ui-btn-secondary min-h-20 justify-between px-4 py-3 text-left"
                  disabled={props.loading || props.busy}
                  onClick={() => props.onBuyMinutes(pkg.minutes)}
                >
                  <span>
                    <span className="block font-semibold">
                      {pkg.minutes} minutes
                    </span>
                    <span className="mt-1 block text-xs opacity-70">
                      {formatMoney(
                        pkg.amountMinor,
                        pkg.currency,
                        props.locale,
                      )}
                    </span>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-[rgb(var(--ui-border)/0.58)] pt-5">
              <div className="font-medium">
                Custom amount
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">
                    Minutes
                  </span>
                  <input
                    className="ui-input w-36"
                    type="number"
                    min={pricing?.minimumMinutes ?? 30}
                    max={pricing?.maximumMinutes ?? 720}
                    step={pricing?.incrementMinutes ?? 1}
                    value={props.purchaseMinutes}
                    disabled={props.loading || props.busy}
                    onChange={(event) =>
                      props.onPurchaseMinutesChange(
                        Number(event.target.value),
                      )
                    }
                  />
                </label>

                <button
                  type="button"
                  className="ui-btn-primary"
                  disabled={
                    props.loading ||
                    props.busy ||
                    !valid
                  }
                  onClick={() =>
                    props.onBuyMinutes(props.purchaseMinutes)
                  }
                >
                  {customAmount !== null && pricing
                    ? `Buy ${props.purchaseMinutes} min · ${formatMoney(
                        customAmount,
                        pricing.currency,
                        props.locale,
                      )}`
                    : "Choose valid minutes"}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgb(var(--ui-border)/0.58)] pt-5">
            <div className="font-semibold">
              Refunds
            </div>
            <p className="mt-1 ui-meta">
              Refund unused purchased minutes to the original payment method. Reserved, used, promotional, plan, and admin-granted minutes are not cash-refundable.
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
              The amount below comes from the original purchase. ZoeSkoul recalculates the final refund on the server before sending it to Stripe.
            </p>

            <div className="mt-4 space-y-3">
              {props.refundLoading ? (
                <div className="ui-meta">
                  Loading purchase history…
                </div>
              ) : props.refundable?.purchases.length ? (
                props.refundable.purchases.map((purchase) => (
                  <div
                    key={purchase.purchaseId}
                    className="ui-surface-soft p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {purchase.purchasedMinutes} tutoring minutes
                        </div>
                        <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
                          {formatPurchaseDate(
                            purchase.paidAt,
                            props.locale,
                          )}{" "}
                          ·{" "}
                          {formatMoney(
                            purchase.amountMinor,
                            purchase.currency,
                            props.locale,
                          )}
                        </div>
                      </div>

                      {purchase.retryableRefundMinutes > 0 ? (
                        <button
                          type="button"
                          className="ui-btn-secondary min-h-10 px-4"
                          disabled={
                            props.busy ||
                            props.refundBusyPurchaseId !== null
                          }
                          onClick={() => {
                            const confirmed =
                              window.confirm(
                                `Retry the refund for ${purchase.retryableRefundMinutes} tutoring minutes? ZoeSkoul will reuse the existing refund attempt so it cannot be duplicated.`,
                              );

                            if (confirmed) {
                              void props.onRequestRefund(
                                purchase.purchaseId,
                                purchase.retryableRefundMinutes,
                              );
                            }
                          }}
                        >
                          {props.refundBusyPurchaseId ===
                          purchase.purchaseId
                            ? "Retrying refund…"
                            : `Retry refund · ${purchase.retryableRefundMinutes} min`}
                        </button>
                      ) : purchase.pendingRefundMinutes > 0 ? (
                        <span className="ui-pill-neutral">
                          Refund pending · {purchase.pendingRefundMinutes} min
                        </span>
                      ) : purchase.refundableMinutes > 0 ? (
                        <button
                          type="button"
                          className="ui-btn-secondary min-h-10 px-4"
                          disabled={
                            props.busy ||
                            props.refundBusyPurchaseId !== null
                          }
                          onClick={() => {
                            const confirmed =
                              window.confirm(
                                `Refund ${purchase.refundableMinutes} unused tutoring minutes (${formatMoney(
                                  purchase.refundableAmountMinor,
                                  purchase.currency,
                                  props.locale,
                                )}) to the original payment method?`,
                              );

                            if (confirmed) {
                              void props.onRequestRefund(
                                purchase.purchaseId,
                                purchase.refundableMinutes,
                              );
                            }
                          }}
                        >
                          {props.refundBusyPurchaseId ===
                          purchase.purchaseId
                            ? "Requesting refund…"
                            : `Request refund · ${formatMoney(
                                purchase.refundableAmountMinor,
                                purchase.currency,
                                props.locale,
                              )}`}
                        </button>
                      ) : (
                        <span className="text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
                          No refundable minutes
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
                      <span>
                        {purchase.refundableMinutes} min refundable
                      </span>

                      {purchase.reservedPurchasedMinutes > 0 ? (
                        <span>
                          {purchase.reservedPurchasedMinutes} min reserved
                        </span>
                      ) : null}

                      {purchase.pendingRefundMinutes > 0 ? (
                        <span>
                          {purchase.pendingRefundMinutes} min being refunded
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="ui-meta">
                  No purchased tutoring minutes are currently available for a cash refund.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
