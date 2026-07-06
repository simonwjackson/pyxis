/**
 * Screenshot one or more lab parts full-frame for design verification.
 *
 * Usage: bun tools/shoot-part.ts <baseUrl> <outDir> <part1> [part2 ...]
 * Each part is a glob key like `coverflow/Editorial.template.part.tsx`.
 * Renders at a portrait phone viewport and a landscape one.
 */

import { chromium } from "@playwright/test";

const [baseUrl, outDir, ...parts] = process.argv.slice(2);
if (!baseUrl || !outDir || parts.length === 0) {
  console.error(
    "usage: bun tools/shoot-part.ts <baseUrl> <outDir> <part> [part...]",
  );
  process.exit(1);
}

const viewports = [
  { name: "portrait", width: 412, height: 900 },
  { name: "landscape", width: 900, height: 520 },
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || undefined,
  args: ["--no-sandbox"],
});
try {
  for (const part of parts) {
    for (const vp of viewports) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const vars = process.env.VARS ? `&vars=${encodeURIComponent(process.env.VARS)}` : "";
      const url = `${baseUrl}/preview.html?part=${encodeURIComponent(part)}${vars}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(900);
      const safe = part.replace(/[^a-z0-9]+/gi, "_");
      const file = `${outDir}/${safe}.${vp.name}.png`;
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
