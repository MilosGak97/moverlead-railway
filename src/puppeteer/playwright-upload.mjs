// playwright-upload.mjs
import { chromium } from 'playwright';

const EMAIL = process.env.DEALMACHINE_EMAIL;
const PASSWORD = process.env.DEALMACHINE_PASSWORD;
const CSV_PATH = process.env.DEALMACHINE_CSV_PATH; // <-- ENV input from your app


/* TESTING LOCALY VARIABLES */
/*
const EMAIL = 'milo@vanexpressmoving.com';
const PASSWORD = 'Jebemnevadim1.';
const CSV_PATH = 'uploads/test.csv'; // <-- ENV input from your app
*/
if (!CSV_PATH) {
    throw new Error('❌ Missing DEALMACHINE_CSV_PATH in environment');
}
if (!EMAIL || !PASSWORD) {
    throw new Error('❌ Missing DEALMACHINE_EMAIL or DEALMACHINE_PASSWORD in environment');
}

console.log(`📁 Uploading CSV: ${CSV_PATH}`);
console.log(`👤 Logging in as: ${EMAIL}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Login
await page.goto('https://app.dealmachine.com/login');
await page.fill('input[name=email]', EMAIL);
await page.fill('input[name=password]', PASSWORD);
// Wait for login and redirect
await page.waitForTimeout(500);
await page.keyboard.press('Enter');

// Wait for login and redirect
await page.waitForTimeout(1500);

// Navigate to import page
await page.goto('https://app.dealmachine.com/leads#import-list!o!fsp');

// Click upload button
await page.getByText('Upload List').click();
await page.waitForTimeout(1000); // wait for input to appear

// Upload file
const fileInput = await page.$('input[type="file"]');
if (!fileInput) throw new Error('❌ File input not found');
await fileInput.setInputFiles(CSV_PATH);
console.log(`✅ CSV file uploaded: ${CSV_PATH}`);




await page.waitForTimeout(5000);
async function selectCustomField(page, labelText, valueToType) {
    const clicked = await page.evaluate((label) => {
        const el = [...document.querySelectorAll('div.deal-copy')]
            .find(el => el.textContent.trim() === label);
        if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'center' });
            el.click();
            return true;
        }
        return false;
    }, labelText);

    if (!clicked) throw new Error(`❌ Field "${labelText}" not found`);
    console.log(`✅ Clicked "${labelText}" field`);

    await page.waitForTimeout(500);

    // Clear any previous text (simulate Ctrl+A then Backspace)
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');

    // Type the new value
    await page.keyboard.type(valueToType);
    await page.keyboard.press('Enter');
    console.log(`✅ Entered "${valueToType}" into "${labelText}"`);

    await page.waitForTimeout(500);
}
// 🧠 Select "moverlead_property_id" → type "mover"
await selectCustomField(page, 'moverlead_property_id', 'mover');

// 🧠 Select "listing_status" → type "listing_status"
await selectCustomField(page, 'listing_status', 'listing');

await page.waitForTimeout(1500); // wait for input to appear

// 🎯 Type "mover" and press Enter
await page.keyboard.type('mover');
await page.keyboard.press('Enter');
console.log('✅ Entered "mover" in custom field');
await page.waitForTimeout(1500);




// Click "Complete Import"
await page.getByText('Complete Import', { timeout: 30000 }).click();
console.log(`🚀 Import started.`);

// Optional: wait for confirmation or delay before closing
await page.waitForTimeout(5000);

// Close browser
await browser.close();
console.log('🎉 Done!');

