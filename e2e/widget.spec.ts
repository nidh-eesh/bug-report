import { expect, test } from "@playwright/test";

test("keeps the trigger visible and opens an aligned dialog", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Report a bug" });
  await expect(trigger).toBeVisible();
  const hostFontFamily = await page.locator("body").evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  await expect(trigger).toHaveCSS("font-family", hostFontFamily);

  const viewport = page.viewportSize()!;
  const triggerBox = (await trigger.boundingBox())!;
  expect(triggerBox.x).toBeGreaterThanOrEqual(0);
  expect(triggerBox.y).toBeGreaterThanOrEqual(0);
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(viewport.width);
  expect(triggerBox.y + triggerBox.height).toBeLessThanOrEqual(viewport.height);

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Report a bug" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("font-family", hostFontFamily);
  const dialogBox = (await dialog.boundingBox())!;
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.width).toBeLessThanOrEqual(viewport.width);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(
    viewport.height + 1,
  );

  if (testInfo.project.name === "mobile-chromium") {
    expect(dialogBox.x).toBeLessThanOrEqual(1);
    expect(Math.abs(dialogBox.width - viewport.width)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(dialogBox.y + dialogBox.height - viewport.height),
    ).toBeLessThanOrEqual(1);
  }

  await expect(page).toHaveScreenshot(
    `widget-open-${testInfo.project.name}.png`,
    {
      fullPage: false,
      timeout: 15_000,
    },
  );
});

test("leaves the frame while a clean-frame capture runs and keeps the draft", async ({
  page,
}) => {
  await page.goto("/?capture=hidden-ui");
  const trigger = page.getByRole("button", { name: "Report a bug" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const message = page.getByLabel("What happened?");
  await message.fill("The export button does nothing");
  await page.getByRole("button", { name: "Capture this page" }).click();

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeHidden();

  await expect(page.getByText("captured-page.png")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeVisible();
  await expect(message).toHaveValue("The export button does nothing");
});

test("preserves contact values while anonymous and keeps every other field", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();

  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
  const anonymous = page.getByRole("switch", { name: "Report anonymously" });
  await anonymous.click();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByLabel("What happened?")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "How much is it in your way?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose screenshot")).toHaveAttribute(
    "accept",
    "image/png,image/jpeg,image/webp",
  );
  await expect(page.getByLabel("Choose screenshot")).not.toHaveAttribute(
    "capture",
  );

  await anonymous.click();
  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
});

test("keeps the anonymous tooltip visible inside the scrollable form", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();

  const switchControl = page.getByRole("switch", {
    name: "Report anonymously",
  });
  const tooltip = page.getByRole("tooltip", { name: "Report anonymously" });
  const card = page.locator(".nbr-dialog__panel > .nbr-card");

  await switchControl.hover();
  await expect(tooltip).toBeVisible();

  const [tooltipBox, cardBox] = await Promise.all([
    tooltip.boundingBox(),
    card.boundingBox(),
  ]);

  expect(tooltipBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width,
  );

  await page.mouse.move(0, 0);
  await switchControl.focus();
  await expect(tooltip).toBeVisible();
});

test("keeps a typed draft when a selection drag ends on the backdrop", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();

  const message = page.getByLabel("What happened?");
  await message.fill("A".repeat(800));
  const messageBox = await message.boundingBox();
  expect(messageBox).not.toBeNull();

  await page.mouse.move(
    messageBox!.x + messageBox!.width / 2,
    messageBox!.y + messageBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(2, 2, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByRole("dialog", { name: "Report a bug" })).toBeVisible();
  await expect(message).toHaveValue("A".repeat(800));

  await page.mouse.click(2, 2);
  await expect(page.getByRole("dialog", { name: "Report a bug" })).toBeHidden();
});

test("tabs out of the open severity menu without losing focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();

  const severity = page.getByRole("combobox", {
    name: /How much is it in your way\?/,
  });
  await severity.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Tab");

  await expect(page.getByLabel("Steps to reproduce")).toBeFocused();
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("supports upload, capture, failure-safe editing, and success", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByLabel("Choose screenshot").setInputFiles({
    name: "phone-screenshot.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
  });
  await expect(page.getByText("phone-screenshot.png")).toBeVisible();
  await page.getByRole("button", { name: "Remove screenshot" }).click();
  await page.getByRole("button", { name: "Capture this page" }).click();
  await expect(page.getByText("captured-page.png")).toBeVisible();

  await page.getByLabel("What happened?").fill("The application did not save.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(
    page.getByRole("heading", { name: "Got it — thank you." }),
  ).toBeFocused();
});

test("keeps exact switch and details motion and honors reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Report a bug" }).click();

  const switchControl = page.getByRole("switch", {
    name: "Report anonymously",
  });
  const knob = switchControl.locator(".nbr-switch__knob");
  await expect(switchControl).toHaveCSS("transition-duration", "0.22s");
  await expect(knob).toHaveCSS("transition-duration", "0.24s, 0.22s");
  await expect(knob).toHaveCSS(
    "transition-timing-function",
    "cubic-bezier(0.32, 1.2, 0.5, 1), ease",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedDuration = await knob.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(Number.parseFloat(reducedDuration)).toBeLessThanOrEqual(0.00001);
});

test("the real optional DOM adapter can produce a PNG", async ({ page }) => {
  test.slow();
  await page.goto("/?capture=real");
  await page.getByRole("button", { name: "Report a bug" }).click();
  await page.getByRole("button", { name: "Capture this page" }).click();
  await expect(page.getByText(/bug-report-.*\.png/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("img", { name: "Screenshot preview" }),
  ).toBeVisible();
});
