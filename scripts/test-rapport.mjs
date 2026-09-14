/**
 * Test de bout en bout du rapport d'analyse.
 * Injecte une partie dans IndexedDB, ouvre le rapport, et vérifie que
 * l'analyse incrémentale se déroule jusqu'au bout avec un résultat cohérent.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHEMINS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const BASE = process.argv[2] ?? 'http://localhost:4173';
const executablePath = CHEMINS.find(existsSync);

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

// Partie du berger, avec une gaffe noire évidente au 3e coup.
const COUPS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

const navigateur = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');

// Injection directe dans IndexedDB, avec le schéma utilisé par l'application.
const injecte = await page.evaluate(async (coups) => {
  return await new Promise((resoudre) => {
    const req = indexedDB.open('echiquier', 1);
    req.onupgradeneeded = () => {
      const b = req.result;
      if (!b.objectStoreNames.contains('parties')) {
        b.createObjectStore('parties', { keyPath: 'id' }).createIndex('par-date', 'date');
      }
    };
    req.onerror = () => resoudre(false);
    req.onsuccess = () => {
      const b = req.result;
      const tx = b.transaction('parties', 'readwrite');
      tx.objectStore('parties').put({
        id: 'test-rapport', date: Date.now(), mode: 'libre',
        blanc: 'Moi', noir: 'Stockfish (niveau 5)',
        resultat: '1-0', finPar: 'Échec et mat',
        fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        coupsSan: coups,
      });
      tx.oncomplete = () => resoudre(true);
      tx.onerror = () => resoudre(false);
    };
  });
}, COUPS);
verifier(injecte, 'Partie injectée dans IndexedDB');

await page.evaluate(() => { window.location.hash = '/historique'; });
await page.waitForSelector('h1');
await new Promise((r) => setTimeout(r, 800));
const dansHistorique = await page.evaluate(() => document.body.innerText.includes('Stockfish (niveau 5)'));
verifier(dansHistorique, 'Partie visible dans l’historique');

await page.evaluate(() => { window.location.hash = '/rapport/test-rapport'; });
await page.waitForSelector('cg-board', { timeout: 30000 });

// L'analyse démarre seule ; on attend la précision, produite en toute fin.
await page.waitForFunction(() => /\d+,\d\s?%/.test(document.body.innerText), {
  timeout: 300000, polling: 1000,
});

const resultat = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    precisions: [...t.matchAll(/(\d+,\d)\s?%/g)].map((m) => m[1]),
    gaffe: t.includes('Gaffe'),
    momentsCles: t.includes('Moments charnières'),
    ouverture: /C\d\d|B\d\d|A\d\d|D\d\d|E\d\d/.test(t),
    nbCoupsListes: document.querySelectorAll('ol li').length,
  };
});
verifier(resultat.precisions.length >= 2, 'Précision calculée pour les deux camps', resultat.precisions.join(' / '));
verifier(resultat.momentsCles, 'Moments charnières présents');
verifier(resultat.ouverture, 'Ouverture identifiée');

// Le graphique doit être rendu.
const graphique = await page.$('svg[role="img"]');
verifier(Boolean(graphique), 'Graphique d’évaluation rendu');

// Sélection d'un coup : le détail doit s'afficher.
const clic = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /^Nf6/.test(x.textContent?.trim() ?? ''));
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  b.click();
  return true;
});
verifier(clic, 'Sélection d’un coup dans la liste');
await new Promise((r) => setTimeout(r, 900));
const detail = await page.evaluate(() => {
  const t = document.body.innerText;
  return { aMeilleurCoup: t.includes('Le meilleur coup était'), texte: t.slice(0, 0) };
});
verifier(detail.aMeilleurCoup, 'Détail du coup avec meilleure alternative');

await page.screenshot({ path: 'captures/rapport.png', fullPage: true });

const bloquantes = erreurs.filter((e) => !/favicon|404/i.test(e));
verifier(bloquantes.length === 0, 'Aucune erreur de console', bloquantes.slice(0, 2).join(' | '));

await navigateur.close();
console.log(`\n${echecs === 0 ? 'Rapport : tous les contrôles sont passés.' : `${echecs} contrôle(s) en échec.`}`);
process.exit(echecs === 0 ? 0 : 1);
