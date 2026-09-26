/**
 * Combien de temps le moteur calcule-t-il quand personne ne lui demande rien ?
 *
 * Signalé sur iPhone 11 : fluidité 7/10 et échauffement marqué. L'hypothèse à
 * vérifier est que le moteur tourne en continu pendant le temps de réflexion
 * du joueur, au lieu de s'arrêter une fois la position évaluée.
 *
 * On lance une partie sur un format de téléphone, on ne joue RIEN, et on
 * échantillonne l'état du moteur. S'il reste en recherche, il consomme deux
 * cœurs pour rien — et c'est la cause de la chauffe.
 *
 * Usage : node scripts/diag-chauffe.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
/** Durée d'observation, en millisecondes : un temps de réflexion ordinaire. */
const OBSERVATION = 20000;

const nav = await puppeteer.launch(optionsLancement());
const page = await nav.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
  { timeout: 60000, polling: 200 },
);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
  b?.scrollIntoView({ block: 'center' });
  b?.click();
});
await page.waitForSelector('cg-board', { timeout: 60000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 30000, polling: 100 },
);

console.log(`\nObservation de ${OBSERVATION / 1000} s, sans jouer le moindre coup.\n`);

/**
 * Deux mesures complémentaires :
 *
 *   - la profondeur annoncée, qui ne cesse de croître tant que la recherche
 *     continue ;
 *   - le temps processeur du rendu, relevé par l'outil de performance.
 */
const client = await page.target().createCDPSession();
await client.send('Performance.enable');

const lireMetriques = async () => {
  const { metrics } = await client.send('Performance.getMetrics');
  const par = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return { tacheProcesseur: par.TaskDuration ?? 0, horloge: par.Timestamp ?? 0 };
};

const debut = await lireMetriques();
const profondeurs = [];
const t0 = Date.now();
while (Date.now() - t0 < OBSERVATION) {
  const p = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/prof\.\s*(\d+)/);
    return m ? Number(m[1]) : null;
  });
  profondeurs.push({ t: Date.now() - t0, p });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
}
const fin = await lireMetriques();

const secondes = fin.horloge - debut.horloge;
const processeur = fin.tacheProcesseur - debut.tacheProcesseur;
const part = secondes > 0 ? (processeur / secondes) * 100 : 0;

console.log('   t(s)   profondeur annoncée');
console.log('   -------------------------');
for (const e of profondeurs) {
  if (e.t % 4000 < 1100) console.log(`   ${String(Math.round(e.t / 1000)).padStart(4)}   ${e.p ?? '—'}`);
}

const valides = profondeurs.map((e) => e.p).filter((p) => p !== null);
const premiere = valides[0] ?? null;
const derniere = valides[valides.length - 1] ?? null;

console.log('');
console.log(`  Profondeur au début : ${premiere ?? '—'}`);
console.log(`  Profondeur à la fin : ${derniere ?? '—'}`);
console.log(`  Temps processeur du fil de rendu : ${processeur.toFixed(1)} s sur ${secondes.toFixed(1)} s`);
console.log(`  Soit ${part.toFixed(0)} % d'un cœur, pour le seul fil principal.`);
console.log('');

if (premiere !== null && derniere !== null && derniere > premiere) {
  console.log('DIAGNOSTIC : la profondeur continue de croître alors que rien n’est demandé.');
  console.log('La recherche est INFINIE pendant le temps de réflexion du joueur : le moteur');
  console.log('occupe ses threads en continu, ce qui explique l’échauffement.');
} else if (derniere !== null) {
  console.log('DIAGNOSTIC : la profondeur se stabilise — la recherche s’arrête d’elle-même.');
} else {
  console.log('DIAGNOSTIC : aucune profondeur affichée, mesure non concluante.');
}

await nav.close();
