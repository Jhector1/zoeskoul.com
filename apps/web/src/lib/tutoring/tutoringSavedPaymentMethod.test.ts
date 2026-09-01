import { describe, expect, it, vi } from "vitest";

import {
  authorizeTutoringSavedPaymentMethodReuse,
  getTutoringSavedPaymentMethod,
  type TutoringSavedPaymentMethodDeps,
} from "./tutoringSavedPaymentMethod";

function card(
  args: {
    id: string;
    allow:
      | "always"
      | "limited"
      | "unspecified";
    last4: string;
  },
) {
  return {
    id: args.id,
    object: "payment_method",
    type: "card",
    allow_redisplay: args.allow,
    card: {
      brand: "visa",
      last4: args.last4,
      exp_month: 12,
      exp_year: 2028,
    },
  } as never;
}

function deps(
  rows: ReturnType<typeof card>[],
): TutoringSavedPaymentMethodDeps {
  return {
    findCustomerId:
      vi.fn(
        async () => "cus_1",
      ),
    listCardPaymentMethods:
      vi.fn(
        async () => rows,
      ),
    updateAllowRedisplay:
      vi.fn(
        async (id) =>
          card({
            id,
            allow: "always",
            last4: "4242",
          }),
      ),
  };
}

describe(
  "tutoring saved payment method",
  () => {
    it(
      "returns only masked card metadata and prefers an always-redisplay card",
      async () => {
        const d = deps([
          card({
            id: "pm_limited",
            allow: "limited",
            last4: "1111",
          }),
          card({
            id: "pm_always",
            allow: "always",
            last4: "4242",
          }),
        ]);

        await expect(
          getTutoringSavedPaymentMethod(
            "learner-1",
            { deps: d },
          ),
        ).resolves.toEqual({
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2028,
          allowRedisplay:
            "always",
        });
      },
    );

    it(
      "returns a limited subscription card for masked pre-screen display",
      async () => {
        const d = deps([
          card({
            id: "pm_subscription",
            allow: "limited",
            last4: "4242",
          }),
        ]);

        await expect(
          getTutoringSavedPaymentMethod(
            "learner-1",
            { deps: d },
          ),
        ).resolves.toMatchObject({
          last4: "4242",
          allowRedisplay:
            "limited",
        });
      },
    );

    it(
      "changes redisplay to always only after explicit reuse authorization",
      async () => {
        const d = deps([
          card({
            id: "pm_subscription",
            allow: "limited",
            last4: "4242",
          }),
        ]);

        await expect(
          authorizeTutoringSavedPaymentMethodReuse(
            "learner-1",
            { deps: d },
          ),
        ).resolves.toMatchObject({
          last4: "4242",
          allowRedisplay:
            "always",
        });

        expect(
          d.updateAllowRedisplay,
        ).toHaveBeenCalledWith(
          "pm_subscription",
        );
      },
    );

    it(
      "does not create a Stripe customer when none is already persisted",
      async () => {
        const d = deps([]);

        vi.mocked(
          d.findCustomerId,
        ).mockResolvedValue(null);

        await expect(
          getTutoringSavedPaymentMethod(
            "learner-1",
            { deps: d },
          ),
        ).resolves.toBeNull();

        expect(
          d.listCardPaymentMethods,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
