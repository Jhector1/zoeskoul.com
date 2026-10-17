import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";

import type {
  PrismaClient,
} from "@zoeskoul/db";

const BUILD_SECRET_ALGORITHM =
  "aes-256-gcm" as const;

const BUILD_SECRET_REF_PREFIX =
  "zoebuild-secret:v1:" as const;

const BUILD_SECRET_KEY_VERSION =
  1 as const;

const BUILD_SECRET_IV_BYTES =
  12;

const BUILD_SECRET_KEY_BYTES =
  32;

const BUILD_SECRET_MAX_PLAINTEXT_BYTES =
  64 * 1024;

export const ZOEBUILD_SECRET_MASTER_KEY_ENV =
  "ZOEBUILD_SECRET_MASTER_KEY_B64" as const;

export type BuildSecretJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type BuildSecretJsonValue =
  | BuildSecretJsonPrimitive
  | readonly BuildSecretJsonValue[]
  | Readonly<{
      [key: string]:
        BuildSecretJsonValue;
    }>;

export type BuildSecretPutResult =
  Readonly<{
    secretRef: string;
  }>;

export interface BuildSecretStore {
  put(
    input:
      Readonly<{
        buildProjectId: string;
        value:
          BuildSecretJsonValue;
      }>,
  ): Promise<BuildSecretPutResult>;

  read(
    input:
      Readonly<{
        buildProjectId: string;
        secretRef: string;
      }>,
  ): Promise<BuildSecretJsonValue>;

  delete(
    input:
      Readonly<{
        buildProjectId: string;
        secretRef: string;
      }>,
  ): Promise<void>;
}

export class BuildSecretStoreError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "BuildSecretStoreError";

    this.code =
      code;
  }
}

function normalizedProjectId(
  value: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_PROJECT_REQUIRED",
      "A BuildProject id is required.",
    );
  }

  return normalized;
}

function decodeMasterKey(
  encoded: string,
) {
  const normalized =
    encoded.trim();

  if (!normalized) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_KEY_MISSING",
      `${ZOEBUILD_SECRET_MASTER_KEY_ENV} is required.`,
    );
  }

  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      normalized,
    )
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_KEY_INVALID",
      `${ZOEBUILD_SECRET_MASTER_KEY_ENV} must be base64.`,
    );
  }

  const key =
    Buffer.from(
      normalized,
      "base64",
    );

  if (
    key.length !==
      BUILD_SECRET_KEY_BYTES
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_KEY_INVALID",
      `${ZOEBUILD_SECRET_MASTER_KEY_ENV} must decode to exactly 32 bytes.`,
    );
  }

  return key;
}

export function readBuildSecretMasterKeyFromEnvironment(
  environment:
    Readonly<
      Record<
        string,
        string | undefined
      >
    > =
      process.env,
) {
  return decodeMasterKey(
    environment[
      ZOEBUILD_SECRET_MASTER_KEY_ENV
    ] ??
      "",
  );
}

function validatedMasterKey(
  key:
    Uint8Array,
) {
  const buffer =
    Buffer.from(
      key,
    );

  if (
    buffer.length !==
      BUILD_SECRET_KEY_BYTES
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_KEY_INVALID",
      "Build secret master key must be exactly 32 bytes.",
    );
  }

  return buffer;
}

function serializeValue(
  value:
    BuildSecretJsonValue,
) {
  let serialized:
    string;

  try {
    serialized =
      JSON.stringify(
        value,
      );
  } catch {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_VALUE_INVALID",
      "Build secret value must be valid JSON.",
    );
  }

  if (
    typeof serialized !==
      "string"
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_VALUE_INVALID",
      "Build secret value must be valid JSON.",
    );
  }

  const plaintext =
    Buffer.from(
      serialized,
      "utf8",
    );

  if (
    plaintext.byteLength >
      BUILD_SECRET_MAX_PLAINTEXT_BYTES
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_VALUE_TOO_LARGE",
      "Build secret value exceeds the 64 KiB limit.",
    );
  }

  return plaintext;
}

function secretIdFromRef(
  secretRef:
    string,
) {
  const normalized =
    secretRef.trim();

  if (
    !normalized.startsWith(
      BUILD_SECRET_REF_PREFIX,
    )
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_REF_INVALID",
      "Build secret reference is invalid.",
    );
  }

  const id =
    normalized.slice(
      BUILD_SECRET_REF_PREFIX.length,
    );

  if (
    !/^[0-9a-f-]{36}$/i.test(
      id,
    )
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_REF_INVALID",
      "Build secret reference is invalid.",
    );
  }

  return id;
}

function secretRef(
  id:
    string,
) {
  return (
    BUILD_SECRET_REF_PREFIX +
    id
  );
}

