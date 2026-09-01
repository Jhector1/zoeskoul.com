export type TutoringCreditBalance = {
  availableMinutes: number;
  reservedMinutes: number;
  totalMinutes: number;
};

export type TutoringCreditPackage = {
  minutes: number;
  amountMinor: number;
  currency: string;
};

export type TutoringPricingPresentation = {
  minimumMinutes: number;
  incrementMinutes: number;
  maximumMinutes: number;
  rateMinorPerMinute: number;
  currency: string;
  pricingVersion: string;
};

export type TutoringCreditsPayload = {
  balance: TutoringCreditBalance;
  purchasePackages: TutoringCreditPackage[];
  sessionDurations: number[];
  pricing: TutoringPricingPresentation;
};

export type LearnerTutoringRequest = {
  id: string;
  tutoringSessionId: string | null;
  status: string;
  requestedMinutes: number;
  preferredStartsAt: string | null;
  sourceSubjectSlug: string | null;
  sourceModuleSlug: string | null;
  sourceExerciseKey: string | null;
  note: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TutoringOverview = {
  credits: TutoringCreditsPayload;
  requests: LearnerTutoringRequest[];
};

export type TutoringSavedPaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  allowRedisplay:
    | "always"
    | "limited"
    | "unspecified";
};

export type TutoringCheckoutResult =
  | {
      kind: "checkout";
      purchaseId: string;
      checkoutSessionId: string;
      url: string;
      resumed: boolean;
    }
  | {
      kind: "embedded_checkout";
      purchaseId: string;
      checkoutSessionId: string;
      clientSecret: string;
      publishableKey: string;
      resumed: boolean;
    }
  | {
      kind: "already_paid";
      purchaseId: string;
      checkoutSessionId: string | null;
    }
  | {
      kind: "expired";
      purchaseId: string;
      checkoutSessionId: string;
    };

export type TutoringSavedCardPaymentResult =
  | {
      kind:
        "saved_card_paid_pending_webhook";
      purchaseId: string;
    }
  | {
      kind:
        "saved_card_processing";
      purchaseId: string;
    }
  | {
      kind:
        "saved_card_requires_action";
      purchaseId: string;
      clientSecret: string;
      publishableKey: string;
    }
  | {
      kind:
        "already_paid";
      purchaseId: string;
    };

export type TutoringEmbeddedCheckoutResult =
  Extract<
    TutoringCheckoutResult,
    {
      kind:
        "embedded_checkout";
    }
  >;

type ErrorPayload = {
  error?: string;
  code?: string;
  availableMinutes?: number;
  requiredMinutes?: number;
};

export class HumanTutoringApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly availableMinutes: number | null;
  readonly requiredMinutes: number | null;

  constructor(
    message: string,
    args: {
      status: number;
      code?: string | null;
      availableMinutes?: number | null;
      requiredMinutes?: number | null;
    },
  ) {
    super(message);
    this.name = "HumanTutoringApiError";
    this.status = args.status;
    this.code = args.code ?? null;
    this.availableMinutes =
      args.availableMinutes ?? null;
    this.requiredMinutes =
      args.requiredMinutes ?? null;
  }
}

function apiUrl(
  apiOrigin: string,
  pathname: string,
) {
  return new URL(
    pathname,
    apiOrigin,
  ).toString();
}

async function readJson(
  response: Response,
) {
  return response
    .json()
    .catch(() => null);
}

async function requireJson<T>(
  response: Response,
): Promise<T> {
  const payload =
    (await readJson(response)) as
      | (T & ErrorPayload)
      | null;

  if (!response.ok) {
    throw new HumanTutoringApiError(
      payload?.error ??
        `Human tutoring request failed (${response.status}).`,
      {
        status: response.status,
        code: payload?.code ?? null,
        availableMinutes:
          payload?.availableMinutes ??
          null,
        requiredMinutes:
          payload?.requiredMinutes ??
          null,
      },
    );
  }

  if (!payload) {
    throw new HumanTutoringApiError(
      "Human tutoring returned an empty response.",
      {
        status: response.status,
      },
    );
  }

  return payload as T;
}

