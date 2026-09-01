import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export type TutoringSavedPaymentMethodSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  allowRedisplay:
    | "always"
    | "limited"
    | "unspecified";
};

export type TutoringSavedPaymentMethodDeps = {
  findCustomerId(
    userId: string,
  ): Promise<string | null>;
  listCardPaymentMethods(
    customerId: string,
  ): Promise<Stripe.PaymentMethod[]>;
  updateAllowRedisplay(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod>;
};

function defaultDeps(): TutoringSavedPaymentMethodDeps {
  return {
    findCustomerId: async (userId) => {
      const user =
        await prisma.user.findUnique({
          where: { id: userId },
          select: {
            stripeCustomerId: true,
          },
        });

      return (
        user?.stripeCustomerId ??
        null
      );
    },
    listCardPaymentMethods:
      async (customerId) => {
        const listed =
          await getStripe().paymentMethods.list({
            customer: customerId,
            type: "card",
            limit: 10,
          });

        return listed.data;
      },
    updateAllowRedisplay:
      async (paymentMethodId) =>
        getStripe().paymentMethods.update(
          paymentMethodId,
          {
            allow_redisplay:
              "always",
          },
        ),
  };
}

function allowRedisplay(
  paymentMethod: Stripe.PaymentMethod,
):
  | "always"
  | "limited"
  | "unspecified" {
  const value =
    paymentMethod.allow_redisplay;

  return value === "always" ||
    value === "limited" ||
    value === "unspecified"
    ? value
    : "unspecified";
}

function summary(
  paymentMethod: Stripe.PaymentMethod,
): TutoringSavedPaymentMethodSummary | null {
  if (
    paymentMethod.type !== "card" ||
    !paymentMethod.card
  ) {
    return null;
  }

  return {
    brand:
      paymentMethod.card.brand,
    last4:
      paymentMethod.card.last4,
    expMonth:
      paymentMethod.card.exp_month,
    expYear:
      paymentMethod.card.exp_year,
    allowRedisplay:
      allowRedisplay(
        paymentMethod,
      ),
  };
}

function chooseCard(
  rows: Stripe.PaymentMethod[],
): Stripe.PaymentMethod | null {
  const cards =
    rows.filter(
      (row) =>
        row.type === "card" &&
        Boolean(row.card),
    );

  return (
    cards.find(
      (row) =>
        row.allow_redisplay ===
        "always",
    ) ??
    cards.find(
      (row) =>
        row.allow_redisplay ===
        "limited",
    ) ??
    cards[0] ??
    null
  );
}

async function candidate(
  userId: string,
  deps: TutoringSavedPaymentMethodDeps,
) {
  const customerId =
    await deps.findCustomerId(
      userId,
    );

  if (!customerId) {
    return null;
  }

  const cards =
    await deps.listCardPaymentMethods(
      customerId,
    );

  const paymentMethod =
    chooseCard(cards);

  if (!paymentMethod) {
    return null;
  }

  return {
    customerId,
    paymentMethod,
  };
}

export async function getTutoringSavedPaymentMethod(
  userId: string,
  options: {
    deps?: TutoringSavedPaymentMethodDeps;
  } = {},
): Promise<TutoringSavedPaymentMethodSummary | null> {
  const deps =
    options.deps ??
    defaultDeps();

  const selected =
    await candidate(
      userId,
      deps,
    );

  return selected
    ? summary(
        selected.paymentMethod,
      )
    : null;
}

export type TutoringSavedPaymentMethodChargeAuthorization = {
  customerId: string;
  paymentMethodId: string;
  summary:
    TutoringSavedPaymentMethodSummary;
};

export async function authorizeTutoringSavedPaymentMethodForCharge(
  userId: string,
  options: {
    deps?: TutoringSavedPaymentMethodDeps;
  } = {},
): Promise<TutoringSavedPaymentMethodChargeAuthorization | null> {
  const deps =
    options.deps ??
    defaultDeps();

  const selected =
    await candidate(
      userId,
      deps,
    );

  if (!selected) {
    return null;
  }

  const current =
    selected.paymentMethod;

  const authorized =
    current.allow_redisplay ===
    "always"
      ? current
      : await deps.updateAllowRedisplay(
          current.id,
        );

  const masked =
    summary(
      authorized,
    );

  if (!masked) {
    return null;
  }

  return {
    customerId:
      selected.customerId,
    paymentMethodId:
      authorized.id,
    summary:
      masked,
  };
}

export async function authorizeTutoringSavedPaymentMethodReuse(
  userId: string,
  options: {
    deps?: TutoringSavedPaymentMethodDeps;
  } = {},
): Promise<TutoringSavedPaymentMethodSummary | null> {
  const deps =
    options.deps ??
    defaultDeps();

  const selected =
    await candidate(
      userId,
      deps,
    );

  if (!selected) {
    return null;
  }

  const current =
    selected.paymentMethod;

  const authorized =
    current.allow_redisplay ===
    "always"
      ? current
      : await deps.updateAllowRedisplay(
          current.id,
        );

  return summary(
    authorized,
  );
}