function authenticatedData(
  input:
    Readonly<{
      id: string;
      buildProjectId: string;
      algorithm: string;
      keyVersion: number;
    }>,
) {
  return Buffer.from(
    [
      "zoebuild-secret",
      input.id,
      input.buildProjectId,
      input.algorithm,
      String(
        input.keyVersion,
      ),
    ].join(
      "|",
    ),
    "utf8",
  );
}

function decryptPayload(
  input:
    Readonly<{
      id: string;
      buildProjectId: string;
      algorithm: string;
      keyVersion: number;
      iv: Uint8Array;
      authTag: Uint8Array;
      ciphertext: Uint8Array;
      masterKey: Uint8Array;
    }>,
): BuildSecretJsonValue {
  if (
    input.algorithm !==
      BUILD_SECRET_ALGORITHM ||
    input.keyVersion !==
      BUILD_SECRET_KEY_VERSION
  ) {
    throw new BuildSecretStoreError(
      "BUILD_SECRET_KEY_VERSION_UNSUPPORTED",
      "Build secret encryption version is not supported.",
    );
  }

  try {
    const decipher =
      createDecipheriv(
        BUILD_SECRET_ALGORITHM,
        input.masterKey,
        input.iv,
      );

    decipher.setAAD(
      authenticatedData(
        input,
      ),
    );

    decipher.setAuthTag(
      Buffer.from(
        input.authTag,
      ),
    );

    const plaintext =
      Buffer.concat([
        decipher.update(
          input.ciphertext,
        ),
        decipher.final(),
      ]);

    return JSON.parse(
      plaintext.toString(
        "utf8",
      ),
    ) as BuildSecretJsonValue;
  } catch (
    error
  ) {
    if (
      error instanceof
      BuildSecretStoreError
    ) {
      throw error;
    }

    throw new BuildSecretStoreError(
      "BUILD_SECRET_DECRYPT_FAILED",
      "Build secret could not be decrypted.",
    );
  }
}

export function createBuildSecretStore(
  input:
    Readonly<{
      prisma: PrismaClient;
      masterKey?:
        Uint8Array;
    }>,
): BuildSecretStore {
  const masterKey =
    input.masterKey
      ? validatedMasterKey(
          input.masterKey,
        )
      : readBuildSecretMasterKeyFromEnvironment();

  return {
    async put(
      request,
    ) {
      const buildProjectId =
        normalizedProjectId(
          request.buildProjectId,
        );

      const id =
        randomUUID();

      const plaintext =
        serializeValue(
          request.value,
        );

      const iv =
        randomBytes(
          BUILD_SECRET_IV_BYTES,
        );

      const cipher =
        createCipheriv(
          BUILD_SECRET_ALGORITHM,
          masterKey,
          iv,
        );

      cipher.setAAD(
        authenticatedData({
          id,
          buildProjectId,
          algorithm:
            BUILD_SECRET_ALGORITHM,
          keyVersion:
            BUILD_SECRET_KEY_VERSION,
        }),
      );

      const ciphertext =
        Buffer.concat([
          cipher.update(
            plaintext,
          ),
          cipher.final(),
        ]);

      const authTag =
        cipher.getAuthTag();

      await input.prisma
        .buildSecret
        .create({
          data: {
            id,
            buildProjectId,
            algorithm:
              BUILD_SECRET_ALGORITHM,
            keyVersion:
              BUILD_SECRET_KEY_VERSION,
            iv,
            authTag,
            ciphertext,
          },
          select: {
            id:
              true,
          },
        });

      return {
        secretRef:
          secretRef(
            id,
          ),
      };
    },

    async read(
      request,
    ) {
      const buildProjectId =
        normalizedProjectId(
          request.buildProjectId,
        );

      const id =
        secretIdFromRef(
          request.secretRef,
        );

      const stored =
        await input.prisma
          .buildSecret
          .findFirst({
            where: {
              id,
              buildProjectId,
            },
            select: {
              id:
                true,
              buildProjectId:
                true,
              algorithm:
                true,
              keyVersion:
                true,
              iv:
                true,
              authTag:
                true,
              ciphertext:
                true,
            },
          });

      if (!stored) {
        throw new BuildSecretStoreError(
          "BUILD_SECRET_NOT_FOUND",
          "Build secret was not found.",
        );
      }

      return decryptPayload({
        ...stored,
        masterKey,
      });
    },

    async delete(
      request,
    ) {
      const buildProjectId =
        normalizedProjectId(
          request.buildProjectId,
        );

      const id =
        secretIdFromRef(
          request.secretRef,
        );

      await input.prisma
        .buildSecret
        .deleteMany({
          where: {
            id,
            buildProjectId,
          },
        });
    },
  };
}
