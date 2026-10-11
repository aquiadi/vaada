import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, type Page } from "@playwright/test";
import { apiAs, startAs } from "./support";

const OUT = resolve(process.env.SCREENS_DIR ?? "../docs/screens");
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;

interface DealSummary {
  id: string;
  slug: string;
  status: string;
}

interface Route {
  name: string;
  path: string | (() => Promise<string>);
  as?: string;
}

async function seededDeal(status: string): Promise<DealSummary> {
  const { deals } = await apiAs<{ deals: DealSummary[] }>("aditi", "/deals");
  const deal = deals.find((d) => d.status === status);
  if (!deal) throw new Error(`no seeded ${status} deal; run make reset and make dev`);
  return deal;
}

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "payouts", path: "/payouts", as: "aditi" },
  { name: "new-deed", path: async () => `/new/${(await apiAs<{ id: string }>("aditi", "/deals", { method: "POST" })).id}`, as: "aditi" },
  { name: "deeds", path: "/deeds", as: "aditi" },
  { name: "deal-room", path: async () => `/d/${(await seededDeal("active")).id}`, as: "aditi" },
  { name: "deal-room-client", path: async () => `/d/${(await seededDeal("active")).id}`, as: "rahul" },
  { name: "client-deed", path: async () => `/a/${(await seededDeal("published")).slug}` },
  { name: "client-deed-paid", path: async () => `/a/${(await seededDeal("active")).slug}`, as: "rahul" },
  { name: "ledger", path: "/ledger", as: "aditi" },
  { name: "maker", path: "/m/aditi-rao" },
  { name: "admin", path: "/admin", as: "desk" },
  { name: "terms", path: "/legal/terms" },
  { name: "privacy", path: "/legal/privacy" },
  { name: "refunds", path: "/legal/refunds" },
  { name: "delivery", path: "/legal/delivery" },
  { name: "contact", path: "/legal/contact" },
  { name: "pricing", path: "/pricing" },
  { name: "styleguide", path: "/styleguide" },
  { name: "outbox", path: "/dev/outbox", as: "aditi" },
  { name: "not-found", path: "/no-such-page" },
];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  // The persona slip exists only in dev; fixed to the first viewport, it would land mid-page in a full-page shot.
  await page.addStyleTag({ content: 'aside[aria-label="Dev personas"] { display: none !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

mkdirSync(OUT, { recursive: true });

for (const route of ROUTES) {
  test(route.name, async ({ browser }) => {
    const path = typeof route.path === "string" ? route.path : await route.path();
    for (const size of SIZES) {
      for (const theme of THEMES) {
        const context = await browser.newContext({ viewport: size, colorScheme: theme, reducedMotion: "reduce" });
        const page = await context.newPage();
        if (route.as) await startAs(page, route.as);
        await page.goto(path);
        await settle(page);
        await page.screenshot({ path: `${OUT}/${route.name}-${size.width}-${theme}.png`, fullPage: true });
        await context.close();
      }
    }
  });
}