export async function loadHumanTutoringOverview(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringOverview> {
  const [
    creditsResponse,
    requestsResponse,
  ] = await Promise.all([
    fetchImpl(
      apiUrl(
        apiOrigin,
        "/api/tutoring/credits",
      ),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    ),
    fetchImpl(
      apiUrl(
        apiOrigin,
        "/api/tutoring/requests",
      ),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    ),
  ]);

  const credits =
    await requireJson<TutoringCreditsPayload>(
      creditsResponse,
    );
  const requestPayload =
    await requireJson<{
      requests:
        LearnerTutoringRequest[];
    }>(
      requestsResponse,
    );

  return {
    credits,
    requests:
      requestPayload.requests,
  };
}

export async function loadTutoringSavedPaymentMethod(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringSavedPaymentMethod | null> {
  const response =
    await fetchImpl(
      apiUrl(
        apiOrigin,
        "/api/tutoring/payment-method",
      ),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  const payload =
    await requireJson<{
      paymentMethod:
        TutoringSavedPaymentMethod | null;
    }>(
      response,
    );

  return payload.paymentMethod;
}

export async function authorizeTutoringSavedPaymentMethod(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringSavedPaymentMethod> {
  const response =
    await fetchImpl(
      apiUrl(
        apiOrigin,
        "/api/tutoring/payment-method",
      ),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          confirmReuse: true,
        }),
      },
    );

  const payload =
    await requireJson<{
      paymentMethod:
        TutoringSavedPaymentMethod;
    }>(
      response,
    );

  return payload.paymentMethod;
}

export async function startTutoringSavedCardPayment(
  args: {
    apiOrigin: string;
    checkoutAttemptId: string;
    minutes: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringSavedCardPaymentResult> {
  const response =
    await fetchImpl(
      apiUrl(
        args.apiOrigin,
        "/api/tutoring/credits/saved-card",
      ),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          checkoutAttemptId:
            args.checkoutAttemptId,
          minutes:
            args.minutes,
          confirmReuse: true,
        }),
      },
    );

  return requireJson<TutoringSavedCardPaymentResult>(
    response,
  );
}

export async function startTutoringCreditCheckout(
  args: {
    apiOrigin: string;
    checkoutAttemptId: string;
    minutes: number;
    locale: string;
    uiMode?: "hosted" | "embedded";
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringCheckoutResult> {
  const response = await fetchImpl(
    apiUrl(
      args.apiOrigin,
      "/api/tutoring/credits/checkout",
    ),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        checkoutAttemptId:
          args.checkoutAttemptId,
        minutes: args.minutes,
          uiMode:
            args.uiMode,
        callbackPath:
          `/${encodeURIComponent(
            args.locale,
          )}/tutoring-sessions`,
        appLocale:
          args.locale,
      }),
    },
  );

  return requireJson<TutoringCheckoutResult>(
    response,
  );
}

export type TutoringRefundablePurchase = {
  purchaseId: string;
  purchasedMinutes: number;
  availablePurchasedMinutes: number;
  reservedPurchasedMinutes: number;
  pendingRefundMinutes: number;
  retryableRefundMinutes: number;
  refundableMinutes: number;
  refundableAmountMinor: number;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
};

export type TutoringRefundableCredits = {
  nonCashAvailableMinutes: number;
  nonCashReservedMinutes: number;
  purchases: TutoringRefundablePurchase[];
  totalRefundableMinutes: number;
};

export async function loadTutoringRefundableCredits(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TutoringRefundableCredits> {
  const response =
    await fetchImpl(
      apiUrl(
        apiOrigin,
        "/api/tutoring/credits/refundable",
      ),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  const payload =
    await requireJson<{
      refundable:
        TutoringRefundableCredits;
    }>(
      response,
    );

  return payload.refundable;
}

export async function requestTutoringCreditRefund(
  args: {
    apiOrigin: string;
    refundAttemptId: string;
    purchaseId: string;
    minutes: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{
  kind:
    | "refund_pending"
    | "refund_already_succeeded";
  refundId: string;
  status: string;
  minutes: number;
  amountMinor: number;
  currency: string;
}> {
  const response =
    await fetchImpl(
      apiUrl(
        args.apiOrigin,
        "/api/tutoring/credits/refund",
      ),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            refundAttemptId:
              args.refundAttemptId,
            purchaseId:
              args.purchaseId,
            minutes:
              args.minutes,
          }),
      },
    );

  return requireJson<{
    kind:
      | "refund_pending"
      | "refund_already_succeeded";
    refundId: string;
    status: string;
    minutes: number;
    amountMinor: number;
    currency: string;
  }>(
    response,
  );
}

export async function cancelHumanTutoringRequest(
  args: {
    apiOrigin: string;
    requestId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{
  status: "canceled";
  releasedReservedMinutes: boolean;
  balance: TutoringCreditBalance;
}> {
  const response = await fetchImpl(
    apiUrl(
      args.apiOrigin,
      `/api/tutoring/requests/${encodeURIComponent(
        args.requestId,
      )}/cancel`,
    ),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
  );

  return requireJson<{
    status: "canceled";
    releasedReservedMinutes: boolean;
    balance: TutoringCreditBalance;
  }>(response);
}

export async function createHumanTutoringRequest(
  args: {
    apiOrigin: string;
    requestAttemptId: string;
    requestedMinutes: number;
    preferredStartsAt: string;
    sourceSubjectSlug: string;
    note: string | null;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(
    apiUrl(
      args.apiOrigin,
      "/api/tutoring/requests",
    ),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        requestAttemptId:
          args.requestAttemptId,
        requestedMinutes:
          args.requestedMinutes,
        preferredStartsAt:
          args.preferredStartsAt,
        sourceSubjectSlug:
          args.sourceSubjectSlug,
        sourceModuleSlug: null,
        sourceExerciseKey: null,
        note: args.note,
      }),
    },
  );

  return requireJson<{
    request:
      LearnerTutoringRequest;
    balance:
      TutoringCreditBalance;
    resumed: boolean;
  }>(
    response,
  );
}
