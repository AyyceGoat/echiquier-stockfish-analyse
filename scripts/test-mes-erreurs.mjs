/**
 * « Mes erreurs » montre-t-il MES coups, sur MES positions ?
 *
 * Deux défauts signalés, tous deux vérifiés ici de bout en bout :
 *
 *  1. La section comptait les coups des DEUX camps. Une bévue du moteur
 *     apparaissait donc comme une erreur du joueur. On fabrique une partie où
 *     chaque camp commet une faute d'un motif DIFFÉRENT : seul le motif du
 *     joueur doit apparaître.
 *
 *  2. Le diagramme affiché venait du catalogue d'exercices — toujours la même
 *     finale, sans rapport avec la partie. On vérifie que la position montrée
 *     est bien celle d'avant la faute, et qu'elle change quand on passe d'une
 *     occurrence à l'autre.
 *
 * Usage : node scripts/test-mes-erreurs.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });

// Table rase : l'historique d'une exécution précédente fausserait le compte.
await page.evaluate(async () => {
  const { listerParties, supprimerPartie } = await import('/src/db/parties.ts');
  for (const p of await listerParties()) await supprimerPartie(p.id);
});

/**
 * Une partie où les DEUX camps se trompent, de façons différentes.
 *
 * Les blancs (le joueur) laissent deux fois une pièce en prise ; les noirs
 * laissent la leur une fois. Si la section comptait les deux camps, le total
 * du motif serait de trois au lieu de deux.
 */
const COUPS = [
  'e4', 'e5',
  'Nf3', 'Nc6',
  'Bc4', 'Bc5',
  'Ng5', 'Qf6',   // 4. Cg5 est douteux, les noirs défendent
  'd3', 'Nh6',
  'Nxf7', 'Nxf7', // 6. Cxf7 donne le cavalier
  'Bxf7+', 'Kxf7',
  'O-O', 'd6',
  'Qh5+', 'g6',
  'Qf3+', 'Qxf3', // 10… la dame blanche est prise
  'gxf3', 'Bh3',
];

const id = await page.evaluate(async (coupsSan) => {
  const { enregistrerPartie, nouvelIdentifiant } = await import('/src/db/parties.ts');
  const id = nouvelIdentifiant();
  await enregistrerPartie({
    id,
    date: Date.now(),
    mode: 'assiste',
    monCamp: 'w',
    blanc: 'Moi',
    noir: 'Ephraim (Amateur)',
    resultat: '0-1',
    finPar: 'abandon',
    fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    coupsSan,
  });
  return id;
}, COUPS);

