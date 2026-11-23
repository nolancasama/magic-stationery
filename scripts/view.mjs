// Quick render of a debug view: node scripts/view.mjs "<query>" <out.png> [waitMs] [w] [h]
import { chromium } from "@playwright/test";
const [query, out, waitMs = "3500", w = "1366", h = "768"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:5181/?e2e=1&" + query);
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
const stats = await page.evaluate(() => window.__ms?.state().stats);
console.log(out, JSON.stringify(stats), errors.join(" | "));
await browser.close();
