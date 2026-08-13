import { describe, expect, it, vi } from "vitest";

import {
  BugReportTransportError,
  createBugReport,
  createScreenshotAttachment,
} from "../src/core";
import { createHttpTransport } from "../src/transports/http";
import { createSentryTransport } from "../src/transports/sentry";
import type {
  SentryFeedbackHint,
  SentryFeedbackParams,
} from "../src/transports/sentry";

describe("HTTP transport", () => {
  it.each([undefined, null, "", "  \t  "])(
    "rejects a missing or blank endpoint at construction (%s)",
    (endpoint) => {
      expect(() =>
        createHttpTransport({ endpoint: endpoint as never }),
      ).toThrow(TypeError);
    },
  );

  it("posts versioned multipart data and returns the server receipt", async () => {
    const fetchImplementation = vi.fn(async (_url, init) => {
      const body = init?.body as FormData;
      const reportPart = body.get("report") as Blob;
      const report = JSON.parse(await reportPart.text());

      expect(report).toMatchObject({
        anonymous: false,
        message: "Saving failed.",
        schemaVersion: 1,
      });
      expect(body.get("attachment")).toBeInstanceOf(Blob);

      return new Response(
        JSON.stringify({
          acceptedAt: "2026-08-13T00:00:01.000Z",
          id: "server-report-1",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 201,
        },
      );
    });
    const transport = createHttpTransport({
      endpoint: "https://example.test/v1/bug-reports",
      fetch: fetchImplementation as typeof fetch,
    });
    const report = createBugReport({
      anonymous: false,
      attachment: createScreenshotAttachment(
        new Blob(["image"], { type: "image/png" }),
        { filename: "screen.png", source: "upload" },
      ),
      contact: { email: "ada@example.com", name: "Ada" },
      includeTechnicalContext: false,
      message: "Saving failed.",
    });

    await expect(transport(report)).resolves.toEqual({
      acceptedAt: "2026-08-13T00:00:01.000Z",
      id: "server-report-1",
      provider: "http",
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
    });
  });

  it("turns problem details into a typed retryable transport error", async () => {
    const transport = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: "Try again in one minute.",
              status: 429,
              title: "Too Many Requests",
              type: "https://example.test/problems/rate-limited",
            }),
            {
              headers: {
                "content-type": "application/problem+json",
                "retry-after": "60",
              },
              status: 429,
            },
          ),
      ) as typeof fetch,
    });

    await expect(
      transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The editor failed.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Try again in one minute.",
      retryAfterMs: 60_000,
      retryable: true,
      status: 429,
    } satisfies Partial<BugReportTransportError>);
  });

  it("supports async headers, request options, and an empty success receipt", async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    const transport = createHttpTransport({
      credentials: "include",
      endpoint: "/v1/bug-reports",
      fetch: fetchImplementation as typeof fetch,
      headers: async () => ({ Authorization: "Bearer test" }),
      signal: controller.signal,
    });

    await expect(
      transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "A report without an attachment",
        }),
      ),
    ).resolves.toEqual({ provider: "http" });
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      headers: { Authorization: "Bearer test" },
    });
    const requestSignal = fetchImplementation.mock.calls[0]?.[1]?.signal;
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal).not.toBe(controller.signal);
  });

  it("composes caller cancellation with the request timeout", async () => {
    vi.useFakeTimers();
    try {
      const caller = new AbortController();
      let requestSignal: AbortSignal | undefined;
      const fetchImplementation = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      );
      const transport = createHttpTransport({
        endpoint: "/v1/bug-reports",
        fetch: fetchImplementation as typeof fetch,
        signal: caller.signal,
        timeoutMs: 30_000,
      });

      const pending = transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The editor failed",
        }),
      );
      const rejection = expect(pending).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        retryable: true,
      });
      expect(requestSignal).toBeDefined();
      expect(requestSignal).not.toBe(caller.signal);

      caller.abort();

      await rejection;
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts and normalizes a request that exceeds the 30-second default timeout", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetchImplementation = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      );
      const transport = createHttpTransport({
        endpoint: "/v1/bug-reports",
        fetch: fetchImplementation as typeof fetch,
      });

      const pending = transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The editor failed",
        }),
      );
      const rejection = expect(pending).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(30_000);

      await rejection;
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["headers", "receipt"] as const)(
    "keeps the timeout active while reading %s",
    async (phase) => {
      vi.useFakeTimers();
      try {
        const never = new Promise<never>(() => {});
        const transport = createHttpTransport({
          endpoint: "/v1/bug-reports",
          fetch:
            phase === "receipt"
              ? (vi.fn(async () => ({
                  headers: new Headers({ "content-type": "application/json" }),
                  json: () => never,
                  ok: true,
                  status: 201,
                })) as unknown as typeof fetch)
              : (vi.fn() as unknown as typeof fetch),
          ...(phase === "headers" ? { headers: () => never } : {}),
          timeoutMs: 25,
        });

        const pending = transport(
          createBugReport({
            anonymous: true,
            includeTechnicalContext: false,
            message: "The editor failed",
          }),
        );
        const rejection = expect(pending).rejects.toMatchObject({
          code: "NETWORK_ERROR",
          retryable: true,
        });
        await vi.advanceTimersByTimeAsync(25);

        await rejection;
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("normalizes network, status, and invalid response failures", async () => {
    const report = createBugReport({
      anonymous: true,
      includeTechnicalContext: false,
      message: "The editor failed",
    });
    const network = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    });
    await expect(network(report)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });

    const forbidden = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(
        async () =>
          new Response("forbidden", { status: 403, statusText: "Forbidden" }),
      ) as typeof fetch,
    });
    await expect(forbidden(report)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden",
      retryable: false,
    });

    const invalidReceipt = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(
        async () => new Response("not-json", { status: 201 }),
      ) as typeof fetch,
    });
    await expect(invalidReceipt(report)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
      status: 201,
    });
  });

  it.each([
    ["a JSON string", "ok"],
    ["an array", ["ok"]],
    ["a number", 42],
    ["null", null],
    ["an empty object", {}],
    ["a blank id", { id: " ", acceptedAt: "2026-08-13T00:00:01.000Z" }],
    ["a numeric id", { id: 7, acceptedAt: "2026-08-13T00:00:01.000Z" }],
    ["a missing timestamp", { id: "report-1" }],
    ["a date without time", { id: "report-1", acceptedAt: "2026-08-13" }],
    ["an invalid timestamp", { id: "report-1", acceptedAt: "yesterday" }],
    [
      "an oversized provider",
      {
        id: "report-1",
        acceptedAt: "2026-08-13T00:00:01.000Z",
        provider: "x".repeat(101),
      },
    ],
    [
      "non-object metadata",
      {
        id: "report-1",
        acceptedAt: "2026-08-13T00:00:01.000Z",
        metadata: [],
      },
    ],
  ])("rejects %s as an invalid success receipt", async (_description, body) => {
    const transport = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            headers: { "content-type": "application/json" },
            status: 201,
          }),
      ) as typeof fetch,
    });

    await expect(
      transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The editor failed",
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
      status: 201,
    });
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [413, "PAYLOAD_TOO_LARGE"],
    [422, "BAD_REQUEST"],
    [503, "SERVER_ERROR"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const transport = createHttpTransport({
      endpoint: "/v1/bug-reports",
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ title: "Request failed", status }), {
            headers: { "content-type": "application/problem+json" },
            status,
          }),
      ) as typeof fetch,
    });

    await expect(
      transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The editor failed",
        }),
      ),
    ).rejects.toMatchObject({ code, status });
  });
});

