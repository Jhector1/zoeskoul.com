import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  decodeDockerExecMultiplexedOutput,
} from "./reactPreviewRuntime.js";

function frame(
  streamType: 1 | 2,
  text: string,
) {
  const payload =
    Buffer.from(
      text,
      "utf8",
    );
  const header =
    Buffer.alloc(8);

  header[0] =
    streamType;
  header.writeUInt32BE(
    payload.length,
    4,
  );

  return Buffer.concat([
    header,
    payload,
  ]);
}

describe(
  "React preview Docker exec transport",
  () => {
    it(
      "demultiplexes stdout JSON without Docker frame bytes",
      () => {
        const raw =
          Buffer.concat([
            frame(
              2,
              "diagnostic\n",
            ),
            frame(
              1,
              '{"status":200,',
            ),
            frame(
              1,
              '"headers":{},',
            ),
            frame(
              1,
              '"bodyBase64":""}\n',
            ),
          ]);

        const decoded =
          decodeDockerExecMultiplexedOutput(
            raw,
          );

        expect(
          decoded.stdout.toString(
            "utf8",
          ),
        ).toBe(
          '{"status":200,"headers":{},"bodyBase64":""}\n',
        );
        expect(
          decoded.stderr.toString(
            "utf8",
          ),
        ).toBe(
          "diagnostic\n",
        );

        expect(() =>
          JSON.parse(
            decoded.stdout
              .toString(
                "utf8",
              )
              .trim(),
          ),
        ).not.toThrow();
      },
    );

    it(
      "fails closed on truncated Docker multiplex frames",
      () => {
        expect(() =>
          decodeDockerExecMultiplexedOutput(
            Buffer.from([
              1, 0, 0, 0,
              0, 0, 0, 4,
              123, 125,
            ]),
          ),
        ).toThrow(
          "invalid Docker stream",
        );
      },
    );

    it(
      "keeps machine-readable exec transport non-TTY",
      () => {
        const source =
          readFileSync(
            resolve(
              process.cwd(),
              "src/services/build/reactPreviewRuntime.ts",
            ),
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "Tty: false",
        );
        expect(
          source,
        ).not.toContain(
          "Tty: true",
        );
      },
    );
  },
);
