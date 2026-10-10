import { expect, test, type Page } from "@playwright/test";
import { signInCode } from "./support";

const run = Date.now().toString(36);
const MAKER = { email: `kavya-${run}@example.in`, name: "Kavya Iyer" };
const CLIENT = { name: "Rahul Mehta", email: "rahul@kilnlabs.dev" };

/** What Wispr Flow would paste into each blank: capitalised, with a full stop, in one burst. */
type Dictation = Record<string, string>;

const BASE: Dictation = {
  client_name: "Rahul Mehta.",
  client_organisation: "Kiln Labs.",
  revisions: "Do.",
  "ip_transfer.exclusions": "Rejected concepts and my working files.",
  "late_fee.days": "Saat din.",
  "late_fee.amount": "Paanch sau rupaye.",
  "kill_fee.percent": "Pachees percent.",
};

const LANDING_PAGE: Dictation = {
  ...BASE,
  work: "A landing page for Kiln Labs, with three sections and the copy.",
  total: "Pachaas hazaar rupaye.",
  plan: "Aadha advance, baaki delivery pe.",
  "milestones.1.deliverables": "Wireframes and the first design.",
  "milestones.1.due": "Do hafte mein.",
  "milestones.2.deliverables": "Final pages in Figma and the copy.",
  "milestones.2.due": "Teen hafte mein.",
};

const LOGO_REFRESH: Dictation = {
  ...BASE,
  work: "A refresh of the Kiln Labs logo.",
  total: "Bees hazaar.",
  plan: "Poora payment delivery pe.",
  "milestones.1.deliverables": "The new logo in SVG and PNG.",
  "milestones.1.due": "Do hafte mein.",
};

const PITCH_DECK: Dictation = {
  ...BASE,
  work: "A twelve slide pitch deck for Kiln Labs.",
  total: "Tees hazaar rupaye.",
  plan: "Aadha advance, baaki delivery pe.",
  "milestones.1.deliverables": "The outline and three sample slides.",
  "milestones.1.due": "Do hafte mein.",
  "milestones.2.deliverables": "All twelve slides.",
  "milestones.2.due": "Teen hafte mein.",
};

async function signIn(page: Page): Promise<void> {
  await page.goto("/login?next=/payouts");
  const asked = new Date(Date.now() - 2_000);
  await page.getByLabel("Email address").fill(MAKER.email);
  await page.getByLabel("Email address").press("Enter");
  const code = await signInCode(MAKER.email, asked);
  await page.getByLabel("Sign-in code").fill(code);
  await page.getByLabel("Sign-in code").press("Enter");
  await page.getByLabel("Your name").fill(MAKER.name);
  await page.getByLabel("Your name").press("Enter");
  await expect(page).toHaveURL(/\/payouts$/);
}

async function setUpPayouts(page: Page): Promise<void> {
  const fields: Array<[string, string]> = [
    ["Legal name (as on PAN)", MAKER.name],
    ["PAN", "ABCPI1234K"],
    ["Bank account number", "50100123454417"],
    ["Confirm account number", "50100123454417"],
    ["IFSC", "HDFC0001234"],
    ["Address", "14 Residency Road"],
    ["City", "Bengaluru"],
    ["State", "Karnataka"],
    ["PIN code", "560025"],
    ["Phone", "9845012345"],
  ];
  for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Phone", { exact: true }).press("Enter");
  await expect(page.getByText(/^Ready\. Money released to you goes to the account ending/)).toBeVisible({ timeout: 60_000 });
}

/** Tab through the deed from the top of the page and dictate into each blank; nothing here uses the mouse. */
async function dictateDeed(page: Page, words: Dictation, strike: string[] = []): Promise<void> {
  await page.goto("/new");
  await expect(page.locator('[data-blank="client_name"]')).toBeVisible();
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.hasAttribute("data-blank"))) break;
  }
  const seen = new Set<string>();
  for (let step = 0; step < 60; step++) {
    const key = await page.evaluate(() => document.activeElement?.getAttribute("data-blank") ?? null);
    if (key === null) break;
    seen.add(key);
    const current = await page.evaluate(() => (document.activeElement as HTMLInputElement).value);
    const dictation = words[key];
    if (dictation && !current) {
      await page.keyboard.insertText(dictation);
      await page.waitForTimeout(120);
    }
    await page.keyboard.press("Tab");
  }
  expect([...seen]).toEqual(expect.arrayContaining(Object.keys(words)));
  for (const clause of strike) {
    const toggle = page.getByRole("button", { name: `Strike ${clause}` }).last();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: `Restore ${clause}` }).last()).toBeVisible();
  }
}