describe("Sentry transport", () => {
  it("maps the universal report without adding an SDK dependency", async () => {
    const sendFeedback = vi.fn(
      async (_params: SentryFeedbackParams, _hint?: SentryFeedbackHint) =>
        "sentry-event-1",
    );
    const transport = createSentryTransport({
      includeReplay: true,
      sendFeedback,
      tags: { product: "editor" },
    });
    const report = createBugReport({
      anonymous: false,
      attachment: createScreenshotAttachment(
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
        { filename: "screen.png", source: "capture" },
      ),
      contact: { email: "ada@example.com", name: "Ada Lovelace" },
      context: {
        appVersion: "2.4.0",
        extra: { routeKind: "editor" },
        locale: "en-GB",
        tags: { surface: "toolbar" },
        userAgent: "Test Browser",
        url: "https://example.test/editor",
        viewport: { devicePixelRatio: 2, height: 844, width: 390 },
      },
      details: {
        actual: "Nothing happened",
        expected: "It should save",
        severity: "blocking",
        steps: "Press Save",
      },
      includeTechnicalContext: true,
      message: "Saving failed.",
    }, {
      id: "report-sentry-1",
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });

    await expect(transport(report)).resolves.toEqual({
      id: "sentry-event-1",
      provider: "sentry",
    });
    expect(sendFeedback).toHaveBeenCalledOnce();
    expect(sendFeedback.mock.calls[0]?.[0]).toMatchObject({
      email: "ada@example.com",
      name: "Ada Lovelace",
      tags: {
        bug_report_id: "report-sentry-1",
        product: "editor",
        severity: "blocking",
        surface: "toolbar",
      },
      url: "https://example.test/editor",
    });
    expect(sendFeedback.mock.calls[0]?.[0]).not.toHaveProperty(
      "associatedEventId",
    );
    expect(sendFeedback.mock.calls[0]?.[1]).toMatchObject({
      captureContext: {
        extra: {
          appVersion: "2.4.0",
          locale: "en-GB",
          reportId: "report-sentry-1",
          routeKind: "editor",
          submittedAt: "2026-08-13T00:00:00.000Z",
          userAgent: "Test Browser",
          viewport: { devicePixelRatio: 2, height: 844, width: 390 },
        },
      },
    });
    expect(sendFeedback.mock.calls[0]?.[0].message).toContain("Press Save");
    expect(sendFeedback.mock.calls[0]?.[1]).toMatchObject({
      attachments: [
        {
          contentType: "image/png",
          filename: "screen.png",
        },
      ],
      includeReplay: true,
    });
  });

  it("never sends contact fields for an anonymous report", async () => {
    const sendFeedback = vi.fn(
      async (_params: SentryFeedbackParams, _hint?: SentryFeedbackHint) =>
        "event-2",
    );
    const transport = createSentryTransport({ sendFeedback });

    await transport(
      createBugReport({
        anonymous: true,
        contact: { email: "hidden@example.com", name: "Hidden" },
        includeTechnicalContext: false,
        message: "The button failed.",
      }),
    );

    expect(sendFeedback.mock.calls[0]?.[0]).not.toHaveProperty("email");
    expect(sendFeedback.mock.calls[0]?.[0]).not.toHaveProperty("name");
  });

  it("supports object event IDs, custom sources, and capture context", async () => {
    const sendFeedback = vi.fn(
      async (_params: SentryFeedbackParams, _hint?: SentryFeedbackHint) => ({
        eventId: "event-object-1",
      }),
    );
    const transport = createSentryTransport({
      sendFeedback,
      source: "custom-widget",
    });

    await expect(
      transport(
        createBugReport(
          {
            anonymous: true,
            includeTechnicalContext: false,
            message: "The button failed",
          },
          { id: "report-object-1" },
        ),
      ),
    ).resolves.toEqual({ id: "event-object-1", provider: "sentry" });
    expect(sendFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ source: "custom-widget" }),
      expect.objectContaining({
        captureContext: {
          extra: expect.objectContaining({ reportId: "report-object-1" }),
        },
      }),
    );
  });

  it("validates adapter construction and tolerates providers without IDs", async () => {
    expect(() =>
      createSentryTransport({ sendFeedback: undefined as never }),
    ).toThrow(TypeError);
    const transport = createSentryTransport({
      sendFeedback: vi.fn(async () => ({ accepted: true })),
    });
    await expect(
      transport(
        createBugReport({
          anonymous: true,
          includeTechnicalContext: false,
          message: "The button failed",
        }),
      ),
    ).resolves.toEqual({ provider: "sentry" });
  });
});
