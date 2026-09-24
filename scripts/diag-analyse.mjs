/**
 * L'analyse attribue-t-elle correctement perte et précision, coup par coup ?
 *
 * Le banc de paliers a montré des valeurs incohérentes DANS UNE MÊME partie :
 * un camp à 29 cp de perte moyenne noté 58 % de précision, l'autre à 42 cp
 * noté 88 %. Une perte plus faible ne peut pas donner une précision plus
 * basse : l'une des deux mesures est mal attribuée, ou mal calculée.
 *
 * Ce script analyse une partie CONNUE, où les blancs jouent proprement et les
 * noirs se sabordent, puis imprime chaque coup : évaluation avant, après,
 * perte retenue, précision. Aucune génération de partie, aucun palier — on
 * regarde uniquement la chaîne d'analyse.
 *
 * Usage : node scripts/diag-analyse.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

/**
 * Les noirs donnent successivement un cavalier, un fou et la dame. Les blancs
 * se contentent de prendre. Aucune ambiguïté possible sur qui joue mal.
 */
const COUPS = [
  'a3', 'Nc6',
  'a4', 'b5',
  'axb5', 'Rb8',
  'b6', 'Ba6',
  'b7', 'Qc8',
  'bxc8=Q+', 'Nd8',
  'Qxc7', 'Rc8',
  'Qe5', 'Rc7',
  'Qxc7', 'Ne6',
  'Qb8+', 'Bc8',
  'Qxc8+', 'Nd8',
  'Qc7', 'Nc6',
  'Qc8+', 'Nd8',
  'Qc7', 'Nc6',
  'Qc8+', 'Nd8',
];

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
const page = await nav.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });

// Légalité vérifiée AVANT d'analyser. Une suite invalide faisait échouer
// l'analyse en silence, et le script attendait quinze minutes un
// pourcentage qui ne viendrait jamais — quinze minutes perdues deux fois.
const illegal = await page.evaluate(async (coupsSan) => {
  const { Chess } = await import('/src/lib/bancEssai.ts');
  const j = new Chess();
  for (const [i, san] of coupsSan.entries()) {
    try {
      j.move(san);
    } catch {
      return `demi-coup ${i + 1} : ${san}`;
    }
  }
  return null;
}, COUPS);
if (illegal) {
  console.log(`Suite de coups invalide — ${illegal}`);
  await nav.close();
  process.exit(1);
}

const id = await page.evaluate(async (coupsSan) => {
  const { enregistrerPartie, nouvelIdentifiant } = await import('/src/db/parties.ts');
  const id = nouvelIdentifiant();
  await enregistrerPartie({
    id,
    date: Date.now(),
    mode: 'libre',
    blanc: 'Blancs-propres',
    noir: 'Noirs-sabordent',
    resultat: '*',
    finPar: 'diagnostic',
    fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    coupsSan,
  });
  return id;
}, COUPS);

