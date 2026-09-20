/**
 * Vérifie le fonctionnement hors ligne.
 *
 * Scénario réel : on ouvre l'application, on laisse le service worker
 * s'installer, on utilise le moteur une fois pour qu'il soit mis en cache,
 * puis on coupe le réseau et on recharge. Tout ce qui ne dépend pas du
 * réseau — jeu, analyse, historique — doit continuer à fonctionner.
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement, trouverNavigateur } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4173';

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

const navigateur = await puppeteer.launch(optionsLancement());
const page = await navigateur.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

page.on('requestfailed', (r) => {
  console.log('       [requête échouée]', r.url().replace(BASE, ''), '—', r.failure()?.errorText);
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('       [console]', m.text().slice(0, 250));
});
page.on('pageerror', (e) => console.log('       [pageerror]', String(e?.message ?? e).slice(0, 250)));

const cliquer = (p) =>
  page.evaluate((src) => {
    const test = new Function('t', 'return (' + src + ')(t);');
    const b = [...document.querySelectorAll('button')].find((x) => test(x.textContent?.trim() ?? ''));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, p);

// --- 1. Première visite : installation du service worker ---
await page.goto(BASE + '/#/', { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');

const swPret = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const r = await navigator.serviceWorker.ready;
    return Boolean(r.active);
  } catch {
    return false;
  }
});
verifier(swPret, 'Service worker installé et actif');

// --- 2. Utilisation du moteur, pour le mettre en cache ---
await page.evaluate(() => {
  window.location.hash = '/diagnostic';
});
await page.waitForFunction(() => document.body.innerText.includes('Diagnostic'), { timeout: 15000, polling: 200 });
await new Promise((r) => setTimeout(r, 600));
verifier(await cliquer("(t) => t === 'Tester'"), 'Lancement du moteur');
await page.waitForFunction(
  () => /Le moteur a répondu|Échec :/.test(document.body.innerText),
  { timeout: 180000, polling: 1000 },
);
const enLigne = await page.evaluate(() => {
  const m = document.body.innerText.match(/Le moteur a répondu[^\n]*/);
  return m ? m[0] : '';
});
verifier(Boolean(enLigne), 'Moteur fonctionnel en ligne', enLigne);

// Laisse le service worker finir d'écrire le moteur dans son cache.
await new Promise((r) => setTimeout(r, 2500));
const enCache = await page.evaluate(async () => {
  const noms = await caches.keys();
  for (const n of noms) {
    const c = await caches.open(n);
    const clefs = await c.keys();
    if (clefs.some((k) => k.url.includes('/engine/sf18/') && k.url.endsWith('.wasm'))) return n;
  }
  return null;
});
verifier(Boolean(enCache), 'Binaire du moteur mis en cache', enCache ?? 'absent');

// --- 3. Coupure du réseau ---
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 20000 });

const horsLigne = await page.evaluate(() => ({
  enLigne: navigator.onLine,
  titre: document.querySelector('h1')?.textContent ?? '',
  aContenu: document.body.innerText.length > 200,
}));
verifier(!horsLigne.enLigne, 'Navigateur bien hors ligne');

const etatIso = await page.evaluate(async () => {
  const noms = await caches.keys();
  const urls = [];
  for (const n of noms) {
    const c = await caches.open(n);
    for (const k of await c.keys()) if (k.url.includes('/engine/')) urls.push(k.url.split('/').pop());
  }
  return { isole: globalThis.crossOriginIsolated === true, sab: typeof SharedArrayBuffer, urls };
});
console.log('       isolation hors ligne :', JSON.stringify(etatIso));
verifier(Boolean(horsLigne.titre), 'Application rendue hors ligne', horsLigne.titre);

// --- 4. Jouer une partie hors ligne ---
await page.evaluate(() => {
  window.location.hash = '/libre';
});
await page.waitForFunction(() => document.body.innerText.includes('Partie libre'), { timeout: 15000, polling: 200 });
await new Promise((r) => setTimeout(r, 400));
verifier(await cliquer("(t) => t.includes('Commencer la partie')"), 'Démarrage d’une partie hors ligne');
await page.waitForSelector('cg-board', { timeout: 20000 });
const pieces = await page.$$eval('cg-board piece', (p) => p.length);
verifier(pieces === 32, 'Échiquier rendu hors ligne', `${pieces} pièces`);

// --- 5. Le moteur doit répondre depuis le cache ---
await page.evaluate(() => {
  window.location.hash = '/diagnostic';
});
await page.waitForFunction(() => document.body.innerText.includes('Diagnostic'), { timeout: 15000, polling: 200 });
await new Promise((r) => setTimeout(r, 600));
verifier(await cliquer("(t) => t === 'Tester'"), 'Relance du moteur hors ligne');
await page.waitForFunction(
  () => /Le moteur a répondu|Échec :/.test(document.body.innerText),
  { timeout: 180000, polling: 1000 },
);
const resultatHL = await page.evaluate(() => {
  const m = document.body.innerText.match(/(Le moteur a répondu[^\n]*|Échec :[^\n]*)/);
  return m ? m[0] : '';
});
verifier(resultatHL.startsWith('Le moteur a répondu'), 'Stockfish répond hors ligne', resultatHL);

await page.screenshot({ path: 'captures/hors-ligne.png', fullPage: true });

await navigateur.close();
console.log('\n' + (echecs === 0 ? 'Hors ligne : tous les contrôles sont passés.' : echecs + ' contrôle(s) en échec.'));
process.exit(echecs === 0 ? 0 : 1);
