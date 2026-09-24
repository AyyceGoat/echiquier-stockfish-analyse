/**
 * Pourquoi les premières prises de parole sont-elles muettes ?
 *
 * Signalé : la bouche ne bouge qu'à partir de la troisième réplique. Trois
 * causes possibles, et ce script les départage au lieu de deviner :
 *
 *  1. l'état d'animation ne démarre pas (`parle` faux, intervalle non posé) ;
 *  2. l'opacité bascule bien, mais les pastilles ne sont pas encore
 *     téléchargées : on affiche une image vide, donc rien ne bouge ;
 *  3. l'image est chargée mais pas décodée au moment du premier basculement.
 *
 * On échantillonne, pendant la toute première réplique, l'opacité de chaque
 * pastille ET son état de chargement.
 *
 * Usage : node scripts/diag-bouches.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

const nav = await puppeteer.launch(optionsLancement());
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

// Cache vide : c'est la première visite qu'il faut reproduire, pas la
// troisième, où tout est déjà en mémoire.
const client = await page.target().createCDPSession();
await client.send('Network.clearBrowserCache');
await page.setCacheEnabled(false);

await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
  { timeout: 30000, polling: 200 },
);

// On relève AVANT de lancer la partie : le portrait de la carte de choix est
// déjà là, mais les pastilles n'appartiennent qu'à l'écran de jeu.
const avant = await page.evaluate(() => ({
  pastilles: document.querySelectorAll('.pp-bouche').length,
}));
console.log(`Avant la partie : ${avant.pastilles} pastille(s) dans le document\n`);

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
  b.scrollIntoView({ block: 'center' });
  b.click();
});
await page.waitForSelector('.pp-scene', { timeout: 30000 });

/**
 * Trois répliques successives, mesurées sur ce qui est RÉELLEMENT rendu.
 *
 * L'opacité bascule bien dès la première : ce n'est donc ni l'état ni le
 * chargement. Reste une piste que seul le rendu peut confirmer — le fil
 * principal est saturé par le démarrage du moteur pendant les premières
 * secondes, et l'intervalle de 115 ms est alors famélique. On mesure donc
 * l'écart réel entre deux changements, et le nombre d'états distincts vus.
 */
async function observerReplique(page, libelle) {
  const r = await page.evaluate(async () => {
    const debut = performance.now();
    const vus = [];
    let dernier = null;
    let dernierT = debut;
    let ecartMax = 0;
    // 3,5 s : une réplique dure le temps de sa frappe, 18 ms par caractère.
    while (performance.now() - debut < 3500) {
      const scene = document.querySelector('.pp-scene');
      if (!scene?.classList.contains('pp-parle') && vus.length > 0) break;
      const etat = [...document.querySelectorAll('.pp-bouche')]
        .map((im) => (Number(im.style.opacity || '0') > 0.5 ? '1' : '0'))
        .join('');
      if (etat !== dernier) {
        const t = performance.now();
        if (dernier !== null) ecartMax = Math.max(ecartMax, t - dernierT);
        dernierT = t;
        dernier = etat;
        vus.push(etat);
      }
      await new Promise((res) => requestAnimationFrame(res));
    }
    return { vus, ecartMax: Math.round(ecartMax), duree: Math.round(performance.now() - debut) };
  });
  const distincts = new Set(r.vus).size;
  console.log(
    `  ${libelle.padEnd(22)} ${String(r.vus.length).padStart(3)} changements, ` +
      `${distincts} états distincts, écart max ${String(r.ecartMax).padStart(4)} ms, ` +
      `durée ${r.duree} ms`,
  );
  return r;
}

console.log('');
console.log('  réplique                changements   états   écart max entre deux');
console.log('  --------------------------------------------------------------------');
const r1 = await observerReplique(page, 'salutation');

// Deux coups joués, donc deux répliques de plus.
for (const [de, vers, libelle] of [
  ['e2', 'e4', 'après 1. e4'],
  ['g1', 'f3', 'après 2. Cf3'],
]) {
  await page.waitForFunction(() => !/réfléchit/.test(document.body.innerText), {
    timeout: 60000,
    polling: 300,
  }).catch(() => {});
  const rect = await page.evaluate(() => {
    const b = document.querySelector('cg-board').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width };
  });
  const c = rect.width / 8;
  const pt = (sq) => ({
    x: rect.left + (sq.charCodeAt(0) - 97 + 0.5) * c,
    y: rect.top + (8 - Number(sq[1]) + 0.5) * c,
  });
  const a = pt(de);
  const b = pt(vers);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForFunction(() => document.querySelector('.pp-scene')?.classList.contains('pp-parle'), {
    timeout: 60000,
    polling: 100,
  }).catch(() => {});
  await observerReplique(page, libelle);
}

console.log('');
if (r1.ecartMax > 400) {
  console.log(
    `DIAGNOSTIC : pendant la première réplique, jusqu'à ${r1.ecartMax} ms séparent deux`,
  );
  console.log(
    "changements de bouche, alors que l'intervalle demandé est de 115 ms. Le fil",
  );
  console.log(
    'principal est saturé — le moteur démarre au même moment — et l’animation est',
  );
  console.log('avalée. Elle ne redevient fluide qu’une fois le démarrage terminé.');
} else if (new Set(r1.vus).size <= 1) {
  console.log('DIAGNOSTIC : aucun changement d’état pendant la première réplique.');
} else {
  console.log('DIAGNOSTIC : la première réplique s’anime normalement.');
}

await nav.close();
