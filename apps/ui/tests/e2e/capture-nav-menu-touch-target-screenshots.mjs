/**
 * Capture hamburger open/close button touch-target screenshots for #5335.
 *
 * Both buttons live inside `lg:hidden` markup, so they never render at the
 * 1280px desktop viewport — only Mobile (375) and Tablet (768) are captured.
 *
 * Usage:
 *   UI_BASE_URL=http://localhost:8094 VARIANT=before node tests/e2e/capture-nav-menu-touch-target-screenshots.mjs
 *   UI_BASE_URL=http://localhost:8095 VARIANT=after  node tests/e2e/capture-nav-menu-touch-target-screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../../tmp/nav-menu-touch-target-screenshots");
const BASE_URL = process.env.UI_BASE_URL ?? "http://localhost:8095";
const VARIANT = process.env.VARIANT === "before" ? "before" : "after";
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
];

// Draws a dashed outline around the button's actual hit box so the ~40px vs
// 44px difference under review is visible in a static screenshot.
async function outlineHitTarget(locator) {
  await locator.evaluate((el) => {
    el.style.outline = "2px dashed #2563eb";
  });
}

async function setTheme(page, theme) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate((t) => {
    localStorage.setItem("mg-theme", t);
  }, theme);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      await setTheme(page, theme);
      await page.waitForTimeout(500);

      const openButton = page.getByRole("button", { name: "Open menu" });
      await openButton.waitFor({ state: "visible", timeout: 30_000 });
      await outlineHitTarget(openButton);
      const openFile = path.join(OUT_DIR, `${VARIANT}-${viewport.name}-${theme}-open-button.png`);
      await page.screenshot({ path: openFile, fullPage: false });
      console.log(`wrote ${openFile}`);

      // The drawer close control is the shared Sheet/Radix Dialog close
      // button; its accessible name is "Close" (sr-only text), not
      // "Close menu" (that aria-label existed only on the old hand-rolled
      // <aside> button removed by #5400).
      const closeButton = page.getByRole("dialog").getByRole("button", { name: "Close" });
      await openButton.click();
      try {
        await closeButton.waitFor({ state: "visible", timeout: 5_000 });
      } catch {
        // Occasional missed click on first attempt; retry once.
        await openButton.click({ force: true }).catch(() => {});
        await closeButton.waitFor({ state: "visible", timeout: 10_000 });
      }
      await outlineHitTarget(closeButton);
      await page.waitForTimeout(300);
      const closeFile = path.join(OUT_DIR, `${VARIANT}-${viewport.name}-${theme}-close-button.png`);
      await page.screenshot({ path: closeFile, fullPage: false });
      console.log(`wrote ${closeFile}`);

      await context.close();
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
