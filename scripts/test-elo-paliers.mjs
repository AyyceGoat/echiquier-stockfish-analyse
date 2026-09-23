/**
 * Étalonnage de l'Elo estimé sur de VRAIES parties, palier par palier.
 *
 * Ce que `test-precision.mjs` ne peut pas voir : il fabrique des parties en
 * injectant un taux de bruit, ce qui produit un gradient contrôlé mais
 * artificiel. Il vérifie donc la COHÉRENCE interne des mesures — plus la
 * perte est élevée, plus la précision est basse — sans jamais vérifier
 * qu'un palier annoncé à 800 Elo ressort bien autour de 800.
 *
 * Ici, chaque palier joue contre lui-même, par le chemin réel du jeu
 * (`choisirCoup`, mêmes options UCI, même profondeur). La partie est ensuite
 * analysée par le rapport de l'application. Les deux camps ayant joué au
 * même palier, les deux Elo estimés doivent tomber ensemble ET près du
 * palier annoncé. Toute asymétrie entre blancs et noirs est alors un défaut
 * d'attribution, pas du bruit.
 *
 * Usage : node scripts/test-elo-paliers.mjs [url] [parties-par-palier]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const PARTIES = Number(process.argv[3] ?? 2);
/** Assez de coups pour que la moyenne ait un sens, sans y passer la nuit. */
const COUPS_MAX = 70;
/** Profondeur d'arbitrage et de repli, quand le palier n'en impose pas. */
const PROFONDEUR_PLEINE = 18;
/** Renouvellement du navigateur : un onglet ne tient pas la série entière. */
const PARTIES_PAR_SESSION = 4;

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

let nav = null;
let page = null;

async function fermerSession() {
  if (!nav) return;
  await nav.close().catch(() => {});
  nav = null;
  page = null;
}

async function ouvrirSession() {
  await fermerSession();
  nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
  page = await nav.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('h1', { timeout: 30000 });
  await installer();
}

async function installer() {
  await page.evaluate(async () => {
    window.__banc = await import('/src/lib/bancEssai.ts');
    window.__ouvrirMoteur = () =>
      new Promise((resoudre, rejeter) => {
        const w = new Worker('/engine/sf19/worker-sf19.js?hash=32&threads=1', { type: 'module' });
        let surLigne = null;
        let pret = false;
        w.onerror = (e) => rejeter(new Error(e.message || 'échec du worker'));
        w.onmessage = (ev) => {
          const s = String(ev.data);
          if (surLigne) surLigne(s);
          if (!pret && s.includes('uciok')) {
            pret = true;
            resoudre({
              envoyer: (c) => w.postMessage(c),
              jusquAuBestmove: () =>
                new Promise((res) => {
                  const lignes = new Map();
                  surLigne = (ligne) => {
                    const mp = ligne.match(/multipv (\d+)/);
                    const sc = ligne.match(/score (cp|mate) (-?\d+)/);
                    const pv = ligne.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                    if (sc && pv) {
                      lignes.set(mp ? Number(mp[1]) : 1, {
                        coup: pv[1],
                        evaluation:
                          sc[1] === 'cp'
                            ? { type: 'cp', valeur: Number(sc[2]) }
                            : { type: 'mat', valeur: Number(sc[2]) },
                      });
                    }
                    if (ligne.startsWith('bestmove')) {
                      surLigne = null;
                      res({ bestmove: ligne.split(' ')[1], candidats: [...lignes.values()] });
                    }
                  };
                }),
            });
          }
        };
        w.postMessage('uci');
      });
    window.__moteurUnique = null;
    window.__moteurPartage = async () =>
      (window.__moteurUnique ??= await window.__ouvrirMoteur());
  });
}

