/** Sonde bas niveau : charge le worker Stockfish à la main et trace tout. */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const chemins = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = chemins.find((c) => existsSync(c));
const BASE = process.argv[2] ?? 'http://localhost:4173';
const VARIANTE = process.argv[3] ?? 'stockfish-18-lite';

const navigateur = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await navigateur.newPage();
page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });

const resultat = await page.evaluate(async (variante) => {
  const journal = [];
  const js = `/engine/sf18/${variante}.js`;
  const wasm = `/engine/sf18/${variante}.wasm`;
  journal.push(`crossOriginIsolated=${globalThis.crossOriginIsolated}`);
  journal.push(`SharedArrayBuffer=${typeof SharedArrayBuffer}`);

  return await new Promise((resoudre) => {
    let worker;
    const finir = (etat) => {
      try { worker?.terminate(); } catch {}
      resoudre({ etat, journal });
    };
    const minuteur = setTimeout(() => finir('délai dépassé'), 90000);

    try {
      worker = new Worker(`${js}#${encodeURIComponent(wasm)}`);
    } catch (e) {
      clearTimeout(minuteur);
      journal.push(`création du worker impossible : ${e}`);
      return finir('échec création');
    }

    worker.onerror = (e) => {
      journal.push(`onerror: ${e.message ?? 'inconnu'} (${e.filename}:${e.lineno})`);
      clearTimeout(minuteur);
      finir('erreur worker');
    };
    worker.onmessageerror = () => journal.push('onmessageerror');

    worker.onmessage = (ev) => {
      const texte = typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data);
      journal.push(`<- ${texte.slice(0, 160)}`);
      if (texte.includes('uciok')) {
        journal.push('-> isready');
        worker.postMessage('isready');
      } else if (texte.includes('readyok')) {
        journal.push('-> go depth 8');
        worker.postMessage('position startpos');
        worker.postMessage('go depth 8');
      } else if (texte.startsWith('bestmove')) {
        clearTimeout(minuteur);
        finir('succès');
      }
    };

    journal.push('-> uci');
    worker.postMessage('uci');
  });
}, VARIANTE);

console.log('\n=== ÉTAT :', resultat.etat, '===');
for (const l of resultat.journal) console.log(l);
await navigateur.close();
