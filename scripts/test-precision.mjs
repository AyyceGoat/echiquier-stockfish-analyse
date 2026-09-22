/**
 * Vérifie que la précision et l'Elo estimé discriminent réellement.
 *
 * Le défaut corrigé : la précision était une moyenne arithmétique des
 * précisions par coup. Dans une partie ordinaire, l'immense majorité des
 * coups sont forcés ou évidents et valent 100 % ; deux gaffes noyées dans
 * soixante coups parfaits laissaient la moyenne au-dessus de 95 %. D'où des
 * parties jouées sans attention notées 96 %.
 *
 * On analyse ici trois parties réelles, de qualités volontairement très
 * différentes, et on exige que les notes les séparent. Une partie jouée
 * n'importe comment DOIT tomber nettement, sinon le calcul ne sert à rien.
 *
 * Usage : node scripts/test-precision.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4180';

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

/**
 * Trois parties, en SAN.
 *
 * `catastrophe` est jouée n'importe comment des deux côtés : pions de bord,
 * pièces qui reviennent, cadeaux. C'est le cas que l'ancienne formule notait
 * encore au-dessus de 90 %.
 */
const PARTIES = {
  solide: [
    'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7',
    'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5', 'Bc2', 'c5',
    'd4', 'Qc7', 'Nbd2', 'cxd4', 'cxd4', 'Nc6', 'Nb3', 'a5',
  ],
  moyenne: [
    'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5',
    'd4', 'exd4', 'O-O', 'd6', 'Qb3', 'Qf6', 'e5', 'Qg6', 'Re1', 'Nge7',
    'Ba3', 'b5', 'Qxb5', 'Rb8', 'Qa4', 'Bb6', 'Nbd2', 'Bb7',
  ],
  catastrophe: [
    'a4', 'h5', 'h4', 'a5', 'Ra3', 'Rh6', 'Rg3', 'Rb6', 'Rg6', 'Rxg6',
    'Nh3', 'Rg3', 'Rh2', 'Rxh3', 'Rxh3', 'Nf6', 'Rg3', 'Ne4', 'Rg6', 'Nf6',
    'Na3', 'Ne4', 'Nb5', 'Nf6', 'Nxc7', 'Qxc7', 'Rg3', 'Qc3',
  ],
};

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });

const resultats = {};

for (const [nom, coupsSan] of Object.entries(PARTIES)) {
  // On injecte la partie dans IndexedDB puis on ouvre son rapport : c'est le
  // chemin réel de l'application, analyse comprise.
  const id = await page.evaluate(
    async (coupsSan, nom) => {
      const { enregistrerPartie, nouvelIdentifiant } = await import('/src/db/parties.ts');
      const id = nouvelIdentifiant();
      await enregistrerPartie({
        id,
        date: Date.now(),
        mode: 'libre',
        blanc: `Blancs ${nom}`,
        noir: `Noirs ${nom}`,
        resultat: '*',
        finPar: 'test',
        fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        coupsSan,
      });
      return id;
    },
    coupsSan,
    nom,
  );

  await page.goto(`${BASE}/#/rapport/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
  // Rechargement obligatoire : une navigation qui ne change que le fragment
  // reste dans le même document, si bien que le rapport PRÉCÉDENT restait à
  // l'écran et les trois parties rendaient les mêmes chiffres.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  // On attend la partie ATTENDUE, pas n'importe quel pourcentage.
  await page.waitForFunction(
    (attendu) => document.body.innerText.includes(attendu),
    { timeout: 60000, polling: 300 },
    `Blancs ${nom}`,
  );
  await page.waitForFunction(
    () => /\d+,\d+\s*%/.test(document.body.innerText),
    { timeout: 600000, polling: 1000 },
  );
  // Laisse l'analyse aller jusqu'au bout avant de lire les chiffres.
  await page.waitForFunction(
    () => !/Analyse en cours|Interrompre/i.test(document.body.innerText),
    { timeout: 600000, polling: 1000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));

  const lu = await page.evaluate(() => {
    const t = document.body.innerText;
    const precisions = [...t.matchAll(/(\d+,\d+)\s*%/g)].map((m) => Number(m[1].replace(',', '.')));
    const elos = [...t.matchAll(/~(\d+)\s*Elo/g)].map((m) => Number(m[1]));
    const pertes = [...t.matchAll(/(\d+)\s*cp perdus/g)].map((m) => Number(m[1]));
    return { precisions, elos, pertes };
  });

  resultats[nom] = lu;
  console.log(
    `${nom.padEnd(12)} précision ${lu.precisions.join(' / ')} %   ` +
      `Elo ${lu.elos.join(' / ')}   perte ${lu.pertes.join(' / ')} cp`,
  );
}

console.log('');

const moy = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const pSolide = moy(resultats.solide.precisions);
const pMoyenne = moy(resultats.moyenne.precisions);
const pCatastrophe = moy(resultats.catastrophe.precisions);

verifier(
  pCatastrophe < 70,
  'Une partie jouée n’importe comment tombe nettement',
  `${pCatastrophe.toFixed(1)} % (l’ancienne formule la laissait au-dessus de 90 %)`,
);
verifier(
  pSolide > pCatastrophe + 15,
  'Une partie solide se distingue nettement d’une catastrophe',
  `${pSolide.toFixed(1)} % contre ${pCatastrophe.toFixed(1)} %`,
);
verifier(
  pSolide >= pMoyenne - 2,
  'L’ordre des trois parties est respecté',
  `solide ${pSolide.toFixed(1)} ≥ moyenne ${pMoyenne.toFixed(1)}`,
);
verifier(
  resultats.catastrophe.elos.length === 2 && resultats.solide.elos.length === 2,
  'Un Elo estimé est affiché pour les deux camps',
);
verifier(
  moy(resultats.catastrophe.elos) < moy(resultats.solide.elos),
  'L’Elo estimé suit la qualité de jeu',
  `${moy(resultats.catastrophe.elos).toFixed(0)} contre ${moy(resultats.solide.elos).toFixed(0)}`,
);

await nav.close();
console.log(
  '\n' +
    (echecs === 0
      ? 'Précision : tous les contrôles sont passés.'
      : `${echecs} contrôle(s) en échec.`),
);
process.exit(echecs === 0 ? 0 : 1);
