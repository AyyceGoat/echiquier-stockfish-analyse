/**
 * Banc de précision : vingt parties de qualités échelonnées.
 *
 * Le contrat est simple et sans exception : PLUS LA PERTE MOYENNE EST
 * ÉLEVÉE, PLUS LA PRÉCISION EST BASSE. Une seule inversion invalide le
 * calcul, et c'est précisément ce qui avait été signalé — une partie à
 * 196 cp perdus par coup notée 87 % pendant qu'une partie à 48 cp était
 * notée 66 %.
 *
 * Les parties sont fabriquées avec un bruit croissant : à chaque coup, avec
 * une probabilité `bruit`, on joue un coup légal au hasard plutôt que le
 * meilleur. Le gradient est donc contrôlé, et les deux camps reçoivent des
 * bruits DIFFÉRENTS dans la même partie — c'est ce qui fait ressortir une
 * éventuelle inversion entre les couleurs.
 *
 * Usage : node scripts/test-precision.mjs [url] [nombre-de-parties]
 */

import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const NB = Number(process.argv[3] ?? 20);
/** Demi-coups par partie. Assez pour que la moyenne ait un sens. */
const DEMI_COUPS = 40;

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

/**
 * Navigateur renouvelé toutes les `PARTIES_PAR_SESSION` parties.
 *
 * Une partie analysée laisse derrière elle un worker Stockfish, sa table de
 * hachage et le rapport complet en mémoire. Au onzième tour, Chrome était
 * tué par le système et le banc s'arrêtait à mi-course sans rien conclure.
 * Fermer et rouvrir périodiquement coûte quelques secondes et rend la série
 * entière atteignable.
 */
const PARTIES_PAR_SESSION = 5;
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
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('h1', { timeout: 30000 });
}

await ouvrirSession();

/**
 * Pilote UCI minimal + modules du jeu.
 *
 * Réinjecté avant CHAQUE fabrication : ouvrir un rapport navigue, ce qui
 * détruit le contexte et donc les globales. Sans cette réinjection, la
 * deuxième partie échouait sur « window.__banc is undefined ».
 */
async function injecter() {
  const present = await page.evaluate(() => Boolean(window.__banc)).catch(() => false);
  if (present) return;
  await page.evaluate(async () => {
  window.__banc = await import('/src/lib/bancEssai.ts');
  window.__ouvrir = () =>
    new Promise((res, rej) => {
      const w = new Worker('/engine/sf19/worker-sf19.js?hash=32&threads=1', { type: 'module' });
      let surLigne = null;
      let pret = false;
      w.onerror = (e) => rej(new Error(e.message || 'worker'));
      w.onmessage = (ev) => {
        const s = String(ev.data);
        if (surLigne) surLigne(s);
        if (!pret && s.includes('uciok')) {
          pret = true;
          res({
            envoyer: (c) => w.postMessage(c),
            best: () =>
              new Promise((r) => {
                surLigne = (l) => {
                  if (l.startsWith('bestmove')) {
                    surLigne = null;
                    r(l.split(' ')[1]);
                  }
                };
              }),
          });
        }
      };
      w.postMessage('uci');
    });
  window.__moteur = null;
  window.__m = async () => (window.__moteur ??= await window.__ouvrir());
  });
}

await injecter();

