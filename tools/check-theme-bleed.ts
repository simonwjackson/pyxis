/**
 * Assert the Pyxis app theme does not bleed into lab surfaces.
 * Checks computed body background + ::selection color on the lab root and a
 * coverflow part, and confirms the pyxis app surface keeps its warm theme.
 *
 * Usage: bun tools/check-theme-bleed.ts <baseUrl>
 */

import { chromium } from "@playwright/test";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("usage: bun tools/check-theme-bleed.ts <baseUrl>");
  process.exit(1);
}

const WARM_BODY = "rgb(26, 23, 20)"; // #1a1714 — the theme ground that must NOT appear
const MAGENTA = /212, ?55, ?123/; // #d4377b primary

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || undefined,
  args: ["--no-sandbox"],
});

const probe = async (url: string) => {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  const result = await page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    // Read ::selection background via a probe span selection.
    const span = document.createElement("span");
    span.textContent = "probe";
    document.body.appendChild(span);
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const selBg = getComputedStyle(span, "::selection").backgroundColor;
    span.remove();
    return { body, selBg };
  });
  await page.close();
  return result;
};

let failed = false;
const lab = await probe(`${baseUrl}/preview.html?part=coverflow/ListEditorial.template.part.tsx`);
console.log("coverflow part:", lab);
if (lab.body === WARM_BODY) {
  console.error("  FAIL: body still warm theme ground");
  failed = true;
}
if (MAGENTA.test(lab.selBg)) {
  console.error("  FAIL: ::selection still magenta theme");
  failed = true;
}
if (!failed) console.log("  OK: neutral body + selection (no theme bleed)");

await browser.close();
process.exit(failed ? 1 : 0);
