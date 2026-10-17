import {
  describe,
  expect,
  it,
} from "vitest";

import {
  materializeProviderPreset,
  type ProviderConnectionSnapshot,
  type ProviderConnectionStatus,
  type ProviderPreset,
} from "./index";

const CANONICAL_PROVIDER_CONNECTION_STATUSES = [
  "disconnected",
  "active",
  "error",
] as const satisfies readonly ProviderConnectionStatus[];

// These are deliberate negative compile-time assertions. If either legacy
// state becomes valid again, TypeScript will fail because @ts-expect-error
// would become unused.
// @ts-expect-error pending is not a provider connection lifecycle state.
const pendingStatus: ProviderConnectionStatus =
  "pending";

// @ts-expect-error disabled is not a provider connection lifecycle state.
const disabledStatus: ProviderConnectionStatus =
  "disabled";

void pendingStatus;
void disabledStatus;

const PRESET = {
  key: "status-lifecycle-test",
  version: 1,
  label: "Status lifecycle test",
  description: "Exercises fail-closed connection status routing.",
  routes: [
    {
      capability: "commerce.payments",
      providerKey: "test-provider",
    },
  ],
} as const satisfies ProviderPreset<"commerce.payments">;

function connection(
  status: ProviderConnectionStatus,
): ProviderConnectionSnapshot {
  return {
    id: `connection-${status}`,
    providerKey: "test-provider",
    environment: "test",
    kind: "credentials",
    status,
  };
}

describe(
  "provider connection status lifecycle",
  () => {
    it(
      "uses the persisted canonical status set",
      () => {
        expect(
          CANONICAL_PROVIDER_CONNECTION_STATUSES,
        ).toEqual([
          "disconnected",
          "active",
          "error",
        ]);
      },
    );

    it(
      "routes only active connections",
      () => {
        expect(
          materializeProviderPreset({
            preset: PRESET,
            scopeId: "scope-1",
            environment: "test",
            resolveConnection:
              () => connection("active"),
          }),
        ).toEqual({
          presetKey:
            "status-lifecycle-test",
          presetVersion:
            1,
          routes: [
            {
              scopeId: "scope-1",
              environment: "test",
              capability:
                "commerce.payments",
              connectionId:
                "connection-active",
            },
          ],
        });
      },
    );

    it.each([
      "disconnected",
      "error",
    ] as const)(
      "fails closed for %s connections",
      (status) => {
        expect(
          () =>
            materializeProviderPreset({
              preset: PRESET,
              scopeId: "scope-1",
              environment: "test",
              resolveConnection:
                () => connection(status),
            }),
        ).toThrow(
          /requires active connection/,
        );
      },
    );
  },
);
