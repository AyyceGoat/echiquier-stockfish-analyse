/**
 * Matchs entre paliers de force.
 *
 * Ce que ce test prouve, et qu'aucun autre ne peut prouver : que les paliers
 * se distinguent RÉELLEMENT en partie. Mesurer la perte moyenne par coup
 * (`test:niveaux`) dit qu'un palier joue mal ; seul un match dit qu'il joue
 * moins bien QUE l'AUTRE.
 *
 * Méthode :
 *  - chaque paire de paliers joue `PARTIES` parties, couleurs alternées, ce
 *    qui annule l'avantage du trait ;
 *  - le choix du coup passe par `choisirCoup` du jeu lui-même, importé
 *    depuis le serveur de développement : on mesure le produit, pas une
 *    réimplémentation ;
 *  - au-delà de `COUPS_MAX` demi-coups, la position est arbitrée par une
 *    évaluation à pleine force — au-delà de 300 centipions, la partie est
 *    donnée au camp qui mène, sinon elle est nulle.
 *
 * Le harnais tourne contre le serveur de DÉVELOPPEMENT (port 5173) et non
 * contre la préversion : il a besoin des modules sources pour importer la
 * logique de choix telle qu'elle est écrite.
 *
 * Usage : node scripts/test-matchs-niveaux.mjs [url] [parties-par-paire]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const PARTIES = Number(process.argv[3] ?? 10);
const COUPS_MAX = 120;

/**
 * Recherche à profondeur fixe, et non au temps.
 *
 * Mesuré : le même match Club contre Fort, à réglages IDENTIQUES, a donné
 * 94 % puis 50 % selon la charge de la machine — 62 s contre 165 s pour le
 * même travail. En `movetime`, les deux camps explorent moins de nœuds quand
 * le processeur est occupé, et l'écart entre paliers se comprime. Des
 * chiffres qui bougent d'un run à l'autre ne prouvent rien.
 *
 * Le test compare donc à profondeur constante. Ce n'est pas exactement ce
 * que joue l'application — qui, elle, est limitée au temps — mais c'est la
 * seule façon d'obtenir une preuve d'ordonnancement reproductible. Passer
 * `--temps` en cinquième argument rétablit les conditions réelles.
 */
const AU_TEMPS = process.argv[5] === '--temps';
/** Profondeur des paliers sans plafond (Maximum). */
const PROFONDEUR_PLEINE = 18;
/** Marge, en centipions, au-delà de laquelle une partie arbitrée est gagnée. */
const MARGE_ARBITRAGE = 300;

/** Paires à éprouver : chaque palier contre le suivant. */
const TOUTES_PAIRES = [
  ['grand-debutant', 'debutant'],
  ['debutant', 'amateur'],
  ['amateur', 'club'],
  ['club', 'fort'],
  ['fort', 'expert'],
  ['expert', 'maximum'],
  // Un écart large, pour vérifier que l'échelle tient sur toute sa longueur.
  ['grand-debutant', 'club'],
];

// Troisième argument facultatif : n'éprouver qu'une paire, pour itérer sur
// un réglage sans rejouer toute l'échelle.
const filtre = process.argv[4];
const PAIRES = filtre
  ? TOUTES_PAIRES.filter(([a, b]) => a.includes(filtre) || b.includes(filtre))
  : TOUTES_PAIRES;

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

// `protocolTimeout` relevé : chaque appel joue une partie entière, qui peut
// dépasser largement les 180 secondes du réglage par défaut aux paliers
// élevés, où le moteur réfléchit jusqu'à 600 ms par coup.
const navigateur = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));
const page = await navigateur.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e?.message ?? e).slice(0, 200)));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('h1', { timeout: 30000 });

/**
 * Installe dans la page un pilote UCI et les modules du jeu.
 * Tout le reste du match se déroule dans le navigateur : faire l'aller-retour
 * avec Node à chaque demi-coup multiplierait la durée par dix.
 */
async function installer() {
  await page.evaluate(async () => {
  const banc = await import('/src/lib/bancEssai.ts');
  window.__banc = banc;

  window.__moteurUnique = null;
  window.__moteurPartage = async () => {
    if (!window.__moteurUnique) window.__moteurUnique = await window.__ouvrirMoteur();
    return window.__moteurUnique;
  };

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
            /**
             * Attend `bestmove` en collectant les lignes MultiPV.
             * On retient la DERNIÈRE annonce de chaque indice multipv :
             * les précédentes viennent de profondeurs inférieures.
             */
            jusquAuBestmove: () =>
              new Promise((res) => {
                const lignes = new Map();
                surLigne = (ligne) => {
                  const mp = ligne.match(/multipv (\d+)/);
                  const sc = ligne.match(/score (cp|mate) (-?\d+)/);
                  const pv = ligne.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
                  if (sc && pv) {
                    const indice = mp ? Number(mp[1]) : 1;
                    lignes.set(indice, {
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
            fermer: () => w.terminate(),
          });
        }
      };
      w.postMessage('uci');
    });
  });
}

