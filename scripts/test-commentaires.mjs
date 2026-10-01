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
    // La dame se donne, et le mat qui était là n'est plus. Les deux constats
    // sont vrais ; le professeur dit celui que le moteur a retenu comme motif,
    // et c'est souvent le mat manqué. Ce qui est interdit, c'est de féliciter.
    attendu: /coûte|perd|prise|grave|erreur|faute|attention|sérieux|dommage|se retourne|s’effondre|mat/i,
    interdit: /jouable mais passif|ne change pas l’appréciation|bravo|excellent|parfait|bien joué/i,
  },
];

/** Texte affiché dans la carte du professeur. */
const lireTexte = (page) =>
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

/**
 * Attend que le texte cesse de bouger.
 *
 * Le commentaire paraît d'un coup, mais il peut être REMPLACÉ : le verdict du
 * moteur arrive après la salutation, et parfois après un premier jet. On exige
 * donc plusieurs relevés de suite sans changement.
 */
// Deux cents tours de 500 ms, soit cent secondes : sur un site déployé, la
// première analyse attend le téléchargement du moteur — sept mégaoctets — et
// quarante-cinq secondes ne suffisaient pas. En local la boucle sort en deux
// secondes, le budget large ne coûte donc rien.
async function texteStable(page, { different = null, minimum = 20, stables = 4, pas = 500, tours = 200 } = {}) {
  let dernier = null;
  let identiques = 0;
  for (let i = 0; i < tours; i++) {
    const courant = await lireTexte(page);
    identiques = courant === dernier ? identiques + 1 : 0;
    dernier = courant;
    const bon = courant.length >= minimum && (different === null || courant !== different);
    if (bon && identiques >= stables) return courant;
    await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), pas);
  }
  return dernier ?? '';
}

/** Centre d'une case, vue des blancs. */
function centre(rect, caseSan) {
  const c = rect.width / 8;
  const f = caseSan.charCodeAt(0) - 97;
  const r = Number(caseSan[1]);
  return { x: rect.left + (f + 0.5) * c, y: rect.top + (8 - r + 0.5) * c };
}

