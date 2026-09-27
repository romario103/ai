// scripts/downloadCore.js
// Kern van het Perchance-downloadsysteem.
// Roept AHK aan om een prompt te plakken, wacht op de gegenereerde afbeelding,
// en geeft een resultaatobject terug.
//
// Aanname: het tekstvak in de pagina heeft altijd focus.
// Het focussen gebeurt eenmalig in start_chrome.bat via een focus-AHK-script.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ============================================================
// === PADEN ==================================================
// ============================================================
// Eén niveau hoger dan de scripts-map: daar staan helpers/, downloads/ en log.txt.

const ROOT_DIR      = path.join(__dirname, '..');
const HELPERS_DIR   = path.join(ROOT_DIR, 'helpers');
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const LOG_FILE      = path.join(ROOT_DIR, 'log.txt');

// ============================================================
// === SITE-SPECIFIEKE INSTELLINGEN ===========================
// ============================================================
// Kies één site door het bijbehorende blok te activeren
// (verwijder de // aan het begin van elke regel) en de andere
// blokken uitgecommentarieerd te laten.
//
// LET OP: het focus-script wordt NIET hier gebruikt, maar in
// start_chrome.bat. Dat draait eenmalig bij het opstarten,
// niet per prompt.

// --- Perchance (actief) ---
const SITE_NAAM          = 'Perchance';
const AHK_PLAK_SCRIPT    = path.join(HELPERS_DIR, 'perchance_plak.ahk');
const AHK_FOCUS_SCRIPT   = path.join(HELPERS_DIR, 'perchance_focus.ahk');
const RESPONSE_PREFIX    = 'https://image-generation.perchance.org/api/downloadTemporaryImageViaProxy';
const TABBLAD_URL_PREFIX = 'https://perchance.org/';

// --- Gemini (uit) ---
// const SITE_NAAM          = 'Gemini';
// const AHK_PLAK_SCRIPT    = path.join(HELPERS_DIR, 'gemini_plak.ahk');
// const AHK_FOCUS_SCRIPT   = path.join(HELPERS_DIR, 'perchance_focus.ahk');
// const RESPONSE_PREFIX    = 'https://gemini.google.com/api/...';
// const TABBLAD_URL_PREFIX = 'https://gemini.google.com/';

// ============================================================
// === ALGEMENE CONFIGURATIE ==================================
// ============================================================

const MAX_POGINGEN   = 3;
const TIMEOUT_MS     = 60000;
const SETTLE_TIME_MS = 2000;

const AHK_EXE       = 'C:\\Remy\\Applicaties\\AutoHotkey\\AutoHotkey64.exe';
const CLIPBOARD_BAT = path.join(HELPERS_DIR, 'zet_klembord.bat');

// ============================================================
// === LOGGING ================================================
// ============================================================

