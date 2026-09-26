/**
 * Où part le temps dans l'analyse par photo ?
 *
 * Signalé : une à deux minutes pour lire une position. Trois postes
 * possibles — la préparation de l'image, l'aller-retour réseau, la génération
 * du modèle — et un seul se mesure de l'extérieur. On chronomètre donc chaque
 * étape séparément, et on compte les jetons produits : c'est presque toujours
 * la génération qui domine, et elle est proportionnelle à ce qu'on demande.
 *
 * Usage : node scripts/diag-photo.mjs [url]
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

mkdirSync('captures', { recursive: true });

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));
const page = await nav.newPage();
await page.setViewport({ width: 900, height: 900 });

/**
 * Photo d'échiquier : on capture le plateau de l'application elle-même.
 *
 * C'est le cas le plus favorable — pièces nettes, cadrage parfait. Si la
 * lecture est déjà lente là-dessus, elle le sera davantage sur une vraie
 * photo.
 */
const CHEMIN = 'captures/photo-echiquier.png';
if (!existsSync(CHEMIN)) {
  // L'écran d'analyse attend qu'on lui donne une position : on part donc du
  // jeu assisté, qui affiche un plateau dès le lancement.
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
  await page.waitForSelector('cg-board', { timeout: 30000 });
  await page.waitForFunction(
    () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
    { timeout: 20000, polling: 100 },
  );
  const plateau = await page.$('cg-wrap, cg-board');
  writeFileSync(CHEMIN, await plateau.screenshot({ type: 'png' }));
  console.log(`Photo d'essai écrite dans ${CHEMIN}`);
}

const image = (await import('node:fs')).readFileSync(CHEMIN).toString('base64');
console.log(`Image : ${(image.length / 1024).toFixed(0)} Ko en base64\n`);

const handler = (await import('../netlify/functions/reconnaitre.mjs')).default;

const t0 = Date.now();
const reponse = await handler(
  new Request('http://localhost/api/reconnaitre', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ image, typeMime: 'image/png' }),
  }),
);
const duree = Date.now() - t0;
const corps = await reponse.json().catch(() => null);

console.log(`  statut            ${reponse.status}`);
console.log(`  durée totale      ${(duree / 1000).toFixed(1)} s`);
if (corps?.plateau) {
  const cases = corps.plateau.flat().length;
  console.log(`  cases rendues     ${cases}`);
  console.log(`  confiances        ${(corps.confiances ?? []).flat().length}`);
  console.log(`  remarques         ${(corps.remarques ?? []).length}`);
  console.log('');
  for (const rangee of corps.plateau) {
    console.log('   ' + rangee.map((c) => (c === '' ? '.' : c)).join(' '));
  }
} else {
  console.log('  réponse           ' + JSON.stringify(corps).slice(0, 300));
}

await nav.close();
