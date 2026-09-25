/**
 * L'application démarre-t-elle SUR L'ADRESSE DÉPLOYÉE ?
 *
 * Ce test existe parce qu'il a manqué. Une politique de sécurité du contenu
 * a été ajoutée et vérifiée dans le fichier de configuration, jamais sur la
 * réponse réelle : elle bloquait les scripts en ligne du document, l'écran de
 * lancement n'était jamais retiré, et l'application restait sur
 * « Préparation… » indéfiniment. Aucun test local ne pouvait le voir — le
 * serveur de développement ne sert pas ces en-têtes.
 *
 * On charge donc l'adresse publique, on relève les en-têtes réellement
 * servis, on écoute les violations de la politique, et on exige que l'écran
 * de lancement disparaisse et que l'interface soit là.
 *
 * Usage : node scripts/test-demarrage-deploye.mjs <url>
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2];
if (!BASE) {
  console.log('Usage : node scripts/test-demarrage-deploye.mjs <url>');
  process.exit(2);
}

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement());
const page = await nav.newPage();
await page.setViewport({ width: 1280, height: 900 });

const violations = [];
const erreurs = [];
page.on('console', (m) => {
  const t = m.text();
  // Chrome signale les blocages de politique par la console : c'est la seule
  // trace exploitable côté client.
  if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 220));
  else if (m.type() === 'error') erreurs.push(t.slice(0, 220));
});
page.on('pageerror', (e) => erreurs.push(String(e?.message ?? e).slice(0, 220)));

const reponse = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const entetes = reponse?.headers() ?? {};

console.log('\n  En-têtes réellement servis :');
for (const nom of [
  'content-security-policy',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'strict-transport-security',
  'x-content-type-options',
]) {
  console.log(`    ${nom} : ${entetes[nom] ?? '(absent)'}`);
}

const csp = entetes['content-security-policy'] ?? '';
console.log('');

// --- L'application démarre-t-elle ? ---------------------------------------
const demarre = await page
  .waitForFunction(
    () => {
      const splash = document.getElementById('lancement');
      if (!splash) return document.querySelector('h1') !== null;
      // `offsetParent` vaut TOUJOURS null sur un élément `position: fixed` :
      // s'en servir donnait un faux succès, l'écran restant bien visible.
      const st = getComputedStyle(splash);
      const masque =
        st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05;
      return masque && document.querySelector('h1') !== null;
    },
    { timeout: 30000, polling: 300 },
  )
  .then(() => true)
  .catch(() => false);

verifier(demarre, 'L’écran de lancement disparaît et l’interface s’affiche');

if (!demarre) {
  const vu = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
  console.log(`       écran figé sur : ${vu}`);
}

verifier(
  violations.length === 0,
  'Aucune ressource bloquée par la politique de sécurité',
  violations.slice(0, 3).join(' | ') || 'aucune violation',
);

// --- Le moteur peut-il démarrer ? -----------------------------------------
// WebAssembly et les workers sont ce que la politique met le plus facilement
// en défaut, et sans eux l'analyse ne fonctionne pas.
verifier(/wasm-unsafe-eval/.test(csp), 'La politique autorise WebAssembly');
verifier(/worker-src[^;]*blob:/.test(csp), 'La politique autorise les workers en blob:');
verifier(/frame-ancestors 'none'/.test(csp), 'La politique interdit l’encadrement');
verifier(
  entetes['cross-origin-opener-policy'] === 'same-origin' &&
    entetes['cross-origin-embedder-policy'] === 'require-corp',
  'L’isolation multi-origine est servie',
  `${entetes['cross-origin-opener-policy']} / ${entetes['cross-origin-embedder-policy']}`,
);

const isole = await page.evaluate(() => window.crossOriginIsolated === true);
verifier(isole, 'Le contexte est isolé : Stockfish multi-thread est possible');

// --- Le garde-fou de l'écran de lancement ---------------------------------
// Il ne doit dépendre d'aucun script : c'est justement quand le script est
// bloqué qu'il sert.
const gardeFou = await page.evaluate(() => {
  const feuilles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  return /lancement-secours|@keyframes[^{]*secours/i.test(feuilles);
});
verifier(gardeFou, 'Le garde-fou de l’écran de lancement est en CSS, pas en JavaScript');

// --- Le moteur tourne-t-il vraiment sous cette politique ? ----------------
// Vérifier que la politique AUTORISE WebAssembly ne prouve pas que le moteur
// démarre : il charge un worker, un module WASM et un réseau de neurones.
// Seule une partie réelle le prouve.
await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
  { timeout: 60000, polling: 300 },
).catch(() => {});
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
  b?.scrollIntoView({ block: 'center' });
  b?.click();
});
const plateau = await page
  .waitForFunction(() => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100, {
    timeout: 60000,
    polling: 200,
  })
  .then(() => true)
  .catch(() => false);
verifier(plateau, 'Une partie se lance et l’échiquier s’affiche');

if (plateau) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const rect = await page.evaluate(() => {
    const b = document.querySelector('cg-board').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width };
  });
  const c = rect.width / 8;
  const pt = (sq) => ({
    x: rect.left + (sq.charCodeAt(0) - 97 + 0.5) * c,
    y: rect.top + (8 - Number(sq[1]) + 0.5) * c,
  });
  const a = pt('e2');
  const b = pt('e4');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();

  const moteurRepond = await page
    .waitForFunction(() => /Coups joués|1\. e4|Évaluation|réfléchit/i.test(document.body.innerText), {
      timeout: 120000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);
  verifier(moteurRepond, 'Le moteur démarre et la partie avance');
}

verifier(erreurs.length === 0, 'Aucune erreur de console', erreurs.slice(0, 2).join(' | ') || 'aucune');

await nav.close();
console.log('\n' + (echecs === 0 ? 'Démarrage déployé : conforme.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