function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Schrijft één regel naar log.txt in de root.
// Formaat: YYYY-MM-DD HH:MM:SS <tab> STATUS <tab> bestandsnaam-of-streepje <tab> prompt
function logResultaat(status, bestandsnaam, prompt) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const regel = `${ts}\t${status}\t${bestandsnaam || '-'}\t${prompt}\n`;
    try {
        fs.appendFileSync(LOG_FILE, regel);
    } catch (e) {
        console.error(`⚠️  Kon niet naar ${LOG_FILE} schrijven: ${e.message}`);
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// === KLEMBORD VULLEN VIA .BAT ===============================
// ============================================================

function zetKlembord(tekst) {
    return new Promise((resolve, reject) => {
        const child = execFile('cmd.exe', ['/c', CLIPBOARD_BAT], { windowsHide: true }, (error) => {
            if (error) return reject(error);
            resolve();
        });
        child.stdin.write(tekst);
        child.stdin.end();
    });
}

// ============================================================
// === AHK AANROEPEN ==========================================
// ============================================================

function runAhkScript(scriptPad) {
    return new Promise((resolve, reject) => {
        execFile(AHK_EXE, [scriptPad], { windowsHide: true }, (error, stdout, stderr) => {
            if (error) return reject(new Error(`AHK-fout (${path.basename(scriptPad)}): ${error.message}`));
            if (stderr) log(`⚠️  AHK stderr: ${stderr}`);
            resolve();
        });
    });
}

// ============================================================
// === BESTANDSNAAM MAKEN =====================================
// ============================================================
// Formaat: YYYYMMDD HH-MM-SS [eerste 35 tekens van prompt].[ext]

function maakBestandsnaam(prompt, contentType) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ` +
        `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    const promptKort = prompt.slice(0, 35).replace(/[\\/:*?"<>|]/g, '_');

    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('svg')) ext = '.svg';

    return `${timestamp} ${promptKort}${ext}`;
}

// ============================================================
// === EEN POGING =============================================
// ============================================================
// Plakt de prompt, wacht op de afbeelding, handelt timeout en
// settle-time af.

function eenPoging(prompt, page, { outputDir, timeoutMs, settleMs }) {
    return new Promise(async (resolve) => {
        let opgeslagen      = null;      // bestandsnaam zodra opgeslagen
        let verwerkBezig    = false;     // voorkomt dubbele verwerking van parallelle responses
        let fase            = 'primair'; // 'primair' | 'settle-na-succes' | 'settle-na-timeout'
        let primaireTimer   = null;
        let settleTimer     = null;
        let klaar           = false;

        const afronden = (resultaat) => {
            if (klaar) return;
            klaar = true;
            if (primaireTimer) clearTimeout(primaireTimer);
            if (settleTimer) clearTimeout(settleTimer);
            page.off('response', handler);
            resolve(resultaat);
        };

        const handler = async (response) => {
            if (klaar) return;
            try {
                const contentType = response.headers()['content-type'] || '';
                if (!contentType.startsWith('image/')) return;
                if (!response.ok()) return;
                const url = response.url();
                if (!url.startsWith(RESPONSE_PREFIX)) return;

                // Al opgeslagen of al bezig? Negeer (settle-gedrag: extra's worden genegeerd)
                if (opgeslagen || verwerkBezig) return;

                verwerkBezig = true;
                const buffer = await response.buffer();
                const bestandsnaam = maakBestandsnaam(prompt, contentType);
                fs.writeFileSync(path.join(outputDir, bestandsnaam), buffer);
                opgeslagen = bestandsnaam;
                verwerkBezig = false;
                log(`💾 Opgeslagen: ${bestandsnaam} (${(buffer.length / 1024).toFixed(1)} KB)`);

                if (fase === 'primair') {
                    // Primaire fase succes: wacht settleMs om extra afbeeldingen te negeren
                    if (primaireTimer) { clearTimeout(primaireTimer); primaireTimer = null; }
                    fase = 'settle-na-succes';
                    settleTimer = setTimeout(() => {
                        afronden({ status: 'SUCCESS', bestand: opgeslagen });
                    }, settleMs);
                } else if (fase === 'settle-na-timeout') {
                    // Late afbeelding tijdens settle-periode na timeout: toch succes
                    afronden({ status: 'SUCCESS', bestand: opgeslagen });
                }
            } catch (e) {
                verwerkBezig = false;
            }
        };

        // Eerst listener opzetten, dan plakken — anders kan de response gemist worden
        page.on('response', handler);

        try {
            // Focus: venster naar voren (idempotent, geen Tabben)
            await runAhkScript(AHK_FOCUS_SCRIPT);
            await wait(150);

            // Klembord vullen
            await zetKlembord(prompt);
            await wait(200);

            // Plakken
            await runAhkScript(AHK_PLAK_SCRIPT);
        } catch (e) {
            log(`❌ Fout bij plakken: ${e.message}`);
            afronden({ status: 'PLAK_FOUT', reden: e.message });
            return;
        }

        // Primaire timeout starten
        primaireTimer = setTimeout(() => {
            if (klaar) return;
            fase = 'settle-na-timeout';
            log(`⏱️  Timeout na ${timeoutMs}ms — nog ${settleMs}ms wachten op late afbeelding`);
            settleTimer = setTimeout(() => {
                afronden({ status: 'TIMEOUT' });
            }, settleMs);
        }, timeoutMs);
    });
}

// ============================================================
// === HOOFDFUNCTIE ===========================================
// ============================================================
// Aanroep:  const r = await downloadCore(prompt, page);
// Resultaat: { status: 'SUCCESS', bestand, prompt }
//            { status: 'FAIL', reden, pogingen, prompt }
//
// Logt het eindresultaat (succes of falen) naar log.txt.

async function downloadCore(prompt, page, opts = {}) {
    const outputDir   = opts.outputDir || DOWNLOADS_DIR;
    const maxPogingen = opts.maxPogingen || MAX_POGINGEN;
    const timeoutMs   = opts.timeoutMs   || TIMEOUT_MS;
    const settleMs    = opts.settleMs !== undefined ? opts.settleMs : SETTLE_TIME_MS;

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (let poging = 1; poging <= maxPogingen; poging++) {
        log(`▶️  [${SITE_NAAM}] Poging ${poging}/${maxPogingen}: "${prompt.substring(0, 60)}"`);

        const r = await eenPoging(prompt, page, { outputDir, timeoutMs, settleMs });

        if (r.status === 'SUCCESS') {
            logResultaat('SUCCESS', r.bestand, prompt);
            return { status: 'SUCCESS', bestand: r.bestand, prompt };
        }

        log(`❌ Poging ${poging} gefaald: ${r.status}${r.reden ? ' (' + r.reden + ')' : ''}`);
    }

    logResultaat('FAIL', null, prompt);
    return { status: 'FAIL', reden: 'TIMEOUT_NA_MAX_POGINGEN', pogingen: maxPogingen, prompt };
}

module.exports = {
    // Configuratie
    ROOT_DIR,
    HELPERS_DIR,
    DOWNLOADS_DIR,
    LOG_FILE,
    AHK_EXE,
    CLIPBOARD_BAT,
    SITE_NAAM,
    TABBLAD_URL_PREFIX,
    // Constanten
    MAX_POGINGEN,
    TIMEOUT_MS,
    SETTLE_TIME_MS,
    // Hoofdfunctie
    downloadCore
};