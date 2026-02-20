// src/puppeteer/dealmachine-export.mjs
import puppeteer from 'puppeteer-core';

// ── ENV ────────────────────────────────────────────────────────────────────────
const EMAIL = process.env.DEALMACHINE_EMAIL;
const PASSWORD = process.env.DEALMACHINE_PASSWORD;
const BROWSERLESS_WS = process.env.BROWSERLESS_WS;

if (!EMAIL || !PASSWORD) {
    throw new Error('Missing DEALMACHINE_EMAIL or DEALMACHINE_PASSWORD environment variable.');
}

if (!BROWSERLESS_WS) {
    throw new Error('Missing BROWSERLESS_WS environment variable.');
}

// ── SMALL HELPERS (DOM-only, no ElementHandles kept between steps) ─────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const idle = (page, ms) =>
    page
        .waitForNetworkIdle({ idleTime: Math.min(600, ms), timeout: Math.max(900, ms + 300) })
        .catch(() => sleep(ms));

async function softResetToLeads(page, attemptIdx) {
    try { await page.keyboard.press('Escape'); } catch {}
    await idle(page, 150);
    const bust = Date.now();
    await page.goto(`https://app.dealmachine.com/leads?retry=${attemptIdx}_${bust}`, {
        waitUntil: 'domcontentloaded',
    });
    console.log(`↻ Soft-reset to Leads (attempt ${attemptIdx + 1})`);
    await idle(page, 600);
}

// Exact “.deal-copy” click, DOM-only, with retries. Accepts {optional, retries, delay}
async function clickDealCopyInlineExact(page, exactText, { optional = false, retries = 8, delay = 180 } = {}) {
    for (let i = 0; i <= retries; i++) {
        const clicked = await page
            .evaluate((txt) => {
                const norm = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const isVisible = (el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
                };
                const nodes = Array.from(document.querySelectorAll('div.deal-copy, div.deal-copy.undefined')).filter(isVisible);
                const el = nodes.find((n) => norm(n.textContent) === norm(txt));
                if (!el) return false;

                // Nudge scrollable ancestors if needed
                let p = el.parentElement;
                for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
                    const cs = p ? getComputedStyle(p) : null;
                    if (p && (cs?.overflowY === 'auto' || cs?.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
                        p.scrollTop = Math.max(0, el.offsetTop - p.clientHeight * 0.3);
                    }
                }
                el.scrollIntoView({ block: 'center', inline: 'center' });
                el.click();
                return true;
            }, exactText)
            .catch(() => false);

        if (clicked) return true;
        await idle(page, delay);
    }
    if (optional) return false;
    throw new Error(`.deal-copy "${exactText}" not found/clickable`);
}

// Click “Custom Fields” inside the sliding drawer (robust against re-renders)
async function clickCustomFieldsInDrawer(page) {
    let clicked = false;
    for (let i = 0; i < 10 && !clicked; i++) {
        try {
            clicked = await page.evaluate(() => {
                const norm = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const isVisible = (el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
                };

                // anchor to a visible “Save & Close” inside the drawer to scope
                const all = Array.from(document.querySelectorAll('div.deal-copy, div.deal-copy.undefined'));
                const save = all.find((n) => norm(n.textContent) === 'Save & Close' && isVisible(n));

                let scope = document;
                if (save) {
                    let root = save;
                    while (root && root.parentElement) {
                        const count = root.querySelectorAll?.('div.deal-copy, div.deal-copy.undefined').length || 0;
                        if (count >= 5) { scope = root; break; }
                        root = root.parentElement;
                    }
                }

                const nodes = Array.from(scope.querySelectorAll('div.deal-copy, div.deal-copy.undefined')).filter(isVisible);
                const el = nodes.find((n) => norm(n.textContent).startsWith('Custom Fields'));
                if (!el) return false;

                // Nudge scrollables
                let p = el.parentElement;
                for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
                    const cs = p ? getComputedStyle(p) : null;
                    if (p && (cs?.overflowY === 'auto' || cs?.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
                        p.scrollTop = Math.max(0, el.offsetTop - p.clientHeight * 0.3);
                    }
                }
                el.scrollIntoView({ block: 'center', inline: 'center' });
                el.click();
                return true;
            });
        } catch {}
        if (!clicked) await idle(page, 160);
    }
    if (!clicked) throw new Error('Custom Fields not found/clickable inside the panel');
}