/** Sends the open draft to the client and returns the deed's address. */
async function send(page: Page): Promise<string> {
  await page.getByLabel("Client's email").fill(CLIENT.email);
  await page.getByLabel("Client's email").press("Enter");
  await expect(page.getByRole("heading", { name: /^Sent to/ })).toBeVisible();
  const link = await page.locator("p.font-mono", { hasText: "/a/" }).innerText();
  return new URL(link.trim()).pathname;
}

async function become(page: Page, who: string): Promise<void> {
  await page.getByRole("complementary", { name: "Dev personas" }).getByRole("button").first().click();
  await page.getByRole("button", { name: new RegExp(`^${who}`) }).click();
  await expect(page.getByRole("complementary", { name: "Dev personas" }).getByRole("button").first()).toHaveText(
    who === "Your own account" ? "Personas" : `As ${who}`,
  );
}

async function letTimePass(page: Page, days: 1 | 6): Promise<void> {
  await page.getByRole("complementary", { name: "Dev personas" }).getByRole("button").first().click();
  await page.getByRole("button", { name: days === 1 ? "+1 day" : "+6 days" }).click();
  await page.getByRole("button", { name: "Close" }).click();
}

/** As the client: accept the deed, pay through the simulated checkout, and come back with the deal room's address. */
async function acceptAndPay(page: Page, deedPath: string): Promise<string> {
  await become(page, CLIENT.name);
  await page.goto(deedPath);
  await page.getByLabel("Your full name").fill(CLIENT.name);
  await page.getByText("I have read this deed and agree to it.").click();
  await page.getByRole("button", { name: "Accept the deed" }).click();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const checkout = page.getByRole("dialog");
  await expect(checkout.getByText("Dev and demo only")).toBeVisible();
  await checkout.getByRole("button", { name: /^Pay ₹/ }).click();
  const room = page.getByRole("link", { name: /deal room/i });
  await expect(room).toBeVisible({ timeout: 60_000 });
  return (await room.getAttribute("href"))!;
}

/** Runs one of the deal room's actions through its confirmation, as the dialog states its effect first. */
async function act(page: Page, label: string, fill?: { field: string; value: string }): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (fill) await dialog.getByLabel(fill.field).fill(fill.value);
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test("a maker signs up, is paid, and a deed ends each of the three ways", async ({ page }) => {
  await signIn(page);
  await setUpPayouts(page);

  await test.step("one deed, delivered and approved", async () => {
    await dictateDeed(page, LANDING_PAGE);
    await expect(page.getByText("50% in advance, the rest on delivery")).toBeVisible();
    const deed = await send(page);
    const room = await acceptAndPay(page, deed);

    await become(page, "Your own account");
    await page.goto(room);
    await act(page, "Mark delivered");
    await expect(page.getByText(/Delivered, in review until/).first()).toBeVisible();

    await become(page, CLIENT.name);
    await page.goto(room);
    await act(page, "Approve and release");
    await expect(page.getByText("Released for the next settlement").first()).toBeVisible({ timeout: 60_000 });
  });

  await test.step("a second deed releases by itself once the review window passes", async () => {
    await become(page, "Your own account");
    await dictateDeed(page, LOGO_REFRESH);
    const deed = await send(page);
    const room = await acceptAndPay(page, deed);

    await become(page, "Your own account");
    await page.goto(room);
    await act(page, "Mark delivered");
    await expect(page.getByText(/Delivered, in review until/).first()).toBeVisible();
    await letTimePass(page, 6);
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Released for the next settlement").first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000 });
  });

  await test.step("a third deed is cancelled by agreement and its undelivered part refunded", async () => {
    await dictateDeed(page, PITCH_DECK, ["the kill fee clause"]);
    const deed = await send(page);
    const room = await acceptAndPay(page, deed);

    await become(page, "Your own account");
    await page.goto(room);
    await act(page, "Mark delivered");
    await become(page, CLIENT.name);
    await page.goto(room);
    await act(page, "Approve and release");
    await expect(page.getByText("Released for the next settlement").first()).toBeVisible({ timeout: 60_000 });

    await become(page, "Your own account");
    await page.goto(room);
    await act(page, "Propose cancelling the rest", { field: "Why", value: "Kiln Labs has paused the raise." });

    await become(page, CLIENT.name);
    await page.goto(room);
    await act(page, "Confirm cancelling");
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000 });
    await expect(page.getByText("Released for the next settlement").first()).toBeVisible();
  });
});
