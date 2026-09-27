const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// === CONFIGURATIE ===
const OUTPUT_DIR = './gedownloade_afbeeldingen';
const AHK_FOCUS_SCRIPT = path.join(__dirname, 'perchance_focus.ahk');
const AHK_SCRIPT = path.join(__dirname, 'perchance_plak.ahk');
const AHK_EXE = 'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe'; // pas aan indien nodig
const CLIPBOARD_BAT = path.join(__dirname, 'zet_klembord.bat');
const LOG_FILE = path.join(__dirname, 'Resultaten.txt');
const PROMPTS_FILE = path.join(__dirname, 'prompts.txt');

// === LOGGING ===
function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// === PROMPTS INLEZEN ===
function loadPrompts() {
    const raw = fs.readFileSync(PROMPTS_FILE, 'utf8');
    return raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

// === KLEMBORD VULLEN VIA .BAT ===
function zetKlembord(tekst) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            'cmd.exe',
            ['/c', CLIPBOARD_BAT],
            { windowsHide: true },
            (error) => {
                if (error) return reject(error);
                resolve();
            }
        );
        // Stuur de tekst naar stdin van het bat-bestand
        child.stdin.write(tekst);
        child.stdin.end();
    });
}

// === AHK AANROEPEN (generiek) ===
function runAhkScript(scriptPad) {
    return new Promise((resolve, reject) => {
        execFile(AHK_EXE, [scriptPad], { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                log(`❌ AHK-fout (${path.basename(scriptPad)}): ${error.message}`);
                return reject(error);
            }
            if (stderr) log(`⚠️  AHK stderr: ${stderr}`);
            resolve();
        });
    });
}

// === MAIN FUNCTION ===
(async () => {
    log('🚀 Start Puppeteer batch-script');
    log('ℹ️  Zorg dat Chrome draait met: --remote-debugging-port=9222');
    log('ℹ️  En dat de Perchance-pagina al geopend is');
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
        log('   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\chrome-debug-profile" "https://perchance.org/cy59utrbbe"');
        process.exit(1);
    }

    // Zoek het Perchance-tabblad
    const pages = await browser.pages();
    let page = pages.find(p => p.url().startsWith('https://perchance.org/'));
    if (!page) {
        log('❌ Geen Perchance-tabblad gevonden. Open eerst de pagina in Chrome.');
        log('   Beschikbare tabbladen:');
        for (const p of pages) {
            try { log(`   - ${p.url()}`); } catch (e) { /* leeg */ }
        }
        process.exit(1);
    }
    log(`📌 Perchance-tabblad gevonden: ${page.url()}`);

    let imageCounter = 0;
    let isRunning = true;
    let batchActief = true;

    // === PROMPTS INLEZEN ===
    if (!fs.existsSync(PROMPTS_FILE)) {
        log(`❌ Bestand niet gevonden: ${PROMPTS_FILE}`);
        process.exit(1);
    }
    const prompts = loadPrompts();
    if (prompts.length === 0) {
        log('❌ Geen prompts gevonden in prompts.txt — stop.');
        process.exit(1);
    }
    log(`📋 ${prompts.length} prompts geladen uit ${PROMPTS_FILE}`);

    let currentPromptIndex = -1;
    let LAATSTE_PROMPT = '';

    // === LUISTER NAAR NETWERKVERKEER ===
    page.on('response', async (response) => {
        try {
            if (!batchActief) return;

            const contentType = response.headers()['content-type'] || '';
            if (!contentType.startsWith('image/')) return;
            if (!response.ok()) return;

            const url = response.url();

            // Alleen afbeeldingen van de Perchance image-generation proxy
            if (!url.startsWith('https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy')) {
                return;
            }

            log(`🖼️ Afbeelding gevonden voor prompt ${currentPromptIndex + 1}`);

            const buffer = await response.buffer();

            let extension = '.jpg';
            if (contentType.includes('png')) extension = '.png';
            else if (contentType.includes('gif')) extension = '.gif';
            else if (contentType.includes('webp')) extension = '.webp';
            else if (contentType.includes('svg')) extension = '.svg';

            // Bestandsnaam op basis van datum en tijd: YYYYMMDD HH-MM-SS
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const timestamp =
                `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ` +
                `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

            // Eerste 35 tekens van de prompt, opgeschoond voor bestandsnaam
            const promptKort = LAATSTE_PROMPT
                .slice(0, 35)
                .replace(/[\\/:*?"<>|]/g, '_');   // ongeldige Windows-tekens vervangen

            const filename = `${timestamp} ${promptKort}${extension}`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            log(`💾 Opgeslagen: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);

            // Regel toevoegen aan Resultaten.txt: datum/tijd + laatste prompt
            const logLine = `${timestamp}\t${LAATSTE_PROMPT}\n`;
            fs.appendFileSync(LOG_FILE, logLine);
            log(`📝 Log: ${logLine.trim()}`);

            // Volgende prompt starten
            if (batchActief) {
                await wait(500);
                await plakVolgendePrompt();
            }

        } catch (error) {
            log(`⚠️  Response-fout: ${error.message}`);
        }
    });

    // === FUNCTIE OM DE VOLGENDE PROMPT TE PLAKKEN ===
    async function plakVolgendePrompt() {
        currentPromptIndex++;
        if (currentPromptIndex >= prompts.length) {
            log('🏁 Alle prompts verwerkt. Batch klaar.');
            batchActief = false;
            return;
        }

        LAATSTE_PROMPT = prompts[currentPromptIndex];
        log(`▶️  Prompt ${currentPromptIndex + 1}/${prompts.length}: ${LAATSTE_PROMPT}`);

        // Tekst naar klembord schrijven via bat-bestand
        try {
            await zetKlembord(LAATSTE_PROMPT);
        } catch (e) {
            log(`❌ Klembord-fout: ${e.message}`);
            return;
        }
        await wait(200);

        // AHK laten plakken (Ctrl+A, Ctrl+V, Enter)
        try {
            await runAhkScript(AHK_SCRIPT);
        } catch (e) {
            log('⚠️  AHK-plak mislukt');
        }
    }

    // === EENMALIGE FOCUS OP CHROME ===
    try {
        log('🎯 Focus eenmalig op Chrome via AHK...');
        await runAhkScript(AHK_FOCUS_SCRIPT);
        log('✅ Chrome heeft focus, klaar voor de batch');
    } catch (e) {
        log('⚠️  Focus mislukt — batch gaat verder, maar controleer of Chrome focus heeft');
    }

    // === EERSTE PROMPT STARTEN ===
    await plakVolgendePrompt();

    // === START MONITORING ===
    log('📜 Start monitoring...');
    log('ℹ️  Druk op Ctrl+C om te stoppen');

    process.on('SIGINT', () => {
        log('\n⏹️  Ctrl+C gedetecteerd. Netjes afsluiten...');
        batchActief = false;
        isRunning = false;
    });

    while (isRunning && batchActief) {
        await wait(2000);
    }

    // === RESULTATEN ===
    log(`📊 Totaal afbeeldingen opgeslagen: ${imageCounter}`);
    log(`📁 Map: ${OUTPUT_DIR}`);
    log(`📝 Logbestand: ${LOG_FILE}`);

    await browser.disconnect();
    log('✅ Verbinding verbroken. Browser blijft open.');
})();