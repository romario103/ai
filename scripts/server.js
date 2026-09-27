// scripts/server.js
// HTTP-server rond downloadCore + serveert client.html.
// Gebruik:  node scripts/server.js
//
// Endpoints:
//   GET /                          → client.html
//   GET /client.html               → client.html
//   GET /generate?prompt=...       → JSON met status en (bij succes) base64-afbeelding
//   GET /generate?prompt=...&raw=1 → de afbeelding zelf als binary (content-type image/*)
//   GET /status                    → simpele health-check
//
// Aanname: Chrome draait al met de Perchance-pagina en het tekstvak heeft focus.
//
// Verzoeken worden serieel afgehandeld (één tegelijk), omdat er maar één Chrome
// en één tekstvak is. Gelijktijdige verzoeken worden in een wachtrij gezet.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer-core');
const {
    downloadCore,
    SITE_NAAM,
    TABBLAD_URL_PREFIX,
    DOWNLOADS_DIR,
    ROOT_DIR
} = require('./downloadCore');

// === SERVER CONFIGURATIE ===
const POORT = 3000;
const HOST  = '0.0.0.0';   // bereikbaar vanaf andere pc's in het netwerk

// === STATISCHE BESTANDEN ===
const HTML_DIR = path.join(ROOT_DIR, 'html');

// === LOGGING ===
function log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// === WACHTRIJ ===
// Eén Chrome, één tekstvak: verzoeken moeten serieel.
let wachtrij = Promise.resolve();

function inWachtrij(taak) {
    const resultaat = wachtrij.then(() => taak());
    wachtrij = resultaat.catch(() => {});
    return resultaat;
}

// === BROWSER/TABBLAD ===
let browser = null;
let page = null;

async function zorgVoorVerbinding() {
    if (browser && page) {
        try {
            await page.evaluate(() => true);
            return;
        } catch (e) {
            log('⚠️  Bestaande verbinding dood — opnieuw verbinden');
            browser = null;
            page = null;
        }
    }

    try {
        browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
    } catch (error) {
        throw new Error('Kan niet verbinden met Chrome op poort 9222. Start eerst start_chrome.bat.');
    }

    const pages = await browser.pages();
    page = pages.find(p => p.url().startsWith(TABBLAD_URL_PREFIX));
    if (!page) {
        throw new Error(`Geen tabblad gevonden dat begint met ${TABBLAD_URL_PREFIX}`);
    }
    log(`🔗 Verbonden met tabblad: ${page.url()}`);
}

// === AFBEELDING LEZEN ===
function leesAfbeelding(bestandsnaam) {
    const pad = path.join(DOWNLOADS_DIR, bestandsnaam);
    if (!fs.existsSync(pad)) return null;
    return fs.readFileSync(pad);
}

function contentTypeVanBestandsnaam(bestandsnaam) {
    const ext = path.extname(bestandsnaam).toLowerCase();
    if (ext === '.png')  return 'image/png';
    if (ext === '.gif')  return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.svg')  return 'image/svg+xml';
    return 'image/jpeg';
}

// === HTTP-ANTWOORDEN ===
function stuurJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function stuurTekst(res, code, tekst) {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(tekst);
}

// === STATISCHE BESTANDEN SERVEREN ===
// Alleen bestanden direct in html/ (geen submappen, geen path traversal).
function serveerStatisch(res, bestandsnaam) {
    // Beveiliging: geen paden met .. of / erin
    if (bestandsnaam.includes('..') || bestandsnaam.includes('/') || bestandsnaam.includes('\\')) {
        return stuurJson(res, 400, { status: 'ERROR', reden: 'Ongeldige bestandsnaam' });
    }

    const pad = path.join(HTML_DIR, bestandsnaam);
    if (!fs.existsSync(pad) || !fs.statSync(pad).isFile()) {
        return stuurJson(res, 404, { status: 'ERROR', reden: 'Bestand niet gevonden', bestand: bestandsnaam });
    }

    const buffer = fs.readFileSync(pad);
    let contentType = 'application/octet-stream';
    const ext = path.extname(bestandsnaam).toLowerCase();
    if (ext === '.html') contentType = 'text/html; charset=utf-8';
    else if (ext === '.css') contentType = 'text/css; charset=utf-8';
    else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.ico') contentType = 'image/x-icon';

    res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buffer.length
    });
    res.end(buffer);
}

