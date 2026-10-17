import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BuildSecretStoreError,
  createBuildSecretStore,
  readBuildSecretMasterKeyFromEnvironment,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  PrismaClient,
} from "@zoeskoul/db";

type Row = {
  id: string;
  buildProjectId: string;
  algorithm: string;
  keyVersion: number;
  iv: Uint8Array;
  authTag: Uint8Array;
  ciphertext: Uint8Array;
};

function fakePrisma() {
  const rows =
    new Map<
      string,
      Row
    >();

  const prisma = {
    buildSecret: {
      async create(
        input:
          any,
      ) {
        rows.set(
          input.data.id,
          {
            ...input.data,
          },
        );

        return {
          id:
            input.data.id,
        };
      },

      async findFirst(
        input:
          any,
      ) {
        const row =
          rows.get(
            input.where.id,
          );

        if (
          !row ||
          row.buildProjectId !==
            input.where.buildProjectId
        ) {
          return null;
        }

        return {
          ...row,
        };
      },

      async deleteMany(
        input:
          any,
      ) {
        const row =
          rows.get(
            input.where.id,
          );

        if (
          !row ||
          row.buildProjectId !==
            input.where.buildProjectId
        ) {
          return {
            count:
              0,
          };
        }

        rows.delete(
          input.where.id,
        );

        return {
          count:
            1,
        };
      },
    },
  } as unknown as
    PrismaClient;

  return {
    prisma,
    rows,
  };
}

const key =
  Buffer.alloc(
    32,
    7,
  );

describe(
  "ZoeBuild BuildSecretStore",
  () => {
    it(
      "round-trips encrypted JSON without storing plaintext",
      async () => {
        const {
          prisma,
          rows,
        } =
          fakePrisma();

        const store =
          createBuildSecretStore({
            prisma,
            masterKey:
              key,
          });

        const result =
          await store.put({
            buildProjectId:
              "project-a",
            value: {
              apiKey:
                "super-secret-value",
              account:
                "acct_123",
            },
          });

        expect(
          result.secretRef,
        ).toMatch(
          /^zoebuild-secret:v1:/,
        );

        const row =
          [
            ...rows.values(),
          ][0];

        expect(
          row,
        ).toBeTruthy();

        expect(
          Buffer.from(
            row.ciphertext,
          ).toString(
            "utf8",
          ),
        ).not.toContain(
          "super-secret-value",
        );

        await expect(
          store.read({
            buildProjectId:
              "project-a",
            secretRef:
              result.secretRef,
          }),
        ).resolves.toEqual({
          apiKey:
            "super-secret-value",
          account:
            "acct_123",
        });
      },
    );

    it(
      "binds a secret reference to its BuildProject",
      async () => {
        const {
          prisma,
        } =
          fakePrisma();

        const store =
          createBuildSecretStore({
            prisma,
            masterKey:
              key,
          });

        const result =
          await store.put({
            buildProjectId:
              "project-a",
            value:
              "secret-a",
          });

        await expect(
          store.read({
            buildProjectId:
              "project-b",
            secretRef:
              result.secretRef,
          }),
        ).rejects.toMatchObject({
          code:
            "BUILD_SECRET_NOT_FOUND",
        });
      },
    );

    it(
      "fails closed when ciphertext authentication is tampered",
      async () => {
        const {
          prisma,
          rows,
        } =
          fakePrisma();

        const store =
          createBuildSecretStore({
            prisma,
            masterKey:
              key,
          });

        const result =
          await store.put({
            buildProjectId:
              "project-a",
            value: {
              token:
                "abc",
            },
          });

        const row =
          [
            ...rows.values(),
          ][0];

        row.authTag =
          Buffer.alloc(
            row.authTag.byteLength,
            0,
          );

        await expect(
          store.read({
            buildProjectId:
              "project-a",
            secretRef:
              result.secretRef,
          }),
        ).rejects.toMatchObject({
          code:
            "BUILD_SECRET_DECRYPT_FAILED",
        });
      },
    );

    it(
      "deletes idempotently without exposing the secret",
      async () => {
        const {
          prisma,
        } =
          fakePrisma();

        const store =
          createBuildSecretStore({
            prisma,
            masterKey:
              key,
          });

        const result =
          await store.put({
            buildProjectId:
              "project-a",
            value:
              "delete-me",
          });

        await store.delete({
          buildProjectId:
            "project-a",
          secretRef:
            result.secretRef,
        });

        await store.delete({
          buildProjectId:
            "project-a",
          secretRef:
            result.secretRef,
        });

        await expect(
          store.read({
            buildProjectId:
              "project-a",
            secretRef:
              result.secretRef,
          }),
        ).rejects.toMatchObject({
          code:
            "BUILD_SECRET_NOT_FOUND",
        });
      },
    );

    it(
      "requires an exact 32-byte base64 deployment master key",
      () => {
        expect(
          () =>
            readBuildSecretMasterKeyFromEnvironment(
              {},
            ),
        ).toThrowError(
          BuildSecretStoreError,
        );

        expect(
          () =>
            readBuildSecretMasterKeyFromEnvironment({
              ZOEBUILD_SECRET_MASTER_KEY_B64:
                Buffer.alloc(
                  31,
                  1,
                ).toString(
                  "base64",
                ),
            }),
        ).toThrowError(
          BuildSecretStoreError,
        );

        expect(
          readBuildSecretMasterKeyFromEnvironment({
            ZOEBUILD_SECRET_MASTER_KEY_B64:
              key.toString(
                "base64",
              ),
          }),
        ).toHaveLength(
          32,
        );
      },
    );
  },
);
