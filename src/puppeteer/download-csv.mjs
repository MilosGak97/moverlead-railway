// download-csv.mjs
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';

const csvUrl = process.argv[2];
const outputDirArg = process.argv[3];

if (!csvUrl) {
    console.error('❌ Please provide the URL to download:');
    console.error('   node download-csv.mjs "<CSV_URL>" [OUTPUT_DIR]');
    process.exit(1);
}

// Use provided output dir or fallback to ./downloads
const downloadDir = outputDirArg
    ? path.resolve(outputDirArg)
    : path.resolve('./downloads');

fs.mkdirSync(downloadDir, { recursive: true });

console.log('📁 Downloading into:', downloadDir);

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
});

try {
    const [page] = await browser.pages();
    const client = await page.target().createCDPSession();

    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
    });

    console.log('🌐 Opening:', csvUrl);
    await page.goto(csvUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('⏳ Waiting for file download...');
    let downloadedFile = null;

    for (let i = 0; i < 30; i++) {
        const files = fs
            .readdirSync(downloadDir)
            .filter(f => f.endsWith('.csv') && !f.endsWith('.crdownload'));

        if (files.length > 0) {
            downloadedFile = path.join(downloadDir, files[0]);
            console.log('✅ File downloaded:', downloadedFile);
            console.log(`>>> ${downloadedFile}`);
            process.exit(0);
        }

        await new Promise(res => setTimeout(res, 1000));
    }

    console.error('❌ File did not download within timeout.');
    process.exit(1);

} catch (err) {
    console.error('🔥 Puppeteer failed:', err);
    process.exit(1);
} finally {
    await browser.close();
}