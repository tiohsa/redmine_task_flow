import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';

const [buildDir, artifactDir] = process.argv.slice(2);
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const moduleName = process.env.TASK_FLOW_PLAYWRIGHT_MODULE || 'playwright';
let playwright;
try {
  playwright = require(moduleName);
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  throw new Error('既存の Playwright の絶対パスを TASK_FLOW_PLAYWRIGHT_MODULE に設定してください。');
}

const script = new URL('../docs/fullscreen-layering/browser-check.js', import.meta.url);
const check = runInThisContext('(' + readFileSync(script, 'utf8') + ')', { filename: script.pathname });
const baseUrl = new URL(process.env.TASK_FLOW_REDMINE_URL || 'http://localhost:3000').href.replace(/\/$/, '');
const assetBaseUrl = baseUrl + '/__task_flow_verification_assets';
const browser = await playwright.chromium.launch({ channel: process.env.TASK_FLOW_BROWSER_CHANNEL });
try {
  const page = await browser.newPage({ locale: 'ja-JP' });
  await page.route(assetBaseUrl + '/**', async (route) => {
    const name = route.request().url().slice(assetBaseUrl.length + 1);
    if (!['stylesheets/task_flow.css', 'javascripts/task_flow.js'].includes(name)) {
      await route.abort();
      return;
    }
    await route.fulfill({ path: join(buildDir, name) });
  });
  console.log(JSON.stringify(await check(page, { baseUrl, assetBaseUrl, artifactDir })));
} finally {
  await browser.close();
}
