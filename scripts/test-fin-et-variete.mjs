/**
 * Fin de partie et absence de répétition d'une partie à l'autre.
 *
 * Deux défauts signalés, vérifiés ici sur le produit :
 *
 *  1. Une fois le mat tombé, le professeur continuait à commenter comme si la
 *     partie se poursuivait. Il doit maintenant dire l'issue, le coup qui a
 *     fait basculer la partie, et ce qu'il faut en retenir.
 *
 *  2. En rejouant plusieurs fois avec le même professeur, l'accueil, les
 *     commentaires et la conclusion revenaient à l'identique. La mémoire des
 *     tournures persiste désormais entre les parties.
 *
 * Usage : node scripts/test-fin-et-variete.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
/**
 * Position de mat en un, jouée par l'élève.
 *
 * Le mat du berger avait été essayé d'abord : il ne passe évidemment pas
 * contre un moteur, qui se défend. La partie ne se terminait donc jamais et
 * le discours de fin n'était pas exercé. Ici, la tour en a8 est mat
 * immédiat — roi en g8, pions f7, g7 et h7 lui bouchent la fuite.
 */
const POSITION = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
const COUP_DE_MAT = [['a1', 'a8']];

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 600_000 }));
const page = await nav.newPage();
// Fenêtre explicite : sans elle, la fenêtre par défaut de 800 x 600 laisse
// l'échiquier sous la ligne de flottaison et les clics tombent à côté.
await page.setViewport({ width: 1280, height: 900 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

/** Texte actuellement affiché dans la carte du professeur. */
const lireCommentaire = () =>
  page.evaluate(() => {
    // On part du portrait et on remonte : le commentaire est le paragraphe
    // voisin, dans la même rangée. Chercher une classe « carte » ne marchait
    // pas, le composant ne porte pas ce nom dans son balisage.
    const scene = document.querySelector('.pp-scene');
    let noeud = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && noeud; i++) {
      const p = noeud.querySelector(':scope > p');
      if (p) return p.textContent?.trim() ?? '';
      noeud = noeud.parentElement;
    }
    return '';
  });

/** Attend que le commentaire cesse de grandir : la frappe est terminée. */
async function commentaireStable(minimum = 40) {
  let dernier = '';
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const courant = await lireCommentaire();
    if (courant.length >= minimum && courant === dernier) return courant;
    dernier = courant;
  }
  return dernier;
}

async function jouerUnePartie(numero) {
  // La position se transmet par `sessionStorage`, comme le fait l'écran
  // d'analyse avec « jouer depuis cette position ».
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate((fen) => sessionStorage.setItem('echiquier.position-a-jouer', fen), POSITION);
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
  // Rechargement : revenir sur la même adresse ne remonte pas l'écran, et la
  // partie précédente resterait en place.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Jouer les blancs'),
    { timeout: 30000, polling: 200 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Jouer les blancs');
    b.scrollIntoView({ block: 'center' });
    b.click();
  });
  await page.waitForSelector('cg-board', { timeout: 30000 });
  await page.waitForFunction(
    () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
    { timeout: 20000, polling: 100 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));

  const salutation = await commentaireStable(30);

  for (const [de, vers] of COUP_DE_MAT) {
    await page.waitForFunction(() => !/réfléchit/.test(document.body.innerText), {
      timeout: 120000,
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
    // Glisser plutôt que cliquer deux fois : Chessground traite le
    // glisser-déposer nativement, et la sélection en deux temps se perdait
    // quand un rendu intervenait entre les deux clics.
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    // Un coup jugé fautif met la partie en pause : on garde le coup pour
    // avancer, c'est le déroulement qui nous intéresse ici.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /Garder le coup|Continuer/i.test(x.textContent ?? ''),
      );
      b?.click();
    });
  }

  const finAtteinte = await page
    .waitForFunction(() => /Partie terminée/i.test(document.body.innerText), {
      timeout: 120000,
      polling: 400,
    })
    .then(() => true)
    .catch(() => false);

  const conclusion = await commentaireStable(40);
  console.log(`\n  --- partie ${numero} ---`);
  console.log(`  accueil    : ${salutation.slice(0, 110)}`);
  console.log(`  conclusion : ${conclusion.slice(0, 160)}`);
  return { salutation, conclusion, finAtteinte };
}

const parties = [];
for (let i = 1; i <= 3; i++) parties.push(await jouerUnePartie(i));

console.log('');
verifier(
  parties.every((p) => p.finAtteinte),
  'La partie se termine bien par un mat',
);

// --- Le professeur parle-t-il de la partie ACHEVÉE ? ----------------------
const motsDeFin = /gagn|victoire|partie est à vous|bravo|retenez|méthode|maîtrise/i;
verifier(
  parties.every((p) => motsDeFin.test(p.conclusion)),
  'La conclusion parle de la partie terminée',
  parties.map((p) => p.conclusion.slice(0, 40)).join(' | '),
);
verifier(
  parties.every((p) => p.conclusion !== p.salutation),
  'La conclusion n’est pas restée sur l’accueil',
);

// --- Répétition d'une partie à l'autre ------------------------------------
const accueils = parties.map((p) => p.salutation);
const conclusions = parties.map((p) => p.conclusion);
verifier(
  new Set(accueils).size === accueils.length,
  'Trois parties, trois accueils différents',
  accueils.map((a) => a.slice(0, 30)).join(' | '),
);
verifier(
  new Set(conclusions).size === conclusions.length,
  'Trois parties, trois conclusions différentes',
  conclusions.map((a) => a.slice(0, 30)).join(' | '),
);

await nav.close();
console.log('\n' + (echecs === 0 ? 'Fin de partie et variété : conformes.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