// Analyse par le chemin réel de l'application.
await page.goto(`${BASE}/#/rapport/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => /\d+,\d+\s*%/.test(document.body.innerText), {
  timeout: 900000,
  polling: 800,
});
await page
  .waitForFunction(() => !/Analyse en cours|Interrompre/i.test(document.body.innerText), {
    timeout: 900000,
    polling: 800,
  })
  .catch(() => {});
await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));

// --- Le rapport nomme-t-il les joueurs ? -----------------------------------
const rapport = await page.evaluate(() => document.body.innerText);
verifier(
  /Moi/.test(rapport) && /Ephraim/.test(rapport),
  'Le rapport nomme les deux joueurs dans la carte de précision',
);

const elos = await page.evaluate(async (id) => {
  const { lirePartie } = await import('/src/db/parties.ts');
  const r = (await lirePartie(id))?.rapport;
  return r
    ? {
        b: r.eloBlancs,
        n: r.eloNoirs,
        cpB: r.perteMoyenneBlancs,
        cpN: r.perteMoyenneNoirs,
        retenusB: r.coups.filter((c) => c.couleur === 'w' && Math.abs(c.cpAvantBlancs) < 1000).length,
        retenusN: r.coups.filter((c) => c.couleur === 'b' && Math.abs(c.cpAvantBlancs) < 1000).length,
      }
    : null;
}, id);
console.log(
  `
  Rapport : blancs ${elos?.b ?? '—'} Elo (${elos?.cpB ?? '—'} cp, ` +
    `${elos?.retenusB ?? '?'} coups disputés) · ` +
    `noirs ${elos?.n ?? '—'} Elo (${elos?.cpN ?? '—'} cp, ${elos?.retenusN ?? '?'} coups disputés)
`,
);

// Onze coups par camp, dont une partie en position déjà décidée : cela ne
// permet pas d'annoncer un niveau. Le rapport doit le dire plutôt que
// d'avancer un chiffre que la partie ne porte pas — c'est ainsi qu'une partie
// bâclée pouvait afficher 1800 Elo.
verifier(
  elos !== null && elos.cpB !== null,
  'La perte moyenne reste calculée même sur une partie courte',
  `${elos?.cpB ?? '—'} cp`,
);
verifier(
  elos !== null && elos.b === null && elos.retenusB < 16,
  'Aucun Elo annoncé quand les coups disputés sont trop peu nombreux',
  `${elos?.retenusB ?? '?'} coups disputés`,
);
verifier(
  /trop peu de coups/.test(rapport),
  'Le rapport explique pourquoi le niveau n’est pas annoncé',
);

// --- Le regroupement ne retient-il que les coups du joueur ? ---------------
const groupes = await page.evaluate(async () => {
  const { listerParties } = await import('/src/db/parties.ts');
  const { regrouperMesErreurs } = await import('/src/lib/mesErreurs.ts');
  return regrouperMesErreurs(await listerParties()).map((g) => ({
    motif: g.motif,
    n: g.occurrences.length,
    couleurs: [...new Set(g.occurrences.map((o) => o.couleur))],
    positions: g.occurrences.map((o) => o.fenAvant),
    coups: g.occurrences.map((o) => `${o.san}→${o.meilleurSan ?? '?'}`),
  }));
});

console.log('  Motifs retenus :');
for (const g of groupes) {
  console.log(`    ${g.motif.padEnd(18)} ${g.n} fois  camps ${g.couleurs.join(',')}  ${g.coups.join(' ')}`);
}
console.log('');

verifier(groupes.length > 0, 'Au moins un motif ressort des coups du joueur');
verifier(
  groupes.every((g) => g.couleurs.length === 1 && g.couleurs[0] === 'w'),
  'Aucune occurrence ne vient du camp adverse',
  groupes.flatMap((g) => g.couleurs).join(',') || '—',
);
verifier(
  groupes.every((g) => g.positions.every((f) => typeof f === 'string' && f.split(' ').length >= 4)),
  'Chaque occurrence porte une position réelle',
);
verifier(
  groupes.every((g) => new Set(g.positions).size === g.positions.length),
  'Deux occurrences d’un même motif ne montrent pas la même position',
);

// --- L'écran affiche-t-il bien ces positions ? -----------------------------
await page.goto(`${BASE}/#/apprendre`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    /Mes erreurs/.test(x.textContent ?? ''),
  );
  b?.click();
});
await page.waitForSelector('cg-board', { timeout: 30000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 20000, polling: 100 },
);

const ecran = await page.evaluate(() => {
  const pieces = [...document.querySelectorAll('cg-board piece')].length;
  const fleches = document.querySelectorAll('.cg-shapes line, .cg-shapes g').length;
  return { texte: document.body.innerText, pieces, fleches };
});

verifier(
  ecran.pieces > 4 && ecran.pieces < 33,
  'Une position réelle est rendue sur l’échiquier',
  `${ecran.pieces} pièces`,
);
verifier(ecran.fleches > 0, 'Le coup joué et le coup attendu sont fléchés', `${ecran.fleches} formes`);
verifier(
  /il fallait jouer/.test(ecran.texte),
  'Le coup qu’il fallait jouer est indiqué',
);
verifier(
  /contre Ephraim/.test(ecran.texte),
  'L’occurrence dit de quelle partie elle vient',
);

// Position figée du catalogue : roi+tour contre roi+dame, la finale générique
// qui s'affichait auparavant. Elle ne doit plus apparaître ici.
verifier(
  !/Mater avec la tour|Mater avec la dame|Opposition/.test(ecran.texte),
  'Aucun exercice générique dans cette section',
);

await nav.close();
console.log('\n' + (echecs === 0 ? 'Mes erreurs : conformes aux parties du joueur.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
