/**
 * Étalonnage de l'Elo estimé sur de VRAIES parties, palier par palier.
 *
 * Ce que `test-precision.mjs` ne peut pas voir : il fabrique des parties en
 * injectant un taux de bruit, ce qui produit un gradient contrôlé mais
 * artificiel. Il vérifie donc la COHÉRENCE interne des mesures — plus la
 * perte est élevée, plus la précision est basse — sans jamais vérifier
 * qu'un palier annoncé à 800 Elo ressort bien autour de 800.
 *
 * Les paliers jouent les uns CONTRE LES AUTRES, et non contre eux-mêmes.
 * C'est la correction de méthode : en auto-affrontement les deux camps sont
 * de force égale, la partie reste disputée, et le biais qui gonflait
 * l'estimation du camp dominant restait invisible. Une partie réelle contre
 * un adversaire de force très différente sort de la zone disputée en une
 * dizaine de coups — c'est exactement le cas signalé, un palier Débutant
 * ressorti à 2190 Elo.
 *
 * Chaque partie fournit DEUX relevés, un par camp, chacun comparé au palier
 * que ce camp a réellement utilisé.
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

/** Joue une partie entière entre DEUX paliers. */
function jouerUnePartie(idBlancs, idNoirs, coupsMax, graine, profondeurPleine) {
  return page.evaluate(
    async (idBlancs, idNoirs, coupsMax, graineTirage, profondeurPleine) => {
      const { Chess, choisirCoup, niveauParId } = window.__banc;
      const nB = niveauParId(idBlancs);
      const nN = niveauParId(idNoirs);
      const m = await window.__moteurPartage();

      m.envoyer('setoption name Hash value 32');
      m.envoyer('ucinewgame');

      // Les options UCI sont réappliquées à chaque changement de camp : les
      // deux paliers ne partagent ni la limitation de force ni MultiPV.
      let courant = null;
      const appliquer = (n) => {
        if (courant === n.id) return;
        m.envoyer(`setoption name MultiPV value ${n.candidats}`);
        if (n.limiterElo && n.uciElo) {
          m.envoyer('setoption name UCI_LimitStrength value true');
          m.envoyer(`setoption name UCI_Elo value ${n.uciElo}`);
        } else {
          m.envoyer('setoption name UCI_LimitStrength value false');
        }
        m.envoyer(`setoption name Skill Level value ${n.skill}`);
        courant = n.id;
      };

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
        const n = jeu.turn() === 'w' ? nB : nN;
        appliquer(n);
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
    idBlancs,
    idNoirs,
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

/**
 * Paires contrastées : chaque palier affronte un adversaire d'un autre
 * niveau, et chacun apparaît au moins deux fois, dans les deux couleurs.
 * C'est ce déséquilibre qui fait sortir la partie de la zone disputée et
 * révèle le biais que l'auto-affrontement masquait.
 */
const PAIRES = [
  // Paliers VOISINS : la partie reste disputée assez longtemps pour que la
  // fenêtre de mesure ait un sens. Opposer 400 à 2400 ne mesure rien —
  // la partie est tranchée avant que l'échantillon soit constitué, et
  // l'application refuse alors de se prononcer, ce qui est le comportement
  // voulu mais ne calibre rien.
  ['grand-debutant', 'debutant'],
  ['debutant', 'amateur'],
  ['amateur', 'club'],
  ['club', 'fort'],
  ['fort', 'expert'],
  ['expert', 'maximum'],
  ['debutant', 'grand-debutant'],
  ['amateur', 'debutant'],
  ['club', 'amateur'],
  ['fort', 'club'],
  ['expert', 'fort'],
  ['maximum', 'expert'],
];

const releves = [];
let compteur = 0;
for (let tour = 0; tour < PARTIES; tour++) {
  for (const [a, b] of PAIRES) {
    // Couleurs inversées au second tour : l'avantage du trait ne doit pas
    // se confondre avec un écart de palier.
    const [idBlancs, idNoirs] = tour % 2 === 0 ? [a, b] : [b, a];
    if (compteur > 0 && compteur % PARTIES_PAR_SESSION === 0) await ouvrirSession();
    compteur++;
    const nom = `${idBlancs}-vs-${idNoirs}-${tour}`;
    let r = null;
    for (let essai = 0; essai < 2 && !r; essai++) {
      try {
        await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
        await installer();
        const { san } = await jouerUnePartie(
          idBlancs,
          idNoirs,
          COUPS_MAX,
          7000 + compteur * 131,
          PROFONDEUR_PLEINE,
        );
        if (san.length < 20) throw new Error(`partie trop courte (${san.length} coups)`);
        r = await analyser(san, nom, idBlancs);
      } catch (e) {
        console.log(`
${nom} : ${String(e?.message ?? e).slice(0, 100)}`);
        await ouvrirSession();
      }
    }
    if (!r) {
      console.log(`${nom} : rapport illisible`);
      continue;
    }
    releves.push(
      { id: idBlancs, camp: 'B', elo: r.eloBlancs, cp: r.cpBlancs, precision: r.precisionBlancs, adverse: idNoirs },
      { id: idNoirs, camp: 'N', elo: r.eloNoirs, cp: r.cpNoirs, precision: r.precisionNoirs, adverse: idBlancs },
    );
    process.stdout.write('.');
  }
}
console.log('');

const PAR_ID = new Map(PALIERS.map((p) => [p.id, p]));

console.log('');
console.log('Chaque ligne est UN camp d’UNE partie, comparé au palier qu’il a joué.');
console.log('');
console.log('  palier            annoncé   estimé   écart   cp/coup   précision   adversaire');
console.log('  --------------------------------------------------------------------------------');
for (const r of releves) {
  const p = PAR_ID.get(r.id);
  const ecart = p?.elo == null || r.elo == null ? '—' : (r.elo - p.elo >= 0 ? '+' : '') + (r.elo - p.elo);
  console.log(
    `  ${(p?.libelle ?? r.id).padEnd(16)} ${String(p?.elo ?? 'max').padStart(6)}   ` +
      `${String(r.elo ?? '—').padStart(6)}   ${String(ecart).padStart(5)}   ` +
      `${String(r.cp ?? '—').padStart(5)}     ${(r.precision?.toFixed(1) ?? '—').padStart(5)} %   ${r.adverse}`,
  );
}

console.log('');
console.log('  Moyenne par palier :');
const moyennes = [];
for (const p of PALIERS) {
  const siens = releves.filter((r) => r.id === p.id && r.elo !== null);
  if (siens.length === 0) continue;
  const moy = siens.reduce((a, r) => a + r.elo, 0) / siens.length;
  const moyPrec = siens.reduce((a, r) => a + (r.precision ?? 0), 0) / siens.length;
  const moyCp = siens.reduce((a, r) => a + (r.cp ?? 0), 0) / siens.length;
  moyennes.push({ palier: p, moy, moyPrec, moyCp, n: siens.length });
  const ecart = p.elo == null ? '—' : (moy - p.elo >= 0 ? '+' : '') + (moy - p.elo).toFixed(0);
  console.log(
    `  ${p.libelle.padEnd(16)} annoncé ${String(p.elo ?? 'max').padStart(4)}   ` +
      `estimé ${moy.toFixed(0).padStart(4)}   écart ${String(ecart).padStart(5)}   ` +
      `${moyCp.toFixed(0).padStart(4)} cp   ${moyPrec.toFixed(1).padStart(5)} %   (${siens.length} relevés)`,
  );
}

console.log('');

// --- Contrôles -------------------------------------------------------------
const TOLERANCE = 150;
const horsTolerance = moyennes.filter(
  (m) => m.palier.elo !== null && Math.abs(m.moy - m.palier.elo) > TOLERANCE,
);
verifier(
  horsTolerance.length === 0,
  `Chaque palier retombe à moins de ${TOLERANCE} Elo de sa valeur annoncée`,
  horsTolerance.length
    ? horsTolerance.map((m) => `${m.palier.libelle} ${m.palier.elo}→${m.moy.toFixed(0)}`).join(' | ')
    : 'sur tous les paliers mesurés',
);

// La précision doit elle aussi rester plausible : un palier Débutant à 98 %
// n'a pas de sens, c'était l'autre moitié du défaut signalé.
const precisionAberrante = moyennes.filter(
  (m) => m.palier.elo !== null && m.palier.elo <= 800 && m.moyPrec > 80,
);
verifier(
  precisionAberrante.length === 0,
  'Aucun palier faible n’affiche une précision de maître',
  precisionAberrante.map((m) => `${m.palier.libelle} ${m.moyPrec.toFixed(1)} %`).join(' | ') ||
    'les paliers faibles restent sous 80 %',
);

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
