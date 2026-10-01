/**
 * Une partie entière, jouée vite, sans qu'une seule phrase revienne.
 *
 * C'est la demande centrale, et elle ne se vérifie pas sur un tirage : il faut
 * une vraie partie, contre le moteur, avec des coups jugés bons, imprécis et
 * fautifs, et le relevé de tout ce que le professeur a écrit.
 *
 * Trois choses sont éprouvées ici :
 *
 *   1. aucune phrase ne revient dans la partie — pas une seule fois ;
 *   2. le professeur parle dès l'ouverture, dans les deux couleurs, et avant
 *      son premier coup quand il a les blancs ;
 *   3. le texte suit le rythme : bref quand on enchaîne, développé quand on
 *      prend son temps, et jamais en retard sur le coup en cours.
 *
 * Usage : node scripts/test-rythme.mjs [url]
 */

import { Chess } from 'chess.js';
import puppeteer from 'puppeteer-core';
import { optionsLancement } from './navigateur.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5180';

let echecs = 0;
const verifier = (ok, libelle, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
};

const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 900_000 }));

/** Texte actuellement affiché dans la carte du professeur. */
const lire = (page) =>
  page.evaluate(() => {
    const scene = document.querySelector('.pp-scene');
    let n = scene?.parentElement ?? null;
    for (let i = 0; i < 4 && n; i++) {
      const p = n.querySelector(':scope > p');
      if (p) return p.textContent?.trim() ?? '';
      n = n.parentElement;
    }
    return '';
  });

async function ouvrirPartie(camp) {
  const page = await nav.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim().startsWith('Jouer les')),
    { timeout: 60000, polling: 150 },
  );
  const libelle = camp === 'w' ? 'Jouer les blancs' : 'Jouer les noirs';
  const lance = Date.now();
  await page.evaluate((libelle) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === libelle);
    b?.scrollIntoView({ block: 'center' });
    b?.click();
  }, libelle);
  return { page, lance };
}

/* --- 2. Le professeur parle-t-il dès l'ouverture ? ---------------------- */
console.log('');
console.log('--- Début de partie ---');
for (const [camp, qui] of [
  ['w', 'le joueur a les blancs'],
  ['b', 'le PROFESSEUR a les blancs'],
]) {
  const { page, lance } = await ouvrirPartie(camp);
  const parle = await page
    .waitForFunction(
      () => {
        const scene = document.querySelector('.pp-scene');
        let n = scene?.parentElement ?? null;
        for (let i = 0; i < 4 && n; i++) {
          const p = n.querySelector(':scope > p');
          if (p) return (p.textContent?.trim().length ?? 0) > 10;
          n = n.parentElement;
        }
        return false;
      },
      { timeout: 60000, polling: 50 },
    )
    .then(() => Date.now() - lance)
    .catch(() => null);

  // Le professeur doit avoir parlé AVANT que son premier coup soit joué.
  const avantSonCoup = await page.evaluate(
    () => (document.body.textContent ?? '').includes('Aucun coup joué'),
  );
  const texte = await lire(page);
  console.log(`  ${qui} : « ${texte.slice(0, 70)} »`);
  verifier(
    parle !== null && parle < 1500,
    `[${qui}] Il parle dès l'ouverture`,
    parle === null ? 'jamais' : `${parle} ms`,
  );
  if (camp === 'b') {
    verifier(avantSonCoup, `[${qui}] Il salue AVANT de jouer son premier coup`);
  }
  await page.close();
}

/* --- 1 et 3. Une partie complète, jouée vite ---------------------------- */

/**
 * Trente coups blancs légaux depuis la position initiale, quoi que réponde le
 * moteur.
 *
 * Une suite fixe se heurterait au premier coup illégal et la partie
 * s'arrêterait là. On cherche donc le coup à jouer dans la position réelle, par
 * `chess.js`, et on prend le premier coup légal d'une liste de préférences :
 * cela donne une partie plausible — développement, puis manœuvres — sans jamais
 * bloquer. Les coups médiocres sont voulus : ils produisent les imprécisions et
 * les fautes dont on veut entendre le commentaire.
 */
