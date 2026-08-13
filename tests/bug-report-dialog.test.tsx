import { render, screen } from "@testing-library/react";
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

    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
});

describe("BugReportWidget", () => {
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
        colors={{ surface: "#fffdf8", text: "#211f1a" }}
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
