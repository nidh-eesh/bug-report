import { describe, expect, it } from "vitest";

import {
  BUG_REPORT_SCHEMA_VERSION,
  BugReportValidationError,
  createBugReport,
  createScreenshotAttachment,
  formatBytes,
  redactBugReport,
  serializeBugReport,
  validateBugReportInput,
} from "../src/core";

describe("bug-report core", () => {
  it("formats byte limits downward so messages never overpromise", () => {
    expect(formatBytes(1_500)).toBe("1 KB");
    expect(formatBytes(2_500_000)).toBe("2.3 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("creates a versioned report and trims human-entered values", () => {
    const report = createBugReport(
      {
        anonymous: false,
        contact: { email: " ada@example.com ", name: " Ada Lovelace " },
        details: {
          actual: " It froze ",
          expected: " It should save ",
          severity: "blocking",
          steps: " Click save ",
        },
        includeTechnicalContext: true,
        message: " The editor stopped responding. ",
        context: {
          locale: "en-GB",
          url: "https://example.test/editor",
        },
      },
      {
        id: "report-123",
        now: () => new Date("2026-08-13T00:00:00.000Z"),
      },
    );

    expect(report).toMatchObject({
      anonymous: false,
      contact: { email: "ada@example.com", name: "Ada Lovelace" },
      id: "report-123",
      message: "The editor stopped responding.",
      schemaVersion: BUG_REPORT_SCHEMA_VERSION,
      submittedAt: "2026-08-13T00:00:00.000Z",
    });
    expect(report.details).toEqual({
      actual: "It froze",
      expected: "It should save",
      severity: "blocking",
      steps: "Click save",
    });
  });

  it("omits only contact details for anonymous reports and preserves context", () => {
    const report = createBugReport({
      anonymous: true,
      contact: { email: "person@example.com", name: "Person" },
      context: {
        extra: { routeKind: "editor" },
        url: "https://example.test/private-view",
        userAgent: "Test Browser",
      },
      includeTechnicalContext: true,
      message: "The button did nothing.",
    });

    expect(report.contact).toBeUndefined();
    expect(report.context).toEqual({
      extra: { routeKind: "editor" },
      url: "https://example.test/private-view",
      userAgent: "Test Browser",
    });
  });

  it("provides explicit redaction without applying it automatically", () => {
    const report = createBugReport({
      anonymous: false,
      contact: { email: "person@example.com", name: "Person" },
      context: {
        extra: { accountId: "account-1" },
        url: "https://example.test/account-1",
        userAgent: "Test Browser",
      },
      includeTechnicalContext: true,
      message: "The page failed.",
    });

    const redacted = redactBugReport(report);

    expect(report.contact?.email).toBe("person@example.com");
    expect(report.context?.url).toBe("https://example.test/account-1");
    expect(redacted.contact).toBeUndefined();
    expect(redacted.context).toBeUndefined();
  });

  it("validates the message and a non-anonymous email", () => {
    expect(() =>
      validateBugReportInput({
        anonymous: false,
        contact: { email: "not-an-email" },
        includeTechnicalContext: false,
        message: "x",
      }),
    ).toThrow(BugReportValidationError);

    expect(() =>
      validateBugReportInput({
        anonymous: true,
        includeTechnicalContext: false,
        message: "A useful description",
      }),
    ).not.toThrow();
  });

  it("accepts supported image attachments and rejects unsafe file types", () => {
    const png = new Blob(["png"], { type: "image/png" });
    const attachment = createScreenshotAttachment(png, {
      filename: "screen.png",
      source: "upload",
    });

    expect(attachment).toMatchObject({
      contentType: "image/png",
      filename: "screen.png",
      size: 3,
      source: "upload",
    });

    expect(() =>
      createScreenshotAttachment(new Blob(["svg"], { type: "image/svg+xml" }), {
        filename: "unsafe.svg",
        source: "upload",
      }),
    ).toThrow(BugReportValidationError);
  });

  it("serializes attachment metadata without embedding binary data", () => {
    const attachment = createScreenshotAttachment(
      new Blob(["image"], { type: "image/png" }),
      { filename: "screen.png", source: "capture" },
    );
    const report = createBugReport({
      anonymous: true,
      attachment,
      includeTechnicalContext: false,
      message: "The preview is blank.",
    });

    const serialized = serializeBugReport(report);

    expect(serialized.attachment).toEqual({
      contentType: "image/png",
      filename: "screen.png",
      size: 5,
      source: "capture",
    });
    expect(serialized.attachment).not.toHaveProperty("blob");
  });

  it("enforces production input and attachment limits", () => {
    expect(() =>
      validateBugReportInput({
        anonymous: false,
        contact: {
          email: `${"a".repeat(310)}@example.com`,
          name: "n".repeat(201),
        },
        details: {
          actual: "a".repeat(5_001),
          expected: "e".repeat(5_001),
          severity: "unknown" as never,
          steps: "s".repeat(10_001),
        },
        includeTechnicalContext: false,
        message: "m".repeat(10_001),
      }),
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ field: "message", code: "too_large" }),
          expect.objectContaining({
            field: "contact.email",
            code: "too_large",
          }),
          expect.objectContaining({ field: "contact.name", code: "too_large" }),
          expect.objectContaining({
            field: "details.severity",
            code: "invalid",
          }),
          expect.objectContaining({
            field: "details.steps",
            code: "too_large",
          }),
        ]),
      }),
    );

    expect(() =>
      createScreenshotAttachment(new Blob([], { type: "image/png" }), {
        filename: "",
        source: "upload",
      }),
    ).toThrow(BugReportValidationError);
    expect(() =>
      createScreenshotAttachment(new Blob(["1234"], { type: "image/png" }), {
        filename: `${"a".repeat(256)}.png`,
        maxBytes: 3,
        source: "upload",
      }),
    ).toThrow(BugReportValidationError);
  });

  it("normalizes safe filenames and keeps optional image dimensions", () => {
    const attachment = createScreenshotAttachment(
      new Blob(["png"], { type: "IMAGE/PNG" }),
      {
        filename: " C:\\fakepath\\screen\u0000.png ",
        height: 844,
        source: "capture",
        width: 390,
      },
    );

    expect(attachment).toMatchObject({
      contentType: "image/png",
      filename: "screen.png",
      height: 844,
      width: 390,
    });
  });

  it("drops blank optional values and context that was not opted in", () => {
    const report = createBugReport({
      anonymous: false,
      contact: { email: " person@example.com ", name: "   " },
      context: { url: "https://example.test/secret" },
      details: { actual: " ", expected: "", steps: " " },
      includeTechnicalContext: false,
      message: "A valid report",
    });

    expect(report.contact).toEqual({ email: "person@example.com" });
    expect(report.details).toBeUndefined();
    expect(report.context).toBeUndefined();
    expect(report.id).toBeTruthy();
  });
});
