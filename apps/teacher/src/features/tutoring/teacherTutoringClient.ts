export type TeacherPoolMembership = {
  userId: string;
  enabled: boolean;
  priority: number;
};

export type TeacherAvailabilityWindow = {
  id?: string;
  startsAt: string;
  endsAt: string;
};

export type TeacherAvailability = {
  userId: string;
  enabled: boolean;
  priority: number;
  timeZone: string;
  availabilityWindows: TeacherAvailabilityWindow[];
};

export type TeacherTutoringBooking = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  status: string;
  tutoringSessionId: string | null;
};

export type TeacherTutoringRequest = {
  id: string;
  status: string;
  requestedMinutes: number;
  preferredStartsAt: string | null;
  sourceSubjectSlug: string | null;
  sourceModuleSlug: string | null;
  sourceExerciseKey: string | null;
  note: string | null;
  assignedTeacherId: string | null;
  tutoringSessionId: string | null;
  assignedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  learner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  assignedTeacher: {
    id: string;
    name: string | null;
  } | null;
  bookings: TeacherTutoringBooking[];
};

export type TeacherTutoringOverview = {
  pool: TeacherPoolMembership;
  availability: TeacherAvailability;
  requests: TeacherTutoringRequest[];
};

type ErrorPayload = {
  error?: string;
  code?: string;
};

export class TeacherTutoringApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(
    message: string,
    args: { status: number; code?: string | null },
  ) {
    super(message);
    this.name = "TeacherTutoringApiError";
    this.status = args.status;
    this.code = args.code ?? null;
  }
}

function apiUrl(apiOrigin: string, pathname: string) {
  return new URL(pathname, apiOrigin).toString();
}

async function requireJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & ErrorPayload)
    | null;

  if (!response.ok) {
    throw new TeacherTutoringApiError(
      payload?.error ??
        `Teacher tutoring request failed (${response.status}).`,
      {
        status: response.status,
        code: payload?.code ?? null,
      },
    );
  }

  if (!payload) {
    throw new TeacherTutoringApiError(
      "Teacher tutoring returned an empty response.",
      { status: response.status },
    );
  }

  return payload as T;
}

function browserRequest(
  fetchImpl: typeof fetch,
  apiOrigin: string,
  pathname: string,
  init: RequestInit = {},
) {
  return fetchImpl(apiUrl(apiOrigin, pathname), {
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
    ...init,
  });
}

export async function loadTeacherTutoringOverview(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TeacherTutoringOverview> {
  const [queueResponse, availabilityResponse] =
    await Promise.all([
      browserRequest(
        fetchImpl,
        apiOrigin,
        "/api/teacher/tutoring-requests",
      ),
      browserRequest(
        fetchImpl,
        apiOrigin,
        "/api/teacher/tutoring-availability",
      ),
    ]);

  const queue = await requireJson<{
    pool: TeacherPoolMembership;
    requests: TeacherTutoringRequest[];
  }>(queueResponse);
  const availabilityPayload = await requireJson<{
    availability: TeacherAvailability;
  }>(availabilityResponse);

  return {
    pool: queue.pool,
    availability: availabilityPayload.availability,
    requests: queue.requests,
  };
}

export async function setTeacherTutoringEnabled(
  apiOrigin: string,
  enabled: boolean,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    apiOrigin,
    "/api/teacher/tutoring-pool",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );

  return requireJson<{ pool: TeacherPoolMembership }>(response);
}

export async function replaceTeacherAvailability(
  args: {
    apiOrigin: string;
    timeZone: string;
    windows: Array<{ startsAt: string; endsAt: string }>;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    args.apiOrigin,
    "/api/teacher/tutoring-availability",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeZone: args.timeZone,
        windows: args.windows,
      }),
    },
  );

  return requireJson<{ availability: TeacherAvailability }>(response);
}

export async function scheduleTeacherTutoringRequest(
  args: {
    apiOrigin: string;
    requestId: string;
    startsAt: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    args.apiOrigin,
    `/api/teacher/tutoring-requests/${encodeURIComponent(args.requestId)}/schedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: args.startsAt }),
    },
  );

  return requireJson<{
    booking: TeacherTutoringBooking;
    teacherId: string;
  }>(response);
}

export async function prepareTeacherTutoringRequest(
  args: {
    apiOrigin: string;
    requestId: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    args.apiOrigin,
    `/api/teacher/tutoring-requests/${encodeURIComponent(args.requestId)}/prepare`,
    { method: "POST" },
  );

  return requireJson<{
    session: { id: string; slug: string; status: string };
    resumed: boolean;
  }>(response);
}

export async function completeTeacherTutoringBooking(
  args: {
    apiOrigin: string;
    bookingId: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    args.apiOrigin,
    `/api/teacher/tutoring-bookings/${encodeURIComponent(args.bookingId)}/complete`,
    { method: "POST" },
  );

  return requireJson<{ ok: true; status: "completed" }>(response);
}

export async function cancelTeacherTutoringBooking(
  args: {
    apiOrigin: string;
    bookingId: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await browserRequest(
    fetchImpl,
    args.apiOrigin,
    `/api/teacher/tutoring-bookings/${encodeURIComponent(args.bookingId)}/cancel`,
    { method: "POST" },
  );

  return requireJson<{ ok: true; status: "canceled" }>(response);
}