// Click the “Select All” that belongs to the Custom Fields section
async function clickSelectAllUnderCustomFields(page) {
    let clicked = false;
    for (let attempt = 0; attempt < 10 && !clicked; attempt++) {
        try {
            clicked = await page.evaluate(() => {
                const norm = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const isVisible = (el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
                };

                // scope by visible Save & Close (drawer root)
                const all = Array.from(document.querySelectorAll('div.deal-copy, div.deal-copy.undefined'));
                const save = all.find((n) => norm(n.textContent) === 'Save & Close' && isVisible(n));

                let scope = document;
                if (save) {
                    let root = save;
                    while (root && root.parentElement) {
                        const count = root.querySelectorAll?.('div.deal-copy, div.deal-copy.undefined').length || 0;
                        if (count >= 5) { scope = root; break; }
                        root = root.parentElement;
                    }
                }

                // locate Custom Fields header
                const header = Array.from(scope.querySelectorAll('div.deal-copy, div.deal-copy.undefined'))
                    .filter(isVisible)
                    .find((n) => norm(n.textContent).startsWith('Custom Fields'));
                if (!header) return false;

                const hTop = header.getBoundingClientRect().top;
                const selects = Array.from(scope.querySelectorAll('div.deal-copy, div.deal-copy.undefined'))
                    .filter(isVisible)
                    .filter((n) => norm(n.textContent) === 'Select All');
                if (!selects.length) return false;

                let target = null;
                let bestDelta = Infinity;
                for (const el of selects) {
                    const top = el.getBoundingClientRect().top;
                    const delta = top - hTop;
                    if (delta >= 0 && delta < bestDelta && delta < 800) {
                        bestDelta = delta;
                        target = el;
                    }
                }
                if (!target) target = selects[0];

                // Nudge scrollables
                let p = target.parentElement;
                for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
                    const cs = p ? getComputedStyle(p) : null;
                    if (p && (cs?.overflowY === 'auto' || cs?.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
                        p.scrollTop = Math.max(0, target.offsetTop - p.clientHeight * 0.3);
                    }
                }

                target.scrollIntoView({ block: 'center', inline: 'center' });
                target.click();
                return true;
            });
        } catch {}
        if (!clicked) await idle(page, 160);
    }
    if (!clicked) throw new Error('Custom Fields → Select All not found/clickable');
}