/** Joue une partie entière, un palier contre lui-même. */
function jouerUnePartie(id, coupsMax, graine, profondeurPleine) {
  return page.evaluate(
    async (id, coupsMax, graineTirage, profondeurPleine) => {
      const { Chess, choisirCoup, niveauParId } = window.__banc;
      const n = niveauParId(id);
      const m = await window.__moteurPartage();

      m.envoyer('setoption name Hash value 32');
      m.envoyer('ucinewgame');
      m.envoyer(`setoption name MultiPV value ${n.candidats}`);
      if (n.limiterElo && n.uciElo) {
        m.envoyer('setoption name UCI_LimitStrength value true');
        m.envoyer(`setoption name UCI_Elo value ${n.uciElo}`);
      } else {
        m.envoyer('setoption name UCI_LimitStrength value false');
      }
      m.envoyer(`setoption name Skill Level value ${n.skill}`);

      const generateur = (g) => () => {
        g |= 0;
        g = (g + 0x6d2b79f5) | 0;
        let t = Math.imul(g ^ (g >>> 15), 1 | g);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const alea = generateur(graineTirage);

      const jeu = new Chess();
      const coups = [];
      while (coups.length < coupsMax && !jeu.isGameOver()) {
        m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
        m.envoyer(`go depth ${n.profondeurMax ?? profondeurPleine}`);
        const { bestmove, candidats } = await m.jusquAuBestmove();
        const uci =
          choisirCoup(
            candidats,
            { temperatureCp: n.temperatureCp, probaBevue: n.probaBevue },
            alea,
          ) ?? bestmove;
        if (!uci || uci === '(none)' || uci === '0000') break;
        try {
          jeu.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? undefined });
        } catch {
          break;
        }
        coups.push(uci);
      }
      return { san: jeu.history(), fin: jeu.isGameOver() };
    },
    id,
    coupsMax,
    graine,
    profondeurPleine,
  );
}

/**
 * Analyse par le chemin réel de l'application, et relit le rapport STOCKÉ.
 *
 * Relire l'écran par expression régulière ne dirait pas à quel camp
 * appartient chaque nombre — or c'est précisément la question posée.
 */
