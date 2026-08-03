export class NextRequest extends Request {
  readonly nextUrl: URL;
  readonly cookies: Record<string, unknown>;

  constructor(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    super(input, init);
    this.nextUrl = new URL(this.url);
    this.cookies = {};
  }
}

export class NextResponse<Body = unknown>
  extends Response {
  readonly bodyValue?: Body;

  constructor(
    body?: BodyInit | null,
    init?: ResponseInit,
    bodyValue?: Body,
  ) {
    super(body, init);
    this.bodyValue = bodyValue;
  }

  static json<Body>(
    body: Body,
    init?: ResponseInit,
  ): NextResponse<Body> {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set(
        "content-type",
        "application/json; charset=utf-8",
      );
    }

    return new NextResponse<Body>(
      JSON.stringify(body),
      {
        ...init,
        headers,
      },
      body,
    );
  }

  static redirect(
    url: string | URL,
    status = 307,
  ): NextResponse<null> {
    return new NextResponse<null>(
      null,
      {
        status,
        headers: {
          location: String(url),
        },
      },
      null,
    );
  }

  static next(
    init?: ResponseInit,
  ): NextResponse<null> {
    return new NextResponse<null>(
      null,
      init,
      null,
    );
  }
}