// Click “Save & Close” in the drawer
async function clickSaveAndClose(page) {
    let clicked = false;
    for (let i = 0; i < 10 && !clicked; i++) {
        try {
            clicked = await page.evaluate(() => {
                const norm = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const isVisible = (el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
                };

                const nodes = Array.from(document.querySelectorAll('div.deal-copy, div.deal-copy.undefined')).filter(isVisible);
                const el = nodes.find((n) => norm(n.textContent) === 'Save & Close');
                if (!el) return false;

                // Nudge scrollables
                let p = el.parentElement;
                for (let k = 0; k < 6 && p; k++, p = p.parentElement) {
                    const cs = p ? getComputedStyle(p) : null;
                    if (p && (cs?.overflowY === 'auto' || cs?.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
                        p.scrollTop = Math.max(0, el.offsetTop - p.clientHeight * 0.3);
                    }
                }
                el.scrollIntoView({ block: 'center', inline: 'center' });
                el.click();
                return true;
            });
        } catch {}
        if (!clicked) await idle(page, 160);
    }
    if (!clicked) throw new Error('"Save & Close" not found/clickable inside the panel');
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
(async () => {
    try {
        await runOnce();
    } catch (err) {
        console.warn('⚠️ Flow crashed, retrying once:', String(err?.message || err));
        await runOnce();
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});

async function runOnce() {
    const browser = await puppeteer.connect({
        browserWSEndpoint: BROWSERLESS_WS,
        protocolTimeout: 180_000,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(45_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // keep Browserless alive with tiny evaluate and keep the page "busy"
    const heartbeat = setInterval(() => {
        page.evaluate(() => (window.__hb = Date.now())).catch(() => {});
    }, 5000);

    // basic listeners (do not throw, just log)
    page.on('close', () => console.log('ℹ️ page closed'));
    page.on('error', (err) => console.log('ℹ️ page error:', err?.message || err));
    page.on('pageerror', (err) => console.log('ℹ️ page console error:', err?.message || err));

    try {
        // STEP 1 — Login
        await page.goto('https://app.dealmachine.com/login', { waitUntil: 'domcontentloaded' });
        console.log('✅ STEP 1: Login page loaded');
        await page.type('input[name=email]', EMAIL, { delay: 15 });
        await page.type('input[name=password]', PASSWORD, { delay: 15 });
        await page.keyboard.press('Enter');
        await idle(page, 700);

        // RETRY LOOP: Steps 2–7
        const MAX_ATTEMPTS = 3;
        let success = false;

        for (let attempt = 0; attempt < MAX_ATTEMPTS && !success; attempt++) {
            try {
                // STEP 2 — Open Leads
                await page.goto('https://app.dealmachine.com/leads', { waitUntil: 'domcontentloaded' });
                console.log('✅ STEP 2: Leads page loaded');
                await idle(page, 500);

                // STEP 3 — Select All
                await clickDealCopyInlineExact(page, 'Select All', { retries: 10, delay: 140 });
                console.log('✅ STEP 3: Clicked "Select All"');
                await idle(page, 300);

                // STEP 4a — Lead Actions
                await clickDealCopyInlineExact(page, 'Lead Actions', { retries: 10, delay: 140 });
                console.log('✅ STEP 4a: Clicked "Lead Actions"');
                await idle(page, 300);

                // STEP 4b — Export Leads
                await clickDealCopyInlineExact(page, 'Export Leads', { retries: 10, delay: 160 });
                console.log('✅ STEP 4b: Clicked "Export Leads"');
                await idle(page, 500);
/*
                // STEP 5a — Select Columns
                await clickDealCopyInlineExact(page, 'Select Columns', { retries: 10, delay: 160 });
                console.log('✅ STEP 5a: Clicked "Select Columns"');
                await idle(page, 250);

                // STEP 5b — Custom Fields (drawer)
                await clickCustomFieldsInDrawer(page);
                console.log('✅ STEP 5b: Clicked "Custom Fields"');
                await idle(page, 250);

                // STEP 5c — Select All (under Custom Fields)
                await clickSelectAllUnderCustomFields(page);
                console.log('✅ STEP 5c: Clicked "Select All" under Custom Fields');
                await idle(page, 250);

                // (optional) click specific fields if they exist (non-fatal)
               // await clickDealCopyInlineExact(page, 'MoverLead Property ID', { optional: true, retries: 4, delay: 140 });
               // await idle(page, 150);
               // await clickDealCopyInlineExact(page, 'Dealmachine Lead ID', { optional: true, retries: 4, delay: 140 });
               // await idle(page, 200);

                // STEP 6a — Save & Close
                await clickSaveAndClose(page);
                console.log('✅ STEP 6a: Clicked "Save & Close"');
                await idle(page, 500);
*/
                // STEP 6b — Submit Export
                await clickDealCopyInlineExact(page, 'Submit Export', { retries: 12, delay: 200 });
                console.log('✅ STEP 6b: Clicked "Submit Export"');
                await idle(page, 1500);

                // STEP 7 — Optional "Download File"
                await clickDealCopyInlineExact(page, 'Download File', { optional: true, retries: 6, delay: 200 });
                console.log('ℹ️ STEP 7: Download handled (button may or may not exist; email delivery is common)');

                success = true;
                console.log('🎉 DONE');
            } catch (err) {
                console.warn(`⚠️ Attempt ${attempt + 1} failed: ${String(err?.message || err)}`);
                if (attempt < MAX_ATTEMPTS - 1) {
                    await softResetToLeads(page, attempt);
                    continue;
                }
                throw err;
            }
        }
    } finally {
        clearInterval(heartbeat);
        await page.close().catch(() => {});
        await browser.disconnect();
    }
}
