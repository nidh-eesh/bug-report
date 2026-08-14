import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BugReportDialog, BugReportWidget } from "../src";

describe("BugReportDialog", () => {
  it("uses native modal semantics and closes from its accessible control", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <BugReportDialog onOpenChange={onOpenChange} onSubmit={vi.fn()} open />,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Close bug report" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("handles native cancellation, backdrop clicks, controlled closing, and theme tokens", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BugReportDialog
        accentColor="#6557d2"
        colors={{ surface: "#fffdf8" }}
        copy={{ title: "Send a problem" }}
        fontFamily='"Host Sans", sans-serif'
        monoFontFamily='"Host Mono", monospace'
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        open
        primaryColor="#171421"
        theme="dark"
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Send a problem" });
    expect(dialog).toHaveAttribute("data-theme", "dark");
    expect(dialog.style.getPropertyValue("--nbr-accent")).toBe("#6557d2");
    expect(dialog.style.getPropertyValue("--nbr-font-family")).toBe(
      '"Host Sans", sans-serif',
    );
    expect(dialog.style.getPropertyValue("--nbr-mono-font-family")).toBe(
      '"Host Mono", monospace',
    );

    const cancel = new Event("cancel", { bubbles: false, cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.pointerDown(dialog);
    fireEvent.pointerUp(dialog);
    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledTimes(2);

    rerender(
      <BugReportDialog
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        open={false}
      />,
    );
    expect(dialog).not.toHaveAttribute("open");
  });

  it("only closes for a complete backdrop press and release", () => {
    const onOpenChange = vi.fn();
    render(
      <BugReportDialog onOpenChange={onOpenChange} onSubmit={vi.fn()} open />,
    );

    const dialog = screen.getByRole("dialog");
    const panel = dialog.querySelector(".nbr-dialog__panel");
    if (!panel) throw new Error("Dialog panel was not rendered");
    const message = screen.getByLabelText("What happened?");
    fireEvent.change(message, { target: { value: "A draft worth keeping" } });

    fireEvent.pointerDown(panel);
    fireEvent.pointerUp(dialog);
    fireEvent.click(dialog);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(message).toHaveValue("A draft worth keeping");

    fireEvent.pointerDown(dialog);
    fireEvent.pointerUp(panel);
    fireEvent.click(dialog);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(message).toHaveValue("A draft worth keeping");

    fireEvent.pointerDown(dialog);
    fireEvent.pointerUp(dialog);
    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides the dialog chrome while a clean-frame capture runs", async () => {
    const user = userEvent.setup();
    let dialogStateDuringCapture: string | null = null;
    const capture = {
      isSupported: () => true,
      requiresHiddenUi: true,
      capture: vi.fn(async () => {
        dialogStateDuringCapture = screen
          .getByRole("dialog")
          .getAttribute("data-capturing");
        throw new Error("Canvas could not be read");
      }),
    };
    render(
      <BugReportDialog
        capture={capture}
        defaultExpanded
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("Canvas could not be read")).toBeVisible();
    expect(dialogStateDuringCapture).toBe("true");
    expect(screen.getByRole("dialog")).not.toHaveAttribute("data-capturing");
  });
});

describe("BugReportWidget", () => {
  it("hides its fixed trigger while a clean-frame capture runs", async () => {
    const user = userEvent.setup();
    let triggerStateDuringCapture: string | null = null;
    const capture = {
      isSupported: () => true,
      requiresHiddenUi: true,
      capture: vi.fn(async () => {
        triggerStateDuringCapture = screen
          .getByRole("button", { name: "Report a bug" })
          .getAttribute("data-capturing");
        throw new Error("Canvas could not be read");
      }),
    };
    render(<BugReportWidget capture={capture} defaultExpanded defaultOpen onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Capture this page" }));

    expect(await screen.findByText("Canvas could not be read")).toBeVisible();
    expect(triggerStateDuringCapture).toBe("true");
  });

  it("ships an always-available trigger and opens the dialog", async () => {
    const user = userEvent.setup();
    render(<BugReportWidget onSubmit={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Report a bug" });
    expect(trigger).toHaveAttribute("data-bug-report-exclude");
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("supports host positioning, styling, controlled notifications, and default open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <BugReportWidget
        accentColor="#6557d2"
        colors={{
          accent: "#8277aa",
          border: "#b9b2a8",
          onPrimary: "#fffdf8",
          primary: "#4a4258",
          surface: "#fffdf8",
          text: "#211f1a",
        }}
        defaultOpen
        fontFamily='"Host Sans", sans-serif'
        monoFontFamily='"Host Mono", monospace'
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        position="top-left"
        primaryColor="#171421"
        triggerClassName="host-trigger"
        triggerLabel="Send feedback"
        triggerStyle={{ margin: 2 }}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Send feedback" });
    expect(trigger).toHaveClass("host-trigger");
    expect(trigger).toHaveAttribute("data-position", "top-left");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger.style.getPropertyValue("--nbr-primary")).toBe("#171421");
    expect(trigger.style.getPropertyValue("--nbr-onPrimary")).toBe("#fffdf8");
    expect(trigger.style.getPropertyValue("--nbr-border")).toBe("#b9b2a8");
    expect(trigger.style.getPropertyValue("--nbr-accent")).toBe("#6557d2");
    expect(trigger.style.getPropertyValue("--nbr-surface")).toBe("#fffdf8");
    expect(trigger.style.getPropertyValue("--nbr-text")).toBe("#211f1a");
    expect(trigger.style.getPropertyValue("--nbr-font-family")).toBe(
      '"Host Sans", sans-serif',
    );
    expect(trigger.style.getPropertyValue("--nbr-mono-font-family")).toBe(
      '"Host Mono", monospace',
    );

    await user.click(screen.getByRole("button", { name: "Close bug report" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
});