async function analyser(coupsSan, nom, niveauId) {
  const id = await page.evaluate(
    async (coupsSan, nom, niveauId) => {
      const { enregistrerPartie, nouvelIdentifiant } = await import('/src/db/parties.ts');
      const id = nouvelIdentifiant();
      await enregistrerPartie({
        id,
        date: Date.now(),
        mode: 'libre',
        blanc: `B-${nom}`,
        noir: `N-${nom}`,
        resultat: '*',
        finPar: 'banc',
        fenDepart: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        coupsSan,
        niveauMoteur: niveauId,
      });
      return id;
    },
    coupsSan,
    nom,
    niveauId,
  );

  await page.goto(`${BASE}/#/rapport/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction((a) => document.body.innerText.includes(a), { timeout: 60000, polling: 300 }, `B-${nom}`);
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
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  return page.evaluate(async (id) => {
    const { lirePartie } = await import('/src/db/parties.ts');
    const r = (await lirePartie(id))?.rapport;
    return r
      ? {
          eloBlancs: r.eloBlancs,
          eloNoirs: r.eloNoirs,
          precisionBlancs: r.precisionBlancs,
          precisionNoirs: r.precisionNoirs,
          cpBlancs: r.perteMoyenneBlancs,
          cpNoirs: r.perteMoyenneNoirs,
          coups: r.coups.length,
        }
      : null;
  }, id);
}

await ouvrirSession();

const PALIERS = await page.evaluate(() =>
  window.__banc.NIVEAUX.map((n) => ({ id: n.id, libelle: n.libelle, elo: n.elo })),
);

const releves = [];
let compteur = 0;
for (const palier of PALIERS) {
  for (let k = 0; k < PARTIES; k++) {
    if (compteur > 0 && compteur % PARTIES_PAR_SESSION === 0) await ouvrirSession();
    compteur++;
    const nom = `${palier.id}-${k}`;
    let r = null;
    for (let essai = 0; essai < 2 && !r; essai++) {
      try {
        await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
        await installer();
        const { san } = await jouerUnePartie(palier.id, COUPS_MAX, 7000 + compteur * 131, PROFONDEUR_PLEINE);
        if (san.length < 20) throw new Error(`partie trop courte (${san.length} coups)`);
        r = await analyser(san, nom, palier.id);
      } catch (e) {
        console.log(`\n${nom} : ${String(e?.message ?? e).slice(0, 100)}`);
        await ouvrirSession();
      }
    }
    if (!r) {
      console.log(`${nom} : rapport illisible`);
      continue;
    }
    releves.push({ palier, ...r });
    process.stdout.write('.');
  }
}
console.log('\n');

// --- Tableau ---------------------------------------------------------------
console.log('Chaque palier joue CONTRE LUI-MÊME : les deux camps doivent tomber');
console.log('ensemble, et près du palier annoncé.\n');
console.log('  palier            annoncé   Elo blancs   Elo noirs   cp B / cp N   préc. B / N');
console.log('  ---------------------------------------------------------------------------------');

const parPalier = new Map();
for (const r of releves) {
  const cle = r.palier.id;
  if (!parPalier.has(cle)) parPalier.set(cle, { palier: r.palier, lignes: [] });
  parPalier.get(cle).lignes.push(r);
  console.log(
    `  ${r.palier.libelle.padEnd(16)} ${String(r.palier.elo ?? 'max').padStart(6)}   ` +
      `${String(r.eloBlancs ?? '—').padStart(10)}   ${String(r.eloNoirs ?? '—').padStart(9)}   ` +
      `${String(r.cpBlancs ?? '—').padStart(4)} / ${String(r.cpNoirs ?? '—').padEnd(4)}   ` +
      `${(r.precisionBlancs?.toFixed(1) ?? '—').padStart(5)} / ${r.precisionNoirs?.toFixed(1) ?? '—'}`,
  );
}

console.log('');
const moyennes = [];
for (const { palier, lignes } of parPalier.values()) {
  const elos = lignes.flatMap((l) => [l.eloBlancs, l.eloNoirs]).filter((e) => e !== null);
  if (elos.length === 0) continue;
  const moy = elos.reduce((a, b) => a + b, 0) / elos.length;
  const ecartB = lignes
    .filter((l) => l.eloBlancs !== null && l.eloNoirs !== null)
    .map((l) => l.eloBlancs - l.eloNoirs);
  moyennes.push({ palier, moy, ecartB });
  console.log(
    `  ${palier.libelle.padEnd(16)} annoncé ${String(palier.elo ?? 'max').padStart(4)}   ` +
      `estimé moyen ${moy.toFixed(0).padStart(4)}   ` +
      `écart ${palier.elo === null ? '—' : (moy - palier.elo >= 0 ? '+' : '') + (moy - palier.elo).toFixed(0)}`,
  );
}

console.log('');

// --- Contrôles -------------------------------------------------------------

// 1. Pas de biais systématique entre les deux camps : même palier des deux
//    côtés, donc un écart constant signalerait une attribution croisée.
const ecarts = moyennes.flatMap((m) => m.ecartB);
const biais = ecarts.length ? ecarts.reduce((a, b) => a + b, 0) / ecarts.length : 0;
verifier(
  Math.abs(biais) < 150,
  'Aucun biais systématique entre blancs et noirs',
  `${biais >= 0 ? '+' : ''}${biais.toFixed(0)} Elo en moyenne sur ${ecarts.length} parties`,
);

// 2. L'estimation suit le palier : un palier à 800 ne doit pas sortir à 1800.
const TOLERANCE = 400;
const horsTolerance = moyennes.filter((m) => m.palier.elo !== null && Math.abs(m.moy - m.palier.elo) > TOLERANCE);
verifier(
  horsTolerance.length === 0,
  `Chaque palier retombe à moins de ${TOLERANCE} Elo de sa valeur annoncée`,
  horsTolerance.length
    ? horsTolerance
        .map((m) => `${m.palier.libelle} ${m.palier.elo}→${m.moy.toFixed(0)}`)
        .join(' | ')
    : 'sur les sept paliers',
);

// 3. L'estimation est au moins ORDONNÉE : un palier supérieur doit estimer
//    plus haut que son cadet.
const ordonnes = moyennes.filter((m) => m.palier.elo !== null).sort((a, b) => a.palier.elo - b.palier.elo);
const desordres = [];
for (let i = 1; i < ordonnes.length; i++) {
  if (ordonnes[i].moy < ordonnes[i - 1].moy)
    desordres.push(`${ordonnes[i - 1].palier.libelle} → ${ordonnes[i].palier.libelle}`);
}
verifier(desordres.length === 0, 'L’estimation croît avec le palier', desordres.join(' | '));

await fermerSession();
console.log('\n' + (echecs === 0 ? 'Étalonnage : conforme.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
