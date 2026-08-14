import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BugReportForm, createScreenshotAttachment } from "../src";
import { ScreenshotCaptureError } from "../src/capture/types";
import type { BugReport } from "../src";

describe("BugReportForm", () => {
  it("prefills contact fields and hides only those fields in anonymous mode", async () => {
    const user = userEvent.setup();
    render(
      <BugReportForm
        onSubmit={vi.fn()}
        reporter={{ email: "ada@example.com", name: "Ada Lovelace" }}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");

    const anonymous = screen.getByRole("switch", {
      name: "Report anonymously",
    });
    expect(anonymous).toHaveAttribute("aria-checked", "false");
    await user.click(anonymous);

    expect(anonymous).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByLabelText("What happened?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add details/i }),
    ).toBeInTheDocument();

    await user.click(anonymous);
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("accepts session data that arrives later without overwriting user edits", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BugReportForm onSubmit={vi.fn()} reporter={{ name: "", email: "" }} />,
    );

    rerender(
      <BugReportForm
        onSubmit={vi.fn()}
        reporter={{ name: "Ada Lovelace", email: "ada@example.com" }}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Grace Hopper");
    rerender(
      <BugReportForm
        onSubmit={vi.fn()}
        reporter={{ name: "Ada Byron", email: "ada@new.example" }}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Grace Hopper");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@new.example");
  });

  it("submits the provider-neutral report with expanded details", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_report: BugReport) => ({ id: "receipt-1" }));
    render(
      <BugReportForm
        context={{ appVersion: "1.2.3", url: "https://example.test/tree" }}
        defaultIncludeTechnicalContext
        onSubmit={onSubmit}
        reporter={{ email: "ada@example.com", name: "Ada" }}
      />,
    );

    await user.type(
      screen.getByLabelText("What happened?"),
      "The tree stopped moving.",
    );
    await user.click(screen.getByRole("button", { name: /add details/i }));
    await user.click(
      screen.getByRole("combobox", {
        name: /How much is it in your way\? Choose a severity/,
      }),
    );
    await user.click(screen.getByRole("option", { name: "It's blocking me" }));
    await user.type(screen.getByLabelText("Steps to reproduce"), "Open a tree");
    await user.type(screen.getByLabelText("Expected"), "Tree moves");
    await user.type(screen.getByLabelText("Got instead"), "Tree froze");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      anonymous: false,
      contact: { email: "ada@example.com", name: "Ada" },
      context: { appVersion: "1.2.3", url: "https://example.test/tree" },
      details: {
        actual: "Tree froze",
        expected: "Tree moves",
        severity: "blocking",
        steps: "Open a tree",
      },
      message: "The tree stopped moving.",
    });
    expect(screen.getByText("Got it — thank you.")).toBeInTheDocument();
  });

  it("keeps the report editable after a transport failure", async () => {
    const user = userEvent.setup();
    render(
      <BugReportForm
        defaultAnonymous
        onSubmit={vi.fn(async () => {
          throw new Error("network unavailable");
        })}
      />,
    );

    const message = screen.getByLabelText("What happened?");
    await user.type(message, "The button stopped working.");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByRole("alert", {
        name: "We couldn't send your report. Check your connection and try again.",
      }),
    ).toBeInTheDocument();
    expect(message).toHaveValue("The button stopped working.");
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });

  it("uploads a supported image through the real file input", async () => {
    const user = userEvent.setup();
    render(<BugReportForm defaultExpanded onSubmit={vi.fn()} />);
    const file = new File(["image"], "mobile-screenshot.png", {
      type: "image/png",
    });

    const fileInput = screen.getByLabelText("Choose screenshot");
    expect(fileInput).toHaveAttribute("tabindex", "-1");
    await user.upload(fileInput, file);

    expect(screen.getByText("mobile-screenshot.png")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove screenshot" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Fewer details" }));
    expect(screen.getByText("mobile-screenshot.png")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove screenshot" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Remove screenshot" }));
    expect(screen.queryByText("mobile-screenshot.png")).toBeNull();
  });

  it("has no automatic axe violations in its default and expanded states", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BugReportForm
        onSubmit={vi.fn()}
        reporter={{ email: "ada@example.com", name: "Ada" }}
      />,
    );

    let results = await axe.run(container);
    expect(results.violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: /add details/i }));
    results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("shows and clears validation errors without calling the transport", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BugReportForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(
      screen.getByText("Tell us a little about what you saw first."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "That address looks off — or turn on anonymous and skip it.",
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("What happened?"), "A useful report");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    expect(
      screen.queryByText("Tell us a little about what you saw first."),
    ).toBeNull();
    expect(screen.queryByText(/That address looks off/)).toBeNull();
  });

  it("validates fields before resolving opted-in host context", async () => {
    const user = userEvent.setup();
    const context = vi.fn(async () => {
      throw new Error("Context is unavailable");
    });
    const onError = vi.fn();
    const onSubmit = vi.fn();
    render(
      <BugReportForm
        context={context}
        defaultExpanded
        defaultIncludeTechnicalContext
        onError={onError}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      screen.getByText("Tell us a little about what you saw first."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "That address looks off — or turn on anonymous and skip it.",
      ),
    ).toBeVisible();
    expect(context).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "We couldn't send your report. Check your connection and try again.",
      ),
    ).toBeNull();
  });

  it("keeps technical context off by default and does not resolve host context", async () => {
    const user = userEvent.setup();
    const context = vi.fn(async () => ({ appVersion: "2.0.0" }));
    const onSubmit = vi.fn(async (_report: BugReport) => undefined);
    render(
      <BugReportForm
        context={context}
        defaultAnonymous
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("What happened?"), "The page failed");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(context).not.toHaveBeenCalled();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      includeTechnicalContext: false,
    });
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("context");
  });

  it("uses semantic color overrides, custom copy, and anonymous callbacks", async () => {
    const user = userEvent.setup();
    const onAnonymousChange = vi.fn();
    const { container } = render(
      <BugReportForm
        accentColor="#6557d2"
        className="host-class"
        colors={{ surface: "#fffdf8" }}
        copy={{ title: "Tell us what broke" }}
        fontFamily='"Host Sans", sans-serif'
        monoFontFamily='"Host Mono", monospace'
        onAnonymousChange={onAnonymousChange}
        onSubmit={vi.fn()}
        primaryColor="#171421"
        style={{ marginTop: 4 }}
        theme="dark"
      />,
    );
    const root = container.querySelector<HTMLElement>(
      "[data-bug-report='form']",
    )!;

    expect(root).toHaveClass("host-class");
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(root.style.getPropertyValue("--nbr-accent")).toBe("#6557d2");
    expect(root.style.getPropertyValue("--nbr-primary")).toBe("#171421");
    expect(root.style.getPropertyValue("--nbr-surface")).toBe("#fffdf8");
    expect(root.style.getPropertyValue("--nbr-font-family")).toBe(
      '"Host Sans", sans-serif',
    );
    expect(root.style.getPropertyValue("--nbr-mono-font-family")).toBe(
      '"Host Mono", monospace',
    );
    expect(screen.getByText("Tell us what broke")).toBeVisible();

    await user.click(
      screen.getByRole("switch", { name: "Report anonymously" }),
    );
    expect(onAnonymousChange).toHaveBeenCalledWith(true);
  });

  it("collects async host and browser context only while opted in", async () => {
    const user = userEvent.setup();
    const context = vi.fn(async () => ({ appVersion: "2.0.0" }));
    const onSubmit = vi.fn(async (_report: BugReport) => undefined);
    render(
      <BugReportForm
        context={context}
        defaultAnonymous
        defaultExpanded
        defaultIncludeTechnicalContext
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("What happened?"), "The page failed");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(context).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      context: {
        appVersion: "2.0.0",
        locale: expect.any(String),
        url: expect.any(String),
        userAgent: expect.any(String),
        viewport: expect.objectContaining({ width: expect.any(Number) }),
      },
    });

    await user.click(
      screen.getByRole("button", { name: "Report something else" }),
    );
    await user.type(
      screen.getByLabelText("What happened?"),
      "The page failed again",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0]).not.toHaveProperty("context");
    expect(context).toHaveBeenCalledOnce();
  });

  it("leaves severity unset until the reporter selects a value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_report: BugReport) => undefined);
    render(
      <BugReportForm
        copy={{ severityPlaceholder: "Select urgency" }}
        defaultAnonymous
        defaultExpanded
        onSubmit={onSubmit}
      />,
    );

    const combobox = screen.getByRole("combobox", {
      name: "How much is it in your way? Select urgency",
    });
    expect(combobox).toHaveTextContent("Select urgency");
    await user.type(screen.getByLabelText("What happened?"), "The page failed");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("details");
  });

  it("handles supported, failed, and oversized capture providers", async () => {
    const user = userEvent.setup();
    const successfulAttachment = createScreenshotAttachment(
      new Blob(["image"], { type: "image/png" }),
      { filename: "captured.png", source: "capture" },
    );
    const capture = {
      isSupported: vi.fn(() => true),
      capture: vi.fn(async () => successfulAttachment),
    };
    const { rerender } = render(
      <BugReportForm capture={capture} defaultExpanded onSubmit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));
    expect(await screen.findByText("captured.png")).toBeVisible();

    const failedCapture = {
      isSupported: () => true,
      capture: vi.fn(async () => {
        throw new Error("Canvas could not be read");
      }),
    };
    rerender(
      <BugReportForm
        capture={failedCapture}
        defaultExpanded
        onSubmit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Capture this page" }));
    expect(await screen.findByText("Canvas could not be read")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Fewer details" }));
    expect(screen.getByText("Canvas could not be read")).toBeVisible();
  });

  it("hides itself while a capture provider that needs a clean frame runs", async () => {
    const user = userEvent.setup();
    const attachment = createScreenshotAttachment(
      new Blob(["image"], { type: "image/png" }),
      { filename: "screen.png", source: "capture" },
    );
    let stateDuringCapture: string | null = null;
    const capture = {
      isSupported: () => true,
      requiresHiddenUi: true,
      capture: vi.fn(async () => {
        stateDuringCapture =
          document
            .querySelector('[data-bug-report="form"]')
            ?.getAttribute("data-capturing") ?? null;
        return attachment;
      }),
    };
    render(
      <BugReportForm capture={capture} defaultExpanded onSubmit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("screen.png")).toBeVisible();
    expect(stateDuringCapture).toBe("true");
    expect(
      document.querySelector('[data-bug-report="form"]'),
    ).not.toHaveAttribute("data-capturing");
  });

  it("stays visible for a capture provider that excludes the form itself", async () => {
    const user = userEvent.setup();
    const attachment = createScreenshotAttachment(
      new Blob(["image"], { type: "image/png" }),
      { filename: "dom.png", source: "capture" },
    );
    let stateDuringCapture: string | null = null;
    const capture = {
      isSupported: () => true,
      capture: vi.fn(async () => {
        stateDuringCapture =
          document
            .querySelector('[data-bug-report="form"]')
            ?.getAttribute("data-capturing") ?? null;
        return attachment;
      }),
    };
    render(
      <BugReportForm capture={capture} defaultExpanded onSubmit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("dom.png")).toBeVisible();
    expect(stateDuringCapture).toBeNull();
  });

  it("captures even when the browser never delivers an animation frame", async () => {
    const user = userEvent.setup();
    // A backgrounded tab can withhold animation frames indefinitely. The wait
    // for a clean frame has to give up rather than strand the capture action.
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
    const attachment = createScreenshotAttachment(
      new Blob(["image"], { type: "image/png" }),
      { filename: "unpainted.png", source: "capture" },
    );
    const capture = {
      isSupported: () => true,
      requiresHiddenUi: true,
      capture: vi.fn(async () => attachment),
    };
    render(
      <BugReportForm capture={capture} defaultExpanded onSubmit={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("unpainted.png")).toBeVisible();
  });

  it("tells the host to hide its own chrome around a clean-frame capture", async () => {
    const user = userEvent.setup();
    const onCapturingChange = vi.fn();
    const capture = {
      isSupported: () => true,
      requiresHiddenUi: true,
      capture: vi.fn(async () => {
        throw new Error("Canvas could not be read");
      }),
    };
    render(
      <BugReportForm
        capture={capture}
        defaultExpanded
        onCapturingChange={onCapturingChange}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("Canvas could not be read")).toBeVisible();
    expect(onCapturingChange.mock.calls).toEqual([[true], [false]]);
  });

  it.each(["AbortError", "NotAllowedError"] as const)(
    "silently ignores a %s screenshot cancellation",
    async (name) => {
      const user = userEvent.setup();
      const cause = new Error("capture was cancelled");
      Object.defineProperty(cause, "cause", {
        configurable: true,
        value: new DOMException("cancelled", name),
      });
      const capture = {
        isSupported: () => true,
        capture: vi.fn(async () => {
          throw new ScreenshotCaptureError("Capture cancelled", cause);
        }),
      };
      render(
        <BugReportForm capture={capture} defaultExpanded onSubmit={vi.fn()} />,
      );

      await user.click(screen.getByRole("button", { name: "Capture this page" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Capture this page" })).toBeEnabled(),
      );
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("rejects invalid uploads and can remove all screenshot actions", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { rerender } = render(
      <BugReportForm
        defaultExpanded
        maxAttachmentBytes={2}
        onSubmit={vi.fn()}
      />,
    );
    await user.upload(
      screen.getByLabelText("Choose screenshot"),
      new File(["svg"], "unsafe.svg", { type: "image/svg+xml" }),
    );
    expect(
      await screen.findByText("Use a PNG, JPEG, or WebP screenshot."),
    ).toBeVisible();

    await user.upload(
      screen.getByLabelText("Choose screenshot"),
      new File(["large"], "large.png", { type: "image/png" }),
    );
    expect(
      await screen.findByText(/screenshot must be 2 B or smaller/i),
    ).toBeVisible();

    rerender(
      <BugReportForm
        allowScreenshotUpload={false}
        capture={{ isSupported: () => false, capture: vi.fn() }}
        defaultExpanded
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Choose screenshot")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Capture this page" }),
    ).toBeNull();
  });

  it("calls success and error callbacks and lets the reporter start over", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn(() => {
      throw new Error("host callback failed");
    });
    const onError = vi.fn();
    const { container } = render(
      <BugReportForm
        defaultAnonymous
        onError={onError}
        onSubmit={vi.fn(async () => ({ id: "report-1" }))}
        onSuccess={onSuccess}
      />,
    );
    const liveRegion = container.querySelector<HTMLElement>(
      '[aria-live="polite"]',
    );
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText("What happened?"), "The page failed");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    const successHeading = await screen.findByRole("heading", {
      name: "Got it — thank you.",
    });
    expect(successHeading).toBeVisible();
    expect(successHeading).toHaveFocus();
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent(
      "Got it — thank you. Your report was sent without your name or email.",
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.any(Error)),
    );

    await user.click(
      screen.getByRole("button", { name: "Report something else" }),
    );
    expect(screen.getByLabelText("What happened?")).toHaveValue("");
  });

  it("supports full keyboard navigation in the custom severity selector", async () => {
    const user = userEvent.setup();
    render(<BugReportForm defaultExpanded onSubmit={vi.fn()} />);
    const combobox = screen.getByRole("combobox", {
      name: /How much is it in your way\? Choose a severity/,
    });

    combobox.focus();
    await user.keyboard("{ArrowUp}");
    expect(
      screen.getByRole("option", { name: "Something looks lost or wrong" }),
    ).toHaveFocus();
    await user.keyboard("{Home}{ArrowDown}{End}{Enter}");
    expect(combobox).toHaveTextContent("Something looks lost or wrong");

    await user.keyboard("{Enter}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("option", { name: "Something looks lost or wrong" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Steps to reproduce")).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Fewer details" }));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