// === REQUEST HANDLER ===
async function verwerkVerzoek(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pad = url.pathname;

    // === / of /client.html → statisch bestand ===
    if (pad === '/' || pad === '/client.html') {
        return serveerStatisch(res, 'client.html');
    }

    // === Eventueel andere statische bestanden in html/ ===
    if (pad.startsWith('/') && !pad.startsWith('/generate') && !pad.startsWith('/status')) {
        const bestandsnaam = pad.substring(1);
        if (bestandsnaam.length > 0) {
            return serveerStatisch(res, bestandsnaam);
        }
    }

    // === /status ===
    if (pad === '/status') {
        return stuurJson(res, 200, {
            status: 'ok',
            site: SITE_NAAM,
            tabbladUrlPrefix: TABBLAD_URL_PREFIX
        });
    }

    // === /generate ===
    if (pad === '/generate') {
        const prompt = url.searchParams.get('prompt');
        const raw    = url.searchParams.get('raw') === '1';

        if (!prompt || prompt.trim().length === 0) {
            return stuurJson(res, 400, {
                status: 'ERROR',
                reden: 'Geen prompt opgegeven (gebruik ?prompt=...)'
            });
        }

        log(`📥 Verzoek: "${prompt.substring(0, 60)}"${raw ? ' (raw)' : ''}`);

        try {
            const resultaat = await inWachtrij(async () => {
                await zorgVoorVerbinding();
                return await downloadCore(prompt, page);
            });

            if (resultaat.status !== 'SUCCESS') {
                log(`❌ Mislukt: ${resultaat.reden}`);
                return stuurJson(res, 500, {
                    status: 'FAIL',
                    reden: resultaat.reden,
                    pogingen: resultaat.pogingen,
                    prompt
                });
            }

            const bestandsnaam = resultaat.bestand;
            const buffer = leesAfbeelding(bestandsnaam);

            if (!buffer) {
                log(`❌ Bestand niet gevonden: ${bestandsnaam}`);
                return stuurJson(res, 500, {
                    status: 'FAIL',
                    reden: 'BESTAND_NIET_GEVONDEN',
                    bestand: bestandsnaam,
                    prompt
                });
            }

            log(`✅ Succes: ${bestandsnaam} (${(buffer.length / 1024).toFixed(1)} KB)`);

            if (raw) {
                res.writeHead(200, {
                    'Content-Type': contentTypeVanBestandsnaam(bestandsnaam),
                    'Content-Length': buffer.length,
                    'X-Bestandsnaam': bestandsnaam
                });
                return res.end(buffer);
            }

            return stuurJson(res, 200, {
                status: 'SUCCESS',
                bestand: bestandsnaam,
                prompt,
                afbeeldingBase64: buffer.toString('base64')
            });

        } catch (error) {
            log(`❌ Serverfout: ${error.message}`);
            return stuurJson(res, 500, {
                status: 'FAIL',
                reden: 'SERVER_FOUT',
                detail: error.message,
                prompt
            });
        }
    }

    // === Onbekend pad ===
    return stuurJson(res, 404, {
        status: 'ERROR',
        reden: 'Onbekend pad',
        paden: ['/', '/client.html', '/generate?prompt=...', '/generate?prompt=...&raw=1', '/status']
    });
}

// === SERVER STARTEN ===
(async () => {
    log('🚀 Server starten');
    log(`ℹ️  Site: ${SITE_NAAM}`);
    log(`ℹ️  Luistert op http://${HOST}:${POORT}`);
    log(`ℹ️  Zorg dat Chrome draait met start_chrome.bat`);
    log('');

    try {
        await zorgVoorVerbinding();
        log('✅ Verbinding met Chrome OK');
    } catch (e) {
        log(`⚠️  Kon nog niet verbinden: ${e.message}`);
        log('   De server start wel, maar verzoeken zullen falen tot Chrome draait.');
    }

    const server = http.createServer((req, res) => {
        verwerkVerzoek(req, res).catch(err => {
            log(`❌ Onverwachte fout: ${err.message}`);
            try {
                stuurJson(res, 500, { status: 'FAIL', reden: 'INTERNE_FOUT', detail: err.message });
            } catch (e) { /* response al verzonden */ }
        });
    });

    server.listen(POORT, HOST, () => {
        log(`✅ Server luistert op http://${HOST}:${POORT}`);
        log('');
        log(`Open in de browser:  http://localhost:${POORT}/`);
        log('');
        log('Druk op Ctrl+C om te stoppen.');
    });

    process.on('SIGINT', () => {
        log('\n⏹️  Ctrl+C — server stopt');
        server.close(() => {
            log('✅ Server gestopt');
            process.exit(0);
        });
        setTimeout(() => process.exit(0), 3000);
    });
})();