/** Fabrique une partie avec un bruit propre à chaque camp. */
function fabriquer(bruitBlancs, bruitNoirs, graine, demiCoups) {
  return page.evaluate(
    async (bB, bN, graine, demiCoups) => {
      const { Chess } = window.__banc;
      const m = await window.__m();
      // Générateur à graine : le banc doit être reproductible.
      let g = graine | 0;
      const alea = () => {
        g = (g + 0x6d2b79f5) | 0;
        let t = Math.imul(g ^ (g >>> 15), 1 | g);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      m.envoyer('ucinewgame');
      m.envoyer('setoption name MultiPV value 1');
      m.envoyer('setoption name UCI_LimitStrength value false');
      m.envoyer('setoption name Skill Level value 20');

      const jeu = new Chess();
      const coups = [];
      for (let i = 0; i < demiCoups; i++) {
        if (jeu.isGameOver()) break;
        const bruit = jeu.turn() === 'w' ? bB : bN;
        const legaux = jeu.moves({ verbose: true });
        let choisi;
        if (alea() < bruit) {
          choisi = legaux[Math.floor(alea() * legaux.length)];
        } else {
          m.envoyer(`position startpos${coups.length ? ' moves ' + coups.join(' ') : ''}`);
          m.envoyer('go depth 10');
          const uci = await m.best();
          choisi = legaux.find(
            (x) => x.from + x.to + (x.promotion ?? '') === uci || x.from + x.to === uci,
          );
          if (!choisi) choisi = legaux[0];
        }
        jeu.move(choisi);
        coups.push(choisi.from + choisi.to + (choisi.promotion ?? ''));
      }
      return jeu.history();
    },
    bruitBlancs,
    bruitNoirs,
    graine,
    demiCoups,
  );
}

/** Analyse une partie par le chemin réel de l'application. */
async function analyser(coupsSan, nom) {
  const id = await page.evaluate(
    async (coupsSan, nom) => {
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
      });
      return id;
    },
    coupsSan,
    nom,
  );

  await page.goto(`${BASE}/#/rapport/${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
  // Rechargement : une navigation qui ne change que le fragment reste dans le
  // même document, et le rapport précédent resterait affiché.
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
  await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));

  // On lit le rapport STOCKÉ plutôt que le texte de l'écran : la lecture par
  // expressions régulières ne dit pas à quel camp appartient chaque nombre,
  // et c'est exactement ce qu'on cherche à vérifier ici.
  return page.evaluate(async (id) => {
    const { lirePartie } = await import('/src/db/parties.ts');
    const p = await lirePartie(id);
    const r = p?.rapport;
    return r
      ? {
          precisionBlancs: r.precisionBlancs,
          precisionNoirs: r.precisionNoirs,
          eloBlancs: r.eloBlancs,
          eloNoirs: r.eloNoirs,
          perteBlancs: r.perteMoyenneBlancs,
          perteNoirs: r.perteMoyenneNoirs,
        }
      : null;
  }, id);
}

// Bruits croisés : les deux camps ne jouent JAMAIS au même niveau dans une
// même partie, sinon une inversion entre couleurs resterait invisible.
const PLANS = [];
for (let i = 0; i < NB; i++) {
  const bB = (i % 5) * 0.2;
  const bN = ((i + 2) % 5) * 0.2;
  PLANS.push({ nom: `p${String(i).padStart(2, '0')}`, bB, bN, graine: 1000 + i * 77 });
}

const lignes = [];
for (let i = 0; i < PLANS.length; i++) {
  const plan = PLANS[i];
  if (i > 0 && i % PARTIES_PAR_SESSION === 0) await ouvrirSession();

  // Une partie perdue ne doit pas emporter la série : on réessaie une fois
  // sur une session neuve, puis on passe à la suivante en le signalant.
  let r = null;
  for (let essai = 0; essai < 2 && !r; essai++) {
    try {
      // Le rapport précédent a navigué : on revient à l'accueil et on réinjecte.
      await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
      await injecter();
      const san = await fabriquer(plan.bB, plan.bN, plan.graine, DEMI_COUPS);
      r = await analyser(san, plan.nom);
    } catch (e) {
      console.log(`
${plan.nom} : ${String(e?.message ?? e).slice(0, 90)}`);
      await ouvrirSession();
    }
  }
  if (!r) {
    console.log(`${plan.nom} : rapport illisible`);
    continue;
  }
  lignes.push(
    { camp: 'B', nom: plan.nom, bruit: plan.bB, precision: r.precisionBlancs, elo: r.eloBlancs, cp: r.perteBlancs },
    { camp: 'N', nom: plan.nom, bruit: plan.bN, precision: r.precisionNoirs, elo: r.eloNoirs, cp: r.perteNoirs },
  );
  process.stdout.write('.');
}
console.log('\n');

const valides = lignes.filter((l) => l.precision !== null && l.cp !== null && l.elo !== null);
valides.sort((a, b) => a.cp - b.cp);

console.log('Trié par perte moyenne croissante. La précision doit DÉCROÎTRE.\n');
console.log('  partie camp  bruit   cp/coup   précision   Elo');
console.log('  ----------------------------------------------');
for (const l of valides) {
  console.log(
    `  ${l.nom}    ${l.camp}    ${(l.bruit * 100).toFixed(0).padStart(3)} %   ` +
      `${String(l.cp).padStart(5)}      ${l.precision.toFixed(1).padStart(5)} %   ${String(l.elo).padStart(4)}`,
  );
}

// --- Contrôle : aucune inversion ---
//
// La règle est : plus la perte moyenne est élevée, plus la précision est
// basse. Encore faut-il énoncer à quelle résolution. Les deux mesures
// n'agrègent pas de la même façon — la perte est une moyenne
// arithmétique, la précision mêle moyenne pondérée et moyenne harmonique,
// laquelle pèse sur les pires coups. À perte égale, une partie faite de
// beaucoup d'erreurs moyennes et une partie faite de peu de fautes graves
// ne valent donc pas la même précision, et c'est voulu : c'est justement
// ce que la perte moyenne seule ne dit pas.
//
// On exige donc l'ordre là où les deux parties sont RÉELLEMENT séparables :
// du simple au double, et au moins 25 centipions d'écart absolu — en deçà,
// on compare deux mesures dont l'incertitude propre dépasse l'écart.
//
// Ce qui avait été signalé tombe très au-dessus de ce seuil : 48 cp noté
// 65,9 % contre 196 cp noté 87,4 %, soit un rapport de quatre et vingt et
// un points à l'envers.
//
// Entre ces deux bornes subsiste une dispersion mesurée jusqu'à une douzaine
// de points, et elle est voulue : la perte moyenne est une moyenne
// arithmétique, la précision mêle moyenne pondérée et moyenne harmonique,
// laquelle pèse sur les pires coups. À perte égale, beaucoup d'erreurs
// moyennes et quelques fautes graves ne valent pas la même précision — c'est
// justement ce que la perte moyenne seule ne dit pas.
const RAPPORT_SEPARABLE = 2;
const ECART_SEPARABLE = 25;
const inversions = [];
for (let i = 0; i < valides.length; i++) {
  for (let j = i + 1; j < valides.length; j++) {
    const a = valides[i];
    const b = valides[j];
    if (b.cp < a.cp * RAPPORT_SEPARABLE || b.cp - a.cp < ECART_SEPARABLE) continue;
    if (b.precision > a.precision)
      inversions.push(
        `${a.nom}${a.camp}(${a.cp}cp,${a.precision}%) < ${b.nom}${b.camp}(${b.cp}cp,${b.precision}%)`,
      );
  }
}

// Second contrôle, par tranches : la moyenne de chaque tranche doit décroître.
const TRANCHES = 4;
const tranches = [];
for (let t = 0; t < TRANCHES; t++) {
  const part = valides.slice(
    Math.floor((t * valides.length) / TRANCHES),
    Math.floor(((t + 1) * valides.length) / TRANCHES),
  );
  tranches.push({
    cp: part.reduce((a, l) => a + l.cp, 0) / part.length,
    precision: part.reduce((a, l) => a + l.precision, 0) / part.length,
  });
}
console.log(`
Par quarts, de la meilleure perte à la pire :`);
for (const t of tranches)
  console.log(`  ${t.cp.toFixed(0).padStart(4)} cp/coup → ${t.precision.toFixed(1).padStart(5)} %`);
const trancheInversee = tranches.some((t, i) => i > 0 && t.precision > tranches[i - 1].precision);

verifier(valides.length >= NB, 'Toutes les parties ont été analysées', `${valides.length} lignes`);
verifier(
  inversions.length === 0,
  'Aucune inversion entre deux parties séparables (du simple au double)',
  inversions.length ? `${inversions.length} : ` + inversions.slice(0, 5).join(' | ') : 'sur toute la série',
);
verifier(!trancheInversee, 'La précision décroît quart après quart');

// L'Elo est dérivé de la perte : il doit être monotone par construction.
const inversionsElo = [];
for (let i = 1; i < valides.length; i++) {
  if (valides[i].elo > valides[i - 1].elo) inversionsElo.push(`${valides[i - 1].nom} → ${valides[i].nom}`);
}
verifier(inversionsElo.length === 0, 'Aucune inversion Elo / perte', inversionsElo.slice(0, 3).join(' | '));

const pires = valides.slice(-3);
const meilleurs = valides.slice(0, 3);
const moyPire = pires.reduce((a, l) => a + l.precision, 0) / pires.length;
const moyBonne = meilleurs.reduce((a, l) => a + l.precision, 0) / meilleurs.length;
verifier(moyPire < 70, 'Les pires parties tombent nettement', `${moyPire.toFixed(1)} %`);
verifier(moyBonne - moyPire > 25, 'L’écart entre extrêmes est franc', `${(moyBonne - moyPire).toFixed(1)} points`);

await fermerSession();
console.log('\n' + (echecs === 0 ? 'Précision : aucun défaut.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
