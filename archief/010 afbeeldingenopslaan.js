const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// === CONFIGURATIE ===
const TARGET_URL = 'https://perchance.org/cy59utrbbe';
const OUTPUT_DIR = './gedownloade_afbeeldingen';

// === LOGGING ===
function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// === MAIN FUNCTION ===
(async () => {
    log('🚀 Start Puppeteer script (alleen monitoren)');
    log('ℹ️  Zorg dat Chrome draait met: --remote-debugging-port=9222');
    log('ℹ️  Druk op Ctrl+C om te stoppen');
    
    // Creëer output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        log(`📁 Directory aangemaakt: ${OUTPUT_DIR}`);
    }

    // Verbinding maken met BESTAANDE Chrome
    let browser;
    try {
        browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222'
        });
        log('✅ Verbonden met bestaande Chrome-instantie op poort 9222');
    } catch (error) {
        log(`❌ Fout bij verbinden: ${error.message}`);
        log('💡 Start Chrome met:');
        log('   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\chrome-debug-profile"');
        process.exit(1);
    }

    // Gebruik het eerste tabblad
    const pages = await browser.pages();
    let page = pages[0];
    if (!page) {
        page = await browser.newPage();
    }
    
    log(`📌 Gebruik tabblad 0`);
    try {
        const currentUrl = await page.url();
        log(`   Huidige URL: ${currentUrl}`);
    } catch (e) {
        log('   Huidige URL: (niet bereikbaar)');
    }

    let imageCounter = 0;
    let isRunning = true;

    // === LUISTER NAAR NETWERKVERKEER ===
    page.on('response', async (response) => {
        try {
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.startsWith('image/')) return;
            if (!response.ok()) return;

            const url = response.url();
            log(`🖼️ Afbeelding gevonden: ${url.substring(0, 80)}...`);

            const buffer = await response.buffer();
            
            let extension = '.jpg';
            if (contentType.includes('png')) extension = '.png';
            else if (contentType.includes('gif')) extension = '.gif';
            else if (contentType.includes('webp')) extension = '.webp';
            else if (contentType.includes('svg')) extension = '.svg';
            
            const filename = `image_${String(++imageCounter).padStart(4, '0')}${extension}`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            log(`💾 Opgeslagen: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
            
        } catch (error) {
            // Sla fouten over
        }
    });

    // === NAVIGEER NAAR DE PAGINA ===
    log(`🌐 Navigeer naar: ${TARGET_URL}`);
    try {
        await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
        log('✅ Pagina geladen');
    } catch (error) {
        log(`❌ Fout bij laden: ${error.message}`);
        log('ℹ️  Je kunt ook handmatig naar de pagina navigeren in de browser');
    }

    // Wacht 5 seconden voor initiële content
    log('⏳ Wacht 5 seconden voor initiële content...');
    await wait(5000);

    // === START MONITORING ===
    log('📜 Start monitoring...');
    log('ℹ️  Druk op Ctrl+C om te stoppen');
    log('💡 Vul nu handmatig de tekst in en klik op generate in de browser');
    
    // Vang Ctrl+C af om netjes af te sluiten
    process.on('SIGINT', () => {
        log('\n⏹️  Ctrl+C gedetecteerd. Netjes afsluiten...');
        isRunning = false;
    });

    while (isRunning) {
        await wait(2000);
    }

    // === RESULTATEN ===
    log(`📊 Totaal afbeeldingen opgeslagen: ${imageCounter}`);
    log(`📁 Map: ${OUTPUT_DIR}`);

    await browser.disconnect();
    log('✅ Verbinding verbroken. Browser blijft open.');
})();