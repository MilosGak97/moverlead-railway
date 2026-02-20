// src/playwright/dealmachine-export.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = process.env.DEALMACHINE_EMAIL;
const PASSWORD = process.env.DEALMACHINE_PASSWORD;

if (!EMAIL || !PASSWORD) {
    throw new Error('Missing DEALMACHINE_EMAIL or DEALMACHINE_PASSWORD environment variable.');
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

console.log('🔐 Logging in...');
await page.goto('https://app.dealmachine.com/login');
await page.fill('input[name=email]', EMAIL);
await page.fill('input[name=password]', PASSWORD);
await page.keyboard.press('Enter');
await page.waitForLoadState('domcontentloaded');
await sleep(1500);

console.log('📨 Navigating to Leads page...');
await page.goto('https://app.dealmachine.com/leads');
await sleep(2000);

console.log('✅ Clicking "Select All"...');
await page.locator('div.deal-copy', { hasText: 'Select All' }).first().click();
await sleep(500);

console.log('⚙️ Clicking "Lead Actions" > "Export Leads"...');
await page.locator('div.deal-copy', { hasText: 'Lead Actions' }).first().click();
await sleep(300);
await page.locator('div.deal-copy', { hasText: 'Export Leads' }).first().click();
await sleep(1200);
/*
console.log('📦 Opening "Select Columns" > "Custom Fields"...');
await page.locator('div.deal-copy', { hasText: 'Select Columns' }).first().click();
await sleep(300);
await page.locator('div.deal-copy', { hasText: 'Custom Fields' }).first().click();
await sleep(500);

console.log('🔘 Clicking "Select All" under Custom Fields...');
await page.locator('div.deal-copy', { hasText: 'Select All' }).first().click();
await sleep(500);

console.log('💾 Saving column selection...');
await page.locator('div.deal-copy', { hasText: 'Save & Close' }).first().click();
await sleep(1000);
*/
console.log('📤 Submitting export...');
await page.locator('div.deal-copy', { hasText: 'Submit Export' }).first().click();
await sleep(2500);

const downloadBtn = await page.locator('div.deal-copy', { hasText: 'Download File' }).first();
if (await downloadBtn.count()) {
    console.log('📥 Clicking download link...');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadBtn.click(),
    ]);

    const downloadPath = path.join(os.tmpdir(), `dealmachine-export-${Date.now()}.csv`);
    await download.saveAs(downloadPath);
    console.log(`✅ File downloaded: ${downloadPath}`);
} else {
    console.log('📧 No download button found. Export will arrive via email.');
}

await browser.close();
console.log('🎉 Done!')
