// scripts/batch.js
// Batch-verwerker: leest prompts.txt en downloadt voor elke regel een afbeelding.
// Gebruik:  node scripts/batch.js
//
// Na elke prompt wordt de regel uit prompts.txt VERPLAATST naar:
//   - prompts_success.txt   bij succes
//   - prompts_fail.txt      bij falen
//
// prompts.txt wordt dus geleegd naarmate de batch vordert.
// Wil je opnieuw beginnen? Zet de regels terug in prompts.txt.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const {
    downloadCore,
    SITE_NAAM,
    TABBLAD_URL_PREFIX,
    ROOT_DIR
} = require('./downloadCore');

// === PADEN ===
const PROMPTS_FILE        = path.join(ROOT_DIR, 'prompts.txt');
const PROMPTS_SUCCESS_FILE = path.join(ROOT_DIR, 'prompts_success.txt');
const PROMPTS_FAIL_FILE    = path.join(ROOT_DIR, 'prompts_fail.txt');
const VOORTGANG_FILE       = path.join(ROOT_DIR, 'voortgang.json');

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

// === PROMPTS BESTAND HERSCHRIJVEN ===
// Schrijft de opgegeven lijst prompts terug naar prompts.txt.
function schrijfPrompts(prompts) {
    const inhoud = prompts.length > 0 ? prompts.join('\n') + '\n' : '';
    fs.writeFileSync(PROMPTS_FILE, inhoud, 'utf8');
}

// === PROMPT TOEVOEGEN AAN SUCCES/FAIL ===
function voegPromptToe(doelBestand, prompt) {
    try {
        fs.appendFileSync(doelBestand, prompt + '\n', 'utf8');
    } catch (e) {
        log(`⚠️  Kon niet schrijven naar ${path.basename(doelBestand)}: ${e.message}`);
    }
}

// === VOORTGANG LEZEN/SCHRIJVEN (extra veiligheidsnet) ===
function leesVoortgang() {
    try {
        if (!fs.existsSync(VOORTGANG_FILE)) return { laatsteVoltooideIndex: -1 };
        const raw = fs.readFileSync(VOORTGANG_FILE, 'utf8');
        const obj = JSON.parse(raw);
        if (typeof obj.laatsteVoltooideIndex !== 'number') return { laatsteVoltooideIndex: -1 };
        return obj;
    } catch (e) {
        log(`⚠️  Kon voortgang.json niet lezen (${e.message}) — begin bij prompt 1`);
        return { laatsteVoltooideIndex: -1 };
    }
}

function schrijfVoortgang(index) {
    try {
        fs.writeFileSync(VOORTGANG_FILE, JSON.stringify({ laatsteVoltooideIndex: index }, null, 2));
    } catch (e) {
        log(`⚠️  Kon voortgang.json niet schrijven: ${e.message}`);
    }
}

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
    // Controleer of prompts.txt bestaat
    if (!fs.existsSync(PROMPTS_FILE)) {
        console.error(`❌ Bestand niet gevonden: ${PROMPTS_FILE}`);
        process.exit(1);
    }

    // Prompts inlezen (altijd volledig, want prompts.txt wordt steeds kleiner)
    let prompts = loadPrompts();
    if (prompts.length === 0) {
        console.log(`ℹ️  Geen prompts (meer) in ${path.basename(PROMPTS_FILE)} — niets te doen.`);
        process.exit(0);
    }

    log(`🚀 Batch starten [${SITE_NAAM}]`);
    log(`📋 ${prompts.length} prompts gevonden in ${path.basename(PROMPTS_FILE)}`);

    // Verbinden en tabblad zoeken
    const browser = await verbindMetChrome();
    const page = await zoekTabblad(browser);

    // Statistieken
    let aantalSucces = 0;
    let aantalFail   = 0;
    const mislukt    = [];

    // Batch-loop — we werken altijd op prompts[0], want we halen de zojuist
    // verwerkte prompt uit de lijst en schrijven de rest terug.
    while (prompts.length > 0) {
        const prompt = prompts[0];
        const totaal = aantalSucces + aantalFail + prompts.length;

        log(`\n═══════════════════════════════════════════════════════════`);
        log(`📌 Prompt ${aantalSucces + aantalFail + 1}/${totaal}`);
        log(`═══════════════════════════════════════════════════════════`);
        log(`   "${prompt.substring(0, 80)}"`);

        const resultaat = await downloadCore(prompt, page);

        // Prompt uit prompts.txt halen
        prompts.shift();
        schrijfPrompts(prompts);

        if (resultaat.status === 'SUCCESS') {
            aantalSucces++;
            voegPromptToe(PROMPTS_SUCCESS_FILE, prompt);
            log(`✅ Succes: ${resultaat.bestand}`);
        } else {
            aantalFail++;
            mislukt.push({ prompt, reden: resultaat.reden });
            voegPromptToe(PROMPTS_FAIL_FILE, prompt);
            log(`❌ Mislukt: ${resultaat.reden}`);
        }

        // Voortgang bijhouden (indien je ooit wilt hervatten met oude logica)
        schrijfVoortgang(aantalSucces + aantalFail - 1);

        // Kleine pauze tussen prompts
        if (prompts.length > 0) await wait(1000);
    }

    // Afronden
    await browser.disconnect();

    log(`\n═══════════════════════════════════════════════════════════`);
    log(`🏁 Batch klaar`);
    log(`═══════════════════════════════════════════════════════════`);
    log(`✅ Succes:  ${aantalSucces}   → ${path.basename(PROMPTS_SUCCESS_FILE)}`);
    log(`❌ Mislukt: ${aantalFail}   → ${path.basename(PROMPTS_FAIL_FILE)}`);

    if (mislukt.length > 0) {
        log(`\nMislukte prompts:`);
        for (const m of mislukt) {
            log(`  (${m.reden}): ${m.prompt.substring(0, 60)}`);
        }
    }

    log(`\n💡 prompts.txt is nu leeg. Zet de mislukte prompts terug in prompts.txt om ze opnieuw te proberen.`);
    process.exit(aantalFail > 0 ? 1 : 0);
})();