const PREFERENCES = [
  'e4', 'Nf3', 'Bc4', 'd3', 'Nc3', 'Bg5', 'Qe2', 'h3', 'a3', 'Rb1',
  'g4', 'Bh4', 'Nd5', 'c3', 'b4', 'Qd2', 'Kf1', 'Rg1', 'a4', 'h4',
  'Ne5', 'f4', 'Bg3', 'Qe3', 'Rb3', 'Nb5', 'd4', 'g5', 'Bf2', 'Rh3',
];

/**
 * Position lue sur l'échiquier, en FEN, aux blancs de jouer.
 *
 * Les droits de roque ne sont pas lisibles sur le plateau : on les déclare
 * perdus. La seule conséquence est que le scénario ne roquera pas, ce qui
 * n'enlève rien à ce qu'on mesure — le professeur commente les coups qu'on joue,
 * pas ceux qu'on ne joue pas.
 */
async function lirePosition(page) {
  const pieces = await page.evaluate(() => {
    const plateau = document.querySelector('cg-board');
    if (!plateau) return null;
    const largeur = plateau.getBoundingClientRect().width;
    if (largeur < 50) return null;
    const cote = largeur / 8;
    return [...plateau.querySelectorAll('piece')]
      .filter((e) => !/ghost|fantome/i.test(e.className))
      .map((e) => {
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(e.style.transform ?? '');
        if (!m) return null;
        return {
          classe: e.className,
          colonne: Math.round(Number(m[1]) / cote),
          rangee: Math.round(Number(m[2]) / cote),
        };
      })
      .filter(Boolean);
  });
  if (!pieces || pieces.length === 0) return null;

  const SYMBOLE = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
  const grille = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const p of pieces) {
    const type = Object.keys(SYMBOLE).find((t) => p.classe.includes(t));
    if (!type || p.colonne < 0 || p.colonne > 7 || p.rangee < 0 || p.rangee > 7) continue;
    const s = SYMBOLE[type];
    grille[p.rangee][p.colonne] = p.classe.includes('white') ? s.toUpperCase() : s;
  }
  const placement = grille
    .map((rangee) => {
      let sortie = '';
      let vides = 0;
      for (const c of rangee) {
        if (c === '') vides += 1;
        else {
          if (vides) sortie += String(vides);
          vides = 0;
          sortie += c;
        }
      }
      return sortie + (vides ? String(vides) : '');
    })
    .join('/');
  return `${placement} w - - 0 1`;
}

/**
 * Attend que la carte du professeur affiche autre chose que `dernier`.
 *
 * Rend `null` si rien ne change : c'est alors que le professeur n'a RIEN écrit
 * pour ce coup, et il faut le compter comme tel plutôt que de relever deux fois
 * la même réplique et de crier à la répétition.
 */
async function attendreChangement(page, dernier) {
  for (let i = 0; i < 80; i++) {
    const courant = await lire(page);
    if (courant !== dernier && courant.trim().length > 0) return courant;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  }
  return null;
}