for (const cas of CAS) {
  // Un navigateur par cas, et non un onglet de plus.
  //
  // Sur le site déployé, les onglets suivants sont servis par le service
  // worker et le glisser-déposer n'y prenait plus : le coup tombait dans le
  // vide, sans verdict, trois tentatives de suite. Trois lancements coûtent
  // quelques secondes et rendent le résultat lisible.
  const nav = await puppeteer.launch(optionsLancement({ protocolTimeout: 300_000 }));
  const page = await nav.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  /**
   * La position se transmet par `sessionStorage`, exactement comme le fait
   * l'écran d'analyse quand on demande « jouer depuis cette position ».
   *
   * L'ORDRE compte, et c'est lui qui rendait ce test imprévisible. L'écran de
   * jeu CONSOMME la clé à son montage : il la lit et l'effface. Déposer la
   * position puis naviguer vers `#/assiste` — un simple changement de fragment,
   * donc sans rechargement — puis recharger, c'était jouer à la course contre
   * le montage de React. S'il avait eu le temps de monter, la clé était déjà
   * consommée et le rechargement repartait de la position initiale : le coup
   * du scénario devenait illégal et aucun glisser ne pouvait le faire passer.
   *
   * On charge donc l'écran de jeu D'ABORD, on dépose ensuite, et le
   * rechargement est le seul montage qui lit la clé.
   */
  await page.goto(`${BASE}/#/assiste`, { waitUntil: 'networkidle2' });
  await page.evaluate(
    (fen) => sessionStorage.setItem('echiquier.position-a-jouer', fen),
    cas.fen,
  );
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

  // Le texte d'accueil est relevé AVANT le coup : c'est le seul repère fiable
  // pour savoir qu'un verdict a remplacé la salutation. Le reconnaître par
  // une liste de phrases devenait faux dès qu'on enrichissait les registres.
  //
  // Et il est relevé POSÉ : saisi pendant sa frappe, il ne vaut qu'un préfixe,
  // et la salutation complète paraissait ensuite « différente de l'accueil » —
  // le test lisait l'accueil en croyant lire le verdict.
  const accueil = await texteStable(page);
  console.log(`  (${cas.nom}) accueil relevé : « ${accueil.slice(0, 60)} »`);

  /**
   * Glisser plutôt que deux clics : Chessground traite le glisser-déposer
   * nativement, et la sélection en deux temps se perdait quand un rendu
   * intervenait entre les deux clics.
   *
   * Les coordonnées du plateau sont relues JUSTE AVANT le glisser. Relevées
   * plus tôt, elles vieillissaient : la carte du professeur grandit pendant
   * que la salutation s'écrit, l'échiquier descend, et le glisser tombait à
   * côté de la pièce — sans que rien ne le signale.
   */
  const glisser = async (parClics) => {
    const rect = await page.evaluate(() => {
      const r = document.querySelector('cg-board').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    });
    const a = centre(rect, cas.coup[0]);
    const b = centre(rect, cas.coup[1]);
    // Une tentative sur deux passe par deux clics. Les deux gestes échouent
    // pour des raisons différentes — un glisser trop rapide pour Chessground,
    // une sélection perdue par un rendu entre les deux clics — et répéter le
    // même geste raté le rate de la même façon.
    if (parClics) {
      await page.mouse.click(a.x, a.y);
      await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
      await page.mouse.click(b.x, b.y);
      return;
    }
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  };

  /**
   * Tant que le texte est celui de l'accueil, aucun verdict n'a été rendu : on
   * lirait la mauvaise réplique. Aucun seuil de longueur non plus — depuis que
   * la parole est passée au langage humain, une réplique complète tient souvent
   * en une phrase, et le seuil de soixante caractères attendait indéfiniment un
   * exposé qui ne vient plus.
   *
   * Trois tentatives : sur un site déployé, le téléchargement du moteur — sept
   * mégaoctets de WebAssembly — bloque le fil principal, et le glisser tombe
   * dans le vide sans que rien ne le signale. Ce n'est pas un défaut du produit,
   * c'est l'instrument qui frappe trop tôt.
   */
  // Deux attentes distinctes, parce que deux choses peuvent manquer. D'abord
  // que le coup soit JOUÉ : le glisser rate de temps en temps sur un site
  // déployé, et on le voit au relevé des demi-coups, pas au texte. Ensuite que
  // le professeur parle, ce qui prend le temps qu'il faut au moteur.
  let joue = false;
  // Huit tentatives, pas quatre : au premier navigateur, le moteur se télécharge
  // encore — sept mégaoctets — et l'échiquier n'accepte rien tant que le fil
  // principal est pris. C'est le seul cas où l'attente est longue ; les suivants
  // partent d'un cache chaud et passent du premier coup.
  for (let essai = 1; essai <= 8 && !joue; essai++) {
    await glisser(essai % 2 === 0);
    joue = await page
      .waitForFunction(() => !/Aucun coup joué/i.test(document.body.textContent ?? ''), {
        timeout: 10000,
        polling: 200,
      })
      .then(() => true)
      .catch(() => false);
    if (!joue) console.log(`  (${cas.nom}) le glisser n’a pas pris, nouvelle tentative`);
  }
  verifier(joue, `[${cas.nom}] Le coup a été joué sur l’échiquier`);

  const texte = await texteStable(page, { different: accueil });

  console.log(`\n  ${cas.nom} — « ${texte.slice(0, 220)}${texte.length > 220 ? '…' : ''} »`);
  verifier(texte.length > 0, `[${cas.nom}] Un commentaire est produit`);
  verifier(cas.attendu.test(texte), `[${cas.nom}] Le ton suit la position`);
  verifier(!cas.interdit.test(texte), `[${cas.nom}] Rien de contradictoire`);
  if (cas.aussi) verifier(cas.aussi.motif.test(texte), `[${cas.nom}] Le professeur ${cas.aussi.libelle}`);

  await page.close();
  await nav.close();
}

console.log('\n' + (echecs === 0 ? 'Commentaires : conformes à la position.' : `${echecs} contrôle(s) en échec.`));
process.exit(echecs === 0 ? 0 : 1);
