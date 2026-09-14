/**
 * Vérifie que le réglage de niveau est RÉELLEMENT appliqué au moteur.
 *
 * Méthode : à chaque palier, le moteur joue contre lui-même une trentaine de
 * demi-coups, puis chaque coup est réévalué à pleine force pour mesurer sa
 * perte en centipions. Un palier « Débutant » doit produire des erreurs
 * grossières ; « Maximum » ne doit pratiquement pas en produire.
 *
 * Si le plus bas niveau ne commet aucune bourde, c'est que le réglage n'est
 * pas transmis — exactement le symptôme qu'on cherche à interdire.
 *
 * La table ci-dessous doit rester alignée sur `src/lib/niveaux.ts` ; les
 * valeurs y sont figées par les tests unitaires.
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHEMINS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const BASE = process.argv[2] ?? 'http://localhost:4173';
const DEMI_COUPS = 30;

const TABLE = {
  debutant: { skill: 0, limiterElo: true, uciElo: 1320, profondeurMax: 1, tempsMs: 50 },
  amateur: { skill: 3, limiterElo: true, uciElo: 1320, profondeurMax: 3, tempsMs: 100 },
  club: { skill: 9, limiterElo: true, uciElo: 1600, profondeurMax: 8, tempsMs: 200 },
  maximum: { skill: 20, limiterElo: false, profondeurMax: null, tempsMs: 1000 },
};
const PALIERS = Object.keys(TABLE);

let echecs = 0;
const verifier = (ok, l, d = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${l}${d ? ` — ${d}` : ''}`);
  if (!ok) echecs += 1;
};

const navigateur = await puppeteer.launch({
  executablePath: CHEMINS.find(existsSync),
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await navigateur.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e?.message ?? e).slice(0, 160)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await page.waitForSelector('h1');

/** Joue une partie du moteur contre lui-même, puis mesure la perte par coup. */
function mesurer(config) {
  return page.evaluate(
    async (cfg, demiCoups) => {
      // --- Petit pilote UCI, volontairement minimal ---
      const ouvrir = () =>
        new Promise((resoudre, rejeter) => {
          const w = new Worker('/engine/sf19/worker-sf19.js?hash=32&threads=1', {
            type: 'module',
          });
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
                /** Attend `bestmove` en retenant le dernier score annoncé. */
                jusquAuBestmove: () =>
                  new Promise((res) => {
                    let score = null;
                    surLigne = (ligne) => {
                      const m = ligne.match(/score (cp|mate) (-?\d+)/);
                      if (m) {
                        score =
                          m[1] === 'cp'
                            ? Number(m[2])
                            : (Number(m[2]) > 0 ? 1 : -1) *
                              (10000 - Math.abs(Number(m[2])) * 10);
                      }
                      if (ligne.startsWith('bestmove')) {
                        surLigne = null;
                        res({ coup: ligne.split(' ')[1], score });
                      }
                    };
                  }),
                fermer: () => w.terminate(),
              });
            }
          };
          w.postMessage('uci');
        });

      const m = await ouvrir();
      m.envoyer('setoption name Hash value 32');
      m.envoyer('ucinewgame');

      // --- 1. Le moteur joue contre lui-même, au palier testé ---
      if (cfg.limiterElo && cfg.uciElo) {
        m.envoyer('setoption name UCI_LimitStrength value true');
        m.envoyer(`setoption name UCI_Elo value ${cfg.uciElo}`);
      } else {
        m.envoyer('setoption name UCI_LimitStrength value false');
      }
      m.envoyer(`setoption name Skill Level value ${cfg.skill}`);

      const commande = cfg.profondeurMax
        ? `go depth ${cfg.profondeurMax} movetime ${cfg.tempsMs}`
        : `go movetime ${cfg.tempsMs}`;

      const coups = [];
      for (let i = 0; i < demiCoups; i++) {
        m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
        m.envoyer(commande);
        const { coup } = await m.jusquAuBestmove();
        if (!coup || coup === '(none)' || coup === '0000') break;
        coups.push(coup);
      }

      // --- 2. Réévaluation de chaque position à pleine force ---
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

      m.fermer();
      return {
        coups: coups.length,
        moyenne: pertes.length
          ? Math.round(pertes.reduce((a, b) => a + b, 0) / pertes.length)
          : 0,
        grossieres: pertes.filter((p) => p >= 200).length,
        pire: pertes.length ? Math.round(Math.max(...pertes)) : 0,
      };
    },
    config,
    DEMI_COUPS,
  );
}

const resultats = {};
for (const palier of PALIERS) {
  resultats[palier] = await mesurer(TABLE[palier]);
  const r = resultats[palier];
  console.log(
    `  ${palier.padEnd(9)} coups=${String(r.coups).padStart(2)}` +
      `  perte moyenne=${String(r.moyenne).padStart(4)} cp` +
      `  bourdes=${String(r.grossieres).padStart(2)}` +
      `  pire=${String(r.pire).padStart(5)} cp`,
  );
}
console.log('');

verifier(
  resultats.debutant.grossieres >= 3,
  'Le niveau Débutant commet bien des erreurs grossières',
  `${resultats.debutant.grossieres} coups perdant 200 cp ou plus`,
);
verifier(
  resultats.debutant.moyenne > resultats.maximum.moyenne,
  'Débutant joue nettement moins bien que Maximum',
  `${resultats.debutant.moyenne} cp contre ${resultats.maximum.moyenne} cp`,
);
verifier(
  resultats.debutant.moyenne > resultats.club.moyenne,
  'La perte moyenne décroît quand le niveau monte',
  `débutant ${resultats.debutant.moyenne} > club ${resultats.club.moyenne}`,
);
verifier(
  resultats.maximum.grossieres <= 1,
  'Le niveau Maximum ne commet pratiquement pas de bourde',
  `${resultats.maximum.grossieres}`,
);

await navigateur.close();
console.log(
  '\n' +
    (echecs === 0 ? 'Niveaux : tous les contrôles sont passés.' : `${echecs} contrôle(s) en échec.`),
);
process.exit(echecs === 0 ? 0 : 1);