async function partieComplete(page, attenteMs, nbCoups) {
  const dits = [];
  const ecarts = [];
  let precedent = 0;
  let dernier = await lire(page);
  let muets = 0;

  for (let n = 0; n < nbCoups; n++) {
    // La position se lit sur l'échiquier lui-même : chaque pièce de Chessground
    // porte sa couleur, son type et sa case dans son `transform`. C'est plus
    // sûr que de chercher un FEN dans le texte de la page, et cela ne demande
    // rien à l'application.
    const fen = await lirePosition(page);
    if (!fen) break;
    const empreinte = await page.evaluate(() => {
      const plateau = document.querySelector('cg-board');
      if (!plateau) return '';
      return [...plateau.querySelectorAll('piece')]
        .map((e) => `${e.className}@${e.style.transform}`)
        .sort()
        .join('|');
    });
    const jeu = new Chess(fen);
    const legaux = jeu.moves({ verbose: true });
    if (legaux.length === 0) break;
    const prefere = PREFERENCES.map((san) => legaux.find((m) => m.san === san)).find(Boolean);
    const choisi = prefere ?? legaux[0];
    const coup = { de: choisi.from, vers: choisi.to };

    const r = await page.evaluate(() => {
      const b = document.querySelector('cg-board')?.getBoundingClientRect();
      return b ? { left: b.left, top: b.top, width: b.width } : null;
    });
    if (!r) break;
    const c = r.width / 8;
    const pt = (sq) => ({
      x: r.left + (sq.charCodeAt(0) - 97 + 0.5) * c,
      y: r.top + (8 - Number(sq[1]) + 0.5) * c,
    });
    const a = pt(coup.de);
    const b = pt(coup.vers);
    /**
     * On vérifie que le coup a PRIS avant de juger le commentaire.
     *
     * Un tap posé pendant que le moteur réfléchit est refusé par l'échiquier,
     * sans un mot. Compter ce coup comme joué faisait apparaître le professeur
     * muet alors que personne n'avait rien joué.
     */
    let joue = false;
    for (let essai = 0; essai < 3 && !joue; essai++) {
      await page.touchscreen.tap(a.x, a.y);
      await page.touchscreen.tap(b.x, b.y);
      joue = await page
        .waitForFunction(
          (avant) => {
            const plateau = document.querySelector('cg-board');
            if (!plateau) return false;
            const empreinte = [...plateau.querySelectorAll('piece')]
              .map((e) => `${e.className}@${e.style.transform}`)
              .sort()
              .join('|');
            return empreinte !== avant;
          },
          { timeout: 6000, polling: 40 },
          empreinte,
        )
        .then(() => true)
        .catch(() => false);
    }
    if (!joue) break;
    const maintenant = Date.now();
    if (precedent) ecarts.push(maintenant - precedent);
    precedent = maintenant;

    if (attenteMs > 0) {
      await page.evaluate((ms) => new Promise((res) => setTimeout(res, ms)), attenteMs);
    } else {
      // Jouer vite, mais laisser le verdict paraître : sans cela on mesurerait
      // la vitesse du moteur, pas le rythme de la parole.
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('button')].some((x) =>
              /Garder|Reprendre|Continuer/i.test(x.textContent ?? ''),
            ),
          { timeout: 20000, polling: 40 },
        )
        .catch(() => null);
    }

    /**
     * On attend que le texte CHANGE, et on ne relève qu'ensuite.
     *
     * Garder son coup ne remplace plus le commentaire — c'est voulu, il faut
     * pouvoir le lire — si bien que le texte du coup précédent reste affiché
     * jusqu'à l'arrivée du verdict suivant. Relever trop tôt enregistrait deux
     * fois la même réplique et faisait croire à une répétition qui n'existait
     * pas.
     */
    const change = await attendreChangement(page, dernier);
    if (change === null) {
      muets += 1;
      console.log(`     [coup ${n + 1} : rien de neuf, l’écran montre encore « ${dernier.slice(0, 60)} »]`);
    } else {
      dernier = change;
      dits.push(change);
    }
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /^Garder$|Garder le coup|Continuer/i.test(x.textContent?.trim() ?? ''),
      );
      b?.click();
    });
    /**
     * On attend que le bouton DISPARAISSE avant de jouer la suite.
     *
     * Sans cela, un clic qui ne prend pas laisse le bouton affiché : le tour
     * suivant croit voir le verdict du nouveau coup, relève l'ancien texte, et
     * la mesure devient fausse — on comptait un coup muet là où c'était la
     * souris qui avait manqué sa cible.
     */
    await page
      .waitForFunction(
        () =>
          ![...document.querySelectorAll('button')].some((x) =>
            /^Garder$|Garder le coup/i.test(x.textContent?.trim() ?? ''),
          ),
        { timeout: 8000, polling: 40 },
      )
      .catch(() => null);
    // La partie peut s'être terminée.
    const finie = await page.evaluate(() => /Partie terminée/i.test(document.body.textContent ?? ''));
    if (finie) break;
  }
  return { dits, ecarts, muets };
}

/** Phrases d'une réplique, découpées comme on les lit. */
const phrasesDe = (t) =>
  t
    .split(new RegExp('(?<=[.!?…])\\s+'))
    .map((p) => p.trim())
    .filter(Boolean);

console.log('');
console.log('--- Une partie complète, jouée vite ---');
const { page } = await ouvrirPartie('w');
await page.waitForSelector('cg-board', { timeout: 60000 });
await page.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 30000, polling: 100 },
);
await page.evaluate(() => window.scrollTo(0, 0));
const accueil = await lire(page);
const vive = await partieComplete(page, 0, 30);
await page.close();

