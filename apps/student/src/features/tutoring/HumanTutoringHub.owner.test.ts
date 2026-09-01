
import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relativePath: string,
) {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "Student human tutoring UI ownership",
  () => {
    it("extends the existing tutoring mode instead of adding a parallel route", () => {
      const myLearning =
        source(
          "src/exact-old-ui/ExactMyLearningView.tsx",
        );
      const routes =
        source(
          "src/app/studentRoutes.ts",
        );

      expect(
        myLearning,
      ).toContain(
        "<HumanTutoringHub",
      );
      expect(
        routes,
      ).toContain(
        'kind: "tutoring"',
      );
      expect(
        routes,
      ).not.toContain(
        'kind: "human-tutoring"',
      );
    });

    it("uses a focused step modal with separate polished date and time selection", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const modal =
        source(
          "src/features/tutoring/HumanTutoringRequestModal.tsx",
        );

      expect(
        hub,
      ).toContain(
        "<HumanTutoringRequestModal",
      );
      expect(
        hub,
      ).toContain(
        "onClick={openRequestModal}",
      );
      expect(
        modal,
      ).toContain(
        "const STEPS =",
      );
      for (const step of [
        '"course"',
        '"duration"',
        '"date"',
        '"time"',
        '"details"',
        '"review"',
      ]) {
        expect(
          modal,
        ).toContain(step);
      }
      expect(
        modal,
      ).toContain(
        "goNext",
      );
      expect(
        modal,
      ).toContain(
        "goBack",
      );
      expect(
        modal,
      ).toContain(
        "!isLastStep &&",
      );
      expect(
        modal,
      ).toContain(
        "canContinue &&",
      );
      expect(
        modal,
      ).toContain(
        "goNext();",
      );
      expect(
        modal,
      ).toContain(
        "void props.onSubmit();",
      );
      expect(
        modal,
      ).not.toContain(
        "props.onSubmit(event)",
      );
      expect(
        modal,
      ).not.toContain(
        'type="submit"',
      );
      expect(
        (
          modal.match(
            /props\.onSubmit\(/g,
          ) ?? []
        ).length,
      ).toBe(1);
      expect(
        modal,
      ).toContain(
        "Your tutoring minutes are reserved only after you press Request tutoring.",
      );
      expect(
        hub,
      ).toContain(
        "async function submitRequest()",
      );
      expect(
        hub,
      ).not.toContain(
        "FormEvent<HTMLFormElement>",
      );
      expect(
        modal,
      ).toContain(
        "CalendarGrid",
      );
      expect(
        modal,
      ).toContain(
        'type="time"',
      );
      expect(
        modal,
      ).not.toContain(
        'type="datetime-local"',
      );
      expect(
        modal,
      ).toContain(
        "preferredStartsAtRef.current",
      );
      expect(
        modal,
      ).toContain(
        "[props.open]",
      );
      expect(
        modal,
      ).not.toContain(
        "props.preferredStartsAt,\n    ],",
      );
    });

    it("preserves flexible duration and preferred-time semantics without tutor selection", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const modal =
        source(
          "src/features/tutoring/HumanTutoringRequestModal.tsx",
        );
      const client =
        source(
          "src/features/tutoring/humanTutoringClient.ts",
        );

      expect(
        modal,
      ).toContain(
        "Custom duration",
      );
      expect(
        modal,
      ).toContain(
        "preferred time, not a confirmed booking",
      );
      expect(
        client,
      ).toContain(
        "preferredStartsAt",
      );
      expect(
        client,
      ).not.toContain(
        "teacherId:",
      );
      expect(
        hub + modal,
      ).not.toContain(
        "Choose a tutor",
      );
    });

    it("embeds only the missing tutoring-credit checkout inside Review", () => {
      const modal =
        source(
          "src/features/tutoring/HumanTutoringRequestModal.tsx",
        );
      const embedded =
        source(
          "src/features/tutoring/HumanTutoringEmbeddedCheckout.tsx",
        );
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const client =
        source(
          "src/features/tutoring/humanTutoringClient.ts",
        );

      expect(
        modal,
      ).toContain(
        "<HumanTutoringEmbeddedCheckout",
      );
      expect(
        embedded,
      ).toContain(
        "props.requestedMinutes -",
      );
      expect(
        embedded,
      ).toContain(
        "props.pricing.minimumMinutes",
      );
      expect(
        embedded,
      ).toContain(
        "<EmbeddedCheckoutProvider",
      );
      expect(
        embedded,
      ).toContain(
        "<EmbeddedCheckout",
      );
      expect(
        embedded,
      ).toContain(
        "onRefreshCredits",
      );
      expect(
        hub,
      ).toContain(
        'uiMode:\n          "embedded"',
      );
      expect(
        client,
      ).toContain(
        '"embedded_checkout"',
      );
      expect(
        client,
      ).not.toContain(
        "amountMinor: args.",
      );
    });

    it("keeps the saved-card choice in front of the canonical payment paths", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const embedded =
        source(
          "src/features/tutoring/HumanTutoringEmbeddedCheckout.tsx",
        );

      expect(
        hub,
      ).toContain(
        "loadTutoringSavedPaymentMethod",
      );
      expect(
        hub,
      ).toContain(
        "authorizeTutoringSavedPaymentMethod",
      );
      expect(
        embedded,
      ).toContain(
        "Saved payment method",
      );
      expect(
        embedded,
      ).toContain(
        "Use another payment method",
      );
      expect(
        embedded,
      ).not.toContain(
        "authorizeSaved: true",
      );
      expect(
        embedded,
      ).toContain(
        "onStartCheckout",
      );
    });

    it("uses a compact tutoring wallet with Request tutoring and Manage credits as the primary actions", () => {
      const hub = source(
        "src/features/tutoring/HumanTutoringHub.tsx",
      );
      const manage = source(
        "src/features/tutoring/HumanTutoringManageCreditsModal.tsx",
      );

      expect(hub).toContain(
        "tutoring minutes",
      );
      expect(hub).toContain(
        "available ·",
      );
      expect(hub).toContain(
        "Manage credits",
      );
      expect(hub).not.toContain(
        "Prepaid tutoring credit",
      );
      expect(manage).toContain(
        "Add tutoring minutes",
      );
      expect(manage).toContain(
        "Refunds",
      );
    });

    it("gives learners request cancellation without duplicating booking credit release logic", () => {
      const hub = source(
        "src/features/tutoring/HumanTutoringHub.tsx",
      );
      const client = source(
        "src/features/tutoring/humanTutoringClient.ts",
      );

      expect(hub).toContain(
        "Cancel request",
      );
      expect(hub).toContain(
        "Cancel session",
      );
      expect(client).toContain(
        "cancelHumanTutoringRequest",
      );
      expect(client).toContain(
        "/cancel",
      );
    });

    it("keeps cash refunds inside Manage credits and never sends an authoritative amount from Student", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const manage =
        source(
          "src/features/tutoring/HumanTutoringManageCreditsModal.tsx",
        );
      const client =
        source(
          "src/features/tutoring/humanTutoringClient.ts",
        );

      expect(manage)
        .toContain(
          "Request refund",
        );
      expect(manage)
        .toContain(
          "original payment method",
        );
      expect(manage)
        .toContain(
          "Refund pending",
        );
      expect(manage)
        .toContain(
          "Retry refund",
        );
      expect(manage)
        .toContain(
          "retryableRefundMinutes",
        );
      expect(hub)
        .toContain(
          "loadTutoringRefundableCredits",
        );
      expect(hub)
        .toContain(
          "requestTutoringCreditRefund",
        );
      expect(client)
        .toContain(
          "refundAttemptId",
        );
      expect(client)
        .toContain(
          "purchaseId",
        );
      expect(client)
        .toContain(
          "minutes",
        );
      expect(client)
        .not.toContain(
          "args.amountMinor",
        );
    });

    it("charges the saved card directly and reserves Embedded Checkout for another method", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const embedded =
        source(
          "src/features/tutoring/HumanTutoringEmbeddedCheckout.tsx",
        );

      expect(hub)
        .toContain(
          "startTutoringSavedCardPayment",
        );
      expect(embedded)
        .toContain(
          "beginSavedCardPayment",
        );
      expect(embedded)
        .toContain(
          "handleNextAction",
        );
      expect(embedded)
        .toContain(
          "Use another payment method",
        );
      expect(embedded)
        .toContain(
          "void beginCheckout();",
        );
      expect(embedded)
        .not.toContain(
          "authorizeSaved: true",
        );
    });

    it("keeps the tutoring calendar compact", () => {
      const modal =
        source(
          "src/features/tutoring/HumanTutoringRequestModal.tsx",
        );

      expect(
        modal,
      ).toContain(
        "max-w-[460px]",
      );
      expect(
        modal,
      ).toContain(
        "h-11 w-11 justify-self-center",
      );
      expect(
        modal,
      ).not.toContain(
        '"relative aspect-square rounded-xl text-sm font-medium transition"',
      );
    });

    it("keeps server-owned pricing and browser checkout money boundaries", () => {
      const hub =
        source(
          "src/features/tutoring/HumanTutoringHub.tsx",
        );
      const client =
        source(
          "src/features/tutoring/humanTutoringClient.ts",
        );

      const checkoutStart =
        client.indexOf(
          "export async function startTutoringCreditCheckout",
        );
      const requestStart =
        client.indexOf(
          "export async function createHumanTutoringRequest",
        );

      expect(
        checkoutStart,
      ).toBeGreaterThanOrEqual(0);
      expect(
        requestStart,
      ).toBeGreaterThan(
        checkoutStart,
      );

      const checkoutRegion =
        client.slice(
          checkoutStart,
          requestStart,
        );

      expect(
        checkoutRegion,
      ).toContain(
        "minutes: args.minutes",
      );
      expect(
        checkoutRegion,
      ).not.toContain(
        "amountMinor: args.",
      );
      expect(
        checkoutRegion,
      ).not.toContain(
        "price: args.",
      );
      expect(
        source(
          "src/features/tutoring/HumanTutoringManageCreditsModal.tsx",
        ),
      ).toContain(
        "server-calculated",
      );
    });
  },
);
