/**
 * Vérifie que le réglage de niveau est RÉELLEMENT appliqué, et mesure la
 * qualité de jeu de chaque palier.
 *
 * Méthode : à chaque palier, le moteur joue contre lui-même une trentaine de
 * demi-coups EN PASSANT PAR LA MÊME SÉLECTION DE COUP QUE LE JEU — options
 * UCI du palier, MultiPV, puis tirage pondéré de `choisirCoup`. Chaque coup
 * est ensuite réévalué à pleine force pour mesurer sa perte en centipions.
 *
 * Deux dettes corrigées ici :
 *
 *  - la table des paliers était RECOPIÉE dans ce script, avec un commentaire
 *    demandant de la garder alignée sur `src/lib/niveaux.ts`. Elle ne l'était
 *    plus. Elle est désormais importée depuis le module du jeu.
 *  - la mesure ne passait que par les options UCI. Or, sous 1320 Elo, c'est
 *    le tirage pondéré côté application qui porte l'essentiel de la
 *    différence : mesurer sans lui, c'était mesurer autre chose que ce que
 *    le joueur affronte.
 *
 * Le harnais tourne contre le serveur de DÉVELOPPEMENT : il a besoin des
 * modules sources pour importer la logique de choix telle qu'elle est écrite.
 *
 * Usage : node scripts/test-niveaux.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const DEMI_COUPS = 30;

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

// Une mesure de palier entière peut dépasser le délai de protocole par
// défaut de Puppeteer, qui couperait la connexion au milieu sans rien rendre.
const navigateur = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
const page = await navigateur.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e?.message ?? e).slice(0, 200)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });

/** Installe le pilote UCI et les modules du jeu dans la page. */
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
                let dernierScore = null;
                surLigne = (ligne) => {
                  const mp = ligne.match(/multipv (\d+)/);
                  const sc = ligne.match(/score (cp|mate) (-?\d+)/);
                  const pv = ligne.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                  if (sc) {
                    const brut =
                      sc[1] === 'cp'
                        ? Number(sc[2])
                        : (Number(sc[2]) > 0 ? 1 : -1) * (10000 - Math.abs(Number(sc[2])) * 10);
                    if (!mp || Number(mp[1]) === 1) dernierScore = brut;
                  }
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
                    res({
                      bestmove: ligne.split(' ')[1],
                      candidats: [...lignes.values()],
                      score: dernierScore,
                    });
                  }
                };
              }),
            fermer: () => w.terminate(),
          });
        }
      };
      w.postMessage('uci');
    });

  window.__moteurUnique = null;
  window.__moteurPartage = async () => {
    if (!window.__moteurUnique) window.__moteurUnique = await window.__ouvrirMoteur();
    return window.__moteurUnique;
  };
});

const paliers = await page.evaluate(() =>
  window.__banc.NIVEAUX.map((n) => ({ id: n.id, libelle: n.libelle, elo: n.elo })),
);

/** Fait jouer un palier contre lui-même, puis mesure la perte par coup. */
function mesurer(id, demiCoups) {
  return page.evaluate(
    async (id, demiCoups) => {
      const { choisirCoup, niveauParId } = window.__banc;
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

      const commande = n.profondeurMax
        ? `go depth ${n.profondeurMax} movetime ${n.tempsMs}`
        : `go movetime ${n.tempsMs}`;

      // --- 1. Le palier joue contre lui-même, sélection du jeu comprise ---
      const coups = [];
      for (let i = 0; i < demiCoups; i++) {
        m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
        m.envoyer(commande);
        const { bestmove, candidats } = await m.jusquAuBestmove();
        const choisi =
          choisirCoup(candidats, {
            temperatureCp: n.temperatureCp,
            probaBevue: n.probaBevue,
          }) ?? bestmove;
        if (!choisi || choisi === '(none)' || choisi === '0000') break;
        coups.push(choisi);
      }

      // --- 2. Réévaluation de chaque position à pleine force ---
      m.envoyer('setoption name MultiPV value 1');
      m.envoyer('setoption name UCI_LimitStrength value false');
      m.envoyer('setoption name Skill Level value 20');
      m.envoyer('ucinewgame');

      const scores = [];
      for (let i = 0; i <= coups.length; i++) {
        const prefixe = coups.slice(0, i);
        m.envoyer(`position startpos${prefixe.length ? ' moves ' + prefixe.join(' ') : ''}`);
        m.envoyer('go depth 12');
        const { score } = await m.jusquAuBestmove();
        scores.push(score ?? 0);
      }

      // Perte de chaque coup, du point de vue du joueur qui vient de jouer.
      // Le score d'une position est donné au trait : on l'inverse pour rester
      // du même côté avant et après.
      const pertes = [];
      for (let i = 0; i < coups.length; i++) {
        pertes.push(Math.max(0, scores[i] - -scores[i + 1]));
      }

      return {
        coups: coups.length,
        moyenne: pertes.length ? Math.round(pertes.reduce((a, b) => a + b, 0) / pertes.length) : 0,
        grossieres: pertes.filter((p) => p >= 200).length,
        pire: pertes.length ? Math.round(Math.max(...pertes)) : 0,
      };
    },
    id,
    demiCoups,
  );
}

console.log(`Qualité de jeu par palier — ${DEMI_COUPS} demi-coups, sélection du jeu comprise.\n`);

const resultats = {};
for (const p of paliers) {
  resultats[p.id] = await mesurer(p.id, DEMI_COUPS);
  const r = resultats[p.id];
  console.log(
    `  ${p.libelle.padEnd(15)} ${String(p.elo ?? 'max').padStart(4)}` +
      `  coups=${String(r.coups).padStart(2)}` +
      `  perte moyenne=${String(r.moyenne).padStart(4)} cp` +
      `  bourdes=${String(r.grossieres).padStart(2)}` +
      `  pire=${String(r.pire).padStart(5)} cp`,
  );
}
console.log('');

verifier(
  resultats['grand-debutant'].grossieres >= 3,
  'Le palier Grand débutant commet bien des erreurs grossières',
  `${resultats['grand-debutant'].grossieres} coups perdant 200 cp ou plus`,
);
verifier(
  resultats.debutant.grossieres >= 2,
  'Le palier Débutant commet des erreurs grossières',
  `${resultats.debutant.grossieres}`,
);
verifier(
  resultats['grand-debutant'].moyenne > resultats.debutant.moyenne,
  'Grand débutant joue moins bien que Débutant',
  `${resultats['grand-debutant'].moyenne} cp contre ${resultats.debutant.moyenne} cp`,
);
verifier(
  resultats.debutant.moyenne > resultats.club.moyenne,
  'La perte moyenne décroît quand le niveau monte',
  `débutant ${resultats.debutant.moyenne} > club ${resultats.club.moyenne}`,
);
verifier(
  resultats.debutant.moyenne > resultats.maximum.moyenne,
  'Débutant joue nettement moins bien que Maximum',
  `${resultats.debutant.moyenne} cp contre ${resultats.maximum.moyenne} cp`,
);
verifier(
  resultats.maximum.grossieres <= 1,
  'Le palier Maximum ne commet pratiquement pas de bourde',
  `${resultats.maximum.grossieres}`,
);

await navigateur.close();
console.log(
  '\n' +
    (echecs === 0 ? 'Niveaux : tous les contrôles sont passés.' : `${echecs} contrôle(s) en échec.`),
);
process.exit(echecs === 0 ? 0 : 1);