await page.goto(`${BASE}/#/rapport/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await page
  .waitForFunction(() => /\d+,\d+\s*%/.test(document.body.innerText), {
    timeout: 180000,
    polling: 500,
  })
  .catch(async () => {
    const vu = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
    console.log('Aucun pourcentage affiché. Écran :');
    console.log(vu);
    await nav.close();
    process.exit(1);
  });
await page
  .waitForFunction(() => !/Analyse en cours|Interrompre/i.test(document.body.innerText), {
    timeout: 900000,
    polling: 800,
  })
  .catch(() => {});
await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));

const r = await page.evaluate(async (id) => {
  const { lirePartie } = await import('/src/db/parties.ts');
  const rap = (await lirePartie(id))?.rapport;
  if (!rap) return null;
  return {
    coups: rap.coups.map((c) => ({
      ply: c.ply,
      san: c.san,
      couleur: c.couleur,
      // Évaluations telles que stockées, du point de vue des BLANCS.
      avantB: c.cpAvantBlancs,
      apresB: c.cpApresBlancs,
      perte: c.perteCp,
      precision: c.precision,
      classement: c.classement,
    })),
    precisionBlancs: rap.precisionBlancs,
    precisionNoirs: rap.precisionNoirs,
    cpBlancs: rap.perteMoyenneBlancs,
    cpNoirs: rap.perteMoyenneNoirs,
    eloBlancs: rap.eloBlancs,
    eloNoirs: rap.eloNoirs,
  };
}, id);

if (!r) {
  console.log('Rapport illisible.');
  await nav.close();
  process.exit(1);
}

console.log('');
console.log('  coup        camp   éval avant   éval après   perte   précision   classement');
console.log('  ------------------------------------------------------------------------------');
for (const c of r.coups) {
  console.log(
    `  ${(Math.floor(c.ply / 2) + 1 + (c.couleur === 'w' ? '. ' : '… ') + c.san).padEnd(12)}` +
      ` ${c.couleur === 'w' ? 'blancs' : 'noirs '}  ${String(c.avantB).padStart(9)}    ` +
      `${String(c.apresB).padStart(9)}   ${String(c.perte).padStart(5)}   ` +
      `${c.precision.toFixed(1).padStart(7)} %   ${c.classement}`,
  );
}

const parCamp = (camp) => {
  const l = r.coups.filter((c) => c.couleur === camp);
  return {
    n: l.length,
    perte: l.reduce((a, c) => a + c.perte, 0) / l.length,
    precision: l.reduce((a, c) => a + c.precision, 0) / l.length,
  };
};
const b = parCamp('w');
const n = parCamp('b');

console.log('');
console.log(`  Blancs (jouent proprement) : ${b.n} coups, perte brute moyenne ${b.perte.toFixed(0)} cp,`);
console.log(`                               précision moyenne par coup ${b.precision.toFixed(1)} %`);
console.log(`  Noirs (se sabordent)       : ${n.n} coups, perte brute moyenne ${n.perte.toFixed(0)} cp,`);
console.log(`                               précision moyenne par coup ${n.precision.toFixed(1)} %`);
console.log('');
console.log(`  Rapport : blancs ${r.cpBlancs} cp / ${r.precisionBlancs?.toFixed(1)} % / ${r.eloBlancs} Elo`);
console.log(`            noirs  ${r.cpNoirs} cp / ${r.precisionNoirs?.toFixed(1)} % / ${r.eloNoirs} Elo`);
console.log('');

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

verifier(
  (r.cpNoirs ?? 0) > (r.cpBlancs ?? 0),
  'Le camp qui se saborde perd davantage',
  `noirs ${r.cpNoirs} cp contre blancs ${r.cpBlancs} cp`,
);
verifier(
  (r.precisionNoirs ?? 100) < (r.precisionBlancs ?? 0),
  'Le camp qui se saborde est moins précis',
  `noirs ${r.precisionNoirs?.toFixed(1)} % contre blancs ${r.precisionBlancs?.toFixed(1)} %`,
);
// L'Elo n'est annoncé qu'au-delà d'un nombre minimal de coups. Cette partie
// de contrôle n'en compte que quinze par camp : l'absence de chiffre est le
// comportement attendu, pas un échec.
if (r.eloBlancs === null && r.eloNoirs === null) {
  console.log('  (Elo tu des deux côtés : partie trop courte pour se prononcer.)');
} else {
  verifier(
    (r.eloNoirs ?? 9999) < (r.eloBlancs ?? 0),
    'Le camp qui se saborde reçoit l’Elo le plus bas',
    `noirs ${r.eloNoirs} contre blancs ${r.eloBlancs}`,
  );
}

// Contrôle central : perte et précision ne peuvent plus se contredire.
const contradictions = [];
const trie = [...r.coups].sort((a, b) => a.perte - b.perte);
for (let i = 1; i < trie.length; i++) {
  if (trie[i].precision > trie[i - 1].precision + 0.01) {
    contradictions.push(`${trie[i - 1].san} (${trie[i - 1].perte}cp) vs ${trie[i].san} (${trie[i].perte}cp)`);
  }
}
verifier(
  contradictions.length === 0,
  'Aucun coup plus coûteux n’est mieux noté qu’un coup moins coûteux',
  contradictions.slice(0, 3).join(' | ') || 'sur les trente demi-coups',
);

await nav.close();
process.exit(echecs === 0 ? 0 : 1);
