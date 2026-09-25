/**
 * Le commentaire correspond-il à la position réelle ?
 *
 * Défaut signalé : à deux coups du mat, l'élève s'entendait dire que son
 * coup était bon. Un coup peut être le meilleur disponible ET la position
 * rester perdue ; le professeur doit dire les deux. Les tests unitaires
 * vérifient le générateur de phrases ; celui-ci vérifie la CHAÎNE COMPLÈTE,
 * depuis l'évaluation du moteur jusqu'au texte affiché — c'est là que
 * pourrait se cacher une inversion de signe, invisible autrement.
 *
 * Trois positions, aux deux extrêmes et sur une faute nette.
 *
 * Usage : node scripts/test-commentaires.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const CAS = [
  {
    nom: 'position perdue',
    // Roi seul contre dame : l'élève joue le seul coup raisonnable, et la
    // partie reste perdue. C'est le cas exact qui avait été signalé.
    fen: '6k1/8/8/8/8/5q2/8/6K1 w - - 0 1',
    coup: ['g1', 'h2'],
    attendu: /perdu|perdue|ne tient plus|très mauvaise|mauvaise/i,
    interdit: /bravo|excellent|parfait|très bien|bien joué|félicit/i,
    aussi: { motif: /défend|compliqu|gêne|désordre|problème|chance/i, libelle: 'dit comment se défendre' },
  },
  {
    nom: 'position gagnante',
    fen: '6k1/8/8/8/8/5Q2/8/6K1 w - - 0 1',
    // Dc3 : la dame reste hors d'atteinte du roi noir. Df7 aurait été légal
    // mais donnait la dame, ce qui changeait le cas testé.
    coup: ['f3', 'c3'],
    // Le vocabulaire de la domination, tel que les quatre professeurs
    // l'emploient : « nettement meilleure » et « simplifiez » en font
    // partie au même titre que « gagnant ».
    attendu: /gagnant|gagnante|gagné|domine|devant|largement|nettement meilleure|simplifiez|convertis/i,
    interdit: /perdue|inférieure|en difficulté/i,
  },
  {
    nom: 'dame donnée',
    // Dd2-d8 : le roi noir la prend. Faute nette, position qui redevient
    // nulle — l'étiquette doit primer sur le constat « sans conséquence ».
    fen: '4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1',
    coup: ['d2', 'd8'],
    attendu: /coûte|perd|prise|grave|erreur|faute|attention|sérieux|dommage|se retourne/i,
    interdit: /jouable mais passif|ne change pas l’appréciation/i,
  },
];

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));

/** Centre d'une case, vue des blancs. */
function centre(rect, caseSan) {
  const c = rect.width / 8;
  const f = caseSan.charCodeAt(0) - 97;
  const r = Number(caseSan[1]);
  return { x: rect.left + (f + 0.5) * c, y: rect.top + (8 - r + 0.5) * c };
}

for (const cas of CAS) {
  const page = await nav.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // La position se transmet par `sessionStorage`, exactement comme le fait
  // l'écran d'analyse quand on demande « jouer depuis cette position ».
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
  await page.evaluate((fen) => sessionStorage.setItem('echiquier.position-a-jouer', fen), cas.fen);
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2' });
  await page.reload({ waitUntil: 'networkidle2' });

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

  const rect = await page.evaluate(() => {
    const r = document.querySelector('cg-board').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width };
  });
  // Le texte d'accueil est relevé AVANT le coup : c'est le seul repère fiable
  // pour savoir qu'un verdict a remplacé la salutation. Le reconnaître par
  // une liste de phrases devenait faux dès qu'on enrichissait les registres.
  const accueil = await page.evaluate(() => {
    const scene = document.querySelector('.pp-scene');
    let n = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && n; i++) {
      const p = n.querySelector(':scope > p');
      if (p) return p.textContent?.trim() ?? '';
      n = n.parentElement;
    }
    return '';
  });

  const a = centre(rect, cas.coup[0]);
  const b = centre(rect, cas.coup[1]);
  // Glisser plutôt que deux clics : Chessground traite le glisser-déposer
  // nativement, et la sélection en deux temps se perdait quand un rendu
  // intervenait entre les deux clics.
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();

  // Le commentaire s'écrit caractère par caractère : on attend qu'il cesse
  // de grandir plutôt qu'un délai fixe, sinon on lit une phrase tronquée.
  const texte = await page
    .waitForFunction(
      (accueil) => {
        const scene = document.querySelector('.pp-scene');
        let n = scene?.parentElement ?? null;
        let courant = '';
        for (let i = 0; i < 4 && n; i++) {
          const p = n.querySelector(':scope > p');
          if (p) {
            courant = p.textContent?.trim() ?? '';
            break;
          }
          n = n.parentElement;
        }
        // Tant que le texte est celui de l'accueil, aucun verdict n'a été
        // rendu : on lirait la mauvaise réplique.
        if (courant === accueil || courant.length < 60) return false;
        if (courant === window.__dernier) return courant;
        window.__dernier = courant;
        return false;
      },
      { timeout: 120000, polling: 1200 },
      accueil,
    )
    .then((h) => h.jsonValue())
    .catch(() => '');

  console.log(`\n  ${cas.nom} — « ${texte.slice(0, 220)}${texte.length > 220 ? '…' : ''} »`);
  verifier(texte.length > 0, `[${cas.nom}] Un commentaire est produit`);
  verifier(cas.attendu.test(texte), `[${cas.nom}] Le ton suit la position`);
  verifier(!cas.interdit.test(texte), `[${cas.nom}] Rien de contradictoire`);
  if (cas.aussi) verifier(cas.aussi.motif.test(texte), `[${cas.nom}] Le professeur ${cas.aussi.libelle}`);

  await page.close();
}

await nav.close();
console.log('\n' + (echecs === 0 ? 'Commentaires : conformes à la position.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