await installer();

/**
 * Réinstalle le harnais si la page a été rechargée.
 *
 * Le serveur de développement recharge la page dès qu'un fichier source
 * change, ce qui détruit le contexte d'exécution et fait échouer l'appel en
 * cours avec « Execution context was destroyed ». Plutôt que d'exiger qu'on
 * ne touche à aucun fichier pendant les vingt minutes du match, on vérifie
 * avant chaque partie que le harnais est toujours en place.
 */
async function assurerHarnais() {
  const present = await page.evaluate(() => Boolean(window.__banc)).catch(() => false);
  if (!present) {
    await page.waitForSelector('h1', { timeout: 30000 });
    await installer();
  }
}

/**
 * Joue UNE partie entre deux paliers.
 *
 * Découpé à la partie et non au match : un match entier dans un seul
 * `page.evaluate` dépassait le `protocolTimeout` de Puppeteer, qui coupait
 * la connexion au milieu sans rien rendre. Un appel par partie borne la
 * durée et donne la progression au fur et à mesure.
 */
function jouerUnePartie(idA, idB, aEstBlanc, coupsMax, margeArbitrage, graine) {
  return page.evaluate(
    async (idA, idB, aEstBlanc, coupsMax, marge, graineTirage, auTemps, profondeurPleine) => {
      const { Chess, choisirCoup, niveauParId } = window.__banc;
      const a = niveauParId(idA);
      const b = niveauParId(idB);
      const m = await window.__moteurPartage();

      m.envoyer('setoption name Hash value 32');
      m.envoyer('ucinewgame');

      let multiPVActuel = null;
      let niveauActuel = null;

      const appliquer = (n) => {
        if (multiPVActuel !== n.candidats) {
          m.envoyer(`setoption name MultiPV value ${n.candidats}`);
          multiPVActuel = n.candidats;
        }
        if (niveauActuel !== n.id) {
          if (n.limiterElo && n.uciElo) {
            m.envoyer('setoption name UCI_LimitStrength value true');
            m.envoyer(`setoption name UCI_Elo value ${n.uciElo}`);
          } else {
            m.envoyer('setoption name UCI_LimitStrength value false');
          }
          m.envoyer(`setoption name Skill Level value ${n.skill}`);
          niveauActuel = n.id;
        }
      };

      /**
       * Générateur pseudo-aléatoire à graine (mulberry32).
       *
       * `choisirCoup` accepte un générateur injecté — c'est exactement à cela
       * qu'il sert. Avec une graine fixée par partie, le tirage pondéré
       * devient reproductible, et deux exécutions du même match donnent le
       * même résultat.
       */
      const generateur = (graine) => () => {
        graine |= 0;
        graine = (graine + 0x6d2b79f5) | 0;
        let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const alea = generateur(graineTirage);

      /** Un coup, au palier donné, exactement comme le fait le jeu. */
      const coupDe = async (niveau, coups) => {
        appliquer(niveau);
        m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
        const profondeur = niveau.profondeurMax ?? profondeurPleine;
        m.envoyer(
          auTemps
            ? niveau.profondeurMax
              ? `go depth ${niveau.profondeurMax} movetime ${niveau.tempsMs}`
              : `go movetime ${niveau.tempsMs}`
            : `go depth ${profondeur}`,
        );
        const { bestmove, candidats } = await m.jusquAuBestmove();
        const choisi = choisirCoup(
          candidats,
          { temperatureCp: niveau.temperatureCp, probaBevue: niveau.probaBevue },
          alea,
        );
        return choisi ?? bestmove;
      };

      /** Évalue la position finale à pleine force, pour arbitrer. */
      const arbitrer = async (coups) => {
        m.envoyer('setoption name MultiPV value 1');
        m.envoyer('setoption name UCI_LimitStrength value false');
        m.envoyer('setoption name Skill Level value 20');
        multiPVActuel = 1;
        niveauActuel = null;
        m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
        m.envoyer('go depth 12');
        const { candidats } = await m.jusquAuBestmove();
        const e = candidats[0]?.evaluation;
        if (!e) return 0;
        return e.type === 'cp' ? e.valeur : (e.valeur > 0 ? 1 : -1) * 10000;
      };

      const jeu = new Chess();
      const coups = [];
      let resultat = null;

      while (coups.length < coupsMax) {
        if (jeu.isGameOver()) {
          if (jeu.isCheckmate()) {
            // Le camp au trait est mat : c'est l'autre qui gagne.
            resultat = jeu.turn() === 'w' ? 'noirs' : 'blancs';
          } else {
            resultat = 'nulle';
          }
          break;
        }
        const blancAuTrait = jeu.turn() === 'w';
        const niveau = blancAuTrait === aEstBlanc ? a : b;
        const uci = await coupDe(niveau, coups);
        if (!uci || uci === '(none)' || uci === '0000') {
          resultat = 'nulle';
          break;
        }
        try {
          jeu.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] ?? undefined,
          });
        } catch {
          resultat = 'illegal';
          break;
        }
        coups.push(uci);
      }

      if (resultat === null) {
        const cp = await arbitrer(coups);
        if (cp > marge) resultat = 'blancs';
        else if (cp < -marge) resultat = 'noirs';
        else resultat = 'nulle';
      }

      let vainqueur;
      if (resultat === 'nulle' || resultat === 'illegal') vainqueur = 'nulle';
      else if (resultat === 'blancs') vainqueur = aEstBlanc ? 'A' : 'B';
      else vainqueur = aEstBlanc ? 'B' : 'A';

      return { aEstBlanc, demiCoups: coups.length, resultat, vainqueur };
    },
    idA,
    idB,
    aEstBlanc,
    coupsMax,
    margeArbitrage,
    graine,
    AU_TEMPS,
    PROFONDEUR_PLEINE,
  );
}

