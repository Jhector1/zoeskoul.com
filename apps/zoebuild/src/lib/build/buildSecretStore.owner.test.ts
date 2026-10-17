import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    fileURLToPath(
      new URL(
        "../../../../../",
        import.meta.url,
      ),
    ),
  );

function source(
  relative:
    string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild generic BuildSecretStore ownership",
  () => {
    const vault =
      source(
        "packages/platform-server/src/security/buildSecretStore.ts",
      );

    const schema =
      source(
        "packages/db/prisma/schema.prisma",
      );

    const migration =
      source(
        "packages/db/prisma/migrations/20261017023000_zoebuild_build_secret_vault/migration.sql",
      );

    const platformPackage =
      source(
        "packages/platform-server/package.json",
      );

    it(
      "keeps the vault in the canonical server package",
      () => {
        expect(
          platformPackage,
        ).toContain(
          '"./security/buildSecretStore"',
        );

        expect(
          vault,
        ).toContain(
          '"node:crypto"',
        );
      },
    );

    it(
      "uses authenticated AES-256-GCM with a fresh 12-byte IV",
      () => {
        expect(
          vault,
        ).toContain(
          '"aes-256-gcm"',
        );

        expect(
          vault,
        ).toContain(
          "randomBytes",
        );

        expect(
          vault,
        ).toContain(
          "BUILD_SECRET_IV_BYTES =\n  12",
        );

        expect(
          vault,
        ).toContain(
          "cipher.setAAD",
        );

        expect(
          vault,
        ).toContain(
          "cipher.getAuthTag",
        );

        expect(
          vault,
        ).toContain(
          "decipher.setAuthTag",
        );
      },
    );

    it(
      "fails closed on missing or malformed deployment key material",
      () => {
        expect(
          vault,
        ).toContain(
          "ZOEBUILD_SECRET_MASTER_KEY_B64",
        );

        expect(
          vault,
        ).toContain(
          "BUILD_SECRET_KEY_MISSING",
        );

        expect(
          vault,
        ).toContain(
          "BUILD_SECRET_KEY_INVALID",
        );

        expect(
          vault,
        ).not.toContain(
          "default-secret",
        );

        expect(
          vault,
        ).not.toContain(
          "development-secret",
        );
      },
    );

    it(
      "binds reads and deletes to BuildProject ownership",
      () => {
        expect(
          vault,
        ).toContain(
          "id,\n              buildProjectId",
        );

        expect(
          schema,
        ).toContain(
          "buildProjectId String",
        );

        expect(
          schema,
        ).toContain(
          "buildProject   BuildProject",
        );

        expect(
          migration,
        ).toContain(
          'REFERENCES "BuildProject"("id")',
        );

        expect(
          migration,
        ).toContain(
          "ON DELETE CASCADE",
        );
      },
    );

    it(
      "stores only encrypted payload material in the control-plane table",
      () => {
        for (
          const field of [
            '"iv" BYTEA',
            '"authTag" BYTEA',
            '"ciphertext" BYTEA',
          ]
        ) {
          expect(
            migration,
          ).toContain(
            field,
          );
        }

        expect(
          migration,
        ).not.toMatch(
          /"plaintext"|"secretValue"|"apiKey"|"accessToken"/,
        );
      },
    );

    it(
      "keeps existing resources and commerce connections on opaque references",
      () => {
        expect(
          schema,
        ).toContain(
          "secretRef      String?",
        );

        expect(
          schema,
        ).toContain(
          "credentialsSecretRef String?",
        );

        expect(
          schema,
        ).toContain(
          "webhookSecretRef     String?",
        );
      },
    );

    it(
      "does not introduce any payment provider SDK into the generic vault",
      () => {
        for (
          const provider of [
            "stripe",
            "square",
            "paypal",
            "shopify",
          ]
        ) {
          expect(
            vault.toLowerCase(),
          ).not.toContain(
            provider,
          );
        }
      },
    );
  },
);
