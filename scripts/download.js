// scripts/download.js
// CLI-schil rond downloadCore.
// Gebruik:  node scripts/download.js "een prompt"
//
// Exit codes:
//   0 = succes
//   1 = fout (geen prompt, geen Chrome, geen tabblad, of download mislukt)

const puppeteer = require('puppeteer-core');
const { downloadCore, SITE_NAAM, TABBLAD_URL_PREFIX } = require('./downloadCore');

// === CHROME VERBINDING ===
async function verbindMetChrome() {
    try {
        return await puppeteer.connect({ browserURL: 'http://localhost:9222' });
    } catch (error) {
        console.error(`❌ Kan niet verbinden met Chrome op poort 9222.`);
        console.error(`   Start eerst start_chrome.bat.`);
        process.exit(1);
    }
}

// === TABBLAD ZOEKEN ===
async function zoekTabblad(browser) {
    const pages = await browser.pages();
    const page = pages.find(p => p.url().startsWith(TABBLAD_URL_PREFIX));
    if (!page) {
        console.error(`❌ Geen tabblad gevonden dat begint met ${TABBLAD_URL_PREFIX}`);
        console.error(`   Open tabbladen:`);
        for (const p of pages) {
            try { console.error(`   - ${p.url()}`); } catch (e) { /* leeg */ }
        }
        process.exit(1);
    }
    return page;
}

// === MAIN ===
(async () => {
    const prompt = process.argv[2];

    if (!prompt || prompt.trim().length === 0) {
        console.error('Gebruik: node scripts/download.js "een prompt"');
        process.exit(1);
    }

    console.log(`[${SITE_NAAM}] Prompt: "${prompt}"`);

    const browser = await verbindMetChrome();
    const page = await zoekTabblad(browser);

    const resultaat = await downloadCore(prompt, page);

    await browser.disconnect();

    if (resultaat.status === 'SUCCESS') {
        console.log(`✅ SUCCESS: ${resultaat.bestand}`);
        process.exit(0);
    } else {
        console.log(`❌ FAIL: ${resultaat.reden} (na ${resultaat.pogingen} pogingen)`);
        process.exit(1);
    }
})();