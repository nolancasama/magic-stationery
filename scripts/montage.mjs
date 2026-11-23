// Contact sheet of PNGs: node scripts/montage.mjs <out.png> <cols> <cellPx> <img...>
// Each image is labelled with its file name. Used to review many close-ups at once.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const [out, colsArg, cellArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const cell = Number(cellArg);
const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:4px;font:12px sans-serif;color:#fff">${files
  .map((f) => `<div><img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}" style="width:${cell}px;height:${cell}px;display:block"><div>${path.basename(f, ".png")}</div></div>`)
  .join("")}</body></html>`;
const browser = await chromium.launch();
const rows = Math.ceil(files.length / cols);
const page = await browser.newPage({ viewport: { width: cols * (cell + 4), height: rows * (cell + 22) } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