/** Enchaîne les parties d'un match, couleurs alternées. */
async function jouerMatch(idA, idB, parties, coupsMax, marge) {
  const bilan = { aGagne: 0, bGagne: 0, nulles: 0, parties: [] };
  for (let i = 0; i < parties; i++) {
    await assurerHarnais();
    // Graine dérivée de la paire et du numéro de partie : reproductible
    // d'un run à l'autre, mais différente d'une partie à l'autre.
    const graine = (idA.length * 7919 + idB.length * 104729 + i * 65537) | 0;
    const r = await jouerUnePartie(idA, idB, i % 2 === 0, coupsMax, marge, graine);
    if (r.vainqueur === 'A') bilan.aGagne++;
    else if (r.vainqueur === 'B') bilan.bGagne++;
    else bilan.nulles++;
    bilan.parties.push(r);
  }
  return bilan;
}

const libelle = await page.evaluate(
  (ids) => ids.map((i) => window.__banc.niveauParId(i).libelle),
  PAIRES.flat(),
);
const nomDe = {};
PAIRES.flat().forEach((id, i) => (nomDe[id] = libelle[i]));

console.log(`Matchs entre paliers — ${PARTIES} parties par paire, couleurs alternées.\n`);
const resume = [];

for (const [idA, idB] of PAIRES) {
  const debut = Date.now();
  const bilan = await jouerMatch(idA, idB, PARTIES, COUPS_MAX, MARGE_ARBITRAGE);
  const duree = ((Date.now() - debut) / 1000).toFixed(0);

  // Score du palier SUPÉRIEUR (B), en points : 1 par gain, 0,5 par nulle.
  const pointsB = bilan.bGagne + bilan.nulles * 0.5;
  const pourcent = ((pointsB / PARTIES) * 100).toFixed(0);

  console.log(
    `${nomDe[idA]} vs ${nomDe[idB]} : ` +
      `${bilan.aGagne}–${bilan.bGagne}–${bilan.nulles} (G–P–N pour le plus faible), ` +
      `${nomDe[idB]} marque ${pointsB}/${PARTIES} soit ${pourcent} % — ${duree} s`,
  );

  resume.push({ idA, idB, ...bilan, pointsB, pourcent: Number(pourcent) });

  // Le palier supérieur doit dominer nettement. Le seuil est à 70 % : sur un
  // petit nombre de parties, exiger 100 % ferait échouer le test sur du
  // bruit, et accepter 55 % ne prouverait rien.
  verifier(
    pointsB / PARTIES >= 0.7,
    `${nomDe[idB]} domine ${nomDe[idA]}`,
    `${pointsB}/${PARTIES} (${pourcent} %)`,
  );
  verifier(
    bilan.parties.every((p) => p.resultat !== 'illegal'),
    `Aucun coup illégal (${nomDe[idA]} vs ${nomDe[idB]})`,
  );
}

console.log('\n--- Tableau récapitulatif ---');
console.log('| Paire | Faible gagne | Fort gagne | Nulles | Score du fort |');
console.log('|---|---|---|---|---|');
for (const r of resume) {
  console.log(
    `| ${nomDe[r.idA]} vs ${nomDe[r.idB]} | ${r.aGagne} | ${r.bGagne} | ${r.nulles} | ${r.pointsB}/${PARTIES} (${r.pourcent} %) |`,
  );
}

await navigateur.close();
console.log(
  echecs === 0
    ? '\nMatchs : tous les paliers se départagent comme attendu.'
    : `\n${echecs} contrôle(s) en échec.`,
);
process.exitCode = echecs === 0 ? 0 : 1;
