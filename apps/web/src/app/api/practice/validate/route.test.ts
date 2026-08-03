import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  buildPracticeValidateContext: vi.fn(),
  enforceTutoringWorkspaceMutationAccess: vi.fn(),
  handlePracticeValidate: vi.fn(),
  rateLimit: vi.fn(),
  readJsonSafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/security/ratelimit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock(
  "@/lib/practice/api/validate/context",
  () => ({
    buildPracticeValidateContext:
      mocks.buildPracticeValidateContext,
  }),
);

vi.mock(
  "@/lib/practice/api/validate/handler",
  () => ({
    handlePracticeValidate:
      mocks.handlePracticeValidate,
  }),
);

vi.mock(
  "@/lib/tutoring/sessionWorkspaceMutationAccess",
  () => ({
    enforceTutoringWorkspaceMutationAccess:
      mocks.enforceTutoringWorkspaceMutationAccess,
  }),
);

vi.mock(
  "@/lib/practice/api/validate/schemas",
  () => ({
    BodySchema: {
      safeParse: vi.fn(() => ({
        success: true,
        data: {
          key: "signed-practice-key",
          answer: {
            kind: "code_input",
            language: "python",
            code: "print(1)",
            stdin: "",
          },
        },
      })),
    },
  }),
);

vi.mock(
  "@/lib/practice/api/shared/http",
  () => ({
    getClientIp: vi.fn(() => "127.0.0.1"),
    jsonApiResponse: vi.fn(
      (args: {
        requestId: string;
        message: string;
        status: number;
      }) =>
        Response.json(
          {
            message: args.message,
            requestId: args.requestId,
          },
          { status: args.status },
        ),
    ),
    readJsonSafe: mocks.readJsonSafe,
  }),
);

function makeRequest(origin?: string) {
  return new Request(
    "https://web-preview.zoeskoul.com/api/practice/validate",
    {
      method: "POST",
      headers: {
        ...(origin ? { Origin: origin } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "signed-practice-key",
        answer: {
          kind: "code_input",
          language: "python",
          code: "print(1)",
          stdin: "",
        },
      }),
    },
  );
}

beforeEach(() => {
  mocks.enforceTutoringWorkspaceMutationAccess
    .mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue({
    ok: true,
    limit: 100,
    remaining: 99,
    resetMs: Date.now() + 60_000,
  });
  mocks.readJsonSafe.mockResolvedValue({
    key: "signed-practice-key",
    answer: {
      kind: "code_input",
      language: "python",
      code: "print(1)",
      stdin: "",
    },
  });
  mocks.buildPracticeValidateContext
    .mockResolvedValue({
      kind: "ctx",
      ctx: {},
    });
  mocks.handlePracticeValidate
    .mockResolvedValue(
      Response.json(
        {
          ok: true,
          finalized: true,
        },
        { status: 200 },
      ),
    );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/practice/validate origin boundary", () => {
  it("rejects a missing mutation origin before reading JSON", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest(),
    );

    expect(response.status).toBe(403);
    expect(mocks.readJsonSafe).not.toHaveBeenCalled();
    expect(
      mocks.buildPracticeValidateContext,
    ).not.toHaveBeenCalled();
  });

  it("rejects an untrusted origin before reading JSON", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest("https://evil.example"),
    );

    expect(response.status).toBe(403);
    expect(mocks.readJsonSafe).not.toHaveBeenCalled();
    expect(
      mocks.buildPracticeValidateContext,
    ).not.toHaveBeenCalled();
  });

  it("accepts the trusted production Student origin", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest(
        "https://student.zoeskoul.com",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.readJsonSafe).toHaveBeenCalledTimes(1);
    expect(
      mocks.handlePracticeValidate,
    ).toHaveBeenCalledTimes(1);
  });

  it("accepts the exact configured Student preview origin", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    const { POST } = await import("./route");

    const response = await POST(
      makeRequest(
        "https://student-preview.zoeskoul.com",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.readJsonSafe).toHaveBeenCalledTimes(1);
    expect(
      mocks.handlePracticeValidate,
    ).toHaveBeenCalledTimes(1);
  });

  it("rejects a configured-preview lookalike origin", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    const { POST } = await import("./route");

    const response = await POST(
      makeRequest(
        "https://student-preview.zoeskoul.com.evil.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.readJsonSafe).not.toHaveBeenCalled();
    expect(
      mocks.handlePracticeValidate,
    ).not.toHaveBeenCalled();
  });
});