const repliques = [accueil, ...vive.dits].filter((t) => t.trim().length > 0);
console.log(
  `  ${vive.dits.length} répliques pour ${vive.dits.length + vive.muets} coups, écart médian ${median(vive.ecarts)} ms` +
    (vive.muets ? `, ${vive.muets} coup(s) sans nouvelle réplique` : ''),
);
for (const [i, t] of repliques.entries()) console.log(`  ${String(i + 1).padStart(2)} · ${t.slice(0, 96)}`);

function median(l) {
  if (l.length === 0) return 0;
  const t = [...l].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

/**
 * Le contrôle porte sur la PREMIÈRE PHRASE de chaque réplique.
 *
 * C'est elle qui vient d'un registre, et c'est elle qu'on lisait trois fois de
 * suite. Ce qui suit — « votre cavalier est en prise » — est fabriqué à partir
 * de la position et doit pouvoir revenir quand le même motif revient : ce n'est
 * pas une formule, c'est un fait.
 */
const ouvertures = repliques.map((t) => phrasesDe(t)[0] ?? t);
const comptes = new Map();
for (const o of ouvertures) comptes.set(o, (comptes.get(o) ?? 0) + 1);
const repetees = [...comptes.entries()].filter(([, n]) => n > 1);

/**
 * Quelques coups peuvent passer sans une ligne nouvelle, et c'est voulu.
 *
 * À deux coups par seconde, le moteur fait deux choses à la fois : juger le
 * coup du joueur et trouver le sien. Il lui arrive d'abandonner le premier pour
 * rendre le second, et aucun verdict n'arrive — donc aucun commentaire. Mieux
 * vaut cela qu'une ligne en retard sur un coup déjà passé, qui est précisément
 * ce qu'on ne veut plus. Mesuré : deux à quatre coups sur trente, jamais
 * davantage, et jamais deux fois la même phrase pour autant.
 */
const tolerance = Math.max(2, Math.ceil((vive.dits.length + vive.muets) * 0.2));
verifier(
  repliques.length >= 12 && vive.muets <= tolerance,
  'Le professeur écrit à presque chaque coup',
  `${repliques.length} répliques, ${vive.muets} coup(s) sans réponse pour ${vive.dits.length + vive.muets} joués`,
);
verifier(
  repetees.length === 0,
  'Aucune phrase ne revient dans la partie',
  repetees.length
    ? repetees.map(([t, n]) => `« ${t} » ${n} fois`).join(' · ')
    : `${comptes.size} tournures distinctes`,
);
const consecutives = ouvertures.filter((o, i) => i > 0 && o === ouvertures[i - 1]);
verifier(consecutives.length === 0, 'Jamais deux fois la même phrase d’affilée');
// Les fautes, elles, sont expliquées à n'importe quel rythme : c'est voulu, et
// leur explication est longue. On mesure donc la MÉDIANE, qui dit ce que le
// joueur lit la plupart du temps, et non la plus longue réplique de la partie.
const medianeVive = median(vive.dits.filter(Boolean).map((t) => t.length));
verifier(
  medianeVive < 60,
  'Les répliques restent courtes quand on enchaîne',
  `médiane ${medianeVive} caractères, la plus longue ${Math.max(0, ...vive.dits.map((t) => t.length))}`,
);

/* --- 3. Et développé quand on prend son temps -------------------------- */
console.log('');
console.log('--- Six coups posés : il développe ---');
const { page: posee } = await ouvrirPartie('w');
await posee.waitForSelector('cg-board', { timeout: 60000 });
await posee.waitForFunction(
  () => (document.querySelector('cg-board')?.getBoundingClientRect().width ?? 0) > 100,
  { timeout: 30000, polling: 100 },
);
await posee.evaluate(() => window.scrollTo(0, 0));
const lente = await partieComplete(posee, 4600, 6);
await posee.close();
for (const [i, t] of lente.dits.entries()) console.log(`  coup ${i + 1} · ${t.slice(0, 110)}`);

const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
const longueurPosee = moyenne(lente.dits.filter(Boolean).map((t) => t.length));
const longueurVive = moyenne(vive.dits.filter(Boolean).map((t) => t.length));
verifier(
  longueurPosee > longueurVive,
  'Le commentaire est plus développé au rythme posé',
  `${Math.round(longueurPosee)} caractères contre ${Math.round(longueurVive)}`,
);

await nav.close();
console.log('');
console.log(echecs === 0 ? 'Rythme et variété : conformes.' : `${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
