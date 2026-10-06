// Renders public/brand/x-banner-1500x500.png and x-icon-400x400.png from brand.html.
// Usage: node scripts/brand/render.mjs $PWD/scripts/brand/brand.html public/brand
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true });
await p.goto('file://' + process.argv[2]);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1500);
await p.evaluate(() => location.reload());
await p.waitForTimeout(2500);
await (await p.$('#banner')).screenshot({ path: process.argv[3] + '/x-banner-1500x500.png' });
await (await p.$('#icon')).screenshot({ path: process.argv[3] + '/x-icon-400x400.png' });
await b.close();
